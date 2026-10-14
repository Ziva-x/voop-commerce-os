if (!process.env.DATABASE_URL) {
  process.env.DATABASE_URL = "postgres://voop_webapp:9ixaVDBzSfxmZlb@127.0.0.1:5433/voop_webapp?sslmode=disable";
}
const { PrismaClient } = require('../lib/generated/client');
const prisma = new PrismaClient();

async function main() {
  const item = await prisma.shopifyOrderItem.findFirst({
    where: { order: { orderNumber: '1926' } },
    include: { order: true }
  });
  console.log('ShopifyOrderItem:', JSON.stringify(item, null, 2));
}

main().catch(console.error).finally(() => prisma.$disconnect());
