import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { testShopifyConnection } from "@/lib/shopify";
import { extractCleanShopDomain } from "@/lib/utils";

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const code = searchParams.get("code");
  const shop = searchParams.get("shop");

  if (!code || !shop) {
    return NextResponse.json({ error: "Missing authorization code or shop domain" }, { status: 400 });
  }

  const cleanDomain = extractCleanShopDomain(shop);
  const origin = new URL(request.url).origin;

  try {
    // ─── 1. Identify the VOOP account making this request ────────────────────
    // Capture the session FIRST — before any async store operations — so we
    // never lose the user context.
    const session = await getServerSession(authOptions);
    const sessionUserId: string | null = (session?.user as any)?.id ?? null;

    // ─── 2. Check ownership: does this store already belong to another account?
    const existingStore = await prisma.shopifyStore.findUnique({
      where: { shopDomain: cleanDomain },
      include: { users: { where: { role: "ADMIN" } }, memberships: true },
    });

    const existingAdmin = existingStore?.users?.[0] ?? null;
    const existingOwnerId = existingStore?.accountId || existingAdmin?.id;

    if (existingOwnerId && sessionUserId && existingOwnerId !== sessionUserId) {
      const isMember = existingStore?.memberships?.some((m: any) => m.userId === sessionUserId);
      if (!isMember) {
        // Different account is trying to claim an already-owned store — BLOCK IT
        return NextResponse.redirect(
          `${origin}/settings?tab=store&error=${encodeURIComponent(
            "This Shopify store is already connected to another VOOP account."
          )}`
        );
      }
    }

    // ─── 3. Exchange OAuth code for offline access token ────────────────────
    const clientId =
      existingStore?.apiKey ||
      process.env.SHOPIFY_CLIENT_ID ||
      process.env.SHOPIFY_API_KEY ||
      "9e75868a20c3b7712800a03fbb4e89e2";
    const clientSecret =
      existingStore?.apiSecret ||
      process.env.SHOPIFY_CLIENT_SECRET ||
      process.env.SHOPIFY_API_SECRET ||
      "";

    const tokenUrl = `https://${cleanDomain}/admin/oauth/access_token`;
    const tokenResponse = await fetch(tokenUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ client_id: clientId, client_secret: clientSecret, code }),
    });

    if (!tokenResponse.ok) {
      const errText = await tokenResponse.text();
      return NextResponse.json({ error: `OAuth Token exchange failed: ${errText}` }, { status: 400 });
    }

    const tokenData = await tokenResponse.json();
    const accessToken = tokenData.access_token;

    // ─── 4. Fetch real shop details ──────────────────────────────────────────
    const testResult = await testShopifyConnection(cleanDomain, accessToken);
    const shopInfo = testResult.shop;
    const finalDomain = shopInfo?.myshopifyDomain ? extractCleanShopDomain(shopInfo.myshopifyDomain) : cleanDomain;

    // ─── 5. Save / update ShopifyStore record preserving permanent identity ──
    let storeToUpdate: any = existingStore;
    if (!storeToUpdate && finalDomain !== cleanDomain) {
      storeToUpdate = await prisma.shopifyStore.findUnique({
        where: { shopDomain: finalDomain },
      });
    }

    let store: any;
    if (storeToUpdate) {
      store = await prisma.shopifyStore.update({
        where: { id: storeToUpdate.id },
        data: {
          shopDomain: finalDomain,
          accessToken,
          apiKey: clientId,
          apiSecret: clientSecret,
          storeName: shopInfo?.name || finalDomain,
          email: shopInfo?.email,
          currency: shopInfo?.currency || "INR",
          isConnected: true,
        },
      });
    } else {
      store = await prisma.shopifyStore.upsert({
        where: { shopDomain: finalDomain },
        create: {
          shopDomain: finalDomain,
          accessToken,
          apiKey: clientId,
          apiSecret: clientSecret,
          storeName: shopInfo?.name || finalDomain,
          email: shopInfo?.email,
          currency: shopInfo?.currency || "INR",
          isConnected: true,
        },
        update: {
          accessToken,
          apiKey: clientId,
          apiSecret: clientSecret,
          storeName: shopInfo?.name || finalDomain,
          email: shopInfo?.email,
          currency: shopInfo?.currency || "INR",
          isConnected: true,
        },
      });
    }

    // ─── 6. CRITICAL: Link the VOOP account to this store & assign permanent Store ID ────
    const { getOrEnsureVoopStoreId, getOrEnsurePublicStoreRef } = await import("@/lib/id-generator");
    const permanentVoopStoreId = await getOrEnsureVoopStoreId(store.id, sessionUserId || existingAdmin?.id);
    await getOrEnsurePublicStoreRef(store.id);

    if (sessionUserId) {
      await prisma.user.update({
        where: { id: sessionUserId },
        data: {
          storeId: store.id,
          voopStoreId: permanentVoopStoreId,
          role: "ADMIN",
        },
      });
      await prisma.shopifyStore.update({
        where: { id: store.id },
        data: { accountId: sessionUserId },
      });
    }

    // ─── 7. Register Real-Time Order Lifecycle Webhooks ─────────────────────
    try {
      const { OrderReconciliationService } = await import("@/lib/services/OrderReconciliationService");
      OrderReconciliationService.registerStoreWebhooks(store.id).catch(console.error);
    } catch (_) {}

    // ─── 8. Redirect based on context ───────────────────────────────────────
    if (sessionUserId) {
      // User connected the store from Settings → trigger auto-sync
      return NextResponse.redirect(`${origin}/settings?tab=store&sync=true`);
    } else if (existingAdmin) {
      // Existing merchant re-installing from Shopify Admin (no VOOP session active)
      // Kick off a background re-sync but don't block the redirect
      const { syncAll } = await import("@/lib/shopify");
      syncAll(store.id, undefined, cleanDomain).catch((err) =>
        console.error("[OAuth Callback] Re-install sync error:", err)
      );
      return NextResponse.redirect(`${origin}/?reinstalled=true&shop=${cleanDomain}`);
    } else {
      // NEW install from Shopify Admin — user has no VOOP account yet.
      // Redirect to onboarding so they can create/link their account.
      // The onboarding page will call /api/shopify/link-account to bind the store
      // to their new account after registration.
      return NextResponse.redirect(
        `${origin}/onboarding?shop=${cleanDomain}&storeId=${store.id}&storeName=${encodeURIComponent(
          store.storeName || cleanDomain
        )}`
      );
    }
  } catch (error: any) {
    console.error("[OAuth Callback] Error:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
