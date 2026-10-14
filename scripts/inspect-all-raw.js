const { PrismaClient } = require('../lib/generated/client');
const prisma = new PrismaClient();

async function checkAllRaw() {
  const orders = await prisma.shopifyOrder.findMany({
    select: { id: true, orderNumber: true, fulfillmentStatus: true, rawPayload: true, fulfillments: true }
  });
  let totalWithRawFulfillments = 0;
  let totalRawFulfillmentCount = 0;
  let ordersWithDbFulfillments = 0;
  const missingOrders = [];

  for (const o of orders) {
    if (o.fulfillments && o.fulfillments.length > 0) {
      ordersWithDbFulfillments++;
    }
    if (o.rawPayload) {
      try {
        const raw = JSON.parse(o.rawPayload);
        if (raw.fulfillments && raw.fulfillments.length > 0) {
          totalWithRawFulfillments++;
          totalRawFulfillmentCount += raw.fulfillments.length;
          if (!o.fulfillments || o.fulfillments.length === 0) {
            missingOrders.push({
              num: o.orderNumber,
              status: o.fulfillmentStatus,
              fCount: raw.fulfillments.length,
              fSample: raw.fulfillments.map(f => ({
                id: f.id,
                carrier: f.tracking_company,
                tracking: f.tracking_number || (f.tracking_numbers && f.tracking_numbers[0])
              }))
            });
          }
        }
      } catch (e) {}
    }
  }

  console.log('Total orders count:', orders.length);
  console.log('Orders with raw fulfillments in rawPayload:', totalWithRawFulfillments);
  console.log('Total raw fulfillment objects across all orders:', totalRawFulfillmentCount);
  console.log('Orders with DB fulfillments currently:', ordersWithDbFulfillments);
  console.log('Missing orders count (have fulfillments in rawPayload but not in DB):', missingOrders.length);
  console.log('Sample missing orders:', JSON.stringify(missingOrders.slice(0, 10), null, 2));

  await prisma.$disconnect();
}
checkAllRaw().catch(console.error);
