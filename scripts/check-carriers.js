const { PrismaClient } = require('../lib/generated/client');
const prisma = new PrismaClient();

async function checkCarriers() {
  const orders = await prisma.shopifyOrder.findMany({
    select: { rawPayload: true, orderNumber: true }
  });
  const carriers = {};
  let totalWithFulfillments = 0;
  let totalFulfillmentObjects = 0;

  for (const o of orders) {
    if (!o.rawPayload) continue;
    try {
      const raw = JSON.parse(o.rawPayload);
      if (raw.fulfillments && raw.fulfillments.length > 0) {
        totalWithFulfillments++;
        for (const f of raw.fulfillments) {
          totalFulfillmentObjects++;
          const c = f.tracking_company || 'UNSPECIFIED';
          carriers[c] = (carriers[c] || 0) + 1;
        }
      }
    } catch(e) {}
  }
  console.log('Orders with fulfillments in rawPayload:', totalWithFulfillments);
  console.log('Total fulfillment objects:', totalFulfillmentObjects);
  console.log('Carriers breakdown:', carriers);
  await prisma.$disconnect();
}
checkCarriers().catch(console.error);
