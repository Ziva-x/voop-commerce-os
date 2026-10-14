import { NextRequest, NextResponse } from "next/server";
import {
  decodeSessionToken,
  exchangeSessionTokenForAccessToken,
  fetchShopInfo,
} from "@/lib/shopifyAuth";
import { prisma } from "@/lib/prisma";
import { extractCleanShopDomain } from "@/lib/utils";

/**
 * POST /api/shopify/auth/exchange
 *
 * Called from the embedded app (App Bridge) to exchange a short-lived
 * Shopify session token (ID token) for an offline access token.
 *
 * Body: { sessionToken: string, shop: string }
 * Returns: { ok: true, storeId, shopDomain, storeName, isNew: boolean }
 */
export async function POST(request: NextRequest) {
  let rawShop: string | null = null;
  try {
    const body = await request.json().catch(() => ({}));
    rawShop = body.shop || null;
    const { sessionToken, shop } = body;

    if (!sessionToken || !shop) {
      return NextResponse.json(
        { error: "Missing sessionToken or shop in request body." },
        { status: 400 }
      );
    }

    const shopDomain = extractCleanShopDomain(shop);

    // Validate and decode the session token
    const decoded = decodeSessionToken(sessionToken);
    if (!decoded || !decoded.shopDomain) {
      return NextResponse.json(
        { error: "Invalid or expired Shopify session token." },
        { status: 401 }
      );
    }

    // Make sure the token is for the shop they claim
    if (decoded.shopDomain !== shopDomain) {
      return NextResponse.json(
        { error: "Session token shop mismatch." },
        { status: 401 }
      );
    }

    // Check if store already exists in DB with a valid access token
    let store = await prisma.shopifyStore.findUnique({ where: { shopDomain } });
    let isNew = false;

    // If not found by shopDomain, check if an existing connected store changed domain to shopDomain
    if (!store) {
      const allConnected = await prisma.shopifyStore.findMany({
        where: { isConnected: true },
        select: { id: true, shopDomain: true, accessToken: true, storeName: true, email: true },
      });
      for (const candidate of allConnected) {
        if (!candidate.accessToken) continue;
        try {
          const info = await fetchShopInfo(shopDomain, candidate.accessToken).catch(() => null);
          if (info) {
            console.log(
              `[VOOP SHOPIFY] Found domain change for existing store ${candidate.id}: updating from ${candidate.shopDomain} to ${shopDomain}`
            );
            const conflict = await prisma.shopifyStore.findUnique({ where: { shopDomain } });
            if (conflict && conflict.id !== candidate.id) {
              await prisma.shopifyStore.delete({ where: { id: conflict.id } }).catch(() => {});
            }
            store = await prisma.shopifyStore.update({
              where: { id: candidate.id },
              data: {
                shopDomain,
                storeName: info.name || candidate.storeName,
                email: info.email || candidate.email,
                isConnected: true,
              },
            });
            break;
          }
        } catch (_aliasErr) {}
      }
    }

    // Perform token exchange to get/refresh the offline access token
    let accessToken: string;
    try {
      const result = await exchangeSessionTokenForAccessToken(shopDomain, sessionToken);
      accessToken = result.accessToken;
    } catch (exchangeErr: any) {
      console.error("[TokenExchange] Failed:", exchangeErr.message);

      // If we already have a stored token, use it as fallback
      if (store?.accessToken && store.isConnected) {
        const userCount = await prisma.user.count({ where: { storeId: store.id } });
        return NextResponse.json({
          ok: true,
          storeId: store.id,
          shopDomain: store.shopDomain,
          storeName: store.storeName || store.shopDomain,
          isNew: false,
          needsOnboarding: userCount === 0,
        });
      }

      return NextResponse.json(
        { error: `Token exchange failed: ${exchangeErr.message}` },
        { status: 500 }
      );
    }

    // Fetch current shop info from Shopify
    const shopInfo = await fetchShopInfo(shopDomain, accessToken).catch(() => null);
    const canonicalDomain = shopInfo?.myshopify_domain
      ? extractCleanShopDomain(shopInfo.myshopify_domain)
      : shopDomain;

    // Upsert or update store in DB preserving identity
    const wasNew = !store;
    if (store) {
      if (canonicalDomain !== store.shopDomain) {
        const conflict = await prisma.shopifyStore.findUnique({ where: { shopDomain: canonicalDomain } });
        if (conflict && conflict.id !== store.id) {
          await prisma.shopifyStore.delete({ where: { id: conflict.id } }).catch(() => {});
        }
      }
      store = await prisma.shopifyStore.update({
        where: { id: store.id },
        data: {
          shopDomain: canonicalDomain,
          accessToken,
          storeName: shopInfo?.name || store.storeName || canonicalDomain,
          email: shopInfo?.email || store.email,
          currency: shopInfo?.currency || store.currency || "INR",
          isConnected: true,
        },
      });
    } else {
      store = await prisma.shopifyStore.upsert({
        where: { shopDomain: canonicalDomain },
        create: {
          shopDomain: canonicalDomain,
          accessToken,
          storeName: shopInfo?.name || canonicalDomain,
          email: shopInfo?.email,
          currency: shopInfo?.currency || "INR",
          isConnected: true,
        },
        update: {
          accessToken,
          storeName: shopInfo?.name || canonicalDomain,
          email: shopInfo?.email,
          currency: shopInfo?.currency || "INR",
          isConnected: true,
        },
      });
    }

    isNew = wasNew;

    // Ensure dedicated VOOP account exists for this store
    let voopUser: any = null;
    if (store.accountId) {
      voopUser = await prisma.user.findUnique({ where: { id: store.accountId } });
    }

    if (!voopUser) {
      voopUser = await prisma.user.findFirst({
        where: { storeId: store.id, role: "ADMIN" },
      });
    }

    if (!voopUser && store.email) {
      voopUser = await prisma.user.findUnique({
        where: { email: store.email.toLowerCase() },
      });
      if (voopUser) {
        await prisma.user.update({
          where: { id: voopUser.id },
          data: { storeId: store.id },
        });
        await prisma.shopifyStore.update({
          where: { id: store.id },
          data: { accountId: voopUser.id },
        });
      }
    }

    const needsOnboarding = !voopUser || voopUser.passwordHash === "SHOPIFY_EMBEDDED_MANAGED_ACCOUNT";

    const { getOrEnsureVoopStoreId } = await import("@/lib/id-generator");
    const permanentVoopStoreId = await getOrEnsureVoopStoreId(store.id, voopUser?.id);

    const requestId = Math.random().toString(36).substring(2, 9);
    const host = request.headers.get("x-shopify-host") || "";
    console.log(`[SHOPIFY_CONTEXT] requestId=${requestId} shop=${store.shopDomain} host=${host || "none"} authenticated=true shopifyStoreId=${store.id} voopStoreId=${permanentVoopStoreId} voopAccountId=${voopUser?.id || "none"} needsOnboarding=${needsOnboarding}`);

    return NextResponse.json({
      ok: true,
      storeId: store.id,
      voopStoreId: permanentVoopStoreId,
      shopDomain: store.shopDomain,
      storeName: store.storeName || store.shopDomain,
      accountId: voopUser?.id || null,
      username: voopUser?.username || null,
      isNew,
      needsOnboarding,
    });
  } catch (err: any) {
    const requestId = Math.random().toString(36).substring(2, 9);
    console.warn(`[SHOPIFY_AUTH_ERROR] requestId=${requestId} reason="${err.message}" shop=${rawShop || "none"} host=${request.headers.get("x-shopify-host") || "none"}`);
    return NextResponse.json(
      { error: err.message || "Internal server error" },
      { status: 500 }
    );
  }
}

/**
 * GET /api/shopify/auth/exchange?shop=...
 * Quick check: is this store already connected?
 */
export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const shop = searchParams.get("shop");

  if (!shop) {
    return NextResponse.json({ error: "Missing shop parameter." }, { status: 400 });
  }

  const shopDomain = extractCleanShopDomain(shop);
  const store = await prisma.shopifyStore.findUnique({
    where: { shopDomain },
    select: {
      id: true,
      shopDomain: true,
      storeName: true,
      isConnected: true,
      lastProductSyncAt: true,
      lastOrderSyncAt: true,
      _count: { select: { users: true } },
    },
  });

  if (!store || !store.isConnected) {
    return NextResponse.json({ connected: false });
  }

  return NextResponse.json({
    connected: true,
    storeId: store.id,
    shopDomain: store.shopDomain,
    storeName: store.storeName,
    needsOnboarding: store._count.users === 0,
    hasProductSync: !!store.lastProductSyncAt,
    hasOrderSync: !!store.lastOrderSyncAt,
  });
}
