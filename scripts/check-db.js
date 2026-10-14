const path = require('path');
let PrismaClient;
try {
  PrismaClient = require(path.join(__dirname, '../lib/generated/client')).PrismaClient;
} catch (_e) {
  PrismaClient = require('@prisma/client').PrismaClient;
}
const prisma = new PrismaClient();

async function main() {
  console.log("=== CHECKING PRODUCTION DB USERS & STORES ===");

  const stores = await prisma.shopifyStore.findMany({
    select: {
      id: true,
      shopDomain: true,
      storeName: true,
      voopStoreId: true,
      accountId: true,
      isConnected: true,
      email: true,
    },
  });
  console.log("STORES:", JSON.stringify(stores, null, 2));

  const users = await prisma.user.findMany({
    select: {
      id: true,
      username: true,
      email: true,
      storeId: true,
      voopStoreId: true,
      role: true,
    },
  });
  console.log("USERS:", JSON.stringify(users, null, 2));
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
