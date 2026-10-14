import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { resolveShopifyContext } from "@/lib/shopifyAuth";
import { validateVoopRequest } from "@/lib/auth-voop";

export async function GET(request: NextRequest) {
  const auth = await validateVoopRequest(request);
  if (!auth.isValid) {
    return NextResponse.json({ error: auth.error || "Unauthorized" }, { status: 401 });
  }

  try {
    const store = await prisma.shopifyStore.findUnique({
      where: { id: auth.storeId }
    });

    const productsCount = await prisma.shopifyProduct.count({ where: { storeId: auth.storeId } });
    const variantsCount = await prisma.shopifyVariant.count({ where: { storeId: auth.storeId } });
    const ordersCount = await prisma.shopifyOrder.count({ where: { storeId: auth.storeId } });
    const syncErrorsCount = await prisma.syncLog.count({
      where: { storeId: auth.storeId, status: "FAILED" },
    });

    return NextResponse.json({
      success: true,
      bridgeVersion: "1.0.0",
      authenticatedAs: auth.keyName,
      store: store
        ? {
            id: store.id,
            shopDomain: store.shopDomain,
            storeName: store.storeName,
            currency: store.currency || "INR",
            isConnected: store.isConnected,
            lastProductSyncAt: store.lastProductSyncAt,
            lastOrderSyncAt: store.lastOrderSyncAt,
            lastFullSyncAt: store.lastFullSyncAt,
          }
        : null,
      counts: {
        products: productsCount,
        variants: variantsCount,
        orders: ordersCount,
        syncErrors: syncErrorsCount,
      },
      serverTime: new Date().toISOString(),
    });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
