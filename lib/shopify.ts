import { prisma } from "./prisma";
import {
  resolveShopifyContext,
  fetchShopInfo,
  exchangeSessionTokenForAccessToken,
  ShopifyContext,
} from "./shopifyAuth";
import { extractCleanShopDomain } from "./utils";
import { DelhiveryService } from "./services/DelhiveryService";
import { CourierService } from "./services/CourierService";
import { InventoryService } from "./services/InventoryService";
import {
  normalizeFinancialStatus,
  normalizeFulfillmentStatus,
} from "./shopifyStatusNormalizer";

export const SHOPIFY_API_VERSION = "2024-07";

export interface ShopifyShopInfo {
  id: string;
  name: string;
  email: string;
  myshopifyDomain: string;
  currency: string;
  planName?: string;
}

import crypto from "crypto";

export function verifyShopifyWebhook(
  rawBody: string,
  hmacHeader: string,
  secret: string
): boolean {
  try {
    const hash = crypto
      .createHmac("sha256", secret)
      .update(rawBody, "utf8")
      .digest("base64");
    return crypto.timingSafeEqual(Buffer.from(hash), Buffer.from(hmacHeader));
  } catch {
    return false;
  }
}

export interface SyncResult {
  success: boolean;
  type: "PRODUCTS" | "ORDERS" | "FULL_SYNC";
  recordsCount: number;
  durationMs: number;
  error?: string;
}

/**
 * Development / Production Structured Shopify API Call Logger
 * Never logs access tokens, passwords, cookies, or secrets.
 */
export function logShopifyCall(params: {
  requestId?: string;
  storeId?: string;
  shopDomain?: string;
  operation: string;
  tokenSource?: string;
  result: "SUCCESS" | "401" | "ERROR";
}) {
  if (process.env.NODE_ENV !== "production") {
    const reqId = params.requestId || "req_" + Math.random().toString(36).substring(2, 9);
    console.log(
      `[VOOP SHOPIFY]\nrequestId=${reqId}\nstoreId=${params.storeId || "unknown"}\nshopDomain=${params.shopDomain || "unknown"}\noperation=${params.operation}\ntokenSource=${params.tokenSource || "STORE_CONNECTION"}\nresult=${params.result}`
    );
  }
}

/**
 * Execute a GraphQL query against Shopify Admin API using the active store's access token
 */
export async function shopifyGraphQL(
  shopDomain?: string,
  explicitAccessToken?: string,
  query: string = "",
  variables: Record<string, any> = {},
  sessionToken?: string,
  storeId?: string,
  requestId?: string
): Promise<any> {
  let domain = shopDomain;
  let token = explicitAccessToken;

  if (!domain || !token) {
    const ctx = await resolveShopifyContext({
      shop: shopDomain,
      sessionToken,
      storeId,
    });
    domain = ctx.shopDomain;
    token = ctx.accessToken;
  }

  const url = `https://${domain}/admin/api/${SHOPIFY_API_VERSION}/graphql.json`;

  const response = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Shopify-Access-Token": token,
    },
    body: JSON.stringify({ query, variables }),
  });

  if (!response.ok) {
    if (response.status === 429) {
      // Rate limited: backoff 2 seconds
      await new Promise((r) => setTimeout(r, 2000));
      const retryResponse = await fetch(url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Shopify-Access-Token": token,
        },
        body: JSON.stringify({ query, variables }),
      });
      if (!retryResponse.ok) {
        logShopifyCall({ requestId, storeId, shopDomain: domain, operation: "GraphQL", result: "ERROR" });
        throw new Error(`Shopify API error (429 Rate Limit): ${retryResponse.statusText}`);
      }
      logShopifyCall({ requestId, storeId, shopDomain: domain, operation: "GraphQL", result: "SUCCESS" });
      return retryResponse.json();
    }

    if (response.status === 401) {
      logShopifyCall({ requestId, storeId, shopDomain: domain, operation: "GraphQL", result: "401" });
      // Mark ONLY this specific store's connection as needing attention
      if (storeId || domain) {
        await prisma.shopifyStore.updateMany({
          where: storeId ? { id: storeId } : { shopDomain: domain },
          data: { isConnected: false },
        }).catch(() => {});
      }

      // Access token rejected/expired. Attempt token exchange if sessionToken available
      if (sessionToken && domain) {
        try {
          const fresh = await exchangeSessionTokenForAccessToken(domain, sessionToken);
          token = fresh.accessToken;
          await prisma.shopifyStore.upsert({
            where: { shopDomain: domain },
            create: { shopDomain: domain, accessToken: token, isConnected: true },
            update: { accessToken: token, isConnected: true },
          });

          // Retry with fresh token
          const retryRes = await fetch(url, {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              "X-Shopify-Access-Token": token,
            },
            body: JSON.stringify({ query, variables }),
          });
          if (retryRes.ok) {
            logShopifyCall({ requestId, storeId, shopDomain: domain, operation: "GraphQL", result: "SUCCESS" });
            return retryRes.json();
          }
        } catch (reAuthErr) {
          console.error("401 Token Exchange recovery failed:", reAuthErr);
        }
      }

      const errText = await response.text();
      throw new Error(`Shopify API error (401 Unauthorized for ${domain}): ${errText}`);
    }

    logShopifyCall({ requestId, storeId, shopDomain: domain, operation: "GraphQL", result: "ERROR" });
    const errorText = await response.text();
    throw new Error(`Shopify API error (${response.status}): ${errorText}`);
  }

  const result = await response.json();
  if (result.errors && result.errors.length > 0) {
    logShopifyCall({ requestId, storeId, shopDomain: domain, operation: "GraphQL", result: "ERROR" });
    throw new Error(`Shopify GraphQL error: ${result.errors.map((e: any) => e.message).join(", ")}`);
  }

  logShopifyCall({ requestId, storeId, shopDomain: domain, operation: "GraphQL", result: "SUCCESS" });
  return result;
}

