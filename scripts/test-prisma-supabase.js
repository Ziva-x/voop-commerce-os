const { PrismaClient } = require('../lib/generated/client');

const projectRef = 'tslnmcvlfehosyjblnpm';
const password = 'V9+x#VW6_WWqKiz';
const encodedPassword = encodeURIComponent(password);
const host = 'aws-0-ap-south-1.pooler.supabase.com';

const dbUrl = `postgresql://postgres.${projectRef}:${encodedPassword}@${host}:6543/postgres?pgbouncer=true&connection_limit=1`;

const prisma = new PrismaClient({
  datasources: { db: { url: dbUrl } }
});

async function testPrisma() {
  console.log('Testing Prisma connection to Supabase...');
  const stores = await prisma.shopifyStore.findMany({
    select: { id: true, shopDomain: true, isConnected: true, voopStoreId: true }
  });
  console.log(`✓ Queried ${stores.length} stores via Prisma:`);
  for (const s of stores) {
    console.log(`  - ${s.shopDomain} (VOOP Store ID: ${s.voopStoreId}, Connected: ${s.isConnected})`);
  }

  const users = await prisma.user.findMany({
    select: { id: true, username: true, email: true, role: true }
  });
  console.log(`✓ Queried ${users.length} users:`);
  for (const u of users) {
    console.log(`  - User: ${u.username || u.email} (Role: ${u.role})`);
  }

  const ordersCount = await prisma.shopifyOrder.count();
  console.log(`✓ Total Shopify Orders: ${ordersCount}`);

  const stockCount = await prisma.stockItem.count();
  console.log(`✓ Total Stock Items: ${stockCount}`);

  const ledgerCount = await prisma.inventoryLedger.count();
  console.log(`✓ Total Inventory Ledger: ${ledgerCount}`);

  await prisma.$disconnect();
  console.log('\n🎉 Prisma successfully verified against Supabase!');
}

testPrisma().catch(err => {
  console.error('Prisma connection error:', err);
  process.exit(1);
});
