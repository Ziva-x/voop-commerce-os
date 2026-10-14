import { prisma } from "@/lib/prisma";
import { SHOPIFY_API_VERSION } from "@/lib/shopify";
import { InventoryService } from "@/lib/services/InventoryService";
import { ShipmentSyncService } from "@/lib/services/ShipmentSyncService";
import {
  normalizeFinancialStatus,
  normalizeFulfillmentStatus,
  isOrderCancelled,
  isOrderFulfilled,
} from "@/lib/shopifyStatusNormalizer";

export interface ReconcileResult {
  success: boolean;
  orderId?: string;
  orderNumber?: string;
  updatedFields?: string[];
  recordsCount: number;
  error?: string;
}

export class OrderReconciliationService {
  /**
   * 1. RECONCILE A SINGLE SHOPIFY ORDER
   *
   * Triggered by Shopify Webhook (e.g. orders/updated, orders/create, orders/cancelled, orders/fulfilled)
   * or direct on-demand order refresh.
   *
   * Crucial Rules:
   * - ONLY fetches and processes the single affected order (NEVER scans the whole DB).
   * - Refreshes Shopify-source fields.
   * - Strictly PRESERVES VOOP-calculated data (invoiceCompanySnapshot, outwardScanned, rtoInwardScanned, deletedAt).
   * - Reconciles line items (quantities, prices, discounts, additions, removals).
   * - Executes inventory deductions for newly fulfilled quantities.
   * - Cascades cancellation to un-dispatched shipments if cancelled.
   */
  public static async reconcileSingleOrder(
    storeId: string,
    shopifyOrderId: string,
    preloadedPayload?: any
  ): Promise<ReconcileResult> {
    const startTime = Date.now();
    try {
      const cleanOrderId = String(shopifyOrderId).replace("gid://shopify/Order/", "").trim();
      if (!cleanOrderId) {
        return { success: false, recordsCount: 0, error: "Missing shopifyOrderId" };
      }

      const store = await prisma.shopifyStore.findUnique({
        where: { id: storeId },
      });

      if (!store || !store.isConnected || !store.accessToken) {
        return { success: false, recordsCount: 0, error: "Store not found or not connected" };
      }

      // 1. Fetch the authoritative, latest order representation from Shopify if not provided
      let orderData = preloadedPayload;
      if (!orderData || !orderData.line_items || !orderData.total_price) {
        const url = `https://${store.shopDomain}/admin/api/${SHOPIFY_API_VERSION}/orders/${cleanOrderId}.json`;
        const res = await fetch(url, {
          headers: {
            "Content-Type": "application/json",
            "X-Shopify-Access-Token": store.accessToken,
          },
        });

        if (!res.ok) {
          const errText = await res.text();
          return {
            success: false,
            recordsCount: 0,
            error: `Failed to fetch order ${cleanOrderId} from Shopify (${res.status}): ${errText}`,
          };
        }

        const json = await res.json();
        orderData = json.order;
      }

      if (!orderData) {
        return { success: false, recordsCount: 0, error: "Empty order payload from Shopify" };
      }

      // 2. Extract and normalize Shopify-source fields
      const rawOrderNumber = (orderData.name || "").replace("#", "").trim();
      const shopifyOrderNumber = orderData.order_number != null ? String(orderData.order_number) : (rawOrderNumber || cleanOrderId);
      const shopifyOrderName = (orderData.name && String(orderData.name).trim()) || (shopifyOrderNumber ? `#${shopifyOrderNumber}` : `#${cleanOrderId}`);
      const orderNumber = shopifyOrderNumber;
      const canonicalOrderName = shopifyOrderName;

      const customerName =
        orderData.shipping_address?.name ||
        (orderData.customer
          ? [orderData.customer.first_name, orderData.customer.last_name].filter(Boolean).join(" ")
          : null) ||
        orderData.customer?.displayName ||
        orderData.billing_address?.name ||
        null;

      const phone = orderData.phone || orderData.shipping_address?.phone || orderData.customer?.phone || null;
      const email = orderData.email || orderData.customer?.email || null;

      const totalPrice = parseFloat(orderData.total_price || "0") || 0.0;
      const subtotalPrice = parseFloat(orderData.subtotal_price || "0") || 0.0;
      const totalTax = parseFloat(orderData.total_tax || "0") || 0.0;
      const totalDiscounts = parseFloat(orderData.total_discounts || "0") || 0.0;

      const financialStatus = normalizeFinancialStatus(orderData.financial_status);
      const fulfillmentStatus = normalizeFulfillmentStatus(orderData.fulfillment_status);

      const isCancelled = isOrderCancelled(orderData);
      const cancelledAt = orderData.cancelled_at
        ? new Date(orderData.cancelled_at)
        : isCancelled
        ? new Date()
        : null;

      const shopifyOrderCreatedAt = new Date(orderData.created_at || Date.now());
      const createdAt = shopifyOrderCreatedAt;
      const processedAt = orderData.processed_at
        ? new Date(orderData.processed_at)
        : shopifyOrderCreatedAt;

      const shippingAddress = orderData.shipping_address ? JSON.stringify(orderData.shipping_address) : null;
      const rawPayload = JSON.stringify(orderData);
      const tags = Array.isArray(orderData.tags) ? orderData.tags.join(", ") : orderData.tags || null;
      const note = orderData.note || null;
      const currency = orderData.currency || store.currency || "INR";

      // 3. Upsert order in VOOP DB while preserving VOOP-specific data
      const savedOrder = await prisma.shopifyOrder.upsert({
        where: {
          storeId_shopifyOrderId: {
            storeId: store.id,
            shopifyOrderId: cleanOrderId,
          },
        },
        create: {
          storeId: store.id,
          shopifyOrderId: cleanOrderId,
          shopifyOrderNumber,
          shopifyOrderName,
          shopifyOrderCreatedAt,
          orderNumber,
          name: canonicalOrderName,
          customerName,
          email,
          phone,
          currency,
          totalPrice,
          subtotalPrice,
          totalTax,
          totalDiscounts,
          financialStatus,
          fulfillmentStatus,
          processedAt,
          cancelledAt,
          shippingAddress,
          tags,
          note,
          rawPayload,
          createdAt,
          updatedAt: new Date(orderData.updated_at || Date.now()),
          syncedAt: new Date(),
        },
        update: {
          // SHOPIFY-SOURCE FIELDS ARE REFRESHED:
          shopifyOrderNumber,
          shopifyOrderName,
          shopifyOrderCreatedAt,
          orderNumber,
          name: canonicalOrderName,
          customerName,
          email,
          phone,
          currency,
          totalPrice,
          subtotalPrice,
          totalTax,
          totalDiscounts,
          financialStatus,
          fulfillmentStatus,
          processedAt,
          cancelledAt,
          shippingAddress,
          tags,
          note,
          rawPayload,
          updatedAt: new Date(orderData.updated_at || Date.now()),
          syncedAt: new Date(),
          // VOOP-CALCULATED DATA PRESERVED (NOT in update clause):
          // - invoiceCompanySnapshot
          // - outwardScanned, outwardScannedAt
          // - rtoInwardScanned, rtoInwardScannedAt
          // - deletedAt
        },
      });

      // 4. Reconcile Line Items
      const incomingLineItemIds: string[] = [];

      for (const item of orderData.line_items || []) {
        const shopifyLineItemId = String(item.id).replace("gid://shopify/LineItem/", "");
        incomingLineItemIds.push(shopifyLineItemId);

        const shopifyProductId = item.product_id
          ? String(item.product_id).replace("gid://shopify/Product/", "")
          : null;
        const shopifyVariantId = item.variant_id
          ? String(item.variant_id).replace("gid://shopify/ProductVariant/", "")
          : null;

        const unitPrice = parseFloat(item.price || "0") || 0.0;
        const discountTotal = parseFloat(item.total_discount || "0") || 0.0;
        const quantity = Number(item.quantity) || 1;
        const itemTotalPrice = unitPrice * quantity - discountTotal;
        const sku = (item.sku || "").trim().toUpperCase();

        // Calculate fulfilled quantity from active fulfillments
        const activeFulfillments = (orderData.fulfillments || []).filter(
          (f: any) => String(f.status || "").toLowerCase() !== "cancelled"
        );

        let fulfilledQtyFromFulfillments = 0;
        let latestFulfillmentId: string | undefined = undefined;

        for (const f of activeFulfillments) {
          for (const fItem of f.line_items || []) {
            const fLineId = String(fItem.id || "").replace("gid://shopify/LineItem/", "");
            if (fLineId === shopifyLineItemId) {
              fulfilledQtyFromFulfillments += Number(fItem.quantity) || 0;
              if (f.id) latestFulfillmentId = String(f.id);
            }
          }
        }

        let fulfilledQuantity = 0;
        if (activeFulfillments.length > 0) {
          fulfilledQuantity = Math.min(quantity, Math.max(0, fulfilledQtyFromFulfillments));
        } else if (
          fulfillmentStatus === "FULFILLED" ||
          item.fulfillment_status === "fulfilled" ||
          item.fulfillment_status === "FULFILLED"
        ) {
          fulfilledQuantity = quantity;
        } else if (item.fulfillment_status === "partial") {
          fulfilledQuantity = item.fulfillable_quantity != null ? Math.max(0, quantity - item.fulfillable_quantity) : 0;
        } else {
          // Unfulfilled, created, paid, packed, manifested, or scanned without fulfillment:
          fulfilledQuantity = 0;
        }

        // Check previous deduction state to handle incremental fulfillment
        const existingLine = await prisma.shopifyOrderItem.findUnique({
          where: {
            orderId_shopifyLineItemId: {
              orderId: savedOrder.id,
              shopifyLineItemId,
            },
          },
        });

        const previouslyDeducted = existingLine?.deductedQuantity || 0;
        const pendingDeduction = Math.max(0, fulfilledQuantity - previouslyDeducted);

        // Upsert the line item with existing deduction state preserved
        await prisma.shopifyOrderItem.upsert({
          where: {
            orderId_shopifyLineItemId: {
              orderId: savedOrder.id,
              shopifyLineItemId,
            },
          },
          create: {
            storeId: store.id,
            orderId: savedOrder.id,
            shopifyOrderId: cleanOrderId,
            shopifyLineItemId,
            shopifyProductId,
            shopifyVariantId,
            productTitle: item.title || item.name || "Product",
            variantTitle: item.variant_title || null,
            sku,
            quantity,
            fulfilledQuantity,
            unitPrice,
            discountTotal,
            totalPrice: itemTotalPrice,
            deductedQuantity: previouslyDeducted,
            isDeducted: previouslyDeducted >= quantity,
            deductionStatus: existingLine?.deductionStatus || (previouslyDeducted >= quantity ? "DEDUCTED" : (previouslyDeducted > 0 ? "PARTIALLY_DEDUCTED" : "PENDING")),
            rawPayload: JSON.stringify(item),
          },
          update: {
            shopifyProductId,
            shopifyVariantId,
            productTitle: item.title || item.name || "Product",
            variantTitle: item.variant_title || null,
            sku,
            quantity,
            fulfilledQuantity,
            unitPrice,
            discountTotal,
            totalPrice: itemTotalPrice,
            deductedQuantity: previouslyDeducted,
            isDeducted: previouslyDeducted >= quantity,
            rawPayload: JSON.stringify(item),
            updatedAt: new Date(),
          },
        });

        // Dynamic Physical Inventory Deduction for newly fulfilled units (SINGLE & COMBO)
        if (pendingDeduction > 0 && sku && sku !== "NULL" && sku !== "NO_SKU" && !isCancelled) {
          await InventoryService.deductSaleableInventory({
            storeId: store.id,
            sku,
            quantity: pendingDeduction,
            orderNumber,
            orderId: savedOrder.id,
            shopifyOrderId: cleanOrderId,
            orderLineId: shopifyLineItemId,
            fulfillmentId: latestFulfillmentId,
            source: "SHOPIFY_FULFILLMENT",
            referenceId: orderNumber,
            notes: `Auto deduction: Order #${orderNumber} fulfilled on Shopify (${pendingDeduction} unit(s))`,
          });
        } else if (pendingDeduction > 0 && (!sku || sku === "NULL" || sku === "NO_SKU")) {
          await prisma.shopifyOrderItem.update({
            where: {
              orderId_shopifyLineItemId: {
                orderId: savedOrder.id,
                shopifyLineItemId,
              },
            },
            data: { deductionStatus: "MAPPING_REQUIRED" },
          });
          console.error(`[VOOP INVENTORY ERROR] Order #${orderNumber} line item ${shopifyLineItemId} has no SKU assigned. Please assign a SKU in VOOP inventory.`);
        }
      }

      // If line items were deleted in Shopify, remove them from VOOP Order
      if (incomingLineItemIds.length > 0) {
        await prisma.shopifyOrderItem.deleteMany({
          where: {
            orderId: savedOrder.id,
            shopifyLineItemId: { notIn: incomingLineItemIds },
          },
        });
      }

      // 5. Reconcile Fulfillments & Tracking
      for (const f of orderData.fulfillments || []) {
        try {
          await ShipmentSyncService.processShopifyFulfillment(store.id, f, {
            ...savedOrder,
            shopifyOrderId: cleanOrderId,
            shopifyOrderNumber,
            shopifyOrderName,
            shopifyOrderCreatedAt,
            customerName,
            total_price: orderData.total_price,
            order_number: shopifyOrderNumber,
            name: canonicalOrderName,
            shipping_address: orderData.shipping_address,
            customer: orderData.customer,
          });
        } catch (fErr) {
          console.error(`[RECONCILE] Error processing fulfillment for order ${shopifyOrderName || orderNumber}:`, fErr);
        }
      }

      // 6. Cascade cancellation to un-dispatched shipments
      if (isCancelled) {
        try {
          await prisma.shipment.updateMany({
            where: {
              storeId: store.id,
              OR: [
                { shopifyOrderId: cleanOrderId },
                { orderNumber: orderNumber },
                { orderNumber: `#${orderNumber}` },
              ],
              outwardScanned: false,
              normalizedStatus: { notIn: ["DELIVERED", "CANCELLED", "CANCELLED_PRE_DISPATCH"] },
            },
            data: {
              status: "Cancelled",
              normalizedStatus: "CANCELLED_PRE_DISPATCH",
            },
          });
        } catch (_) {
          // non-blocking
        }
      }

      // 6b. Physical Inventory Reversal for Cancelled Orders, Fulfillments, or Line Refunds
      if (isCancelled) {
        try {
          await InventoryService.reverseOrderFulfillments(store.id, {
            shopifyOrderId: cleanOrderId,
            orderNumber,
            cancellationRef: orderData.cancelled_at || `CANCEL_${cleanOrderId}`,
            reason: orderData.cancel_reason || "Shopify Order Cancelled",
          });
        } catch (revErr) {
          console.error(`[OrderReconciliationService] Error reversing inventory for cancelled order ${orderNumber}:`, revErr);
        }
      } else {
        // Line-level refund restocks
        for (const refund of orderData.refunds || []) {
          for (const rItem of refund.refund_line_items || []) {
            const rLineId = String(rItem.line_item_id).replace("gid://shopify/LineItem/", "");
            const rQty = Number(rItem.quantity) || 0;
            if (rQty > 0 && rItem.restock_type !== "no_restock") {
              try {
                await InventoryService.reverseOrderLineFulfillment(store.id, {
                  orderId: savedOrder.id,
                  shopifyOrderId: cleanOrderId,
                  shopifyLineItemId: rLineId,
                  orderNumber,
                  cancelledQty: rQty,
                  cancellationRef: `REFUND_${refund.id}_${rLineId}`,
                  reason: "Shopify Line Refund Restock",
                });
              } catch (rErr) {
                console.error(`[OrderReconciliationService] Error reversing inventory for refunded line ${rLineId}:`, rErr);
              }
            }
          }
        }

        // Cancelled fulfillments
        for (const f of orderData.fulfillments || []) {
          if (String(f.status).toLowerCase() === "cancelled") {
            for (const fItem of f.line_items || []) {
              const fLineId = String(fItem.id || fItem.line_item_id).replace("gid://shopify/LineItem/", "");
              const fQty = Number(fItem.quantity) || 0;
              if (fQty > 0) {
                try {
                  await InventoryService.reverseOrderLineFulfillment(store.id, {
                    orderId: savedOrder.id,
                    shopifyOrderId: cleanOrderId,
                    shopifyLineItemId: fLineId,
                    fulfillmentId: String(f.id),
                    orderNumber,
                    cancelledQty: fQty,
                    cancellationRef: `FULFILLMENT_CANCEL_${f.id}_${fLineId}`,
                    reason: "Shopify Fulfillment Cancelled",
                  });
                } catch (fRevErr) {
                  console.error(`[OrderReconciliationService] Error reversing inventory for cancelled fulfillment ${f.id}:`, fRevErr);
                }
              }
            }
          }
        }
      }

      // 7. Audit log for near real-time update
      await prisma.syncLog.create({
        data: {
          storeId: store.id,
          type: isCancelled ? "ORDER_CANCELLED" : "ORDER_RECONCILED",
          status: "SUCCESS",
          recordsCount: 1,
          durationMs: Date.now() - startTime,
          details: `Order #${orderNumber} reconciled in real-time. Status: ${financialStatus} / ${fulfillmentStatus}.`,
          completedAt: new Date(),
        },
      });

      return {
        success: true,
        orderId: savedOrder.id,
        orderNumber,
        recordsCount: 1,
      };
    } catch (err: any) {
      console.error("[OrderReconciliationService] Reconcile error:", err);
      return {
        success: false,
        recordsCount: 0,
        error: err?.message || "Unknown error during order reconciliation",
      };
    }
  }

