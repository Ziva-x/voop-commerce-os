import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { SHOPIFY_API_VERSION } from "@/lib/shopify";
import {
  normalizeFulfillmentStatus,
  normalizeFinancialStatus,
  isOrderCancelled,
} from "@/lib/shopifyStatusNormalizer";
import { InventoryService } from "@/lib/services/InventoryService";
import { ShipmentSyncService } from "@/lib/services/ShipmentSyncService";

// Max runtime — Next.js default is 60s on serverless
export const maxDuration = 60;

const BATCH_SIZE = 50;
const TIME_BUDGET_MS = 8000; // 8 seconds per serverless invocation to avoid 504 timeouts
const MAX_RETRIES = 3;
const RETRY_BACKOFF_MS = [1000, 3000, 8000];

function safeDate(val: any, fallback?: Date): Date | null {
  if (!val) return fallback ?? null;
  const d = new Date(val);
  return isNaN(d.getTime()) ? (fallback ?? null) : d;
}

/** Update job state + heartbeat after each batch */
async function updateJobProgress(
  jobId: string,
  patch: {
    status?: string;
    currentBatch?: number;
    totalBatches?: number;
    processedCount?: number;
    totalCount?: number;
    pageInfo?: string | null;
    errorMessage?: string;
    completedAt?: Date;
    startedAt?: Date;
  }
) {
  await prisma.syncJob.update({
    where: { id: jobId },
    data: { ...patch, heartbeat: new Date() },
  });
}

/** Shopify REST paginated fetch (uses Link header cursors — more reliable for large datasets) */
async function shopifyRestFetch(
  shopDomain: string,
  accessToken: string,
  endpoint: string, // e.g. "/admin/api/2024-07/orders.json"
  params: Record<string, string> = {}
): Promise<{ data: any[]; nextPageInfo: string | null }> {
  const url = new URL(`https://${shopDomain}${endpoint}`);
  Object.entries(params).forEach(([k, v]) => url.searchParams.set(k, v));

  let attempt = 0;
  while (attempt <= MAX_RETRIES) {
    const res = await fetch(url.toString(), {
      headers: { "X-Shopify-Access-Token": accessToken },
    });

    if (res.status === 429) {
      const retryAfter = parseInt(res.headers.get("Retry-After") || "2") * 1000;
      const wait = Math.max(retryAfter, RETRY_BACKOFF_MS[Math.min(attempt, MAX_RETRIES - 1)]);
      console.log(`[SyncWorker] Rate limited — waiting ${wait}ms (attempt ${attempt + 1})`);
      await new Promise((r) => setTimeout(r, wait));
      attempt++;
      continue;
    }

    if (!res.ok) {
      if (attempt < MAX_RETRIES) {
        await new Promise((r) => setTimeout(r, RETRY_BACKOFF_MS[attempt]));
        attempt++;
        continue;
      }
      throw new Error(`Shopify API ${res.status}: ${await res.text()}`);
    }

    const json = await res.json();
    // Extract next page_info from Link header
    const linkHeader = res.headers.get("Link") || "";
    const nextMatch = linkHeader.match(/<[^>]*page_info=([^&>]+)[^>]*>;\s*rel="next"/);
    const nextPageInfo = nextMatch ? nextMatch[1] : null;

    const dataKey = Object.keys(json)[0]; // "orders", "products", etc.
    return { data: json[dataKey] || [], nextPageInfo };
  }

  throw new Error("Max retries exceeded");
}

