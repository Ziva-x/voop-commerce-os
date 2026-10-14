const { PrismaClient } = require('../lib/generated/client');
const prisma = new PrismaClient();

async function run() {
  const store = await prisma.shopifyStore.findFirst();
  const shipments = await prisma.shipment.findMany({
    where: { storeId: store.id },
    select: {
      id: true,
      awb: true,
      orderNumber: true,
      shopifyOrderId: true,
      shopifyFulfillmentId: true,
      date: true,
      pickupDate: true,
      createdAt: true
    },
    take: 10
  });

  console.log('Sample shipments date info:');
  for (const s of shipments) {
    console.log({
      awb: s.awb,
      order: s.orderNumber,
      date: s.date,
      pickupDate: s.pickupDate,
      createdAt: s.createdAt
    });
  }

  // Count how many have pickupDate
  const total = await prisma.shipment.count({ where: { storeId: store.id } });
  const withPickupDate = await prisma.shipment.count({
    where: { storeId: store.id, pickupDate: { not: null } }
  });
  const withDate = await prisma.shipment.count({
    where: { storeId: store.id, date: { not: null } }
  });

  console.log({ total, withPickupDate, withDate });

  // Let's also check if we can join or map to shopifyFulfillment
  const fulfillments = await prisma.shopifyFulfillment.findMany({
    where: { storeId: store.id },
    include: { order: true },
    take: 5
  });
  console.log('Fulfillment sample dates:');
  for (const f of fulfillments) {
    console.log({
      tracking: f.trackingNumber,
      orderNumber: f.order?.orderNumber,
      fCreatedAt: f.createdAt,
      fPickupDate: f.pickupDate,
      orderCreatedAt: f.order?.createdAt,
      orderProcessedAt: f.order?.processedAt,
    });
  }
}

run()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
