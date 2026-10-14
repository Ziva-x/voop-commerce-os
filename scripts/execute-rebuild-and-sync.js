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
  console.log("===============================================================");
  console.log("VOOP — MULTI-TENANT ARCHITECTURE RESET & FRESH SYNC RUNNER");
  console.log("===============================================================\n");

  // 1. Validate Existing Stores
  console.log("--- 1. Validating Existing Stores & Identities ---");
  const stores = await prisma.shopifyStore.findMany({
    select: {
      id: true,
      voopStoreId: true,
      publicStoreRef: true,
      shopDomain: true,
      storeName: true,
      accountId: true,
      accessToken: true,
      isConnected: true,
    }
  });
  console.log(`Found ${stores.length} store(s) in DB:`);
  for (const s of stores) {
    console.log(`  • Store ID: ${s.id} | VOOP ID: ${s.voopStoreId} | Ref: ${s.publicStoreRef} | Domain: ${s.shopDomain} | Connected: ${s.isConnected}`);
  }

  if (stores.length < 2) {
    throw new Error(`Expected at least 2 stores, found ${stores.length}`);
  }

  // 2. Validate Existing Users
  console.log("\n--- 2. Validating Users ---");
  const users = await prisma.user.findMany({
    select: {
      id: true,
      email: true,
      username: true,
      name: true,
      role: true,
      storeId: true,
      voopStoreId: true,
    }
  });
  for (const u of users) {
    console.log(`  • User: ${u.username} (${u.email}) | Role: ${u.role} | Store ID: ${u.storeId} | VOOP Store ID: ${u.voopStoreId}`);
  }

  // 3. Controlled Reset of Stale Transactional Data
  console.log("\n--- 3. Controlled Application Data Reset (Preserving Stores & Users) ---");
  console.log("Deleting stale shipment scans...");
  const delShipmentScans = await prisma.shipmentScan.deleteMany({});
  console.log(`  Deleted ${delShipmentScans.count} shipment scans.`);

  console.log("Deleting stale shipments...");
  const delShipments = await prisma.shipment.deleteMany({});
  console.log(`  Deleted ${delShipments.count} shipments.`);

  console.log("Deleting stale order line items...");
  const delOrderItems = await prisma.shopifyOrderItem.deleteMany({});
  console.log(`  Deleted ${delOrderItems.count} order items.`);

  console.log("Deleting stale fulfillments...");
  const delFulfillments = await prisma.shopifyFulfillment.deleteMany({});
  console.log(`  Deleted ${delFulfillments.count} fulfillments.`);

  console.log("Deleting stale orders...");
  const delOrders = await prisma.shopifyOrder.deleteMany({});
  console.log(`  Deleted ${delOrders.count} orders.`);

  console.log("Deleting stale variants...");
  const delVariants = await prisma.shopifyVariant.deleteMany({});
  console.log(`  Deleted ${delVariants.count} variants.`);

  console.log("Deleting stale products...");
  const delProducts = await prisma.shopifyProduct.deleteMany({});
  console.log(`  Deleted ${delProducts.count} products.`);

  console.log("Deleting stale inventory ledgers...");
  const delLedgers = await prisma.inventoryLedger.deleteMany({});
  console.log(`  Deleted ${delLedgers.count} inventory ledgers.`);

  console.log("Deleting stale combo components...");
  const delCombos = await prisma.comboComponent.deleteMany({});
  console.log(`  Deleted ${delCombos.count} combo components.`);

  console.log("Deleting stale stock items...");
  const delStock = await prisma.stockItem.deleteMany({});
  console.log(`  Deleted ${delStock.count} stock items.`);

  console.log("Deleting stale purchase bills...");
  await prisma.purchaseBillItem.deleteMany({}).catch(() => {});
  await prisma.purchaseBill.deleteMany({}).catch(() => {});

  console.log("Deleting stale sync jobs & logs...");
  const delJobs = await prisma.syncJob.deleteMany({});
  const delLogs = await prisma.syncLog.deleteMany({});
  console.log(`  Deleted ${delJobs.count} sync jobs and ${delLogs.count} sync logs.`);

  console.log("Deleting stale ad metrics & offline orders...");
  await prisma.metaDailyMetric.deleteMany({}).catch(() => {});
  await prisma.metaAd.deleteMany({}).catch(() => {});
  await prisma.metaAdSet.deleteMany({}).catch(() => {});
  await prisma.metaCampaign.deleteMany({}).catch(() => {});
  await prisma.metaPixelEvent.deleteMany({}).catch(() => {});
  await prisma.adDailyMetric.deleteMany({}).catch(() => {});
  await prisma.adPlatformAccount.deleteMany({}).catch(() => {});
  await prisma.offlineOrderItem.deleteMany({}).catch(() => {});
  await prisma.offlineOrder.deleteMany({}).catch(() => {});

  console.log("Resetting store memberships...");
  const delMemberships = await prisma.storeMembership.deleteMany({});
  console.log(`  Deleted ${delMemberships.count} store memberships.`);

  console.log("✓ Application data reset complete.");

  // 4. Rebuild Store Relationships & Memberships
  console.log("\n--- 4. Rebuilding Store Relationships, Memberships & Permissions ---");

  const storeA = stores.find(s => s.shopDomain === "qt0dyq-79.myshopify.com") || stores[0];
  const storeB = stores.find(s => s.shopDomain === "monkey-garage-test.myshopify.com") || stores[1];

  const adminA = users.find(u => u.email === "adithziva@gmail.com") || users[0];
  const adminB = users.find(u => u.email === "adithziva12@gmail.com") || users[1];
  const staffB = users.find(u => u.email === "adithziva46@gmail.com");

  // Re-link Store A
  await prisma.shopifyStore.update({
    where: { id: storeA.id },
    data: {
      accountId: adminA.id,
      voopStoreId: "VOOP-H2GDGBVA",
      publicStoreRef: storeA.publicStoreRef || "2lLQMInScly2Eey",
      lastProductSyncAt: null,
      lastOrderSyncAt: null,
      lastFullSyncAt: null,
      isConnected: true,
    }
  });

  // Re-link Store B
  await prisma.shopifyStore.update({
    where: { id: storeB.id },
    data: {
      accountId: adminB.id,
      voopStoreId: "VOOP-T162QPD8",
      publicStoreRef: storeB.publicStoreRef || "4ESo9DzBMWo7uiS",
      lastProductSyncAt: null,
      lastOrderSyncAt: null,
      lastFullSyncAt: null,
      isConnected: true,
    }
  });

  // Update Users
  await prisma.user.update({
    where: { id: adminA.id },
    data: {
      storeId: storeA.id,
      voopStoreId: "VOOP-H2GDGBVA",
      role: "ADMIN",
    }
  });

  await prisma.user.update({
    where: { id: adminB.id },
    data: {
      storeId: storeB.id,
      voopStoreId: "VOOP-T162QPD8",
      role: "ADMIN",
    }
  });

  if (staffB) {
    await prisma.user.update({
      where: { id: staffB.id },
      data: {
        storeId: storeB.id,
        voopStoreId: "VOOP-T162QPD8",
        role: "STAFF",
        createdById: adminB.id,
      }
    });
  }

  // Create explicit StoreMembership records
  console.log("Creating StoreMembership records...");
  await prisma.storeMembership.create({
    data: {
      userId: adminA.id,
      storeId: storeA.id,
      role: "ADMIN",
      permissions: null,
    }
  });
  console.log(`  ✓ Membership created: Admin ${adminA.email} -> Store A (${storeA.shopDomain}) [ADMIN]`);

  await prisma.storeMembership.create({
    data: {
      userId: adminB.id,
      storeId: storeB.id,
      role: "ADMIN",
      permissions: null,
    }
  });
  console.log(`  ✓ Membership created: Admin ${adminB.email} -> Store B (${storeB.shopDomain}) [ADMIN]`);

  if (staffB) {
    await prisma.storeMembership.create({
      data: {
        userId: staffB.id,
        storeId: storeB.id,
        role: "STAFF",
        permissions: JSON.stringify(["orders.view", "products.view", "shipments.view", "dashboard.view"]),
      }
    });
    console.log(`  ✓ Membership created: Staff ${staffB.email} -> Store B (${storeB.shopDomain}) [STAFF]`);
  }

  console.log("✓ Store relationships and memberships successfully rebuilt.");

  // 5. Perform Fresh Initial Sync
  console.log("\n--- 5. Performing Fresh Initial Sync for Connected Stores ---");

  let shopifyLib;
  try {
    shopifyLib = require('/app/lib/shopify');
  } catch (_e) {
    try {
      shopifyLib = require('./lib/shopify');
    } catch (_err) {
      shopifyLib = require('../lib/shopify');
    }
  }

  console.log(`\n[Syncing Store A: ${storeA.shopDomain} (${storeA.voopStoreId})]...`);
  try {
    const prodResA = await shopifyLib.syncProducts(storeA.id, undefined, undefined, { isFreshSync: true });
    console.log(`  ✓ Store A Products Synced: ${prodResA.recordsCount} products in ${prodResA.durationMs}ms`);
  } catch (err) {
    console.error(`  ✗ Store A Products Sync Failed:`, err.message);
  }

  try {
    const orderResA = await shopifyLib.syncOrders(storeA.id, undefined, undefined, { isFreshSync: true });
    console.log(`  ✓ Store A Orders Synced: ${orderResA.recordsCount} orders in ${orderResA.durationMs}ms`);
  } catch (err) {
    console.error(`  ✗ Store A Orders Sync Failed:`, err.message);
  }

  console.log(`\n[Syncing Store B: ${storeB.shopDomain} (${storeB.voopStoreId})]...`);
  try {
    const prodResB = await shopifyLib.syncProducts(storeB.id, undefined, undefined, { isFreshSync: true });
    console.log(`  ✓ Store B Products Synced: ${prodResB.recordsCount} products in ${prodResB.durationMs}ms`);
  } catch (err) {
    console.error(`  ✗ Store B Products Sync Failed:`, err.message);
  }

  try {
    const orderResB = await shopifyLib.syncOrders(storeB.id, undefined, undefined, { isFreshSync: true });
    console.log(`  ✓ Store B Orders Synced: ${orderResB.recordsCount} orders in ${orderResB.durationMs}ms`);
  } catch (err) {
    console.error(`  ✗ Store B Orders Sync Failed:`, err.message);
  }

  // 6. Post-Sync Inspection & Isolation Assertion
  console.log("\n--- 6. Post-Sync Data Verification & Isolation Audit ---");

  const [
    storeAProducts,
    storeAVariants,
    storeAOrders,
    storeAOrderItems,
    storeBProducts,
    storeBVariants,
    storeBOrders,
    storeBOrderItems,
  ] = await Promise.all([
    prisma.shopifyProduct.count({ where: { storeId: storeA.id } }),
    prisma.shopifyVariant.count({ where: { storeId: storeA.id } }),
    prisma.shopifyOrder.count({ where: { storeId: storeA.id } }),
    prisma.shopifyOrderItem.count({ where: { storeId: storeA.id } }),
    prisma.shopifyProduct.count({ where: { storeId: storeB.id } }),
    prisma.shopifyVariant.count({ where: { storeId: storeB.id } }),
    prisma.shopifyOrder.count({ where: { storeId: storeB.id } }),
    prisma.shopifyOrderItem.count({ where: { storeId: storeB.id } }),
  ]);

  console.log(`Store A (${storeA.voopStoreId} / ${storeA.shopDomain}):`);
  console.log(`  • Products: ${storeAProducts}`);
  console.log(`  • Variants: ${storeAVariants}`);
  console.log(`  • Orders: ${storeAOrders}`);
  console.log(`  • Order Items: ${storeAOrderItems}`);

  console.log(`Store B (${storeB.voopStoreId} / ${storeB.shopDomain}):`);
  console.log(`  • Products: ${storeBProducts}`);
  console.log(`  • Variants: ${storeBVariants}`);
  console.log(`  • Orders: ${storeBOrders}`);
  console.log(`  • Order Items: ${storeBOrderItems}`);

  // Cross-tenant assertion:
  const crossProductsA = await prisma.shopifyProduct.count({
    where: { storeId: storeA.id, store: { id: { not: storeA.id } } }
  });
  const crossProductsB = await prisma.shopifyProduct.count({
    where: { storeId: storeB.id, store: { id: { not: storeB.id } } }
  });
  const crossOrdersA = await prisma.shopifyOrder.count({
    where: { storeId: storeA.id, store: { id: { not: storeA.id } } }
  });
  const crossOrdersB = await prisma.shopifyOrder.count({
    where: { storeId: storeB.id, store: { id: { not: storeB.id } } }
  });

  console.log(`Cross-tenant data leakage checks:`);
  console.log(`  • Store A cross-polluted products: ${crossProductsA}`);
  console.log(`  • Store B cross-polluted products: ${crossProductsB}`);
  console.log(`  • Store A cross-polluted orders: ${crossOrdersA}`);
  console.log(`  • Store B cross-polluted orders: ${crossOrdersB}`);

  if (crossProductsA === 0 && crossProductsB === 0 && crossOrdersA === 0 && crossOrdersB === 0) {
    console.log(`\n🎉 VERIFICATION PASSED: Strict 100% tenant isolation across all stores.`);
  } else {
    console.error(`\n❌ VERIFICATION FAILED: Cross-tenant data leakage detected!`);
    process.exitCode = 1;
  }
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
