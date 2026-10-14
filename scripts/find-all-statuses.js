const { PrismaClient } = require('./lib/generated/client');
const prisma = new PrismaClient();

async function main() {
  const store = await prisma.shopifyStore.findFirst({ where: { voopStoreId: 'VOOP-H2GDGBVA' } });
  const all = await prisma.shipment.findMany({
    where: { storeId: store.id },
    select: {
      awb: true,
      orderNumber: true,
      status: true,
      normalizedStatus: true,
      rawStatus: true,
      statusType: true,
      statusInstructions: true,
      customerName: true,
      customerPhone: true
    }
  });

  const statusCounts = {};
  all.forEach(s => {
    const key = `${s.normalizedStatus} | ${s.rawStatus} | ${s.statusType} | ${s.statusInstructions}`;
    statusCounts[key] = (statusCounts[key] || 0) + 1;
  });

  console.log('Distinct status breakdown (total ' + all.length + '):');
  for (const [k, count] of Object.entries(statusCounts)) {
    console.log(`  [${count}] ${k}`);
  }
}

main().finally(() => prisma.$disconnect());