  /**
   * 2. INCREMENTAL RECONCILIATION SAFETY SYNC (EVERY 5 HOURS)
   *
   * Queries Shopify Admin API for orders changed since `sinceDate` (default 5-6 hours ago).
   * - ONLY fetches and updates orders whose `updated_at >= sinceDate`.
   * - NEVER reprocesses the entire historical order database.
   */
  public static async reconcileIncrementalOrders(
    storeId: string,
    sinceDate?: Date
  ): Promise<{ success: boolean; changedOrdersCount: number; durationMs: number; error?: string }> {
    const startTime = Date.now();
    try {
      const store = await prisma.shopifyStore.findUnique({
        where: { id: storeId },
      });

      if (!store || !store.isConnected || !store.accessToken) {
        return { success: false, changedOrdersCount: 0, durationMs: 0, error: "Store not connected" };
      }

      // Default to 6 hours ago to ensure overlap with 5-hour cron
      const cutoff = sinceDate || new Date(Date.now() - 6 * 60 * 60 * 1000);
      const sinceIso = cutoff.toISOString();

      console.log(`[OrderReconciliationService] 🔍 Checking incremental order changes for ${store.shopDomain} since ${sinceIso}...`);

      const url = new URL(`https://${store.shopDomain}/admin/api/${SHOPIFY_API_VERSION}/orders.json`);
      url.searchParams.set("status", "any");
      url.searchParams.set("updated_at_min", sinceIso);
      url.searchParams.set("limit", "250");

      const res = await fetch(url.toString(), {
        headers: {
          "Content-Type": "application/json",
          "X-Shopify-Access-Token": store.accessToken,
        },
      });

      if (!res.ok) {
        const errText = await res.text();
        throw new Error(`Shopify API error (${res.status}): ${errText}`);
      }

      const json = await res.json();
      const changedOrders: any[] = json.orders || [];

      console.log(`[OrderReconciliationService] 📦 Found ${changedOrders.length} changed order(s) since ${sinceIso}`);

      let reconciledCount = 0;
      for (const order of changedOrders) {
        const result = await this.reconcileSingleOrder(store.id, String(order.id), order);
        if (result.success) {
          reconciledCount++;
        }
      }

      // Record incremental reconciliation in sync logs
      await prisma.syncLog.create({
        data: {
          storeId: store.id,
          type: "ORDERS_INCREMENTAL",
          status: "SUCCESS",
          recordsCount: reconciledCount,
          durationMs: Date.now() - startTime,
          details: `5-Hour Safety Incremental Sync completed: ${reconciledCount} changed order(s) updated. (Scanned changes since ${sinceIso})`,
          completedAt: new Date(),
        },
      });

      // Update store lastOrderSyncAt
      await prisma.shopifyStore.update({
        where: { id: store.id },
        data: { lastOrderSyncAt: new Date() },
      });

      return {
        success: true,
        changedOrdersCount: reconciledCount,
        durationMs: Date.now() - startTime,
      };
    } catch (err: any) {
      console.error("[OrderReconciliationService] Incremental sync error:", err);
      return {
        success: false,
        changedOrdersCount: 0,
        durationMs: Date.now() - startTime,
        error: err?.message,
      };
    }
  }

