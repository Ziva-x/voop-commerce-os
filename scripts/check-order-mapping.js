const { PrismaClient } = require('./lib/generated/client');
const prisma = new PrismaClient();

async function main() {
  console.log('=== COUNT OF TABLES ===');
  const orderCount = await prisma.shopifyOrder.count();
  const fulfillmentCount = await prisma.shopifyFulfillment.count();
  const shipmentCount = await prisma.shipment.count();
  console.log({ orderCount, fulfillmentCount, shipmentCount });

  console.log('\n=== LATEST 10 ORDERS AND THEIR FULFILLMENTS/SHIPMENTS ===');
  const latestOrders = await prisma.shopifyOrder.findMany({
    take: 10,
    orderBy: { createdAt: 'desc' },
    include: {
      fulfillments: true,
    }
  });

  for (const o of latestOrders) {
    const shipments = await prisma.shipment.findMany({
      where: {
        OR: [
          { shopifyOrderId: o.shopifyOrderId },
          { orderNumber: o.orderNumber },
          { orderNumber: `#${o.orderNumber}` }
        ]
      }
    });

    console.log({
      orderId: o.id,
      shopifyOrderId: o.shopifyOrderId,
      orderNumber: o.orderNumber,
      orderName: o.name,
      createdAt: o.createdAt,
      fulfillmentsCount: o.fulfillments.length,
      fulfillments: o.fulfillments.map(f => ({
        id: f.shopifyFulfillmentId,
        trackingCompany: f.trackingCompany,
        trackingNumber: f.trackingNumber,
      })),
      shipmentsCount: shipments.length,
      shipments: shipments.map(s => ({
        awb: s.awb,
        orderNumber: s.orderNumber,
        shopifyOrderId: s.shopifyOrderId,
        carrier: s.carrier,
        orderCreatedAt: s.orderCreatedAt
      }))
    });
  }

  console.log('\n=== CHECKING SHIPMENT WITH AWB 46932210007151 (THE USER EXAMPLE) ===');
  const targetShipment = await prisma.shipment.findFirst({
    where: { awb: '46932210007151' }
  });
  console.log('Target Shipment:', targetShipment);
  if (targetShipment?.shopifyOrderId) {
    const linkedOrder = await prisma.shopifyOrder.findFirst({
      where: { shopifyOrderId: targetShipment.shopifyOrderId },
      include: { fulfillments: true }
    });
    console.log('Linked Order for 46932210007151:', {
      id: linkedOrder?.id,
      shopifyOrderId: linkedOrder?.shopifyOrderId,
      orderNumber: linkedOrder?.orderNumber,
      name: linkedOrder?.name,
      createdAt: linkedOrder?.createdAt,
      rawPayloadSnippet: linkedOrder?.rawPayload ? linkedOrder.rawPayload.slice(0, 300) : null,
      fulfillments: linkedOrder?.fulfillments
    });
  }

  await prisma.$disconnect();
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