/**
 * Options for domain auto-correction and synchronization
 */
export interface CorrectDomainOptions {
  storeId?: string;
  shopDomain?: string;
  candidateDomain?: string;
  accessToken?: string;
}

/**
 * Fetch fresh shop details from Shopify Admin API and auto-correct store domain if changed.
 * Handles Prisma unique constraint conflicts on shopDomain, cleans up empty shells,
 * updates metadata (storeName, email, currency), and preserves permanent store ID and relationships.
 */
export async function syncAndCorrectStoreDomain(
  params: CorrectDomainOptions
): Promise<any> {
  const { storeId, shopDomain, candidateDomain, accessToken: explicitToken } = params;

  // 1. Identify existing store in DB
  let store: any = null;

  if (storeId) {
    store = await prisma.shopifyStore.findFirst({
      where: {
        OR: [
          { id: storeId },
          { voopStoreId: storeId.toUpperCase() },
          { tenantId: storeId.toUpperCase() },
          { publicStoreRef: storeId },
        ],
      },
    });
  }

  if (!store && shopDomain) {
    const clean = extractCleanShopDomain(shopDomain);
    store = await prisma.shopifyStore.findUnique({ where: { shopDomain: clean } });
  }

  if (!store && candidateDomain) {
    const clean = extractCleanShopDomain(candidateDomain);
    store = await prisma.shopifyStore.findUnique({ where: { shopDomain: clean } });
  }

  // If still not found, check if any connected store can authenticate with candidateDomain or shopDomain
  if (!store && (candidateDomain || shopDomain)) {
    const probeDomain = extractCleanShopDomain(candidateDomain || shopDomain!);
    const connectedStores = await prisma.shopifyStore.findMany({
      where: { isConnected: true },
      select: { id: true, shopDomain: true, accessToken: true, storeName: true, email: true, currency: true },
    });

    for (const cand of connectedStores) {
      if (!cand.accessToken) continue;
      try {
        const info = await fetchShopInfo(probeDomain, cand.accessToken).catch(() => null);
        if (info) {
          store = cand;
          break;
        }
      } catch (_e) {}
    }
  }

  if (!store) {
    return null;
  }

  const token = explicitToken || store.accessToken;
  if (!token) {
    return store;
  }

  // 2. Query Shopify to determine canonical myshopify domain
  const targetClean = candidateDomain
    ? extractCleanShopDomain(candidateDomain)
    : extractCleanShopDomain(store.shopDomain);

  let shopInfo: any = null;

  try {
    shopInfo = await fetchShopInfo(targetClean, token).catch(() => null);
  } catch (_e) {}

  if (!shopInfo && targetClean !== store.shopDomain) {
    try {
      shopInfo = await fetchShopInfo(store.shopDomain, token).catch(() => null);
    } catch (_e) {}
  }

  if (!shopInfo) {
    return store;
  }

  const canonicalDomain = extractCleanShopDomain(
    shopInfo.myshopify_domain || shopInfo.domain || targetClean
  );

  const previousDomain = store.shopDomain;
  const domainChanged = canonicalDomain !== previousDomain;

  if (domainChanged) {
    console.log(
      `[VOOP SHOPIFY] Domain change auto-corrected for store ${store.id}: updated from ${previousDomain} to ${canonicalDomain}`
    );

    // Resolve any unique constraint conflict before updating
    const existingConflict = await prisma.shopifyStore.findUnique({
      where: { shopDomain: canonicalDomain },
    });

    if (existingConflict && existingConflict.id !== store.id) {
      const [orderCount, prodCount, userCount] = await Promise.all([
        prisma.shopifyOrder.count({ where: { storeId: existingConflict.id } }).catch(() => 0),
        prisma.shopifyProduct.count({ where: { storeId: existingConflict.id } }).catch(() => 0),
        prisma.user.count({ where: { storeId: existingConflict.id } }).catch(() => 0),
      ]);

      if (orderCount === 0 && prodCount === 0 && userCount === 0) {
        await prisma.shopifyStore.delete({ where: { id: existingConflict.id } }).catch(async () => {
          await prisma.shopifyStore.update({
            where: { id: existingConflict.id },
            data: { shopDomain: `${canonicalDomain}.old-${Date.now()}` },
          });
        });
      } else {
        await prisma.shopifyStore.update({
          where: { id: existingConflict.id },
          data: { shopDomain: `${canonicalDomain}.conflict-${Date.now()}` },
        });
      }
    }

    store = await prisma.shopifyStore.update({
      where: { id: store.id },
      data: {
        shopDomain: canonicalDomain,
        storeName: shopInfo.name || store.storeName,
        email: shopInfo.email || store.email,
        currency: shopInfo.currency || store.currency || "INR",
        isConnected: true,
      },
    });
  } else {
    store = await prisma.shopifyStore.update({
      where: { id: store.id },
      data: {
        storeName: shopInfo.name || store.storeName,
        email: shopInfo.email || store.email,
        currency: shopInfo.currency || store.currency || "INR",
        isConnected: true,
      },
    });
  }

  return store;
}

/**
 * Test Shopify connection by making a real GraphQL shop query
 */
