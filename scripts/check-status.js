const { PrismaClient } = require('/app/lib/generated/client');
const p = new PrismaClient();
p.shopifyStore.findMany({
  select: {
    id: true,
    voopStoreId: true,
    shopDomain: true,
    isConnected: true,
    accessToken: true,
    lastProductSyncAt: true,
    lastOrderSyncAt: true,
  }
})
  .then(s => console.log('Stores status in DB:', JSON.stringify(s, null, 2)))
  .finally(() => p.$disconnect());
