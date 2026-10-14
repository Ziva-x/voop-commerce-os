import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { verifyShopifyWebhook } from "@/lib/shopify";
import {
  normalizeFulfillmentStatus,
  normalizeFinancialStatus,
  isOrderCancelled,
  isOrderFulfilled,
  isOrderPartiallyFulfilled,
  getFulfillmentStatusLabel,
} from "@/lib/shopifyStatusNormalizer";
import { OrderReconciliationService } from "@/lib/services/OrderReconciliationService";

import { extractCleanShopDomain } from "@/lib/utils";

export async function POST(request: NextRequest) {
  try {
    const topic = request.headers.get("x-shopify-topic") || "unknown";
    const rawShopDomain = request.headers.get("x-shopify-shop-domain");
    const hmacHeader = request.headers.get("x-shopify-hmac-sha256");
    const eventId = request.headers.get("x-shopify-event-id") || request.headers.get("x-shopify-webhook-id");

    const rawBody = await request.text();

    if (!rawShopDomain) {
      return NextResponse.json({ error: "Missing x-shopify-shop-domain header" }, { status: 400 });
    }

    const cleanDomain = extractCleanShopDomain(rawShopDomain);
    const store = await prisma.shopifyStore.findUnique({ where: { shopDomain: cleanDomain } });
    if (!store) {
      return NextResponse.json({ error: "Store not found" }, { status: 404 });
    }

    // Verify HMAC if store has webhook secret
    if (store?.webhookSecret && hmacHeader) {
      const isValid = verifyShopifyWebhook(rawBody, hmacHeader, store.webhookSecret);
      if (!isValid) {
        return NextResponse.json({ error: "Invalid webhook HMAC signature" }, { status: 401 });
      }
    }

    let payload: any = {};
    try {
      payload = JSON.parse(rawBody);
    } catch {
      payload = { raw: rawBody };
    }

    // Record webhook event
    const webhookEvent = await prisma.shopifyWebhookEvent.create({
      data: {
        storeId: store?.id || null,
        topic,
        shopifyEventId: eventId || null,
        payload: typeof payload === "string" ? payload : JSON.stringify(payload),
        status: "PROCESSED",
        receivedAt: new Date(),
        processedAt: new Date(),
      },
    });

    if (!store) {
      return NextResponse.json({ received: true, note: "No matching store found" });
    }

    // Process Order Deletion
    if (topic === "orders/delete") {
      const cleanOrderId = String(payload?.id || "").replace("gid://shopify/Order/", "").trim();
      if (cleanOrderId && store?.id) {
        await prisma.shopifyOrder.updateMany({
          where: { storeId: store.id, shopifyOrderId: cleanOrderId },
          data: { deletedAt: new Date() },
        });
        return NextResponse.json({ success: true, action: "soft_deleted", orderId: cleanOrderId });
      }
    }

    // Process Real-Time Orders / Fulfillments / Refunds / Order-Edits Webhooks
    if (topic.startsWith("orders/") || topic.startsWith("fulfillments/") || topic.startsWith("refunds/")) {
      const rawOrderId = payload?.order_edit?.order_id || payload?.order_id || payload?.id;
      const shopifyOrderId = String(rawOrderId || "").trim();
      if (!shopifyOrderId || !store?.id) {
        return NextResponse.json({ received: true, note: "Missing payload order ID or store.id" });
      }

      // Crucial: Only process the affected single order (NEVER fetch/scan all orders)
      const reconcileResult = await OrderReconciliationService.reconcileSingleOrder(
        store.id,
        shopifyOrderId,
        topic.startsWith("orders/") && payload.line_items && !topic.includes("edited") ? payload : undefined
      );

      return NextResponse.json({
        success: reconcileResult.success,
        processedOrderId: shopifyOrderId,
        reconcileResult,
        processedEventId: webhookEvent.id,
      });
    }

    return NextResponse.json({ success: true, processedEventId: webhookEvent.id });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
