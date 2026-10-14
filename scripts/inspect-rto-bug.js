const { PrismaClient } = require('../lib/generated/client');
const p = new PrismaClient();

async function check() {

  const stores = await p.shopifyStore.findMany({ select: { id: true, shopDomain: true } });
  console.log('Stores:', stores);




  const allStatuses = await p.shipment.groupBy({
    by: ['status', 'normalizedStatus'],
    _count: true
  });
  console.log('\nAll Statuses in DB:', JSON.stringify(allStatuses, null, 2));

  // Let's also check active shipments vs all
  const activeCount = await p.shipment.count({
    where: {
      deletedAt: null,
      normalizedStatus: {
        in: ['MANIFESTED', 'READY_FOR_PICKUP', 'IN_TRANSIT', 'IN-TRANSIT', 'OUT_FOR_DELIVERY', 'OUT-FOR-DELIVERY', 'RTO']
      }
    }
  });
  console.log('\nActive shipments count (operational):', activeCount);
}

check().catch(console.error).finally(() => p.$disconnect());
