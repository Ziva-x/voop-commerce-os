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
  const counts = {
    users: await prisma.user.count(),
    userPreferences: await prisma.userPreference.count(),
    storeMemberships: await prisma.storeMembership.count(),
    shopifyStores: await prisma.shopifyStore.count(),
    shopifyProducts: await prisma.shopifyProduct.count(),
    shopifyVariants: await prisma.shopifyVariant.count(),
    shopifyOrders: await prisma.shopifyOrder.count(),
    shopifyOrderItems: await prisma.shopifyOrderItem.count(),
    shopifyFulfillments: await prisma.shopifyFulfillment.count(),
    stockItems: await prisma.stockItem.count(),
    comboComponents: await prisma.comboComponent.count(),
    purchaseBills: await prisma.purchaseBill.count(),
    purchaseBillItems: await prisma.purchaseBillItem.count(),
    inventoryLedgers: await prisma.inventoryLedger.count(),
    shipments: await prisma.shipment.count(),
    shipmentScans: await prisma.shipmentScan.count(),
    metaAccounts: await prisma.metaAccount.count(),
    metaCampaigns: await prisma.metaCampaign.count(),
    metaAdSets: await prisma.metaAdSet.count(),
    metaAds: await prisma.metaAd.count(),
    metaDailyMetrics: await prisma.metaDailyMetric.count(),
    metaPixels: await prisma.metaPixel.count(),
    metaPixelEvents: await prisma.metaPixelEvent.count(),
    delhiveryConfigs: await prisma.delhiveryConfig.count(),
    courierIntegrations: await prisma.courierIntegration.count(),
    syncLogs: await prisma.syncLog.count(),
    syncJobs: await prisma.syncJob.count(),
    webhookEvents: await prisma.shopifyWebhookEvent.count(),
    apiKeys: await prisma.voopApiKey.count(),
    collaborations: await prisma.collaboration.count(),
    collabSettings: await prisma.collabSetting.count(),
    expenseSettings: await prisma.expenseSetting.count(),
    productTaxConfigs: await prisma.productTaxConfig.count(),
    adPlatformAccounts: await prisma.adPlatformAccount.count(),
    adDailyMetrics: await prisma.adDailyMetric.count(),
    offlineOrders: await prisma.offlineOrder.count(),
    offlineOrderItems: await prisma.offlineOrderItem.count(),
    appSubscriptions: await prisma.appSubscription.count(),
    storeSettings: await prisma.storeSetting.count(),
  };

  console.log("=== TABLE RECORD COUNTS ===");
  console.log(JSON.stringify(counts, null, 2));

  // Also check store memberships
  const memberships = await prisma.storeMembership.findMany({
    include: {
      user: { select: { email: true, username: true, role: true } },
      store: { select: { shopDomain: true, voopStoreId: true } }
    }
  });
  console.log("=== MEMBERSHIPS ===");
  console.log(JSON.stringify(memberships, null, 2));
}

main().catch(console.error).finally(() => prisma.$disconnect());