export async function testShopifyConnection(
  targetShop?: string,
  customAccessToken?: string,
  sessionToken?: string
): Promise<{ success: boolean; shop?: ShopifyShopInfo; error?: string }> {
  try {
    let accessToken = customAccessToken;
    let shopDomain = targetShop ? extractCleanShopDomain(targetShop) : undefined;

    if (!accessToken || !shopDomain) {
      const ctx = await resolveShopifyContext({
        shop: targetShop,
        sessionToken,
      });
      accessToken = ctx.accessToken;
      shopDomain = ctx.shopDomain;
    }

    const query = `
      query {
        shop {
          id
          name
          email
          myshopifyDomain
          currencyCode
          plan {
            displayName
          }
        }
      }
    `;

    const data = await shopifyGraphQL(shopDomain, accessToken, query, {}, sessionToken);
    const shop = data?.data?.shop;

    if (!shop) {
      return { success: false, error: "Unable to retrieve shop data from Shopify." };
    }

    const finalDomain = shop.myshopifyDomain ? extractCleanShopDomain(shop.myshopifyDomain) : shopDomain;

    // Check if store already exists under finalDomain OR under the initial shopDomain
    let storeToUpdate = await prisma.shopifyStore.findUnique({ where: { shopDomain: finalDomain } });
    if (!storeToUpdate && shopDomain && extractCleanShopDomain(shopDomain) !== finalDomain) {
      storeToUpdate = await prisma.shopifyStore.findUnique({
        where: { shopDomain: extractCleanShopDomain(shopDomain) },
      });
    }

    let store: any;
    if (storeToUpdate) {
      if (storeToUpdate.shopDomain !== finalDomain) {
        console.log(
          `[VOOP SHOPIFY] Domain change auto-corrected in testShopifyConnection for store ${storeToUpdate.id}: updated from ${storeToUpdate.shopDomain} to ${finalDomain}`
        );
        // Handle any conflict if another record already has finalDomain
        const conflict = await prisma.shopifyStore.findUnique({ where: { shopDomain: finalDomain } });
        if (conflict && conflict.id !== storeToUpdate.id) {
          await prisma.shopifyStore.delete({ where: { id: conflict.id } }).catch(() => {});
        }
      }
      store = await prisma.shopifyStore.update({
        where: { id: storeToUpdate.id },
        data: {
          shopDomain: finalDomain,
          accessToken,
          storeName: shop.name,
          email: shop.email,
          currency: shop.currencyCode || "INR",
          isConnected: true,
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
          currency: shop.currencyCode || "INR",
          isConnected: true,
        },
        update: {
          accessToken,
          storeName: shop.name,
          email: shop.email,
          currency: shop.currencyCode || "INR",
          isConnected: true,
        },
      });
    }

    // Ensure permanent store references exist
    const { getOrEnsurePublicStoreRef, getOrEnsureVoopStoreId } = await import("./id-generator");
    await getOrEnsurePublicStoreRef(store.id).catch(() => {});
    await getOrEnsureVoopStoreId(store.id).catch(() => {});

    return {
      success: true,
      shop: {
        id: shop.id,
        name: shop.name,
        email: shop.email,
        myshopifyDomain: finalDomain,
        currency: shop.currencyCode || "INR",
        planName: shop.plan?.displayName || "Shopify Store",
      },
    };
  } catch (error: any) {
    return { success: false, error: error.message || "Failed to connect to Shopify." };
  }
}

/**
 * Synchronize all Products, Variants, and SKUs from Shopify
 */
