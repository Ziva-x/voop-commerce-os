const { PrismaClient } = require('../lib/generated/client');
const p = new PrismaClient();

async function run() {
  const shipments = await p.shipment.findMany({
    where: {
      OR: [
        { status: { contains: 'RTO', mode: 'insensitive' } },
        { normalizedStatus: { contains: 'RTO' } }
      ]
    },
    include: {
      scans: {
        take: 3,
        orderBy: { timestamp: 'desc' }
      }
    }
  });

  console.log(`Found ${shipments.length} RTO-related shipments:`);
  for (const s of shipments) {
    console.log({
      awb: s.awb,
      status: s.status,
      normalizedStatus: s.normalizedStatus,
      rawStatus: s.rawStatus,
      statusType: s.statusType,
      rtoInwardScanned: s.rtoInwardScanned,
      rtoReceivedAt: s.rtoReceivedAt,
      deliveryDate: s.deliveryDate,
      latestScan: s.scans[0] ? { type: s.scans[0].statusType, desc: s.scans[0].instructions || s.scans[0].status } : null
    });
  }
}

run().finally(() => p.$disconnect());
