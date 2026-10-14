const { PrismaClient } = require('./lib/generated/client');
const prisma = new PrismaClient();

async function main() {
  console.log('=== SHOPIFY ORDERS (TOP 10) ===');
  const orders = await prisma.shopifyOrder.findMany({
    take: 10,
    orderBy: { createdAt: 'desc' },
    select: {
      id: true,
      shopifyOrderId: true,
      orderNumber: true,
      name: true,
      createdAt: true,
      rawPayload: true,
    }
  });

  for (const o of orders) {
    let raw = {};
    try { raw = JSON.parse(o.rawPayload || '{}'); } catch(e){}
    console.log({
      id: o.id,
      shopifyOrderId: o.shopifyOrderId,
      db_orderNumber: o.orderNumber,
      db_name: o.name,
      createdAt: o.createdAt,
      raw_id: raw.id,
      raw_order_number: raw.order_number,
      raw_name: raw.name,
    });
  }

  console.log('\n=== SHIPMENTS (TOP 10) ===');
  const shipments = await prisma.shipment.findMany({
    take: 10,
    orderBy: { createdAt: 'desc' },
    select: {
      id: true,
      awb: true,
      shopifyOrderId: true,
      orderNumber: true,
      carrier: true,
      orderCreatedAt: true,
      date: true,
    }
  });

  for (const s of shipments) {
    console.log(s);
  }

  console.log('\n=== CHECKING SPECIFIC NUMBER: 1730 or similar ===');
  const match1730Orders = await prisma.shopifyOrder.findMany({
    where: {
      OR: [
        { orderNumber: { contains: '1730' } },
        { name: { contains: '1730' } },
        { shopifyOrderId: { contains: '1730' } }
      ]
    },
    take: 5,
    select: { id: true, shopifyOrderId: true, orderNumber: true, name: true, rawPayload: true }
  });
  console.log('Orders matching 1730:', match1730Orders.length);
  for (const m of match1730Orders) {
    let raw = {};
    try { raw = JSON.parse(m.rawPayload || '{}'); } catch(e){}
    console.log('Match 1730:', {
      id: m.id,
      shopifyOrderId: m.shopifyOrderId,
      db_orderNumber: m.orderNumber,
      db_name: m.name,
      raw_id: raw.id,
      raw_order_number: raw.order_number,
      raw_name: raw.name,
    });
  }

  const match1730Shipments = await prisma.shipment.findMany({
    where: {
      OR: [
        { orderNumber: { contains: '1730' } },
        { shopifyOrderId: { contains: '1730' } },
        { awb: { contains: '1730' } }
      ]
    },
    take: 5,
  });
  console.log('Shipments matching 1730:', match1730Shipments.length);
  for (const s of match1730Shipments) {
    console.log('Shipment match 1730:', {
      id: s.id,
      awb: s.awb,
      shopifyOrderId: s.shopifyOrderId,
      orderNumber: s.orderNumber,
    });
  }

  await prisma.$disconnect();
}

main().catch(err => {
  console.error('Error:', err);
  process.exit(1);
});