export async function syncProducts(
  storeId?: string,
  sessionToken?: string,
  targetShop?: string,
  options?: { isFreshSync?: boolean }
): Promise<SyncResult> {
  const startTime = Date.now();
  let recordsCount = 0;

  // Strictly resolve target store by identifier or shop domain
  let store: any = null;
  if (storeId) {
    store = await prisma.shopifyStore.findFirst({
      where: {
        OR: [
          { id: storeId },
          { voopStoreId: storeId.toUpperCase() },
          { publicStoreRef: storeId },
        ],
      },
    });
    if (!store) {
      throw new Error(`Target store not found for identifier: ${storeId}`);
    }
  } else if (targetShop) {
    const cleanDomain = extractCleanShopDomain(targetShop);
    store = await prisma.shopifyStore.findUnique({ where: { shopDomain: cleanDomain } });
    if (!store) {
      try {
        store = await syncAndCorrectStoreDomain({ candidateDomain: cleanDomain });
      } catch (_e) {}
    }
    if (!store) {
      throw new Error(`Target store not found for shop domain: ${targetShop}`);
    }
  } else {
    const ctx = await resolveShopifyContext({ sessionToken });
    store = await prisma.shopifyStore.findUnique({ where: { id: ctx.storeId } });
  }

  if (!store || !store.isConnected || !store.accessToken) {
    throw new Error(`Store ${store?.shopDomain || storeId || "unknown"} is disconnected or missing access token.`);
  }

  if (targetShop && extractCleanShopDomain(targetShop) !== extractCleanShopDomain(store.shopDomain)) {
    const cleanTarget = extractCleanShopDomain(targetShop);
    try {
      const corrected = await syncAndCorrectStoreDomain({
        storeId: store.id,
        candidateDomain: cleanTarget,
      });
      if (corrected && extractCleanShopDomain(corrected.shopDomain) === cleanTarget) {
        store = corrected;
      } else {
        throw new Error(`Shop domain mismatch: requested ${targetShop} but store has ${store.shopDomain}`);
      }
    } catch (_domainErr: any) {
      if (_domainErr.message?.includes("Shop domain mismatch")) {
        throw _domainErr;
      }
      throw new Error(`Shop domain mismatch: requested ${targetShop} but store has ${store.shopDomain}`);
    }
  }

  const shopDomain = store.shopDomain;
  const accessToken = store.accessToken;

  // Calculate incremental query string if not a fresh sync and lastProductSyncAt exists
  let queryString: string | null = null;
  if (!options?.isFreshSync && store.lastProductSyncAt) {
    const bufferDate = new Date(store.lastProductSyncAt.getTime() - 5 * 60 * 1000);
    queryString = `updated_at:>='${bufferDate.toISOString()}'`;
  }

  // Create audit log
  const log = await prisma.syncLog.create({
    data: {
      storeId: store.id,
      type: "PRODUCTS",
      status: "IN_PROGRESS",
      startedAt: new Date(),
    },
  });

  try {
    let hasNextPage = true;
    let cursor: string | null = null;

    const query = `
      query getProducts($cursor: String, $query: String) {
        products(first: 50, after: $cursor, query: $query) {
          pageInfo {
            hasNextPage
            endCursor
          }
          edges {
            node {
              id
              title
              handle
              descriptionHtml
              vendor
              productType
              status
              tags
              featuredImage {
                url
              }
              variants(first: 100) {
                edges {
                  node {
                    id
                    title
                    sku
                    barcode
                    price
                    compareAtPrice
                    inventoryQuantity
                    selectedOptions {
                      name
                      value
                    }
                    image {
                      url
                    }
                  }
                }
              }
            }
          }
        }
      }
    `;

    const syncedProductIds: string[] = [];

    while (hasNextPage) {
      const response = await shopifyGraphQL(shopDomain, accessToken, query, { cursor, query: queryString }, sessionToken, store.id);
      const productsData = response?.data?.products;

      if (!productsData) break;

      for (const edge of productsData.edges || []) {
        const p = edge.node;
        const shopifyProductId = p.id.replace("gid://shopify/Product/", "");
        syncedProductIds.push(shopifyProductId);

        const product = await prisma.shopifyProduct.upsert({
          where: {
            storeId_shopifyProductId: {
              storeId: store.id,
              shopifyProductId,
            },
          },
          create: {
            storeId: store.id,
            shopifyProductId,
            title: p.title,
            handle: p.handle,
            vendor: p.vendor || null,
            productType: p.productType || null,
            status: p.status || "ACTIVE",
            tags: Array.isArray(p.tags) ? p.tags.join(", ") : p.tags || null,
            imageUrl: p.featuredImage?.url || null,
            rawPayload: JSON.stringify(p),
            syncedAt: new Date(),
          },
          update: {
            title: p.title,
            handle: p.handle,
            vendor: p.vendor || null,
            productType: p.productType || null,
            status: p.status || "ACTIVE",
            tags: Array.isArray(p.tags) ? p.tags.join(", ") : p.tags || null,
            imageUrl: p.featuredImage?.url || null,
            rawPayload: JSON.stringify(p),
            syncedAt: new Date(),
          },
        });

        const syncedVariantIdsForProduct: string[] = [];

        for (const vEdge of p.variants?.edges || []) {
          const v = vEdge.node;
          const shopifyVariantId = v.id.replace("gid://shopify/ProductVariant/", "");
          syncedVariantIdsForProduct.push(shopifyVariantId);

          await prisma.shopifyVariant.upsert({
            where: {
              storeId_shopifyVariantId: {
                storeId: store.id,
                shopifyVariantId,
              },
            },
            create: {
              storeId: store.id,
              productId: product.id,
              shopifyProductId,
              shopifyVariantId,
              title: v.title,
              sku: v.sku || null,
              barcode: v.barcode || null,
              price: parseFloat(v.price || "0"),
              compareAtPrice: v.compareAtPrice ? parseFloat(v.compareAtPrice) : null,
              inventoryQuantity: v.inventoryQuantity ?? 0,
              imageUrl: v.image?.url || null,
              rawPayload: JSON.stringify(v),
              syncedAt: new Date(),
            },
            update: {
              title: v.title,
              sku: v.sku || null,
              barcode: v.barcode || null,
              price: parseFloat(v.price || "0"),
              compareAtPrice: v.compareAtPrice ? parseFloat(v.compareAtPrice) : null,
              inventoryQuantity: v.inventoryQuantity ?? 0,
              imageUrl: v.image?.url || null,
              rawPayload: JSON.stringify(v),
              syncedAt: new Date(),
            },
          });
        }

        // Purge ghost/deleted variants for this product that no longer exist in Shopify
        if (syncedVariantIdsForProduct.length > 0) {
          await prisma.shopifyVariant.deleteMany({
            where: {
              productId: product.id,
              shopifyVariantId: { notIn: syncedVariantIdsForProduct },
            },
          });
        }

        recordsCount++;
      }

      hasNextPage = productsData.pageInfo?.hasNextPage || false;
      cursor = productsData.pageInfo?.endCursor || null;
    }

    // Clean up products for this store that are no longer present in Shopify
    await prisma.shopifyProduct.deleteMany({
      where: {
        storeId: store.id,
        ...(syncedProductIds.length > 0 ? { shopifyProductId: { notIn: syncedProductIds } } : {}),
      },
    });

    const durationMs = Date.now() - startTime;

    // Update store metadata
    await prisma.shopifyStore.update({
      where: { id: store.id },
      data: { lastProductSyncAt: new Date() },
    });

    // Automatically fetch and map all SKUs into VOOP Physical Inventory
    try {
      await InventoryService.syncItemsFromShopify(store.id);
    } catch (invErr) {
      console.error("[syncProducts] Failed to auto-sync physical inventory SKUs:", invErr);
    }

    // Update audit log
    try {
      await prisma.syncLog.update({
        where: { id: log.id },
        data: {
          status: "SUCCESS",
          recordsCount,
          durationMs,
          completedAt: new Date(),
          details: `Successfully synchronized ${recordsCount} products and their variants with live Variant IDs.`,
        },
      });
    } catch (logErr) {
      console.error("Failed to update syncLog (success):", logErr);
    }

    return {
      success: true,
      type: "PRODUCTS",
      recordsCount,
      durationMs,
    };
  } catch (error: any) {
    const durationMs = Date.now() - startTime;
    const is401 = error.message?.includes("401") || error.message?.includes("Unauthorized");
    if (is401 && store?.id) {
      await prisma.shopifyStore.update({
        where: { id: store.id },
        data: { isConnected: false },
      }).catch(() => {});
    }

    try {
      await prisma.syncLog.update({
        where: { id: log.id },
        data: {
          status: "FAILED",
          durationMs,
          completedAt: new Date(),
          errorDetails: is401
            ? `Shopify API 401 Unauthorized: Invalid API key or access token for ${store?.shopDomain || "store"}`
            : (error.message || "Product sync failed"),
        },
      });
    } catch (logErr) {
      console.error("Failed to update syncLog (error):", logErr);
    }

    throw error;
  }
}

