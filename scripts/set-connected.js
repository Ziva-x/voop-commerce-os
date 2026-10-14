const { PrismaClient } = require('/app/lib/generated/client');
const p = new PrismaClient();
p.shopifyStore.updateMany({ data: { isConnected: true } })
  .then(r => console.log('Stores marked connected:', r))
  .finally(() => p.$disconnect());