/** Upsert a single Shopify order + line items */
async function upsertOrder(storeId: string, order: any) {
  if (!storeId || !order?.id) {
    console.warn("[SYNC_WORKER] Skipping order without valid storeId or order.id");
    return null;
  }
  const shopifyOrderId = String(order.id).replace("gid://shopify/Order/", "").trim();
  if (!shopifyOrderId) return null;

  const rawOrderNumber = (order.name || "").replace("#", "").trim();
  const shopifyOrderNumber = order.order_number != null ? String(order.order_number) : (rawOrderNumber || shopifyOrderId);
  const shopifyOrderName = (order.name && String(order.name).trim()) || (shopifyOrderNumber ? `#${shopifyOrderNumber}` : `#${shopifyOrderId}`);
  const orderNumber = shopifyOrderNumber;
  const canonicalOrderName = shopifyOrderName;

  const customerName =
    order.shipping_address?.name ||
    (order.customer ? [order.customer.first_name, order.customer.last_name].filter(Boolean).join(" ") : null) ||
    order.customer?.displayName ||
    order.billing_address?.name ||
    null;

  const phone = order.phone || order.shipping_address?.phone || order.customer?.phone || null;
  const email = order.email || order.customer?.email || null;

  const totalPrice = parseFloat(order.total_price || "0") || 0.0;
  const subtotalPrice = parseFloat(order.subtotal_price || "0") || 0.0;
  const totalTax = parseFloat(order.total_tax || "0") || 0.0;
  const totalDiscounts = parseFloat(order.total_discounts || "0") || 0.0;

  const financialStatus = normalizeFinancialStatus(order.financial_status);
  const fulfillmentStatus = normalizeFulfillmentStatus(order.fulfillment_status);

  const isCancelled = isOrderCancelled(order);
  const cancelledAt = order.cancelled_at ? safeDate(order.cancelled_at) : (isCancelled ? new Date() : null);
  const shopifyOrderCreatedAt = safeDate(order.created_at, new Date())!;
  const createdAt = shopifyOrderCreatedAt;
  const processedAt = order.processed_at ? safeDate(order.processed_at) : shopifyOrderCreatedAt;
  const updatedAt = safeDate(order.updated_at, new Date())!;

  const shippingAddress = order.shipping_address ? JSON.stringify(order.shipping_address) : null;
  const rawPayload = JSON.stringify(order);
  const tags = Array.isArray(order.tags) ? order.tags.join(", ") : order.tags || null;
  const note = order.note || null;
  const currency = order.currency || "INR";

  const savedOrder = await prisma.shopifyOrder.upsert({
    where: { storeId_shopifyOrderId: { storeId, shopifyOrderId } },
    create: {
      storeId,
      shopifyOrderId,
      shopifyOrderNumber,
      shopifyOrderName,
      shopifyOrderCreatedAt,
      orderNumber,
      name: canonicalOrderName,
      customerName,
      email,
      phone,
      financialStatus,
      fulfillmentStatus,
      totalPrice,
      subtotalPrice,
      totalTax,
      totalDiscounts,
      currency,
      processedAt,
      cancelledAt,
      shippingAddress,
      tags,
      note,
      rawPayload,
      createdAt,
      updatedAt,
      syncedAt: new Date(),
    },
    update: {
      shopifyOrderNumber,
      shopifyOrderName,
      shopifyOrderCreatedAt,
      orderNumber,
      name: canonicalOrderName,
      customerName,
      email,
      phone,
      financialStatus,
      fulfillmentStatus,
      totalPrice,
      subtotalPrice,
      totalTax,
      totalDiscounts,
      currency,
      processedAt,
      cancelledAt,
      shippingAddress,
      tags,
      note,
      rawPayload,
      updatedAt,
      syncedAt: new Date(),
    },
  });

  // Upsert Line Items
  for (const item of order.line_items || []) {
    const shopifyLineItemId = String(item.id).replace("gid://shopify/LineItem/", "");
    const shopifyProductId = item.product_id ? String(item.product_id).replace("gid://shopify/Product/", "") : null;
    const shopifyVariantId = item.variant_id ? String(item.variant_id).replace("gid://shopify/ProductVariant/", "") : null;
    const unitPrice = parseFloat(item.price || "0") || 0.0;
    const discountTotal = parseFloat(item.total_discount || "0") || 0.0;
    const quantity = Number(item.quantity) || 1;
    const itemTotalPrice = unitPrice * quantity - discountTotal;
    const sku = (item.sku || "").trim().toUpperCase();

    // Determine fulfilled quantity from active fulfillments
    const activeFulfillments = (order.fulfillments || []).filter(
      (f: any) => String(f.status || "").toLowerCase() !== "cancelled"
    );
    let fulfilledQtyFromFulfillments = 0;
    for (const f of activeFulfillments) {
      for (const fItem of f.line_items || []) {
        const fLineId = String(fItem.id || "").replace("gid://shopify/LineItem/", "");
        if (fLineId === shopifyLineItemId) {
          fulfilledQtyFromFulfillments += Number(fItem.quantity) || 0;
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
    } else {
      fulfilledQuantity = 0;
    }

    await prisma.shopifyOrderItem.upsert({
      where: {
        orderId_shopifyLineItemId: {
          orderId: savedOrder.id,
          shopifyLineItemId,
        },
      },
      create: {
        storeId,
        orderId: savedOrder.id,
        shopifyOrderId,
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
        rawPayload: JSON.stringify(item),
        updatedAt: new Date(),
      },
    });
  }

  // If order is cancelled, cascade cancellation to un-dispatched shipments
  if (isCancelled) {
    try {
      await prisma.shipment.updateMany({
        where: {
          storeId,
          OR: [
            { shopifyOrderId: savedOrder.shopifyOrderId },
            { orderNumber: savedOrder.orderNumber },
            { orderNumber: `#${savedOrder.orderNumber}` },
          ],
          outwardScanned: false,
          normalizedStatus: { notIn: ["DELIVERED", "CANCELLED", "CANCELLED_PRE_DISPATCH"] },
        },
        data: {
          status: "Cancelled",
          normalizedStatus: "CANCELLED_PRE_DISPATCH",
        },
      });
    } catch (_shipmentErr) {
      // Non-blocking
    }
  }

  // Automatically process fulfillments into VOOP shipments
  for (const f of order.fulfillments || []) {
    try {
      await ShipmentSyncService.processShopifyFulfillment(storeId, f, {
        ...savedOrder,
        shopifyOrderId,
        shopifyOrderNumber,
        shopifyOrderName,
        shopifyOrderCreatedAt,
        customerName,
        total_price: order.total_price,
        order_number: shopifyOrderNumber,
        name: canonicalOrderName,
        shipping_address: order.shipping_address,
        customer: order.customer,
      });
    } catch (fErr) {
      console.error(`[SYNC_WORKER] Error processing fulfillment for order ${shopifyOrderName || savedOrder.orderNumber}:`, fErr);
    }
  }

  return savedOrder;
}

/** Upsert a single Shopify product + variants */
async function upsertProduct(storeId: string, product: any) {
  const shopifyProductId = String(product.id).replace("gid://shopify/Product/", "");

  const saved = await prisma.shopifyProduct.upsert({
    where: { storeId_shopifyProductId: { storeId, shopifyProductId } },
    create: {
      storeId,
      shopifyProductId,
      title: product.title || "Untitled Product",
      handle: product.handle || null,
      vendor: product.vendor || null,
      productType: product.product_type || null,
      status: (product.status || "active").toUpperCase(),
      tags: Array.isArray(product.tags) ? product.tags.join(", ") : product.tags || null,
      imageUrl: product.image?.src || null,
      rawPayload: JSON.stringify(product),
      syncedAt: new Date(),
    },
    update: {
      title: product.title || "Untitled Product",
      handle: product.handle || null,
      vendor: product.vendor || null,
      productType: product.product_type || null,
      status: (product.status || "active").toUpperCase(),
      tags: Array.isArray(product.tags) ? product.tags.join(", ") : product.tags || null,
      imageUrl: product.image?.src || null,
      rawPayload: JSON.stringify(product),
      syncedAt: new Date(),
    },
  });

  for (const v of product.variants || []) {
    const shopifyVariantId = String(v.id).replace("gid://shopify/ProductVariant/", "");
    await prisma.shopifyVariant.upsert({
      where: { storeId_shopifyVariantId: { storeId, shopifyVariantId } },
      create: {
        storeId,
        productId: saved.id,
        shopifyProductId,
        shopifyVariantId,
        title: v.title || "Default Title",
        sku: (v.sku || "").trim().toUpperCase() || null,
        barcode: v.barcode || null,
        price: parseFloat(v.price || "0") || 0.0,
        compareAtPrice: v.compare_at_price ? parseFloat(v.compare_at_price) || 0.0 : null,
        inventoryQuantity: v.inventory_quantity ?? 0,
        imageUrl: null,
        rawPayload: JSON.stringify(v),
        syncedAt: new Date(),
      },
      update: {
        title: v.title || "Default Title",
        sku: (v.sku || "").trim().toUpperCase() || null,
        barcode: v.barcode || null,
        price: parseFloat(v.price || "0") || 0.0,
        compareAtPrice: v.compare_at_price ? parseFloat(v.compare_at_price) || 0.0 : null,
        inventoryQuantity: v.inventory_quantity ?? 0,
        rawPayload: JSON.stringify(v),
        syncedAt: new Date(),
      },
    });
  }
}

/** Run the orders sync loop for a job */
async function runOrdersSync(
  job: any,
  store: any
): Promise<{ completed: boolean; moreBatches: boolean; currentBatch: number; processedCount: number }> {
  const cycleStartTime = Date.now();
  let pageInfo: string | null = job.pageInfo || null; // Resume from checkpoint if set
  let batchNum = job.currentBatch || 0;
  let processedCount = job.processedCount || 0;
  let successfulCount = 0;
  let failedCount = 0;
  let isFirstBatch = batchNum === 0 && !pageInfo;
  const orderErrors: string[] = [];

  // Fetch total orders count from Shopify to populate totalCount, totalBatches, and ETA
  let totalCount = job.totalCount;
  if (!totalCount) {
    try {
      const countRes = await fetch(
        `https://${store.shopDomain}/admin/api/${SHOPIFY_API_VERSION}/orders/count.json?status=any`,
        { headers: { "X-Shopify-Access-Token": store.accessToken } }
      );
      if (countRes.ok) {
        const countJson = await countRes.json();
        totalCount = countJson.count;
        if (typeof totalCount === "number") {
          const totalBatches = Math.max(1, Math.ceil(totalCount / BATCH_SIZE));
          await updateJobProgress(job.id, { totalCount, totalBatches });
        }
      }
    } catch (_e) {
      // Non-blocking
    }
  }

  // Create or reuse SyncLog for history
  let syncLog = await prisma.syncLog.findFirst({
    where: { storeId: store.id, type: "ORDERS", status: "IN_PROGRESS" },
    orderBy: { startedAt: "desc" },
  });
  if (!syncLog) {
    syncLog = await prisma.syncLog.create({
      data: {
        storeId: store.id,
        type: "ORDERS",
        status: "IN_PROGRESS",
        startedAt: new Date(),
      },
    });
  }

  try {
    let hasMorePages = false;

    while (true) {
      const params: Record<string, string> = {
        limit: String(BATCH_SIZE),
      };
      if (pageInfo) {
        params.page_info = pageInfo;
      } else {
        params.status = "any";
      }

      const { data: orders, nextPageInfo } = await shopifyRestFetch(
        store.shopDomain,
        store.accessToken,
        `/admin/api/${SHOPIFY_API_VERSION}/orders.json`,
        params
      );

      isFirstBatch = false;

      if (orders.length === 0 && !nextPageInfo) {
        break; // Nothing to sync
      }

      for (const order of orders) {
        try {
          await upsertOrder(store.id, order);
          successfulCount++;
        } catch (orderErr: any) {
          failedCount++;
          console.error(`[SyncWorker] Order #${order.order_number || order.id} upsert error:`, orderErr.message);
          orderErrors.push(`Order #${order.order_number || order.id}: ${orderErr.message}`);
        }
        processedCount++;
      }

      batchNum++;
      pageInfo = nextPageInfo;

      await updateJobProgress(job.id, {
        currentBatch: batchNum,
        processedCount,
        pageInfo,
      });

      if (!nextPageInfo) {
        hasMorePages = false;
        break;
      }

      // Check time budget (8s) so Vercel serverless functions never 504 timeout
      if (Date.now() - cycleStartTime > TIME_BUDGET_MS) {
        console.log(`[SyncWorker] Time budget reached (${Date.now() - cycleStartTime}ms). Checkpointing batch ${batchNum} (processed: ${processedCount}).`);
        hasMorePages = true;
        break;
      }
    }

    if (hasMorePages) {
      // Chunk completed within budget, more batches remaining
      return { completed: false, moreBatches: true, currentBatch: batchNum, processedCount };
    }

    // Determine final job status
    const isFullSuccess = failedCount === 0;
    const finalJobStatus = isFullSuccess ? "COMPLETED" : (successfulCount > 0 ? "COMPLETED" : "FAILED");
    const finalLogStatus = isFullSuccess ? "SUCCESS" : (successfulCount > 0 ? "PARTIAL_SUCCESS" : "FAILED");

    await updateJobProgress(job.id, {
      status: finalJobStatus,
      currentBatch: batchNum,
      processedCount,
      pageInfo: null,
      completedAt: new Date(),
      errorMessage: orderErrors.length > 0 ? orderErrors.slice(0, 5).join(" | ") : undefined,
    });

    await prisma.shopifyStore.update({
      where: { id: store.id },
      data: { lastOrderSyncAt: new Date() },
    });

    const durationMs = Date.now() - (syncLog.startedAt?.getTime() ?? Date.now());
    const detailMsg = isFullSuccess
      ? (processedCount === 0
          ? "No changes found — store is up to date."
          : `Synchronized ${successfulCount} orders in ${batchNum} batch${batchNum === 1 ? "" : "es"}.`)
      : `Synchronized ${successfulCount} orders. ${failedCount} orders had issues.`;

    await prisma.syncLog.update({
      where: { id: syncLog.id },
      data: {
        status: finalLogStatus,
        recordsCount: successfulCount,
        durationMs,
        completedAt: new Date(),
        details: detailMsg,
        errorDetails: orderErrors.length > 0 ? orderErrors.join("\n") : null,
      },
    });

    return { completed: true, moreBatches: false, currentBatch: batchNum, processedCount };
  } catch (err: any) {
    await updateJobProgress(job.id, { status: "FAILED", errorMessage: err.message });
    await prisma.syncLog.update({
      where: { id: syncLog.id },
      data: {
        status: "FAILED",
        completedAt: new Date(),
        durationMs: Date.now() - (syncLog.startedAt?.getTime() ?? Date.now()),
        errorDetails: err.message,
      },
    });
    throw err;
  }
}

/** Run the products sync loop for a job */
async function runProductsSync(
  job: any,
  store: any
): Promise<{ completed: boolean; moreBatches: boolean; currentBatch: number; processedCount: number }> {
  const cycleStartTime = Date.now();
  let pageInfo: string | null = job.pageInfo || null;
  let batchNum = job.currentBatch || 0;
  let processedCount = job.processedCount || 0;
  let successfulCount = 0;
  let failedCount = 0;
  let isFirstBatch = batchNum === 0 && !pageInfo;
  const productErrors: string[] = [];

  // Fetch total products count from Shopify to populate totalCount, totalBatches, and ETA
  let totalCount = job.totalCount;
  if (!totalCount) {
    try {
      const countRes = await fetch(
        `https://${store.shopDomain}/admin/api/${SHOPIFY_API_VERSION}/products/count.json`,
        { headers: { "X-Shopify-Access-Token": store.accessToken } }
      );
      if (countRes.ok) {
        const countJson = await countRes.json();
        totalCount = countJson.count;
        if (typeof totalCount === "number") {
          const totalBatches = Math.max(1, Math.ceil(totalCount / BATCH_SIZE));
          await updateJobProgress(job.id, { totalCount, totalBatches });
        }
      }
    } catch (_e) {
      // Non-blocking
    }
  }

  let syncLog = await prisma.syncLog.findFirst({
    where: { storeId: store.id, type: "PRODUCTS", status: "IN_PROGRESS" },
    orderBy: { startedAt: "desc" },
  });
  if (!syncLog) {
    syncLog = await prisma.syncLog.create({
      data: {
        storeId: store.id,
        type: "PRODUCTS",
        status: "IN_PROGRESS",
        startedAt: new Date(),
      },
    });
  }

  try {
    let hasMorePages = false;

    while (true) {
      const params: Record<string, string> = { limit: String(BATCH_SIZE) };
      if (pageInfo) {
        params.page_info = pageInfo;
      } else if (!isFirstBatch) {
        break;
      }

      const { data: products, nextPageInfo } = await shopifyRestFetch(
        store.shopDomain,
        store.accessToken,
        `/admin/api/${SHOPIFY_API_VERSION}/products.json`,
        params
      );

      isFirstBatch = false;

      if (products.length === 0 && !nextPageInfo) break;

      for (const product of products) {
        try {
          await upsertProduct(store.id, product);
          successfulCount++;
        } catch (prodErr: any) {
          failedCount++;
          console.error(`[SyncWorker] Product ${product.id} upsert error:`, prodErr.message);
          productErrors.push(`Product #${product.id}: ${prodErr.message}`);
        }
        processedCount++;
      }

      batchNum++;
      pageInfo = nextPageInfo;

      await updateJobProgress(job.id, {
        currentBatch: batchNum,
        processedCount,
        pageInfo,
      });

      if (!nextPageInfo) {
        hasMorePages = false;
        break;
      }

      // Check time budget (8s) so Vercel serverless functions never 504 timeout
      if (Date.now() - cycleStartTime > TIME_BUDGET_MS) {
        console.log(`[SyncWorker] Product time budget reached (${Date.now() - cycleStartTime}ms). Checkpointing batch ${batchNum}.`);
        hasMorePages = true;
        break;
      }
    }

    if (hasMorePages) {
      return { completed: false, moreBatches: true, currentBatch: batchNum, processedCount };
    }

    const isFullSuccess = failedCount === 0;
    const finalJobStatus = isFullSuccess ? "COMPLETED" : (successfulCount > 0 ? "COMPLETED" : "FAILED");
    const finalLogStatus = isFullSuccess ? "SUCCESS" : (successfulCount > 0 ? "PARTIAL_SUCCESS" : "FAILED");

    await updateJobProgress(job.id, {
      status: finalJobStatus,
      currentBatch: batchNum,
      processedCount,
      pageInfo: null,
      completedAt: new Date(),
      errorMessage: productErrors.length > 0 ? productErrors.slice(0, 5).join(" | ") : undefined,
    });

    await prisma.shopifyStore.update({
      where: { id: store.id },
      data: { lastProductSyncAt: new Date() },
    });

    // Automatically fetch and map all SKUs into VOOP Physical Inventory
    try {
      await InventoryService.syncItemsFromShopify(store.id);
    } catch (invErr) {
      console.error("[runProductsSync] Failed to auto-sync physical inventory SKUs:", invErr);
    }

    const durationMs = Date.now() - (syncLog.startedAt?.getTime() ?? Date.now());
    const detailMsg = isFullSuccess
      ? (processedCount === 0
          ? "No changes found — store is up to date."
          : `Synchronized ${successfulCount} products in ${batchNum} batch${batchNum === 1 ? "" : "es"}.`)
      : `Synchronized ${successfulCount} products. ${failedCount} products had issues.`;

    await prisma.syncLog.update({
      where: { id: syncLog.id },
      data: {
        status: finalLogStatus,
        recordsCount: successfulCount,
        durationMs,
        completedAt: new Date(),
        details: detailMsg,
        errorDetails: productErrors.length > 0 ? productErrors.join("\n") : null,
      },
    });

    return { completed: true, moreBatches: false, currentBatch: batchNum, processedCount };
  } catch (err: any) {
    await updateJobProgress(job.id, { status: "FAILED", errorMessage: err.message });
    await prisma.syncLog.update({
      where: { id: syncLog.id },
      data: {
        status: "FAILED",
        completedAt: new Date(),
        durationMs: Date.now() - (syncLog.startedAt?.getTime() ?? Date.now()),
        errorDetails: err.message,
      },
    });
    throw err;
  }
}

/**
 * POST /api/sync/worker
 *
 * Internal background batch processor. Called by /api/sync/start.
 * Supports auto-resume and time-budgeted chunk execution for serverless.
 */
export async function POST(request: NextRequest) {
  let job: any = null;

  try {
    const body = await request.json();
    const { jobId } = body;

    if (!jobId) {
      return NextResponse.json({ error: "Missing jobId" }, { status: 400 });
    }

    job = await prisma.syncJob.findUnique({ where: { id: jobId } });
    if (!job) {
      return NextResponse.json({ error: "Job not found" }, { status: 404 });
    }

    // Safety: only process QUEUED or IN_PROGRESS (for auto-resume)
    if (job.status === "COMPLETED" || job.status === "FAILED") {
      return NextResponse.json({ skipped: true, reason: `Job already ${job.status}`, status: job.status });
    }

    const store = await prisma.shopifyStore.findUnique({ where: { id: job.storeId } });
    if (!store || !store.isConnected) {
      await updateJobProgress(jobId, {
        status: "FAILED",
        errorMessage: "Store not found or disconnected",
        completedAt: new Date(),
      });
      return NextResponse.json({ error: "Store not found" }, { status: 404 });
    }

    // Mark as IN_PROGRESS
    await updateJobProgress(jobId, { status: "IN_PROGRESS", startedAt: job.startedAt ?? new Date() });

    let chunkResult: { completed: boolean; moreBatches: boolean; currentBatch?: number; processedCount?: number } = {
      completed: true,
      moreBatches: false,
    };

    if (job.type === "products") {
      chunkResult = await runProductsSync(job, store);
    } else if (job.type === "orders") {
      chunkResult = await runOrdersSync(job, store);
    } else if (job.type === "all") {
      // For "all": run products first, then orders
      const meta = typeof job.metadata === "object" && job.metadata !== null ? (job.metadata as any) : {};
      if (!meta.productsCompleted) {
        const prodResult = await runProductsSync(job, store);
        if (prodResult.moreBatches) {
          return NextResponse.json({
            success: true,
            jobId,
            status: "IN_PROGRESS",
            moreBatches: true,
            stage: "products",
            currentBatch: prodResult.currentBatch,
            processedCount: prodResult.processedCount,
          });
        }
        await prisma.syncJob.update({
          where: { id: job.id },
          data: {
            metadata: { ...meta, productsCompleted: true },
            pageInfo: null,
            currentBatch: 0,
          },
        });
        job.pageInfo = null;
        job.currentBatch = 0;
      }
      chunkResult = await runOrdersSync(job, store);
      if (chunkResult.completed) {
        await updateJobProgress(job.id, {
          status: "COMPLETED",
          completedAt: new Date(),
        });
        await prisma.shopifyStore.update({
          where: { id: store.id },
          data: { lastFullSyncAt: new Date() },
        });
      }
    } else if (job.type === "single_order") {
      const orderId = (job.metadata as any)?.orderId;
      if (!orderId) {
        await updateJobProgress(job.id, { status: "FAILED", errorMessage: "No orderId in metadata" });
        return NextResponse.json({ error: "No orderId" }, { status: 400 });
      }
      const { data: orders } = await shopifyRestFetch(
        store.shopDomain,
        store.accessToken,
        `/admin/api/${SHOPIFY_API_VERSION}/orders/${orderId}.json`,
        {}
      );
      const order = (orders as any)?.order ?? orders;
      if (order) {
        await upsertOrder(store.id, order);
        await updateJobProgress(job.id, {
          status: "COMPLETED",
          processedCount: 1,
          totalCount: 1,
          totalBatches: 1,
          completedAt: new Date(),
        });
      } else {
        await updateJobProgress(job.id, { status: "FAILED", errorMessage: "Order not found in Shopify" });
      }
    }

    return NextResponse.json({
      success: true,
      jobId,
      status: chunkResult.completed ? "COMPLETED" : "IN_PROGRESS",
      moreBatches: chunkResult.moreBatches ?? false,
      currentBatch: chunkResult.currentBatch,
      processedCount: chunkResult.processedCount,
    });
  } catch (error: any) {
    console.error("[SyncWorker] Unhandled error:", error.message);
    if (job?.id) {
      await prisma.syncJob
        .update({
          where: { id: job.id },
          data: { status: "FAILED", errorMessage: error.message, heartbeat: new Date() },
        })
        .catch(() => {});
    }
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
