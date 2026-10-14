import { prisma } from "@/lib/prisma";

export async function pushSyncDataToWebApp(storeId: string, customUrl?: string): Promise<{ success: boolean; message: string; data?: any }> {
  try {
    const webAppUrl = customUrl || process.env.VOOP_WEBAPP_URL || "https://voop-webapp.fly.dev";

    const store = await prisma.shopifyStore.findUnique({
      where: { id: storeId },
    });

    if (!store) {
      throw new Error("Store not found");
    }

    const products = await prisma.shopifyProduct.findMany({
      where: { storeId },
      include: { variants: true },
      orderBy: { updatedAt: "desc" },
    });

    const orders = await prisma.shopifyOrder.findMany({
      where: { storeId },
      include: {
        items: true,
        fulfillments: true,
      },
      orderBy: { createdAt: "desc" },
    });

    const payload = {
      source: "VOOP_SHOPIFY_SYNC_APP",
      timestamp: new Date().toISOString(),
      store: {
        id: store.id,
        shopDomain: store.shopDomain,
        storeName: store.storeName || store.shopDomain,
        currency: store.currency || "INR",
      },
      products,
      orders,
    };

    const targetEndpoint = `${webAppUrl.replace(/\/$/, "")}/api/ingest/sync-app`;
    console.log(`[VoopPushService] Pushing ${orders.length} orders & ${products.length} products to ${targetEndpoint}...`);

    const res = await fetch(targetEndpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });

    if (!res.ok) {
      const errText = await res.text();
      return { success: false, message: `Failed to push to Web App (${res.status}): ${errText}` };
    }

    const json = await res.json();
    return { success: true, message: `Successfully pushed data to VOOP Web App: ${json.message || "OK"}`, data: json };
  } catch (error: any) {
    console.error("[VoopPushService] Push error:", error.message);
    return { success: false, message: `Push error: ${error.message}` };
  }
}
