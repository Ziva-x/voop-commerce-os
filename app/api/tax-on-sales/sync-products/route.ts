import { NextRequest, NextResponse } from "next/server";
import { resolveCurrentTenant } from "@/lib/auth-helpers";
import { prisma } from "@/lib/prisma";
import { shopifyGraphQL } from "@/lib/shopify";

export const dynamic = "force-dynamic";

/**
 * POST /api/tax-on-sales/sync-products
 *
 * Fetches products & variants directly from the CURRENT authenticated tenant's connected Shopify store,
 * upserts them canonically into ShopifyProduct & ShopifyVariant, ensures default tax configs,
 * resolves StockItem descriptions, and returns detailed sync metrics.
 */
export async function POST(request: NextRequest) {
  try {
    const tenant = await resolveCurrentTenant(request);
    if (!tenant.authorized || !tenant.shopifyStoreId || !tenant.store) {
      return NextResponse.json(
        { success: false, error: tenant.error || "Unauthorized: No connected store found" },
        { status: tenant.status || 401 }
      );
    }

    const store = tenant.store;
    const storeId = store.id;
    const shopDomain = store.shopDomain;
    const accessToken = store.accessToken;

    if (!accessToken) {
      return NextResponse.json(
        { success: false, error: "Connected Shopify store has no valid access token." },
        { status: 400 }
      );
    }

    const startTime = Date.now();
    let productsFetched = 0;
    let variantsFetched = 0;
    let newCount = 0;
    let updatedCount = 0;
    let unchangedCount = 0;
    let failedCount = 0;

    let hasNextPage = true;
    let cursor: string | null = null;

    const query = `
      query getProductsAndVariants($cursor: String) {
        products(first: 50, after: $cursor) {
          pageInfo {
            hasNextPage
            endCursor
          }
          edges {
            node {
              id
              title
              handle
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

    while (hasNextPage) {
      const response = await shopifyGraphQL(shopDomain, accessToken, query, { cursor });
      const productsData = response?.data?.products;

      if (!productsData || !productsData.edges) {
        break;
      }

      for (const edge of productsData.edges) {
        try {
          const p = edge.node;
          const shopifyProductId = p.id.replace("gid://shopify/Product/", "");
          productsFetched++;

          // Check if product already exists
          const existingProduct = await prisma.shopifyProduct.findUnique({
            where: {
              storeId_shopifyProductId: {
                storeId,
                shopifyProductId,
              },
            },
            select: { id: true, title: true, status: true, updatedAt: true },
          });

          const product = await prisma.shopifyProduct.upsert({
            where: {
              storeId_shopifyProductId: {
                storeId,
                shopifyProductId,
              },
            },
            create: {
              storeId,
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

          if (!existingProduct) {
            newCount++;
          } else if (existingProduct.title !== p.title || existingProduct.status !== p.status) {
            updatedCount++;
          } else {
            unchangedCount++;
          }

          // Upsert variants
          for (const vEdge of p.variants?.edges || []) {
            try {
              const v = vEdge.node;
              const shopifyVariantId = v.id.replace("gid://shopify/ProductVariant/", "");
              variantsFetched++;

              const priceFloat = parseFloat(v.price || "0") || 0.0;
              const compareAtPriceFloat = v.compareAtPrice ? parseFloat(v.compareAtPrice) : null;
              const cleanSku = (v.sku || "").trim().toUpperCase();

              await prisma.shopifyVariant.upsert({
                where: {
                  storeId_shopifyVariantId: {
                    storeId,
                    shopifyVariantId,
                  },
                },
                create: {
                  storeId,
                  productId: product.id,
                  shopifyProductId,
                  shopifyVariantId,
                  title: v.title,
                  sku: cleanSku || null,
                  barcode: v.barcode || null,
                  price: priceFloat,
                  compareAtPrice: compareAtPriceFloat,
                  inventoryQuantity: v.inventoryQuantity ?? 0,
                  imageUrl: v.image?.url || null,
                  rawPayload: JSON.stringify(v),
                  syncedAt: new Date(),
                },
                update: {
                  productId: product.id,
                  shopifyProductId,
                  title: v.title,
                  sku: cleanSku || null,
                  barcode: v.barcode || null,
                  price: priceFloat,
                  compareAtPrice: compareAtPriceFloat,
                  inventoryQuantity: v.inventoryQuantity ?? 0,
                  imageUrl: v.image?.url || null,
                  rawPayload: JSON.stringify(v),
                  syncedAt: new Date(),
                },
              });

              // Ensure default ProductTaxConfig exists for this canonical variant
              if (cleanSku) {
                const existingTaxConfig = await prisma.productTaxConfig.findUnique({
                  where: { storeId_sku: { storeId, sku: cleanSku } },
                });

                if (!existingTaxConfig) {
                  await prisma.productTaxConfig.create({
                    data: {
                      storeId,
                      sku: cleanSku,
                      shopifyProductId,
                      shopifyVariantId,
                      title: v.title && v.title !== "Default Title" ? `${p.title} — ${v.title}` : p.title,
                      taxRate: 18.0,
                      isTaxInclusive: true,
                      hsnCode: "",
                    },
                  }).catch(() => {});
                } else if (!existingTaxConfig.shopifyVariantId || !existingTaxConfig.shopifyProductId) {
                  await prisma.productTaxConfig.update({
                    where: { id: existingTaxConfig.id },
                    data: { shopifyProductId, shopifyVariantId },
                  }).catch(() => {});
                }
              }

              // Update StockItem description in Physical Inventory if single item exists with raw SKU name
              if (cleanSku) {
                const singleStockItem = await prisma.stockItem.findUnique({
                  where: { storeId_sku: { storeId, sku: cleanSku } },
                });

                if (singleStockItem && singleStockItem.type === "SINGLE") {
                  const varTitle = v.title?.trim();
                  const isMeaningful =
                    varTitle &&
                    varTitle !== "Default Title" &&
                    varTitle.toLowerCase() !== "default" &&
                    !p.title.toLowerCase().includes(varTitle.toLowerCase());
                  const resolvedName = isMeaningful ? `${p.title} — ${varTitle}` : p.title;

                  if (singleStockItem.name === singleStockItem.sku || !singleStockItem.name || singleStockItem.name.length < 3) {
                    await prisma.stockItem.update({
                      where: { id: singleStockItem.id },
                      data: { name: resolvedName },
                    }).catch(() => {});
                  }
                }
              }
            } catch (varErr) {
              console.error("[TAX_SYNC] Error upserting variant:", varErr);
              failedCount++;
            }
          }
        } catch (prodErr) {
          console.error("[TAX_SYNC] Error upserting product:", prodErr);
          failedCount++;
        }
      }

      hasNextPage = productsData.pageInfo?.hasNextPage || false;
      cursor = productsData.pageInfo?.endCursor || null;
    }

    // Update store's lastProductSyncAt timestamp
    await prisma.shopifyStore.update({
      where: { id: storeId },
      data: { lastProductSyncAt: new Date() },
    });

    // Create sync log entry
    await prisma.syncLog.create({
      data: {
        storeId,
        type: "PRODUCTS",
        status: failedCount === 0 ? "SUCCESS" : "PARTIAL",
        recordsCount: variantsFetched,
        durationMs: Date.now() - startTime,
        details: JSON.stringify({
          productsFetched,
          variantsFetched,
          newCount,
          updatedCount,
          unchangedCount,
          failedCount,
        }),
      },
    }).catch(() => {});

    return NextResponse.json({
      success: true,
      message: "Products & variants successfully synchronized from Shopify.",
      stats: {
        productsFetched,
        variantsFetched,
        newCount,
        updatedCount,
        unchangedCount,
        failedCount,
      },
    });
  } catch (error: any) {
    console.error("[TAX_SYNC_ERROR]:", error);
    return NextResponse.json(
      { success: false, error: error.message || "Failed to fetch products from Shopify." },
      { status: 500 }
    );
  }
}
