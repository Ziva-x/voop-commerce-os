import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { authorizeStoreAccess } from "@/lib/auth-helpers";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  try {
    const auth = await authorizeStoreAccess(request);
    if (!auth.authorized || !auth.storeId) {
      return NextResponse.json(
        { error: auth.error || "Unauthorized" },
        {
          status: auth.status || 401,
          headers: { "Cache-Control": "no-store, no-cache, must-revalidate" },
        }
      );
    }

    const storeId = auth.storeId;
    const store = auth.store || (await prisma.shopifyStore.findUnique({ where: { id: storeId } }));

    if (!store) {
      return NextResponse.json({ error: "Store not found" }, { status: 404 });
    }

    const whereStore = { storeId: store.id };

    const [
      productsCount,
      variantsCount,
      ordersCount,
      syncErrorsCount,
      recentLogs,
    ] = await Promise.all([
      prisma.shopifyProduct.count({ where: whereStore }),
      prisma.shopifyVariant.count({ where: whereStore }),
      prisma.shopifyOrder.count({ where: whereStore }),
      prisma.syncLog.count({ where: { ...whereStore, status: "FAILED" } }),
      prisma.syncLog.findMany({
        where: whereStore,
        take: 5,
        orderBy: { startedAt: "desc" },
      }),
    ]);

    return NextResponse.json(
      {
        store: {
          id: store.id,
          voopStoreId: auth.voopStoreId || store.voopStoreId,
          shopDomain: store.shopDomain,
          storeName: store.storeName,
          currency: store.currency || "INR",
          isConnected: store.isConnected,
          lastProductSyncAt: store.lastProductSyncAt,
          lastOrderSyncAt: store.lastOrderSyncAt,
          lastFullSyncAt: store.lastFullSyncAt,
        },
        stats: {
          products: productsCount,
          variants: variantsCount,
          orders: ordersCount,
          syncErrors: syncErrorsCount,
        },
        recentLogs,
      },
      {
        headers: { "Cache-Control": "no-store, no-cache, must-revalidate" },
      }
    );
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

