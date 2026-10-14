import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { testShopifyConnection, syncAll } from "@/lib/shopify";
import { resolveShopifyContext, fetchShopInfo } from "@/lib/shopifyAuth";
import { extractCleanShopDomain } from "@/lib/utils";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";

export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    const userId = (session?.user as any)?.id;

    const body = await request.json().catch(() => ({}));
    const { shopDomain, accessToken: explicitToken, runInitialSync } = body;

    const cleanDomain = shopDomain ? extractCleanShopDomain(shopDomain) : undefined;
    if (!cleanDomain) {
      return NextResponse.json({ error: "Missing or invalid shopDomain" }, { status: 400 });
    }

    // 1. Ownership validation: check if this store is already connected to another VOOP account
    let existingStore = await prisma.shopifyStore.findUnique({
      where: { shopDomain: cleanDomain },
      include: {
        users: { where: { role: "ADMIN" } },
        memberships: true,
      },
    });

    if (!existingStore) {
      const allConnected = await prisma.shopifyStore.findMany({
        where: { isConnected: true },
        select: { id: true, shopDomain: true, accessToken: true },
      });
      for (const candidate of allConnected) {
        if (!candidate.accessToken) continue;
        try {
          const info = await fetchShopInfo(cleanDomain, candidate.accessToken).catch(() => null);
          if (info) {
            existingStore = await prisma.shopifyStore.findUnique({
              where: { id: candidate.id },
              include: {
                users: { where: { role: "ADMIN" } },
                memberships: true,
              },
            });
            break;
          }
        } catch (_e) {}
      }
    }

    if (existingStore) {
      const existingOwnerId = existingStore.accountId || existingStore.users?.[0]?.id;
      if (existingOwnerId && userId && existingOwnerId !== userId) {
        const isMember = existingStore.memberships?.some((m) => m.userId === userId);
        if (!isMember) {
          return NextResponse.json(
            {
              error: "This Shopify store is already connected to another VOOP account.",
              code: "STORE_ALREADY_CONNECTED",
            },
            { status: 409 }
          );
        }
      }
    }

    let accessToken = explicitToken;
    if (!accessToken) {
      const ctx = await resolveShopifyContext({
        request,
        shop: cleanDomain,
      });
      accessToken = ctx.accessToken;
    }

    // 2. Test live connection
    const testResult = await testShopifyConnection(cleanDomain, accessToken);
    if (!testResult.success) {
      return NextResponse.json(
        { error: `Connection failed: ${testResult.error}` },
        { status: 400 }
      );
    }

    const shop = testResult.shop!;
    const finalDomain = shop.myshopifyDomain ? extractCleanShopDomain(shop.myshopifyDomain) : cleanDomain;

    // 3. Save / Upsert Store in DB (Preserves permanent ID and identity)
    let storeToUpdate = existingStore;
    if (!storeToUpdate && finalDomain !== cleanDomain) {
      storeToUpdate = await prisma.shopifyStore.findUnique({
        where: { shopDomain: finalDomain },
        include: { users: { where: { role: "ADMIN" } }, memberships: true },
      });
    }

    let store: any;
    if (storeToUpdate) {
      store = await prisma.shopifyStore.update({
        where: { id: storeToUpdate.id },
        data: {
          shopDomain: finalDomain,
          accessToken,
          storeName: shop.name,
          email: shop.email,
          currency: shop.currency || "INR",
          isConnected: true,
          ...(userId && !storeToUpdate.accountId ? { accountId: userId } : {}),
        },
      });
    } else {
      store = await prisma.shopifyStore.upsert({
        where: { shopDomain: finalDomain },
        create: {
          shopDomain: finalDomain,
          accessToken,
          storeName: shop.name,
          email: shop.email,
          currency: shop.currency || "INR",
          isConnected: true,
          accountId: userId || undefined,
        },
        update: {
          accessToken,
          storeName: shop.name,
          email: shop.email,
          currency: shop.currency || "INR",
          isConnected: true,
        },
      });
    }

    // 4. Ensure permanent VOOP Store ID and opaque publicStoreRef
    const { getOrEnsurePublicStoreRef, getOrEnsureVoopStoreId } = await import("@/lib/id-generator");
    const permanentVoopStoreId = await getOrEnsureVoopStoreId(store.id, userId);
    const publicStoreRef = await getOrEnsurePublicStoreRef(store.id);

    if (userId) {
      await prisma.user
        .update({
          where: { id: userId },
          data: {
            storeId: store.id,
            voopStoreId: permanentVoopStoreId,
          },
        })
        .catch(() => {});

      if (!store.accountId) {
        await prisma.shopifyStore
          .update({
            where: { id: store.id },
            data: { accountId: userId },
          })
          .catch(() => {});
      }
    }

    // 5. Register Real-Time Order Lifecycle Webhooks & Run Initial Sync
    try {
      const { OrderReconciliationService } = await import("@/lib/services/OrderReconciliationService");
      OrderReconciliationService.registerStoreWebhooks(store.id).catch(console.error);
    } catch (_) {}

    let initialSyncResult = null;
    if (runInitialSync !== false) {
      initialSyncResult = await syncAll(store.id, undefined, cleanDomain);
    }

    return NextResponse.json({
      success: true,
      message: `Successfully connected to ${shop.name} (${cleanDomain})!`,
      store: {
        id: store.id,
        voopStoreId: permanentVoopStoreId,
        publicStoreRef,
        shopDomain: store.shopDomain,
        storeName: store.storeName,
        currency: store.currency,
        isConnected: store.isConnected,
      },
      initialSync: initialSyncResult,
    });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
