const { PrismaClient } = require('./lib/generated/client');
const prisma = new PrismaClient();

async function main() {
  const shipments = await prisma.shipment.findMany({
    where: {
      OR: [
        { normalizedStatus: { contains: 'RTO' } },
        { status: { contains: 'RTO' } },
        { rawStatus: { contains: 'RTO' } }
      ]
    },
    take: 50,
    select: {
      id: true,
      awb: true,
      storeId: true,
      status: true,
      rawStatus: true,
      normalizedStatus: true,
      deliveryStatus: true,
      rtoInwardScanned: true,
      rtoDate: true,
      deliveryDate: true
    }
  });
  console.log(`Found ${shipments.length} matching shipments:`);
  console.table(shipments);
}

main().catch(console.error).finally(() => prisma.$disconnect());
