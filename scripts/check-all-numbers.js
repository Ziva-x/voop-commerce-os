const { PrismaClient } = require('./lib/generated/client');
const prisma = new PrismaClient();

async function main() {
  const orders = await prisma.shopifyOrder.findMany({
    orderBy: { createdAt: 'desc' },
    select: {
      id: true,
      shopifyOrderId: true,
      orderNumber: true,
      name: true,
      createdAt: true,
      rawPayload: true
    }
  });

  console.log(`Total orders in DB: ${orders.length}`);
  
  // Check range of orderNumbers
  const orderNums = orders.map(o => {
    let raw = {};
    try { raw = JSON.parse(o.rawPayload || '{}'); } catch(e){}
    return {
      shopifyOrderId: o.shopifyOrderId,
      db_orderNumber: o.orderNumber,
      db_name: o.name,
      createdAt: o.createdAt,
      raw_order_number: raw.order_number,
      raw_name: raw.name
    };
  });

  console.log('--- NEWEST 15 ORDERS ---');
  orderNums.slice(0, 15).forEach(o => console.log(o));

  console.log('--- OLDEST 15 ORDERS ---');
  orderNums.slice(-15).forEach(o => console.log(o));

  // Check if there are orders where db_orderNumber != raw_order_number or where raw_name is different
  const discrepancies = orderNums.filter(o => {
    if (!o.raw_order_number) return false;
    return String(o.db_orderNumber) !== String(o.raw_order_number);
  });
  console.log(`Discrepancies where db_orderNumber !== raw_order_number: ${discrepancies.length}`);
  discrepancies.slice(0, 10).forEach(d => console.log(d));

  // Check shipments mapping to orders
  const shipments = await prisma.shipment.findMany({
    select: {
      id: true,
      awb: true,
      shopifyOrderId: true,
      orderNumber: true,
      orderCreatedAt: true,
      customerName: true
    }
  });
  console.log(`Total shipments in DB: ${shipments.length}`);
  
  // How many shipments have a shopifyOrderId that exists in shopifyOrder?
  const orderIdsSet = new Set(orders.map(o => o.shopifyOrderId));
  const matchedShipments = shipments.filter(s => s.shopifyOrderId && orderIdsSet.has(s.shopifyOrderId));
  const unmatchedShipments = shipments.filter(s => !s.shopifyOrderId || !orderIdsSet.has(s.shopifyOrderId));
  console.log(`Shipments with matching shopifyOrderId: ${matchedShipments.length}`);
  console.log(`Shipments with UNMATCHED shopifyOrderId: ${unmatchedShipments.length}`);
  if (unmatchedShipments.length > 0) {
    console.log('Sample unmatched shipments:', unmatchedShipments.slice(0, 5));
  }

  // Check shipments where shipment.orderNumber != order.orderNumber
  const shipmentDiscrepancies = [];
  for (const s of matchedShipments) {
    const parentOrder = orders.find(o => o.shopifyOrderId === s.shopifyOrderId);
    if (parentOrder && String(s.orderNumber).replace('#', '') !== String(parentOrder.orderNumber).replace('#', '')) {
      shipmentDiscrepancies.push({
        awb: s.awb,
        shipment_orderNumber: s.orderNumber,
        parentOrder_orderNumber: parentOrder.orderNumber,
        parentOrder_name: parentOrder.name,
        shopifyOrderId: s.shopifyOrderId
      });
    }
  }
  console.log(`Shipments where shipment.orderNumber !== parentOrder.orderNumber: ${shipmentDiscrepancies.length}`);
  shipmentDiscrepancies.slice(0, 10).forEach(sd => console.log(sd));

  await prisma.$disconnect();
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
