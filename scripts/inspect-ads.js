const { PrismaClient } = require('../lib/generated/client');
const prisma = new PrismaClient();

async function main() {
  const stores = await prisma.shopifyStore.findMany({
    select: { id: true, shopDomain: true, storeName: true }
  });
  console.log('Stores:', JSON.stringify(stores, null, 2));

  const metaAccounts = await prisma.metaAccount.findMany();
  console.log('MetaAccounts count:', metaAccounts.length);
  console.log('MetaAccounts:', JSON.stringify(metaAccounts.map(m => ({
    id: m.id,
    storeId: m.storeId,
    adAccountId: m.adAccountId,
    name: m.name,
    status: m.status,
    hasToken: !!m.accessToken,
    lastSyncedAt: m.lastSyncedAt
  })), null, 2));

  const adAccounts = await prisma.adPlatformAccount.findMany();
  console.log('AdPlatformAccounts count:', adAccounts.length);
  console.log('AdPlatformAccounts:', JSON.stringify(adAccounts.map(a => ({
    id: a.id,
    storeId: a.storeId,
    platform: a.platform,
    accountId: a.accountId,
    accountName: a.accountName,
    status: a.status,
    hasAccessToken: !!a.accessToken,
    hasRefreshToken: !!a.refreshToken,
    clientId: a.clientId,
    developerToken: a.developerToken ? 'SET' : null,
    organizationId: a.organizationId,
    spendThisMonth: a.spendThisMonth,
    roas: a.roas,
    lastSyncedAt: a.lastSyncedAt
  })), null, 2));

  const adMetrics = await prisma.adDailyMetric.findMany();
  console.log('AdDailyMetrics count:', adMetrics.length);
  if (adMetrics.length > 0) {
    console.log('Sample AdDailyMetric:', JSON.stringify(adMetrics.slice(0, 5), null, 2));
  }

  const metaMetrics = await prisma.metaDailyMetric.findMany();
  console.log('MetaDailyMetrics count:', metaMetrics.length);
  if (metaMetrics.length > 0) {
    console.log('Sample MetaDailyMetric:', JSON.stringify(metaMetrics.slice(0, 5), null, 2));
  }

  const expenses = await prisma.businessExpense.findMany({
    where: { category: 'Advertising' }
  });
  console.log('Advertising BusinessExpenses count:', expenses.length);

  await prisma.$disconnect();
}

main().catch(console.error);
