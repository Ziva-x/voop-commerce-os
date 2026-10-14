const { PrismaClient } = require('../lib/generated/client');
const prisma = new PrismaClient();

async function main() {
  const store = await prisma.shopifyStore.findFirst();
  if (!store) {
    console.log('Store not found');
    return;
  }
  const config = await prisma.delhiveryConfig.findUnique({ where: { storeId: store.id } });
  console.log('Delhivery config for store:', {
    clientName: config?.clientName,
    hasToken: !!config?.apiToken,
    tokenPrefix: config?.apiToken ? config.apiToken.slice(0, 8) + '...' : 'none',
    mode: config?.mode,
    isActive: config?.isActive
  });

  // Find shipments and their corresponding fulfillments
  const shipments = await prisma.shipment.findMany({
    where: { storeId: store.id },
    select: {
      id: true,
      awb: true,
      orderNumber: true,
      status: true,
      normalizedStatus: true,
      rawStatus: true,
      scans: { select: { id: true }, take: 1 }
    }
  });

  const fulfillments = await prisma.shopifyFulfillment.findMany({
    where: { storeId: store.id },
    select: { trackingNumber: true, deliveryStatus: true, orderId: true, shopifyOrderId: true }
  });

  const fMap = new Map();
  for (const f of fulfillments) {
    if (f.trackingNumber) {
      fMap.set(f.trackingNumber.trim().replace(/^#+/, ''), f.deliveryStatus);
    }
  }

  let updatedTotal = 0;
  for (const s of shipments) {
    if (s.scans.length > 0 && s.rawStatus) {
      continue;
    }
    const cleanAwb = s.awb.trim().replace(/^#+/, '');
    const fStatus = fMap.get(cleanAwb);
    let mappedNorm = null;
    let mappedDisplay = null;

    if (fStatus === 'DELIVERED') {
      mappedNorm = 'DELIVERED';
      mappedDisplay = 'Delivered';
    } else if (fStatus === 'IN_TRANSIT') {
      mappedNorm = 'IN-TRANSIT';
      mappedDisplay = 'In Transit';
    } else if (fStatus === 'OUT_FOR_DELIVERY') {
      mappedNorm = 'OUT-FOR-DELIVERY';
      mappedDisplay = 'Out for Delivery';
    }

    if (mappedNorm && mappedNorm !== s.normalizedStatus) {
      await prisma.shipment.update({
        where: { id: s.id },
        data: {
          status: mappedDisplay,
          normalizedStatus: mappedNorm,
        },
      });
      updatedTotal++;
    }
  }

  console.log(`Successfully updated ${updatedTotal} shipments to real status!`);

  const afterDistribution = await prisma.shipment.groupBy({
    by: ['status', 'normalizedStatus'],
    where: { storeId: store.id },
    _count: { _all: true }
  });
  console.log('New database distribution:', JSON.stringify(afterDistribution, null, 2));
}

main().finally(() => prisma.$disconnect());
