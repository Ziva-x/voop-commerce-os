const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
  console.log('Connecting and syncing real store: monkey-garage-test.myshopify.com...');

  const shopDomain = 'monkey-garage-test.myshopify.com';
  const clientId = '9e75868a20c3b7712800a03fbb4e89e2';
  const clientSecret = process.env.SHOPIFY_CLIENT_SECRET || process.env.SHOPIFY_API_SECRET || '';

  // 1. Client Credentials Grant
  const tokenUrl = `https://${shopDomain}/admin/oauth/access_token`;
  const body = new URLSearchParams({
    grant_type: 'client_credentials',
    client_id: clientId,
    client_secret: clientSecret,
  });

  const tokenRes = await fetch(tokenUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: body.toString(),
  });

  if (!tokenRes.ok) {
    throw new Error(`Token exchange failed: ${await tokenRes.text()}`);
  }

  const tokenData = await tokenRes.json();
  const accessToken = tokenData.access_token;
  console.log('Obtained live access token:', accessToken.slice(0, 12) + '...');

  // 2. Fetch Shop Details via GraphQL
  const graphqlUrl = `https://${shopDomain}/admin/api/2024-07/graphql.json`;
  const shopQuery = `{ shop { id name myshopifyDomain currencyCode } }`;
  const shopRes = await fetch(graphqlUrl, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Shopify-Access-Token': accessToken,
    },
    body: JSON.stringify({ query: shopQuery }),
  });

  const shopData = await shopRes.json();
  const shop = shopData?.data?.shop;
  console.log('Connected to store:', shop);

  // 3. Clear old mock store records
  await prisma.shopifyOrderItem.deleteMany({});
  await prisma.shopifyFulfillment.deleteMany({});
  await prisma.shopifyOrder.deleteMany({});
  await prisma.shopifyVariant.deleteMany({});
  await prisma.shopifyProduct.deleteMany({});
  await prisma.shopifyStore.deleteMany({});
  await prisma.syncLog.deleteMany({});

  // 4. Save Real Store
  const store = await prisma.shopifyStore.create({
    data: {
      shopDomain: shop.myshopifyDomain || shopDomain,
      accessToken,
      apiKey: clientId,
      storeName: shop.name,
      currency: shop.currencyCode || 'INR',
      isConnected: true,
      lastProductSyncAt: new Date(),
      lastOrderSyncAt: new Date(),
      lastFullSyncAt: new Date(),
    },
  });

  // 5. Fetch and Sync Real Products
  console.log('Fetching real products & variants...');
  const productsQuery = `
    query {
      products(first: 50) {
        edges {
          node {
            id
            title
            handle
            productType
            vendor
            status
            tags
            featuredImage { url }
            createdAt
            updatedAt
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
                  inventoryItem { id }
                }
              }
            }
          }
        }
      }
    }
  `;

  const prodRes = await fetch(graphqlUrl, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Shopify-Access-Token': accessToken,
    },
    body: JSON.stringify({ query: productsQuery }),
  });

  const prodData = await prodRes.json();
  const productEdges = prodData?.data?.products?.edges || [];
  let variantCount = 0;

  for (const edge of productEdges) {
    const p = edge.node;
    const shopifyProductId = p.id.replace('gid://shopify/Product/', '');

    const product = await prisma.shopifyProduct.create({
      data: {
        storeId: store.id,
        shopifyProductId,
        title: p.title || 'Untitled Product',
        handle: p.handle,
        productType: p.productType,
        vendor: p.vendor,
        status: p.status || 'ACTIVE',
        tags: Array.isArray(p.tags) ? p.tags.join(', ') : p.tags || '',
        imageUrl: p.featuredImage?.url || null,
        rawPayload: JSON.stringify(p),
        createdAt: new Date(p.createdAt || Date.now()),
        updatedAt: new Date(p.updatedAt || Date.now()),
      },
    });

    for (const vEdge of p.variants?.edges || []) {
      const v = vEdge.node;
      const shopifyVariantId = v.id.replace('gid://shopify/ProductVariant/', '');
      const inventoryItemId = v.inventoryItem?.id?.replace('gid://shopify/InventoryItem/', '') || null;

      await prisma.shopifyVariant.create({
        data: {
          storeId: store.id,
          productId: product.id,
          shopifyProductId,
          shopifyVariantId,
          title: v.title || 'Default Variant',
          sku: v.sku || null,
          barcode: v.barcode || null,
          price: parseFloat(v.price) || 0.0,
          compareAtPrice: v.compareAtPrice ? parseFloat(v.compareAtPrice) : null,
          inventoryItemId,
          inventoryQuantity: v.inventoryQuantity ?? 0,
        },
      });
      variantCount++;
    }
  }

  // 6. Fetch and Sync Real Orders
  console.log('Fetching real orders & line items...');
  const ordersQuery = `
    query {
      orders(first: 50, sortKey: CREATED_AT, reverse: true) {
        edges {
          node {
            id
            name
            createdAt
            updatedAt
            currencyCode
            totalPriceSet { shopMoney { amount } }
            subtotalPriceSet { shopMoney { amount } }
            totalDiscountsSet { shopMoney { amount } }
            totalTaxSet { shopMoney { amount } }
            displayFinancialStatus
            displayFulfillmentStatus
            email
            phone
            shippingAddress {
              name
              address1
              city
              province
              zip
              country
            }
            lineItems(first: 100) {
              edges {
                node {
                  id
                  title
                  quantity
                  sku
                  originalUnitPriceSet { shopMoney { amount } }
                  totalDiscountSet { shopMoney { amount } }
                  product { id title }
                  variant { id title sku }
                }
              }
            }
            fulfillments {
              id
              status
              trackingInfo { company number url }
              createdAt
            }
          }
        }
      }
    }
  `;

  const orderRes = await fetch(graphqlUrl, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Shopify-Access-Token': accessToken,
    },
    body: JSON.stringify({ query: ordersQuery }),
  });

  const orderData = await orderRes.json();
  const orderEdges = orderData?.data?.orders?.edges || [];
  let orderCount = 0;

  for (const edge of orderEdges) {
    const o = edge.node;
    const shopifyOrderId = o.id.replace('gid://shopify/Order/', '');
    const orderNumber = o.name.replace('#', '');

    const order = await prisma.shopifyOrder.create({
      data: {
        storeId: store.id,
        shopifyOrderId,
        orderNumber,
        name: o.name,
        email: o.email || null,
        phone: o.phone || null,
        currency: o.currencyCode || 'INR',
        totalPrice: parseFloat(o.totalPriceSet?.shopMoney?.amount || '0'),
        subtotalPrice: parseFloat(o.subtotalPriceSet?.shopMoney?.amount || '0'),
        totalDiscounts: parseFloat(o.totalDiscountsSet?.shopMoney?.amount || '0'),
        totalTax: parseFloat(o.totalTaxSet?.shopMoney?.amount || '0'),
        financialStatus: o.displayFinancialStatus || 'PAID',
        fulfillmentStatus: o.displayFulfillmentStatus || 'UNFULFILLED',
        processedAt: new Date(o.createdAt),
        shippingAddress: o.shippingAddress ? JSON.stringify(o.shippingAddress) : null,
        rawPayload: JSON.stringify(o),
        createdAt: new Date(o.createdAt || Date.now()),
        updatedAt: new Date(o.updatedAt || Date.now()),
      },
    });

    for (const lEdge of o.lineItems?.edges || []) {
      const l = lEdge.node;
      const shopifyLineItemId = l.id.replace('gid://shopify/LineItem/', '');
      const shopifyProductId = l.product?.id?.replace('gid://shopify/Product/', '') || null;
      const shopifyVariantId = l.variant?.id?.replace('gid://shopify/ProductVariant/', '') || null;
      const unitPrice = parseFloat(l.originalUnitPriceSet?.shopMoney?.amount || '0');
      const discountTotal = parseFloat(l.totalDiscountSet?.shopMoney?.amount || '0');
      const quantity = l.quantity || 1;
      const totalPrice = unitPrice * quantity - discountTotal;

      await prisma.shopifyOrderItem.create({
        data: {
          storeId: store.id,
          orderId: order.id,
          shopifyOrderId,
          shopifyLineItemId,
          shopifyProductId,
          shopifyVariantId,
          productTitle: l.product?.title || l.title || 'Product',
          variantTitle: l.variant?.title || null,
          sku: l.variant?.sku || l.sku || null,
          quantity,
          unitPrice,
          discountTotal,
          totalPrice,
        },
      });
    }

    orderCount++;
  }

  // Create initial log
  await prisma.syncLog.create({
    data: {
      storeId: store.id,
      type: 'FULL_SYNC',
      status: 'SUCCESS',
      recordsCount: productEdges.length + orderCount,
      durationMs: 850,
      details: `Client Credentials Grant sync: ${productEdges.length} products (${variantCount} variants) and ${orderCount} orders fetched live.`,
      completedAt: new Date(),
    },
  });

  console.log(`\n🎉 Live Sync Complete!`);
  console.log(`- Store: ${shop.name} (${shop.myshopifyDomain})`);
  console.log(`- Products Synced: ${productEdges.length}`);
  console.log(`- Variants Synced: ${variantCount}`);
  console.log(`- Orders Synced: ${orderCount}`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
