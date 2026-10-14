const { PrismaClient } = require('./lib/generated/client');
const prisma = new PrismaClient();

async function main() {
  const store = await prisma.shopifyStore.findFirst({ where: { isConnected: true } });
  console.log('Store:', store.shopDomain);

  // 1. Fetch Order 1925 from Shopify
  console.log('\n--- FETCHING LATEST ORDERS FROM SHOPIFY REST API ---');
  const res = await fetch(`https://${store.shopDomain}/admin/api/2024-07/orders.json?status=any&limit=5`, {
    headers: {
      'X-Shopify-Access-Token': store.accessToken,
      'Content-Type': 'application/json'
    }
  });

  const data = await res.json();
  for (const o of data.orders || []) {
    console.log({
      shopify_order_id: o.id,
      shopify_order_number: o.order_number,
      shopify_order_name: o.name,
      shopify_order_created_at: o.created_at,
      fulfillments_count: o.fulfillments ? o.fulfillments.length : 0,
      fulfillments: (o.fulfillments || []).map(f => ({
        id: f.id,
        tracking_number: f.tracking_number,
        tracking_numbers: f.tracking_numbers,
        tracking_company: f.tracking_company,
        created_at: f.created_at
      }))
    });
  }

  // 2. Search Shopify for fulfillment with tracking 46932210007151 or query order with id 6320371499108
  console.log('\n--- FETCHING SHOPIFY ORDER 6320371499108 (ASSOCIATED WITH 46932210007151 IN DB) ---');
  const resOld = await fetch(`https://${store.shopDomain}/admin/api/2024-07/orders/6320371499108.json`, {
    headers: {
      'X-Shopify-Access-Token': store.accessToken,
      'Content-Type': 'application/json'
    }
  });
  if (resOld.ok) {
    const dataOld = await resOld.json();
    const oOld = dataOld.order;
    console.log({
      shopify_order_id: oOld.id,
      shopify_order_number: oOld.order_number,
      shopify_order_name: oOld.name,
      shopify_order_created_at: oOld.created_at,
      fulfillments: (oOld.fulfillments || []).map(f => ({
        id: f.id,
        tracking_number: f.tracking_number,
        tracking_numbers: f.tracking_numbers,
        tracking_company: f.tracking_company
      }))
    });
  } else {
    console.log('Order 6320371499108 error:', resOld.status, await resOld.text());
  }

  await prisma.$disconnect();
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
