let PrismaClient;
try {
  PrismaClient = require('/app/lib/generated/client').PrismaClient;
} catch (e) {
  try {
    PrismaClient = require('./lib/generated/client').PrismaClient;
  } catch (err) {
    PrismaClient = require('../lib/generated/client').PrismaClient;
  }
}

const prisma = new PrismaClient();

async function main() {
  const stores = await prisma.shopifyStore.findMany();
  const users = await prisma.user.findMany();
  const preferences = await prisma.userPreference.findMany();
  const storeSettings = await prisma.storeSetting.findMany();
  const delhiveryConfigs = await prisma.delhiveryConfig.findMany();
  const courierIntegrations = await prisma.courierIntegration.findMany();

  const backup = {
    timestamp: new Date().toISOString(),
    stores: stores.map(s => ({
      id: s.id,
      voopStoreId: s.voopStoreId,
      publicStoreRef: s.publicStoreRef,
      accountId: s.accountId,
      shopDomain: s.shopDomain,
      storeName: s.storeName,
      currency: s.currency,
      isConnected: s.isConnected,
      hasAccessToken: !!s.accessToken,
    })),
    users: users.map(u => ({
      id: u.id,
      email: u.email,
      username: u.username,
      name: u.name,
      role: u.role,
      storeId: u.storeId,
      voopStoreId: u.voopStoreId,
      createdById: u.createdById,
    })),
    preferences,
    storeSettings,
    delhiveryConfigs,
    courierIntegrations,
  };

  console.log("=== BACKUP DATA SUMMARY ===");
  console.log(JSON.stringify(backup, null, 2));
}

main().catch(console.error).finally(() => prisma.$disconnect());
