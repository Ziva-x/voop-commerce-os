const { PrismaClient } = require('../lib/generated/client');
const prisma = new PrismaClient();

async function check() {
  const store = await prisma.shopifyStore.findFirst();
  console.log('Store:', store?.shopDomain, store?.id);

  const totalOrders = await prisma.shopifyOrder.count({ where: { storeId: store.id } });
  const fulfilledOrders = await prisma.shopifyOrder.count({ where: { storeId: store.id, fulfillmentStatus: 'FULFILLED' } });
  const fulfillmentsCount = await prisma.shopifyFulfillment.count({ where: { storeId: store.id } });
  const shipmentsCount = await prisma.shipment.count({ where: { storeId: store.id } });

  console.log('Total orders:', totalOrders);
  console.log('Fulfilled orders:', fulfilledOrders);
  console.log('ShopifyFulfillments count in DB:', fulfillmentsCount);
  console.log('Shipments count in DB:', shipmentsCount);

  // Check top 15 orders (from user's screenshot)
  const orders = await prisma.shopifyOrder.findMany({
    where: { storeId: store.id },
    orderBy: { createdAt: 'desc' },
    take: 15,
    include: { fulfillments: true }
  });

  for (const o of orders) {
    console.log(`Order #${o.orderNumber} (id: ${o.id}) - status: ${o.fulfillmentStatus} - fulfillments in DB: ${o.fulfillments.length}`);
    if (o.fulfillments.length > 0) {
      console.log('   DB Fulfillments:', JSON.stringify(o.fulfillments));
    }
    if (o.rawPayload) {
      try {
        const raw = JSON.parse(o.rawPayload);
        const fCount = raw.fulfillments ? raw.fulfillments.length : 0;
        console.log(`   raw fulfillments count: ${fCount}`);
        if (fCount > 0) {
          console.log('   raw fulfillments sample:', JSON.stringify(raw.fulfillments.map(f => ({
            id: f.id,
            status: f.status,
            tracking_company: f.tracking_company,
            tracking_number: f.tracking_number,
            tracking_numbers: f.tracking_numbers,
            tracking_url: f.tracking_url,
            tracking_urls: f.tracking_urls,
            tracking_info: f.tracking_info,
            line_items_count: f.line_items?.length
          }))));
        }
      } catch (e) {
        console.log('   rawPayload parse error:', e.message);
      }
    }
  }

  const fulfillments = await prisma.shopifyFulfillment.findMany({
    where: { storeId: store.id },
    select: { deliveryStatus: true, trackingNumber: true }
  });
  const deliveryStatusCounts = {};
  for (const f of fulfillments) {
    deliveryStatusCounts[f.deliveryStatus] = (deliveryStatusCounts[f.deliveryStatus] || 0) + 1;
  }
  console.log('ShopifyFulfillment deliveryStatus counts:', deliveryStatusCounts);

  const rawStatusCounts = {};
  const ordersAll = await prisma.shopifyOrder.findMany({
    where: { storeId: store.id },
    select: { rawPayload: true }
  });
  for (const o of ordersAll) {
    if (!o.rawPayload) continue;
    try {
      const raw = JSON.parse(o.rawPayload);
      if (raw.fulfillments) {
        for (const f of raw.fulfillments) {
          const s = f.shipment_status || 'NONE';
          rawStatusCounts[s] = (rawStatusCounts[s] || 0) + 1;
        }
      }
    } catch(e) {}
  }
  console.log('Raw Shopify shipment_status counts:', rawStatusCounts);

  await prisma.$disconnect();
}
check().catch(console.error);
