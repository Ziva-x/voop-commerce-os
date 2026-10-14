import { prisma } from "@/lib/prisma";
import { CourierService } from "@/lib/services/CourierService";

export interface ProcessFulfillmentResult {
  success: boolean;
  upsertedShipments: string[];
  skippedReason?: string;
  error?: string;
}

export class ShipmentSyncService {
  /**
   * Process a single Shopify fulfillment and automatically create/update VOOP shipments idempotently.
   * Scoped strictly to storeId.
   *
   * Shared by:
   * - Initial Sync (SyncWorker)
   * - Incremental Sync
   * - 5-Hour Reconciliation
   * - Webhook events (orders/updated, fulfillments/create, fulfillments/update)
   */
  public static async processShopifyFulfillment(
    storeId: string,
    fulfillment: any,
    order: any
  ): Promise<ProcessFulfillmentResult> {
    if (!storeId || !fulfillment) {
      return { success: false, upsertedShipments: [], skippedReason: "Missing storeId or fulfillment" };
    }

    const shopifyFulfillmentId = String(fulfillment.id || "").replace("gid://shopify/Fulfillment/", "").trim();

    // 1. Extract and normalize all available tracking numbers
    const trackingNumbersSet = new Set<string>();
    const trackingUrlsMap = new Map<string, string>();

    // Array tracking_numbers
    if (Array.isArray(fulfillment.tracking_numbers)) {
      fulfillment.tracking_numbers.forEach((num: any, idx: number) => {
        const clean = String(num || "").trim();
        if (clean) {
          trackingNumbersSet.add(clean);
          if (Array.isArray(fulfillment.tracking_urls) && fulfillment.tracking_urls[idx]) {
            trackingUrlsMap.set(clean, String(fulfillment.tracking_urls[idx]).trim());
          }
        }
      });
    }

    // Single tracking_number
    if (fulfillment.tracking_number) {
      const clean = String(fulfillment.tracking_number).trim();
      if (clean) {
        trackingNumbersSet.add(clean);
        if (fulfillment.tracking_url) {
          trackingUrlsMap.set(clean, String(fulfillment.tracking_url).trim());
        }
      }
    }

    // If no meaningful tracking numbers exist, do NOT create a shipment
    if (trackingNumbersSet.size === 0) {
      return {
        success: true,
        upsertedShipments: [],
        skippedReason: "No tracking number present on fulfillment",
      };
    }

    // 2. Extract order & customer details
    const rawOrderId = (order.shopifyOrderId || (order.id && !isNaN(Number(order.id)) ? order.id : null) || fulfillment.order_id || "")
      .toString()
      .replace("gid://shopify/Order/", "")
      .trim();
    const shopifyOrderId = rawOrderId || null;

    // Resolve parent ShopifyOrder to ensure canonical order name & number
    let parentOrder: any = null;
    if (storeId && shopifyOrderId) {
      try {
        parentOrder = await prisma.shopifyOrder.findFirst({
          where: {
            storeId,
            shopifyOrderId,
          },
        });
      } catch (_) {}
    }

    const shopifyOrderNumber =
      parentOrder?.shopifyOrderNumber ||
      order.shopifyOrderNumber ||
      (order.order_number != null ? String(order.order_number) : null) ||
      (order.orderNumber != null ? String(order.orderNumber).replace(/^#+/, "").trim() : null) ||
      (order.name ? (order.name.match(/(\d+)(?!.*\d)/)?.[1] || order.name.replace(/^#+/, "").trim()) : null) ||
      shopifyOrderId;

    const shopifyOrderName =
      parentOrder?.shopifyOrderName ||
      order.shopifyOrderName ||
      (order.name && String(order.name).startsWith("#") ? String(order.name).trim() : null) ||
      (shopifyOrderNumber ? `#${shopifyOrderNumber}` : null) ||
      (shopifyOrderId ? `#${shopifyOrderId}` : "—");

    const orderNumber = shopifyOrderName;

    const shopifyOrderCreatedAt =
      parentOrder?.shopifyOrderCreatedAt ||
      parentOrder?.createdAt ||
      (order.shopifyOrderCreatedAt ? new Date(order.shopifyOrderCreatedAt) : null) ||
      (order.created_at ? new Date(order.created_at) : null) ||
      null;

    const customerName =
      parentOrder?.customerName ||
      order.customerName ||
      order.shipping_address?.name ||
      (order.customer
        ? [order.customer.first_name, order.customer.last_name].filter(Boolean).join(" ")
        : null) ||
      order.customer?.displayName ||
      order.billing_address?.name ||
      (order.name && !order.name.startsWith("#") ? order.name : null) ||
      "Customer";

    const customerPhone =
      parentOrder?.phone ||
      order.customerPhone ||
      order.phone ||
      order.shipping_address?.phone ||
      order.customer?.phone ||
      null;

    const financialStatus = (order.financialStatus || order.financial_status || "").toString().toUpperCase();
    const payment = financialStatus === "PAID" ? "Prepaid" : "COD";
    const amount = parseFloat(order.totalPrice || order.total_price || "0") || 0.0;

    const fulfillmentCreatedAt = fulfillment.created_at ? new Date(fulfillment.created_at) : new Date();
    const dateStr = fulfillmentCreatedAt.toISOString().slice(0, 10);

    // 3. Serialize fulfillment line items
    let lineItemsSummary: string | null = null;
    try {
      const items = (fulfillment.line_items || []).map((li: any) => ({
        id: li.id ? String(li.id) : null,
        title: li.title || li.name || "Product",
        variantTitle: li.variant_title || null,
        sku: li.sku ? String(li.sku).trim() : null,
        quantity: Number(li.quantity) || 1,
        price: parseFloat(li.price || "0") || 0.0,
      }));
      if (items.length > 0) {
        lineItemsSummary = JSON.stringify(items);
      }
    } catch (_) {
      lineItemsSummary = null;
    }

    const trackingCompany = fulfillment.tracking_company ? String(fulfillment.tracking_company).trim() : null;
    const upsertedShipments: string[] = [];

    // 4. Upsert shipment for each distinct tracking number (supports multi-tracking)
    for (const trackingNumber of Array.from(trackingNumbersSet)) {
      const cleanAwb = trackingNumber.trim();
      if (!cleanAwb) continue;

      const shopifyTrackingUrl = trackingUrlsMap.get(cleanAwb) || fulfillment.tracking_url || null;
      const courierType = CourierService.normalizeCarrierType(trackingCompany, cleanAwb);
      const detectedCourier = CourierService.detectCourier(trackingCompany, cleanAwb);
      const carrierDisplayName = detectedCourier.displayName || trackingCompany || "Other Carrier";
      const finalTrackingUrl = CourierService.getTrackingUrl(cleanAwb, trackingCompany, shopifyTrackingUrl);

      // Check if shipment already exists
      const existing = await prisma.shipment.findUnique({
        where: {
          storeId_awb: {
            storeId,
            awb: cleanAwb,
          },
        },
      });

      const rawShipStatus = String(fulfillment.shipment_status || "").toLowerCase().trim();
      let derivedStatus = "AWB Generated";
      let derivedNormalized = "AWB_GENERATED";

      if (rawShipStatus === "delivered") {
        derivedStatus = "Delivered";
        derivedNormalized = "DELIVERED";
      } else if (rawShipStatus === "in_transit") {
        derivedStatus = "In Transit";
        derivedNormalized = "IN_TRANSIT";
      } else if (rawShipStatus === "out_for_delivery") {
        derivedStatus = "Out for Delivery";
        derivedNormalized = "OUT_FOR_DELIVERY";
      } else if (rawShipStatus === "failure" || rawShipStatus === "rto" || rawShipStatus.includes("return")) {
        derivedStatus = "RTO";
        derivedNormalized = "RTO";
      } else if (rawShipStatus === "cancelled") {
        derivedStatus = "Cancelled";
        derivedNormalized = "CANCELLED";
      }

      if (existing) {
        // UPDATE existing shipment (Idempotent: never duplicate)
        // If shipment has no live carrier API scans and is still AWB_GENERATED, apply Shopify tracking status
        const shouldUpdateStatus = !existing.rawStatus && (existing.normalizedStatus === "AWB_GENERATED" || existing.normalizedStatus === "MANIFESTED" || derivedNormalized !== "AWB_GENERATED");

        await prisma.shipment.update({
          where: { id: existing.id },
          data: {
            shopifyFulfillmentId: shopifyFulfillmentId || existing.shopifyFulfillmentId,
            shopifyOrderId: shopifyOrderId || existing.shopifyOrderId,
            shopifyOrderNumber: shopifyOrderNumber || existing.shopifyOrderNumber,
            shopifyOrderName: shopifyOrderName || existing.shopifyOrderName,
            orderNumber: orderNumber || existing.orderNumber,
            orderCreatedAt: shopifyOrderCreatedAt || existing.orderCreatedAt,
            carrier: carrierDisplayName,
            courierType,
            trackingCompany: trackingCompany || existing.trackingCompany,
            trackingUrl: finalTrackingUrl || existing.trackingUrl,
            lineItemsSummary: lineItemsSummary || existing.lineItemsSummary,
            customerName: customerName || existing.customerName,
            customerPhone: customerPhone || existing.customerPhone,
            payment: existing.payment || payment,
            amount: existing.amount ? existing.amount : amount,
            date: existing.date || dateStr,
            status: shouldUpdateStatus && derivedNormalized !== "MANIFESTED" ? derivedStatus : existing.status,
            normalizedStatus: shouldUpdateStatus && derivedNormalized !== "MANIFESTED" ? derivedNormalized : existing.normalizedStatus,
          },
        });
      } else {
        // CREATE new shipment
        await prisma.shipment.create({
          data: {
            storeId,
            awb: cleanAwb,
            shopifyFulfillmentId,
            shopifyOrderId,
            shopifyOrderNumber,
            shopifyOrderName,
            orderNumber,
            orderCreatedAt: shopifyOrderCreatedAt,
            carrier: carrierDisplayName,
            courierType,
            trackingCompany: trackingCompany || carrierDisplayName,
            trackingUrl: finalTrackingUrl,
            lineItemsSummary,
            status: derivedStatus,
            normalizedStatus: derivedNormalized,
            payment,
            amount,
            date: dateStr,
            customerName,
            customerPhone,
            pickupDate: null,
          },
        });
      }

      upsertedShipments.push(cleanAwb);
    }

    // 5. Dual-sync to shopifyFulfillment record for DB consistency
    if (order.id && shopifyFulfillmentId) {
      try {
        const firstTracking = Array.from(trackingNumbersSet)[0];
        const firstUrl = trackingUrlsMap.get(firstTracking) || fulfillment.tracking_url || null;
        const lineItemIds = JSON.stringify(
          (fulfillment.line_items || []).map((li: any) =>
            String(li.id || "").replace("gid://shopify/LineItem/", "")
          ).filter(Boolean)
        );
        const deliveryStatus = (fulfillment.shipment_status || "MANIFESTED").toUpperCase();

        const detectedCourier = CourierService.detectCourier(trackingCompany, firstTracking);
        const resolvedCarrier = trackingCompany || detectedCourier.displayName || "Courier";

        await prisma.shopifyFulfillment.upsert({
          where: {
            orderId_shopifyFulfillmentId: {
              orderId: order.id,
              shopifyFulfillmentId,
            },
          },
          create: {
            storeId,
            orderId: order.id,
            shopifyOrderId: rawOrderId || "",
            shopifyFulfillmentId,
            status: (fulfillment.status || "SUCCESS").toUpperCase(),
            trackingCompany: resolvedCarrier,
            trackingNumber: firstTracking,
            trackingUrl: firstUrl,
            deliveryStatus,
            lineItemIds: lineItemIds !== "[]" ? lineItemIds : null,
            createdAt: fulfillmentCreatedAt,
            updatedAt: new Date(),
          },
          update: {
            status: (fulfillment.status || "SUCCESS").toUpperCase(),
            trackingCompany: resolvedCarrier,
            trackingNumber: firstTracking,
            trackingUrl: firstUrl,
            deliveryStatus,
            lineItemIds: lineItemIds !== "[]" ? lineItemIds : undefined,
            updatedAt: new Date(),
          },
        });
      } catch (fErr) {
        // Non-blocking
      }
    }

    return {
      success: true,
      upsertedShipments,
    };
  }

  /**
   * Comprehensive backfill and synchronization of all Shopify fulfillments and VOOP shipments for a store.
   * - Scans all ShopifyOrder records and extracts fulfillments from rawPayload
   * - Saves each fulfillment into shopify_fulfillments (with courier partner, AWB, URL, and line item IDs)
   * - Automatically creates / updates the shipment in shipments table (moving fulfilled items into Shipments & Couriers)
   * - Optionally queries Shopify REST API for any newly shipped orders
   */
  public static async syncAllStoreFulfillments(
    storeId: string,
    options?: { fetchFromShopifyApi?: boolean }
  ): Promise<{
    ordersChecked: number;
    fulfillmentsProcessed: number;
    shipmentsCreatedOrUpdated: number;
    apiOrdersFetched?: number;
  }> {
    if (!storeId) {
      return { ordersChecked: 0, fulfillmentsProcessed: 0, shipmentsCreatedOrUpdated: 0 };
    }

    let apiOrdersFetched = 0;

    // 1. Optionally fetch directly from Shopify REST API
    if (options?.fetchFromShopifyApi) {
      try {
        const store = await prisma.shopifyStore.findUnique({ where: { id: storeId } });
        if (store && store.isConnected && store.accessToken) {
          let pageInfo: string | null = null;
          while (true) {
            let url = `https://${store.shopDomain}/admin/api/2024-01/orders.json?status=any&fulfillment_status=shipped&limit=250`;
            if (pageInfo) {
              url += `&page_info=${pageInfo}`;
            }

            const res = await fetch(url, {
              headers: {
                "X-Shopify-Access-Token": store.accessToken,
                "Content-Type": "application/json",
              },
            });

            if (!res.ok) break;

            const linkHeader = res.headers.get("Link") || "";
            const nextMatch = linkHeader.match(/<[^>]*page_info=([^&>]+)[^>]*>;\s*rel="next"/);
            pageInfo = nextMatch ? nextMatch[1] : null;

            const json = await res.json();
            const shopifyOrders = json.orders || [];
            apiOrdersFetched += shopifyOrders.length;

            for (const sOrder of shopifyOrders) {
              const shopifyOrderId = String(sOrder.id).replace("gid://shopify/Order/", "");
              const existingDbOrder = await prisma.shopifyOrder.findUnique({
                where: { storeId_shopifyOrderId: { storeId, shopifyOrderId } },
                include: { items: true },
              });

              if (existingDbOrder) {
                // Update rawPayload with the complete fulfillment payload from Shopify
                await prisma.shopifyOrder.update({
                  where: { id: existingDbOrder.id },
                  data: {
                    rawPayload: JSON.stringify(sOrder),
                    fulfillmentStatus: "FULFILLED",
                  },
                });

                // Process fulfillments
                for (const f of sOrder.fulfillments || []) {
                  await this.processShopifyFulfillment(storeId, f, {
                    ...existingDbOrder,
                    name: sOrder.name || existingDbOrder.name,
                    order_number: sOrder.order_number || existingDbOrder.orderNumber,
                    shipping_address: sOrder.shipping_address,
                    customer: sOrder.customer,
                    items: existingDbOrder.items,
                  });
                }
              }
            }

            if (!pageInfo) break;
          }
        }
      } catch (apiErr) {
        console.error("[ShipmentSyncService] Error fetching from Shopify API:", apiErr);
      }
    }

    // 2. Scan all Shopify orders in the database and ingest fulfillments
    const orders = await prisma.shopifyOrder.findMany({
      where: { storeId },
      include: {
        items: true,
        fulfillments: true,
      },
    });

    let fulfillmentsProcessed = 0;
    let shipmentsCreatedOrUpdated = 0;

    for (const order of orders) {
      let rawFulfillments: any[] = [];

      // Extract fulfillments from rawPayload
      if (order.rawPayload) {
        try {
          const raw = JSON.parse(order.rawPayload);
          if (Array.isArray(raw.fulfillments) && raw.fulfillments.length > 0) {
            rawFulfillments = raw.fulfillments;
          }
        } catch (_) {}
      }

      // If no fulfillments in rawPayload but exist in db, use db fulfillments
      if (rawFulfillments.length === 0 && order.fulfillments && order.fulfillments.length > 0) {
        rawFulfillments = order.fulfillments.map((dbF) => ({
          id: dbF.shopifyFulfillmentId,
          tracking_number: dbF.trackingNumber,
          tracking_numbers: dbF.trackingNumber ? [dbF.trackingNumber] : [],
          tracking_company: dbF.trackingCompany,
          tracking_url: dbF.trackingUrl,
          created_at: dbF.createdAt,
          line_items: order.items.map((it) => ({
            id: it.shopifyLineItemId,
            title: it.productTitle,
            variant_title: it.variantTitle,
            sku: it.sku,
            quantity: it.quantity,
            price: it.unitPrice,
          })),
        }));
      }

      for (const f of rawFulfillments) {
        const res = await this.processShopifyFulfillment(storeId, f, order);
        fulfillmentsProcessed++;
        shipmentsCreatedOrUpdated += res.upsertedShipments.length;
      }
    }

    return {
      ordersChecked: orders.length,
      fulfillmentsProcessed,
      shipmentsCreatedOrUpdated,
      apiOrdersFetched,
    };
  }

  /**
   * Backfill shipments for existing fulfilled orders in a store.
   * Delegates to syncAllStoreFulfillments for exhaustive coverage.
   */
  public static async backfillShipmentsForStore(storeId: string): Promise<{
    processedFulfillments: number;
    createdShipments: number;
  }> {
    const result = await this.syncAllStoreFulfillments(storeId);
    return {
      processedFulfillments: result.fulfillmentsProcessed,
      createdShipments: result.shipmentsCreatedOrUpdated,
    };
  }
}

