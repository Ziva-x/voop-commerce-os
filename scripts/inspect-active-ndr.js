const { PrismaClient } = require('./lib/generated/client');
const prisma = new PrismaClient();

async function main() {
  const store = await prisma.shopifyStore.findFirst({ where: { voopStoreId: 'VOOP-H2GDGBVA' } });
  const activeShipments = await prisma.shipment.findMany({
    where: { storeId: store.id, deletedAt: null },
    include: { scans: { take: 5, orderBy: { timestamp: 'desc' } } }
  });
  console.log('Active shipments count:', activeShipments.length);
  for (const s of activeShipments) {
    console.log({
      awb: s.awb,
      orderNumber: s.orderNumber,
      status: s.status,
      normalizedStatus: s.normalizedStatus,
      rawStatus: s.rawStatus,
      statusType: s.statusType,
      statusLocation: s.statusLocation,
      statusInstructions: s.statusInstructions,
      ndrStatus: s.ndrStatus,
      customerName: s.customerName,
      customerPhone: s.customerPhone,
      scansCount: s.scans.length,
      latestScan: s.scans[0] ? {
        status: s.scans[0].status,
        statusType: s.scans[0].statusType,
        instructions: s.scans[0].instructions,
        location: s.scans[0].location,
        time: s.scans[0].timestamp
      } : null
    });
  }
}

main().finally(() => prisma.$disconnect());
