const { PrismaClient } = require('../lib/generated/client');
const prisma = new PrismaClient();

async function run() {
  const store = await prisma.shopifyStore.findFirst();
  const delhivery = await prisma.delhiveryConfig.findFirst({ where: { storeId: store.id } });
  const company = await prisma.storeSetting.findFirst({ where: { storeId: store.id } });

  console.log('Store Origin Sources:');
  console.log('Delhivery clientName:', delhivery?.clientName);
  console.log('Delhivery warehousePin:', delhivery?.warehousePin);
  console.log('Company city/state/pincode:', {
    city: company?.city,
    state: company?.state,
    pincode: company?.pincode,
    addressLine1: company?.addressLine1
  });

  // Check shipments with orders
  const shipments = await prisma.shipment.findMany({
    where: { storeId: store.id },
    orderBy: [{ date: 'desc' }, { pickupDate: 'desc' }, { createdAt: 'desc' }],
    take: 10,
    select: {
      awb: true,
      orderNumber: true,
      date: true,
      pickupDate: true,
      statusLocation: true,
      customerName: true,
      customerPhone: true,
    }
  });

  const cleanOrderNums = shipments.map(s => (s.orderNumber || '').replace(/^#+/, '').trim());
  const orders = await prisma.shopifyOrder.findMany({
    where: {
      storeId: store.id,
      orderNumber: { in: cleanOrderNums }
    },
    select: {
      orderNumber: true,
      processedAt: true,
      createdAt: true,
      shippingAddress: true,
    }
  });

  const orderMap = new Map();
  for (const o of orders) {
    orderMap.set(o.orderNumber, o);
  }

  console.log('\nSample Top 10 Shipments with Route & Date:');
  for (const s of shipments) {
    const cleanNum = (s.orderNumber || '').replace(/^#+/, '').trim();
    const ord = orderMap.get(cleanNum);
    let dest = null;
    if (ord?.shippingAddress) {
      try {
        const addr = JSON.parse(ord.shippingAddress);
        dest = {
          city: addr.city,
          state: addr.province || addr.province_code,
          pincode: addr.zip,
          address1: addr.address1
        };
      } catch (e) {}
    }

    console.log({
      awb: s.awb,
      orderNumber: s.orderNumber,
      fulfilledDate: s.date,
      orderPlacedDate: ord?.processedAt ? ord.processedAt.toISOString().slice(0, 10) : null,
      origin: delhivery?.clientName ? `${delhivery.clientName} (${delhivery.warehousePin || ''})` : 'Akathiyur, Kerala',
      destination: dest ? `${dest.city}, ${dest.state || ''} ${dest.pincode || ''}` : 'No address'
    });
  }
}

run()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
