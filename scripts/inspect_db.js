const { PrismaClient } = require('../lib/generated/client');
const prisma = new PrismaClient();

async function main() {
  const users = await prisma.user.count();
  const stores = await prisma.shopifyStore.count();
  const memberships = await prisma.storeMembership.count();
  const orders = await prisma.shopifyOrder.count();
  const products = await prisma.shopifyProduct.count();
  const variants = await prisma.shopifyVariant.count();
  const syncLogs = await prisma.syncLog.count();
  const syncJobs = await prisma.syncJob.count();
  
  console.log('Database counts:', {
    users,
    stores,
    memberships,
    orders,
    products,
    variants,
    syncLogs,
    syncJobs
  });

  const allStores = await prisma.shopifyStore.findMany({
    select: {
      id: true,
      voopStoreId: true,
      publicStoreRef: true,
      shopDomain: true,
      storeName: true,
      isConnected: true,
      accountId: true
    }
  });
  console.log('Stores in DB:', allStores);

  const allUsers = await prisma.user.findMany({
    select: {
      id: true,
      email: true,
      role: true,
      storeId: true,
      voopStoreId: true
    }
  });
  console.log('Users in DB:', allUsers);
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
