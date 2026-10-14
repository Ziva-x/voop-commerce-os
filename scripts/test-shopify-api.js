const { PrismaClient } = require('../lib/generated/client');
const prisma = new PrismaClient();

async function testShopify() {
  const store = await prisma.shopifyStore.findFirst({ where: { isConnected: true } });
  console.log('Store:', store.shopDomain);

  const res = await fetch(`https://${store.shopDomain}/admin/api/2024-01/orders.json?status=any&limit=5`, {
    headers: {
      'X-Shopify-Access-Token': store.accessToken,
      'Content-Type': 'application/json'
    }
  });

  console.log('Shopify API response status:', res.status);
  if (res.ok) {
    const data = await res.json();
    console.log('Fetched sample orders count:', data.orders.length);
    for (const o of data.orders) {
      console.log(`Order #${o.order_number} (${o.name}) - fulfillment_status: ${o.fulfillment_status} - fulfillments count: ${o.fulfillments?.length}`);
      if (o.fulfillments && o.fulfillments.length > 0) {
        console.log('   Fulfillment 0:', {
          id: o.fulfillments[0].id,
          carrier: o.fulfillments[0].tracking_company,
          tracking: o.fulfillments[0].tracking_number,
          tracking_numbers: o.fulfillments[0].tracking_numbers,
          tracking_url: o.fulfillments[0].tracking_url,
          line_items_count: o.fulfillments[0].line_items?.length
        });
      }
    }
  } else {
    const text = await res.text();
    console.log('Shopify API error:', text);
  }

  await prisma.$disconnect();
}
testShopify().catch(console.error);
