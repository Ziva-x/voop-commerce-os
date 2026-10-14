import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { resolveShopifyContext } from "@/lib/shopifyAuth";

export async function GET(request: NextRequest) {
  try {
    const ctx = await resolveShopifyContext({ request });

    const products = await prisma.shopifyProduct.findMany({
      where: { storeId: ctx.storeId },
      include: { variants: true },
      orderBy: { updatedAt: "desc" },
    });

    const orders = await prisma.shopifyOrder.findMany({
      where: { storeId: ctx.storeId },
      include: {
        items: true,
        fulfillments: true,
      },
      orderBy: { createdAt: "desc" },
    });

    const stockItems = await prisma.stockItem.findMany({
      where: { storeId: ctx.storeId },
      orderBy: { sku: "asc" },
    });

    const ledger = await prisma.inventoryLedger.findMany({
      where: { storeId: ctx.storeId },
      take: 100,
      orderBy: { createdAt: "desc" },
    });

    const store = ctx.storeId ? await prisma.shopifyStore.findUnique({
      where: { id: ctx.storeId },
      select: { id: true, shopDomain: true, storeName: true, currency: true },
    }) : null;

    return NextResponse.json({
      success: true,
      source: "VOOP_SHOPIFY_SYNC_APP",
      timestamp: new Date().toISOString(),
      store: store ? {
        id: store.id,
        shopDomain: store.shopDomain,
        storeName: store.storeName || store.shopDomain,
        currency: store.currency || "INR",
      } : null,
      counts: {
        products: products.length,
        variants: products.reduce((acc, p) => acc + p.variants.length, 0),
        orders: orders.length,
        lineItems: orders.reduce((acc, o) => acc + o.items.length, 0),
      },
      products,
      orders,
      stockItems,
      ledger,
    });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
