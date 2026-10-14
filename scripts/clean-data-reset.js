const path = require('path');
let PrismaClient;
try {
  PrismaClient = require(path.join(__dirname, '../lib/generated/client')).PrismaClient;
} catch (_e) {
  PrismaClient = require('@prisma/client').PrismaClient;
}

const prisma = new PrismaClient({
  datasources: {
    db: {
      url: process.env.DATABASE_URL
    }
  }
});

const MODELS = [
  // 1. Sync & logs
  { name: 'SyncLog', accessor: 'syncLog' },
  { name: 'SyncJob', accessor: 'syncJob' },
  { name: 'ShopifyWebhookEvent', accessor: 'shopifyWebhookEvent' },

  // 2. Couriers & shipments
  { name: 'ShipmentScan', accessor: 'shipmentScan' },
  { name: 'Shipment', accessor: 'shipment' },
  { name: 'DelhiveryConfig', accessor: 'delhiveryConfig' },
  { name: 'CourierIntegration', accessor: 'courierIntegration' },

  // 3. Meta & marketing
  { name: 'MetaPixelEvent', accessor: 'metaPixelEvent' },
  { name: 'MetaPixel', accessor: 'metaPixel' },
  { name: 'MetaDailyMetric', accessor: 'metaDailyMetric' },
  { name: 'MetaAd', accessor: 'metaAd' },
  { name: 'MetaAdSet', accessor: 'metaAdSet' },
  { name: 'MetaCampaign', accessor: 'metaCampaign' },
  { name: 'MetaAccount', accessor: 'metaAccount' },
  { name: 'AdDailyMetric', accessor: 'adDailyMetric' },
  { name: 'AdPlatformAccount', accessor: 'adPlatformAccount' },

  // 4. Settings & offline orders
  { name: 'ProductTaxConfig', accessor: 'productTaxConfig' },
  { name: 'ExpenseSetting', accessor: 'expenseSetting' },
  { name: 'CollabSetting', accessor: 'collabSetting' },
  { name: 'Collaboration', accessor: 'collaboration' },
  { name: 'StoreSetting', accessor: 'storeSetting' },
  { name: 'OfflineOrderItem', accessor: 'offlineOrderItem' },
  { name: 'OfflineOrder', accessor: 'offlineOrder' },

  // 5. Inventory & purchasing
  { name: 'InventoryLedger', accessor: 'inventoryLedger' },
  { name: 'PurchaseBillItem', accessor: 'purchaseBillItem' },
  { name: 'PurchaseBill', accessor: 'purchaseBill' },
  { name: 'ComboComponent', accessor: 'comboComponent' },
  { name: 'StockItem', accessor: 'stockItem' },

  // 6. Orders & fulfillment
  { name: 'ShopifyFulfillment', accessor: 'shopifyFulfillment' },
  { name: 'ShopifyOrderItem', accessor: 'shopifyOrderItem' },
  { name: 'ShopifyOrder', accessor: 'shopifyOrder' },

  // 7. Products & variants
  { name: 'ShopifyVariant', accessor: 'shopifyVariant' },
  { name: 'ShopifyProduct', accessor: 'shopifyProduct' },

  // 8. Auth & core
  { name: 'AppSubscription', accessor: 'appSubscription' },
  { name: 'VoopApiKey', accessor: 'voopApiKey' },
  { name: 'StoreMembership', accessor: 'storeMembership' },
  { name: 'UserPreference', accessor: 'userPreference' },
  { name: 'User', accessor: 'user' },
  { name: 'ShopifyStore', accessor: 'shopifyStore' },
];

async function runCleanDataReset() {
  console.log('\n======================================================');
  console.log('   VOOP PRODUCTION-SAFE COMPLETE CLEAN DATA RESET     ');
  console.log('======================================================\n');
  console.log('Target Database URL:', process.env.DATABASE_URL ? process.env.DATABASE_URL.replace(/:[^:@]+@/, ':***@') : 'NOT SET');

  // Step 1: Pre-reset counts
  console.log('\n--- 1. PRE-RESET RECORD COUNTS ---');
  const beforeCounts = {};
  for (const m of MODELS) {
    if (prisma[m.accessor]) {
      const count = await prisma[m.accessor].count();
      beforeCounts[m.name] = count;
      if (count > 0) {
        console.log(`  [BEFORE] ${m.name.padEnd(25)}: ${count}`);
      }
    }
  }

  // Step 2: Delete records in strict foreign key order
  console.log('\n--- 2. PURGING ALL RECORDS IN DEPENDENCY ORDER ---');
  for (const m of MODELS) {
    if (prisma[m.accessor]) {
      try {
        const deleted = await prisma[m.accessor].deleteMany({});
        console.log(`  ✓ Cleared ${m.name.padEnd(25)} (deleted: ${deleted.count})`);
      } catch (err) {
        console.error(`  ✗ Error clearing ${m.name}:`, err.message);
        throw err;
      }
    } else {
      console.warn(`  ⚠ Warning: prisma.${m.accessor} not found`);
    }
  }

  // Step 3: Post-reset verification
  console.log('\n--- 3. POST-RESET VERIFICATION (Target: 0 for all models) ---');
  let hasResidualData = false;
  const afterCounts = {};
  for (const m of MODELS) {
    if (prisma[m.accessor]) {
      const count = await prisma[m.accessor].count();
      afterCounts[m.name] = count;
      if (count !== 0) {
        console.error(`  ✗ RESIDUAL DATA DETECTED in ${m.name}: count = ${count}`);
        hasResidualData = true;
      }
    }
  }

  if (hasResidualData) {
    console.error('\n❌ RESET FAILED: Some tables still contain records!');
    process.exit(1);
  }

  console.log('\n======================================================');
  console.log('   ✓ ALL 39 MODELS SUCCESSFULLY PURGED TO 0 RECORDS   ');
  console.log('   ✓ DATABASE TABLES, SCHEMAS & CONSTRAINTS PRESERVED ');
  console.log('======================================================\n');

  console.log('Summary of Purged Data:');
  console.table(
    MODELS.map(m => ({
      Model: m.name,
      'Before Count': beforeCounts[m.name] || 0,
      'After Count': afterCounts[m.name] || 0,
      Status: afterCounts[m.name] === 0 ? 'CLEAN (0)' : 'FAILED'
    }))
  );
}

runCleanDataReset()
  .catch(err => {
    console.error('Fatal error during clean data reset:', err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