  /**
   * 3. AUTOMATIC SHOPIFY WEBHOOK REGISTRATION
   *
   * Subscribes the store to real-time order lifecycle webhooks so Shopify notifies VOOP within seconds.
   */
  public static async registerStoreWebhooks(storeId: string): Promise<{ registered: string[]; existing: string[]; errors: string[] }> {
    const registered: string[] = [];
    const existing: string[] = [];
    const errors: string[] = [];

    try {
      const store = await prisma.shopifyStore.findUnique({ where: { id: storeId } });
      if (!store || !store.isConnected || !store.accessToken) {
        return { registered, existing, errors: ["Store not found or disconnected"] };
      }

      const baseUrl = (process.env.NEXTAUTH_URL || process.env.VOOP_WEBAPP_URL || "https://voop-webapp.fly.dev").replace(/\/+$/, "");
      const webhookUrl = `${baseUrl}/api/webhooks/shopify`;

      // 1. Fetch existing webhooks
      const listUrl = `https://${store.shopDomain}/admin/api/${SHOPIFY_API_VERSION}/webhooks.json`;
      const listRes = await fetch(listUrl, {
        headers: { "X-Shopify-Access-Token": store.accessToken },
      });

      let currentWebhooks: any[] = [];
      if (listRes.ok) {
        const listJson = await listRes.json();
        currentWebhooks = listJson.webhooks || [];
      }

      // Mandatory order lifecycle topics for near real-time sync
      const targetTopics = [
        "orders/create",
        "orders/updated",
        "orders/cancelled",
        "orders/fulfilled",
        "orders/partially_fulfilled",
        "orders/paid",
        "orders/edited",
        "orders/delete",
        "fulfillments/create",
        "fulfillments/update",
        "refunds/create",
      ];

      for (const topic of targetTopics) {
        const alreadyActive = currentWebhooks.some(
          (w) => w.topic === topic && w.address === webhookUrl
        );

        if (alreadyActive) {
          existing.push(topic);
          continue;
        }

        const createRes = await fetch(listUrl, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "X-Shopify-Access-Token": store.accessToken,
          },
          body: JSON.stringify({
            webhook: {
              topic,
              address: webhookUrl,
              format: "json",
            },
          }),
        });

        if (createRes.ok) {
          registered.push(topic);
        } else {
          const errBody = await createRes.text();
          errors.push(`${topic}: ${errBody}`);
        }
      }

      console.log(`[OrderReconciliationService] Webhooks for ${store.shopDomain}: Registered ${registered.length}, Already existing ${existing.length}`);
    } catch (err: any) {
      errors.push(err?.message || "Webhook registration failed");
    }

    return { registered, existing, errors };
  }
}
