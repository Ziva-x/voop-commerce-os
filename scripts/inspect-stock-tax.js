let PrismaClient;
try {
  PrismaClient = require('./lib/generated/client').PrismaClient;
} catch (_e) {
  PrismaClient = require('@prisma/client').PrismaClient;
}
const prisma = new PrismaClient();

async function main() {
  const stockItems = await prisma.stockItem.findMany({
    select: {
      id: true,
      storeId: true,
      sku: true,
      name: true,
      type: true,
    },
    take: 30,
  });
  console.log("STOCK ITEMS COUNT:", stockItems.length);
  console.log("STOCK ITEMS:", JSON.stringify(stockItems, null, 2));
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