/**
 * Synchronize Orders, Line Items, and execute dynamic SKU inventory deductions
 */
export async function syncOrders(
  storeId?: string,
  sessionToken?: string,
  targetShop?: string,
  options?: { isFreshSync?: boolean }
): Promise<SyncResult> {
  const startTime = Date.now();
  let recordsCount = 0;

  // Strictly resolve target store by identifier or shop domain
  let store: any = null;
  if (storeId) {
    store = await prisma.shopifyStore.findFirst({
      where: {
        OR: [
          { id: storeId },
          { voopStoreId: storeId.toUpperCase() },
          { publicStoreRef: storeId },
        ],
      },
    });
    if (!store) {
      throw new Error(`Target store not found for identifier: ${storeId}`);
    }
  } else if (targetShop) {
    const cleanDomain = extractCleanShopDomain(targetShop);
    store = await prisma.shopifyStore.findUnique({ where: { shopDomain: cleanDomain } });
    if (!store) {
      try {
        store = await syncAndCorrectStoreDomain({ candidateDomain: cleanDomain });
      } catch (_e) {}
    }
    if (!store) {
      throw new Error(`Target store not found for shop domain: ${targetShop}`);
    }
  } else {
    const ctx = await resolveShopifyContext({ sessionToken });
    store = await prisma.shopifyStore.findUnique({ where: { id: ctx.storeId } });
  }

  if (!store || !store.isConnected || !store.accessToken) {
    throw new Error(`Store ${store?.shopDomain || storeId || "unknown"} is disconnected or missing access token.`);
  }

  if (targetShop && extractCleanShopDomain(targetShop) !== extractCleanShopDomain(store.shopDomain)) {
    const cleanTarget = extractCleanShopDomain(targetShop);
    try {
      const corrected = await syncAndCorrectStoreDomain({
        storeId: store.id,
        candidateDomain: cleanTarget,
      });
      if (corrected && extractCleanShopDomain(corrected.shopDomain) === cleanTarget) {
        store = corrected;
      } else {
        throw new Error(`Shop domain mismatch: requested ${targetShop} but store has ${store.shopDomain}`);
      }
    } catch (_domainErr: any) {
      if (_domainErr.message?.includes("Shop domain mismatch")) {
        throw _domainErr;
      }
      throw new Error(`Shop domain mismatch: requested ${targetShop} but store has ${store.shopDomain}`);
    }
  }

  const shopDomain = store.shopDomain;
  const accessToken = store.accessToken;

  // Calculate incremental query string if not a fresh sync and lastOrderSyncAt exists
  let queryString: string | null = null;
  if (!options?.isFreshSync && store.lastOrderSyncAt) {
    const bufferDate = new Date(store.lastOrderSyncAt.getTime() - 5 * 60 * 1000);
    queryString = `updated_at:>='${bufferDate.toISOString()}'`;
  }

  // Create audit log
  const log = await prisma.syncLog.create({
    data: {
      storeId: store.id,
      type: "ORDERS",
      status: "IN_PROGRESS",
      startedAt: new Date(),
    },
  });

  try {
    let hasNextPage = true;
    let cursor: string | null = null;

    const query = `
      query getOrders($cursor: String, $query: String) {
        orders(first: 50, after: $cursor, query: $query, sortKey: UPDATED_AT, reverse: true) {
          pageInfo {
            hasNextPage
            endCursor
          }
          edges {
            node {
              id
              name
              createdAt
              updatedAt
              processedAt
              cancelledAt
              cancelReason
              currencyCode
              totalPriceSet {
                shopMoney {
                  amount
                }
              }
              subtotalPriceSet {
                shopMoney {
                  amount
                }
              }
              totalDiscountsSet {
                shopMoney {
                  amount
                }
              }
              totalTaxSet {
                shopMoney {
                  amount
                }
              }
              displayFinancialStatus
              displayFulfillmentStatus
              email
              phone
              customer {
                id
                firstName
                lastName
                displayName
                email
                phone
              }
              shippingAddress {
                name
                firstName
                lastName
                address1
                address2
                city
                province
                zip
                country
                phone
              }
              billingAddress {
                name
                address1
                city
                province
                zip
                country
                phone
              }
              lineItems(first: 100) {
                edges {
                  node {
                    id
                    title
                    quantity
                    sku
                    originalUnitPriceSet {
                      shopMoney {
                        amount
                      }
                    }
                    totalDiscountSet {
                      shopMoney {
                        amount
                      }
                    }
                    discountAllocations {
                      allocatedAmountSet {
                        shopMoney {
                          amount
                        }
                      }
                    }
                    product {
                      id
                      title
                    }
                    variant {
                      id
                      title
                      sku
                    }
                  }
                }
              }
              fulfillments {
                id
                status
                createdAt
                trackingInfo {
                  number
                  url
                  company
                }
              }
            }
          }
        }
      }
    `;

    const syncedAwbs: string[] = [];

    while (hasNextPage) {
      const ordersResponse = await shopifyGraphQL(
        shopDomain,
        accessToken,
        query,
        { cursor, query: queryString },
        sessionToken,
        store.id
      );

      const ordersData = ordersResponse?.data?.orders;
      if (!ordersData || !ordersData.edges) {
        break;
      }

      for (const edge of ordersData.edges) {
        try {
          const o = edge.node;
          if (!o?.id || !store?.id) continue;
          const shopifyOrderId = String(o.id).replace("gid://shopify/Order/", "").trim();
          if (!shopifyOrderId) continue;

          const rawOrderName = (o.name && String(o.name).trim()) || "";
          const shopifyOrderName = rawOrderName || `#${shopifyOrderId}`;
          const digitsMatch = rawOrderName.match(/(\d+)(?!.*\d)/);
          const shopifyOrderNumber = digitsMatch ? digitsMatch[1] : (rawOrderName.replace("#", "").trim() || shopifyOrderId);
          const orderNumber = shopifyOrderNumber;
          const canonicalOrderName = shopifyOrderName;

          const realCustomerName =
            o.shippingAddress?.name ||
            o.customer?.displayName ||
            [o.customer?.firstName, o.customer?.lastName].filter(Boolean).join(" ") ||
            o.billingAddress?.name ||
            null;

          const realPhone = o.phone || o.shippingAddress?.phone || o.customer?.phone || null;
          const realEmail = o.email || o.customer?.email || null;

          const isOrderCancelled = Boolean(o.cancelledAt) || o.displayFinancialStatus === "VOIDED" || o.displayFinancialStatus === "CANCELLED" || Boolean(o.cancelReason);
          const cancelledAtDate = o.cancelledAt ? new Date(o.cancelledAt) : (isOrderCancelled ? new Date() : null);
          const shopifyOrderCreatedAt = new Date(o.createdAt || Date.now());
          const createdAt = shopifyOrderCreatedAt;
          const processedAt = o.processedAt ? new Date(o.processedAt) : shopifyOrderCreatedAt;

          const order = await prisma.shopifyOrder.upsert({
            where: {
              storeId_shopifyOrderId: {
                storeId: store.id,
                shopifyOrderId,
              },
            },
            create: {
              storeId: store.id,
              shopifyOrderId,
              shopifyOrderNumber,
              shopifyOrderName,
              shopifyOrderCreatedAt,
              orderNumber,
              name: canonicalOrderName,
              customerName: realCustomerName,
              email: realEmail,
              phone: realPhone,
              currency: o.currencyCode || "INR",
              totalPrice: parseFloat(o.totalPriceSet?.shopMoney?.amount || "0") || 0.0,
              subtotalPrice: parseFloat(o.subtotalPriceSet?.shopMoney?.amount || "0") || 0.0,
              totalDiscounts: parseFloat(o.totalDiscountsSet?.shopMoney?.amount || "0") || 0.0,
              totalTax: parseFloat(o.totalTaxSet?.shopMoney?.amount || "0") || 0.0,
              financialStatus: normalizeFinancialStatus(o.displayFinancialStatus),
              fulfillmentStatus: normalizeFulfillmentStatus(o.displayFulfillmentStatus),
              processedAt,
              cancelledAt: cancelledAtDate,
              shippingAddress: o.shippingAddress ? JSON.stringify(o.shippingAddress) : null,
              rawPayload: JSON.stringify(o),
              createdAt,
              updatedAt: new Date(o.updatedAt || Date.now()),
              syncedAt: new Date(),
            },
            update: {
              shopifyOrderNumber,
              shopifyOrderName,
              shopifyOrderCreatedAt,
              orderNumber,
              name: canonicalOrderName,
              customerName: realCustomerName,
              email: realEmail,
              phone: realPhone,
              currency: o.currencyCode || "INR",
              totalPrice: parseFloat(o.totalPriceSet?.shopMoney?.amount || "0") || 0.0,
              subtotalPrice: parseFloat(o.subtotalPriceSet?.shopMoney?.amount || "0") || 0.0,
              totalDiscounts: parseFloat(o.totalDiscountsSet?.shopMoney?.amount || "0") || 0.0,
              totalTax: parseFloat(o.totalTaxSet?.shopMoney?.amount || "0") || 0.0,
              financialStatus: normalizeFinancialStatus(o.displayFinancialStatus),
              fulfillmentStatus: normalizeFulfillmentStatus(o.displayFulfillmentStatus),
              processedAt,
              cancelledAt: cancelledAtDate,
              shippingAddress: o.shippingAddress ? JSON.stringify(o.shippingAddress) : null,
              rawPayload: JSON.stringify(o),
              updatedAt: new Date(o.updatedAt || Date.now()),
              syncedAt: new Date(),
            },
          });

        // If order is cancelled, immediately cascade cancellation to un-dispatched shipments
        if (isOrderCancelled) {
          try {
            await prisma.shipment.updateMany({
              where: {
                OR: [
                  { shopifyOrderId: order.shopifyOrderId },
                  { orderNumber: order.orderNumber },
                  { orderNumber: `#${order.orderNumber}` },
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
          } catch (shipmentSyncErr) {
            // non-blocking
          }

          // Cascade inventory reversal for cancelled order
          try {
            await InventoryService.reverseOrderFulfillments(store.id, {
              shopifyOrderId: order.shopifyOrderId,
              orderNumber: order.orderNumber,
              cancellationRef: o.cancelledAt || `CANCEL_${order.shopifyOrderId}`,
              reason: o.cancelReason || "Shopify Order Cancelled",
            });
          } catch (revErr) {
            console.error(`[ShopifySync] Error reversing inventory for cancelled order ${order.orderNumber}:`, revErr);
          }
        }

        // Line Items
        for (const lEdge of o.lineItems?.edges || []) {
          const l = lEdge.node;
          const shopifyLineItemId = l.id.replace("gid://shopify/LineItem/", "");
          const shopifyProductId = l.product?.id?.replace("gid://shopify/Product/", "") || null;
          const shopifyVariantId = l.variant?.id?.replace("gid://shopify/ProductVariant/", "") || null;
          const unitPrice = parseFloat(l.originalUnitPriceSet?.shopMoney?.amount || "0");
          let discountTotal = parseFloat(l.totalDiscountSet?.shopMoney?.amount || "0");
          if (l.discountAllocations && Array.isArray(l.discountAllocations)) {
            const allocatedTotal = l.discountAllocations.reduce((sum: number, alloc: any) => {
              const amt = parseFloat(alloc.allocatedAmountSet?.shopMoney?.amount || alloc.allocatedAmount?.amount || "0");
              return sum + (isNaN(amt) ? 0 : amt);
            }, 0);
            if (allocatedTotal > discountTotal) {
              discountTotal = allocatedTotal;
            }
          }
          const quantity = l.quantity || 1;
          const totalPrice = Math.max(0, unitPrice * quantity - discountTotal);
          const rawSku = (l.variant?.sku || l.sku || "").trim().toUpperCase();

          // Calculate fulfilled quantity from active fulfillments
          const activeFulfillments = (o.fulfillments || []).filter(
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
            l.fulfillmentStatus === "FULFILLED" ||
            l.fulfillmentStatus === "fulfilled" ||
            o.fulfillmentStatus === "FULFILLED" ||
            o.fulfillmentStatus === "fulfilled"
          ) {
            fulfilledQuantity = quantity;
          } else {
            fulfilledQuantity = 0;
          }

          // Check previous deduction state
          const existingLineItem = await prisma.shopifyOrderItem.findUnique({
            where: {
              orderId_shopifyLineItemId: {
                orderId: order.id,
                shopifyLineItemId,
              },
            },
          });

          const previouslyDeducted = existingLineItem?.deductedQuantity || (existingLineItem?.isDeducted ? quantity : 0);
          const pendingDeduction = Math.max(0, fulfilledQuantity - previouslyDeducted);

          let deductionStatus = existingLineItem?.deductionStatus || (fulfilledQuantity > 0 ? "PENDING" : "UNFULFILLED");
          let isDeducted = previouslyDeducted >= quantity;
          let deductedQuantity = previouslyDeducted;
          let deductedComponentsSummary = existingLineItem?.deductedComponents || null;

          if (pendingDeduction > 0 && rawSku && rawSku !== "NULL" && rawSku !== "NO_SKU" && !isOrderCancelled) {
            const deductionRes = await InventoryService.deductSaleableInventory({
              storeId: store.id,
              sku: rawSku,
              quantity: pendingDeduction,
              orderNumber,
              shopifyOrderId: order.shopifyOrderId,
              orderLineId: shopifyLineItemId,
              fulfillmentId: latestFulfillmentId,
              source: "SHOPIFY_FULFILLMENT",
              referenceId: orderNumber,
              notes: `Fulfillment deduction of ${pendingDeduction} unit(s) for Order #${orderNumber}`,
            });

            if (deductionRes.success) {
              const actualDeducted = deductionRes.deductedQuantity !== undefined ? deductionRes.deductedQuantity : pendingDeduction;
              deductedQuantity += actualDeducted;
              isDeducted = deductedQuantity >= quantity;
              deductionStatus = isDeducted ? "DEDUCTED" : (deductedQuantity > 0 ? "PARTIALLY_DEDUCTED" : "DEDUCTED");
              deductedComponentsSummary = JSON.stringify(deductionRes.deductedComponents);
            } else if (deductionRes.unmappedSku) {
              deductionStatus = "MAPPING_REQUIRED";
            }
          } else if (pendingDeduction > 0 && (!rawSku || rawSku === "NO_SKU" || rawSku === "NULL")) {
            deductionStatus = "MAPPING_REQUIRED";
          }

          // Persist ShopifyOrderItem
          await prisma.shopifyOrderItem.upsert({
            where: {
              orderId_shopifyLineItemId: {
                orderId: order.id,
                shopifyLineItemId,
              },
            },
            create: {
              storeId: store.id,
              orderId: order.id,
              shopifyOrderId,
              shopifyLineItemId,
              shopifyProductId,
              shopifyVariantId,
              productTitle: l.product?.title || l.title || "Product",
              variantTitle: l.variant?.title || null,
              sku: l.variant?.sku || l.sku || null,
              quantity,
              fulfilledQuantity,
              deductedQuantity,
              unitPrice,
              discountTotal,
              totalPrice,
              isDeducted,
              deductionStatus,
              deductedComponents: deductedComponentsSummary,
            },
            update: {
              productTitle: l.product?.title || l.title || "Product",
              variantTitle: l.variant?.title || null,
              sku: l.variant?.sku || l.sku || null,
              quantity,
              fulfilledQuantity,
              deductedQuantity,
              unitPrice,
              discountTotal,
              totalPrice,
              isDeducted,
              deductionStatus,
              deductedComponents: deductedComponentsSummary,
            },
          });
        }

        // Fulfillments & Tracking Info
        for (const f of o.fulfillments || []) {
          const shopifyFulfillmentId = f.id.replace("gid://shopify/Fulfillment/", "");
          const trackingList = Array.isArray(f.trackingInfo)
            ? f.trackingInfo
            : f.trackingInfo
            ? [f.trackingInfo]
            : [];
          const trackingNumber = trackingList.map((t: any) => t.number).filter(Boolean).join(", ") || null;
          const trackingCompany = trackingList.map((t: any) => t.company).filter(Boolean).join(", ") || null;
          const trackingUrl = trackingList.map((t: any) => t.url).filter(Boolean).join(", ") || null;

          await prisma.shopifyFulfillment.upsert({
            where: {
              orderId_shopifyFulfillmentId: {
                orderId: order.id,
                shopifyFulfillmentId,
              },
            },
            create: {
              storeId: store.id,
              orderId: order.id,
              shopifyOrderId,
              shopifyFulfillmentId,
              status: (f.status || "SUCCESS").toUpperCase(),
              trackingCompany,
              trackingNumber,
              trackingUrl,
            },
            update: {
              status: (f.status || "SUCCESS").toUpperCase(),
              trackingCompany,
              trackingNumber,
              trackingUrl,
            },
          });

          // Link to Shipment table
          if (trackingNumber) {
            for (const tNum of trackingNumber.split(",").map((s: string) => s.trim()).filter(Boolean)) {
              const detectedCourier = CourierService.detectCourier(trackingCompany, tNum);
              if (detectedCourier.code === "DELHIVERY") {
                syncedAwbs.push(tNum);
              }
              const existingShipment = await prisma.shipment.findUnique({ where: { storeId_awb: { storeId: store.id, awb: tNum } } });
              const isOutward = existingShipment?.outwardScanned || false;

              await prisma.shipment.upsert({
                where: { storeId_awb: { storeId: store.id, awb: tNum } },
                create: {
                  awb: tNum,
                  storeId: store.id,
                  shopifyOrderId: order.shopifyOrderId,
                  shopifyOrderNumber: order.shopifyOrderNumber || order.orderNumber,
                  shopifyOrderName: order.shopifyOrderName || order.name,
                  orderNumber: order.shopifyOrderName || order.orderNumber,
                  orderCreatedAt: order.shopifyOrderCreatedAt || order.createdAt,
                  customerName: order.customerName || realCustomerName || "Customer",
                  customerPhone: order.phone,
                  amount: order.totalPrice,
                  payment: order.financialStatus === "PAID" ? "Prepaid" : "COD",
                  date: order.createdAt.toISOString().split("T")[0],
                  carrier: detectedCourier.displayName,
                  status: isOrderCancelled && !isOutward ? "Cancelled" : "AWB Generated",
                  normalizedStatus: isOrderCancelled && !isOutward ? "CANCELLED_PRE_DISPATCH" : "AWB_GENERATED",
                },
                update: {
                  storeId: store.id,
                  carrier: detectedCourier.displayName,
                  shopifyOrderId: order.shopifyOrderId,
                  shopifyOrderNumber: order.shopifyOrderNumber || order.orderNumber || undefined,
                  shopifyOrderName: order.shopifyOrderName || order.name || undefined,
                  orderNumber: order.shopifyOrderName || order.orderNumber || undefined,
                  orderCreatedAt: order.shopifyOrderCreatedAt || order.createdAt || undefined,
                  customerName: order.customerName || realCustomerName || undefined,
                  customerPhone: order.phone || undefined,
                  amount: order.totalPrice || undefined,
                  ...(isOrderCancelled && !isOutward
                    ? { status: "Cancelled", normalizedStatus: "CANCELLED_PRE_DISPATCH" }
                    : {}),
                },
              });
            }
          }
        }

        recordsCount++;
        } catch (orderErr: any) {
          console.error("[GraphQL Order Sync] Order processing error:", orderErr.message);
        }
      }

      hasNextPage = ordersData.pageInfo?.hasNextPage || false;
      cursor = ordersData.pageInfo?.endCursor || null;
    }

    // Run batch Delhivery tracking sync for all discovered AWBs
    if (syncedAwbs.length > 0) {
      try {
        await DelhiveryService.syncBatchTracking(store.id, syncedAwbs);
      } catch (delhiveryErr) {
        console.error("Batch Delhivery tracking sync error during Shopify sync:", delhiveryErr);
      }
    }

    const durationMs = Date.now() - startTime;

    // Update store metadata
    await prisma.shopifyStore.update({
      where: { id: store.id },
      data: { lastOrderSyncAt: new Date() },
    });

    // Update audit log
    try {
      await prisma.syncLog.update({
        where: { id: log.id },
        data: {
          status: "SUCCESS",
          recordsCount,
          durationMs,
          completedAt: new Date(),
          details: `Successfully synchronized ${recordsCount} orders with line items and physical stock deductions.`,
        },
      });
    } catch (logErr) {
      console.error("Failed to update syncLog (success):", logErr);
    }

    return {
      success: true,
      type: "ORDERS",
      recordsCount,
      durationMs,
    };
  } catch (error: any) {
    const durationMs = Date.now() - startTime;
    const is401 = error.message?.includes("401") || error.message?.includes("Unauthorized");
    if (is401 && store?.id) {
      await prisma.shopifyStore.update({
        where: { id: store.id },
        data: { isConnected: false },
      }).catch(() => {});
    }

    try {
      await prisma.syncLog.update({
        where: { id: log.id },
        data: {
          status: "FAILED",
          durationMs,
          completedAt: new Date(),
          errorDetails: is401
            ? `Shopify API 401 Unauthorized: Invalid API key or access token for ${store?.shopDomain || "store"}`
            : (error.message || "Order sync failed"),
        },
      });
    } catch (logErr) {
      console.error("Failed to update syncLog (error):", logErr);
    }

    throw error;
  }
}

/**
 * Synchronize both products and orders
 */
export async function syncAll(
  storeId?: string,
  sessionToken?: string,
  targetShop?: string
): Promise<SyncResult> {
  const startTime = Date.now();

  const prodRes = await syncProducts(storeId, sessionToken, targetShop);
  const orderRes = await syncOrders(storeId, sessionToken, targetShop);

  const durationMs = Date.now() - startTime;
  const recordsCount = prodRes.recordsCount + orderRes.recordsCount;

  return {
    success: true,
    type: "FULL_SYNC",
    recordsCount,
    durationMs,
  };
}
