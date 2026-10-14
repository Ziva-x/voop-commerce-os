const { PrismaClient } = require('./lib/generated/client');
const prisma = new PrismaClient();

async function main() {
  const stores = await prisma.shopifyStore.findMany({
    select: {
      id: true,
      shopDomain: true,
      storeName: true,
      voopStoreId: true,
      publicStoreRef: true,
      accountId: true,
      isConnected: true,
      accessToken: true,
    }
  });
  console.log("=== ALL STORES IN FLY DB ===");
  for (const s of stores) {
    console.log({
      id: s.id,
      shopDomain: s.shopDomain,
      storeName: s.storeName,
      voopStoreId: s.voopStoreId,
      publicStoreRef: s.publicStoreRef,
      accountId: s.accountId,
      isConnected: s.isConnected,
      hasToken: Boolean(s.accessToken),
    });
  }

  const users = await prisma.user.findMany({
    select: {
      id: true,
      username: true,
      email: true,
      storeId: true,
      voopStoreId: true,
    }
  });
  console.log("\n=== ALL USERS IN FLY DB ===");
  console.log(users);
}

main().then(() => prisma.$disconnect()).catch(console.error);
