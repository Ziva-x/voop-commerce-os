const { PrismaClient } = require('../lib/generated/client');
const prisma = new PrismaClient({
  datasources: {
    db: {
      url: 'postgres://voop_webapp:9ixaVDBzSfxmZlb@127.0.0.1:5433/voop_webapp?sslmode=disable'
    }
  }
});

async function main() {
  const storeCount = await prisma.shopifyStore.count();
  const userCount = await prisma.user.count();
  console.log('SUCCESS CONNECTING VIA LOCAL PROXY!');
  console.log('Stores count:', storeCount);
  console.log('Users count:', userCount);
}

main().catch(console.error).finally(() => prisma.$disconnect());
