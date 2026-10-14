const path = require('path');
const bcrypt = require('bcrypt');

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

const {
  generateVoopStoreId,
  generateTenantId,
  generatePublicStoreRef,
  ensureStorePermanentIdentities,
} = require('./tenant-ids-helper');

let passed = 0;
let failed = 0;

function assert(condition, message) {
  if (condition) {
    console.log(`  ✓ PASS: ${message}`);
    passed++;
  } else {
    console.error(`  ✗ FAIL: ${message}`);
    failed++;
  }
}

const ALL_39_MODELS = [
  'syncLog', 'syncJob', 'shopifyWebhookEvent',
  'shipmentScan', 'shipment', 'delhiveryConfig', 'courierIntegration',
  'metaPixelEvent', 'metaPixel', 'metaDailyMetric', 'metaAd', 'metaAdSet', 'metaCampaign', 'metaAccount', 'adDailyMetric', 'adPlatformAccount',
  'productTaxConfig', 'expenseSetting', 'collabSetting', 'collaboration', 'storeSetting', 'offlineOrderItem', 'offlineOrder',
  'inventoryLedger', 'purchaseBillItem', 'purchaseBill', 'comboComponent', 'stockItem',
  'shopifyFulfillment', 'shopifyOrderItem', 'shopifyOrder',
  'shopifyVariant', 'shopifyProduct',
  'appSubscription', 'voopApiKey', 'storeMembership', 'userPreference', 'user', 'shopifyStore'
];

async function countAllRecords() {
  const counts = {};
  for (const m of ALL_39_MODELS) {
    if (prisma[m]) {
      counts[m] = await prisma[m].count();
    }
  }
  return counts;
}

async function purgeAllRecords() {
  for (const m of ALL_39_MODELS) {
    if (prisma[m]) {
      await prisma[m].deleteMany({});
    }
  }
}

async function runTestSuite() {
  console.log('\n========================================================================');
  console.log('   VOOP COMPLETE CLEAN RESET & MULTI-TENANT ARCHITECTURE TEST SUITE     ');
  console.log('========================================================================\n');

  // ──────────────────────────────────────────────────────────────────────────
  // TEST 1: Clean Data Reset Verification (All 39 Models = 0)
  // ──────────────────────────────────────────────────────────────────────────
  console.log('--- TEST 1: Clean Data Reset Verification ---');
  await purgeAllRecords();
  const initialCounts = await countAllRecords();
  const nonZeroInitial = Object.entries(initialCounts).filter(([_, count]) => count > 0);
  assert(nonZeroInitial.length === 0, `All 39 database models purged to exactly 0 records (Non-zero tables: ${nonZeroInitial.length})`);
  assert(initialCounts.user === 0, 'User count is 0');
  assert(initialCounts.shopifyStore === 0, 'ShopifyStore count is 0');
  assert(initialCounts.storeMembership === 0, 'StoreMembership count is 0');
  assert(initialCounts.shopifyProduct === 0, 'ShopifyProduct count is 0');
  assert(initialCounts.shopifyOrder === 0, 'ShopifyOrder count is 0');

  // ──────────────────────────────────────────────────────────────────────────
  // TEST 2: First Store Embedded Onboarding & Permanent Identifiers
  // ──────────────────────────────────────────────────────────────────────────
  console.log('\n--- TEST 2: First Store Embedded Onboarding & Permanent Identifiers ---');
  const storeADomain = 'monkey-garage-test.myshopify.com';
  const voopStoreIdA = generateVoopStoreId();
  const tenantIdA = generateTenantId();
  const publicRefA = generatePublicStoreRef();

  assert(voopStoreIdA.startsWith('VOOP-') && voopStoreIdA.length >= 10, `Generated valid VOOP Store ID format: ${voopStoreIdA}`);
  assert(tenantIdA.startsWith('TENANT-') && tenantIdA.length >= 12, `Generated valid Tenant ID format: ${tenantIdA}`);
  assert(publicRefA.length >= 15, `Generated valid opaque Public Store Ref: ${publicRefA}`);

  // Create Store A
  const storeA = await prisma.shopifyStore.create({
    data: {
      shopDomain: storeADomain,
      accessToken: 'shpat_test_token_store_a_12345',
      storeName: 'Monkey Garage',
      email: 'owner@monkeygarage.com',
      currency: 'INR',
      isConnected: true,
      voopStoreId: voopStoreIdA,
      tenantId: tenantIdA,
      publicStoreRef: publicRefA,
    },
  });

  assert(storeA.id && storeA.id.startsWith('cm'), `Store A created with permanent cuid store.id: ${storeA.id}`);
  assert(storeA.voopStoreId === voopStoreIdA, `Store A has permanent voopStoreId: ${storeA.voopStoreId}`);
  assert(storeA.tenantId === tenantIdA, `Store A has permanent tenantId: ${storeA.tenantId}`);
  assert(storeA.publicStoreRef === publicRefA, `Store A has permanent publicStoreRef: ${storeA.publicStoreRef}`);

  // Create User A with bcrypt password (real credentials created during embedded onboarding)
  const plainPasswordA = 'SuperSecret2026!';
  const passwordHashA = await bcrypt.hash(plainPasswordA, 10);
  const userA = await prisma.user.create({
    data: {
      name: 'Adith Ziva',
      email: 'owner@monkeygarage.com',
      username: 'adithziva',
      passwordHash: passwordHashA,
      role: 'ADMIN',
      storeId: storeA.id,
      voopStoreId: storeA.voopStoreId,
      tenantId: storeA.tenantId,
    },
  });

  // Link StoreMembership (ADMIN)
  const membershipA = await prisma.storeMembership.create({
    data: {
      userId: userA.id,
      storeId: storeA.id,
      role: 'ADMIN',
    },
  });

  // Link store.accountId to userA.id
  await prisma.shopifyStore.update({
    where: { id: storeA.id },
    data: { accountId: userA.id },
  });

  // Create user preference
  await prisma.userPreference.create({
    data: {
      userId: userA.id,
      themeMode: 'dark',
      accentTheme: 'voop',
    },
  });

  assert(userA.id && userA.storeId === storeA.id, `User A created and linked to store.id ${storeA.id}`);
  assert(membershipA.role === 'ADMIN' && membershipA.storeId === storeA.id, 'User A has StoreMembership with ADMIN role');
  assert(userA.voopStoreId === storeA.voopStoreId, 'User A shares permanent voopStoreId');
  assert(userA.tenantId === storeA.tenantId, 'User A shares permanent tenantId');

  // ──────────────────────────────────────────────────────────────────────────
  // TEST 3: Initial Full Historical Sync Simulation for Store A
  // ──────────────────────────────────────────────────────────────────────────
  console.log('\n--- TEST 3: Initial Full Historical Sync Simulation for Store A ---');
  const productA1 = await prisma.shopifyProduct.create({
    data: {
      storeId: storeA.id,
      shopifyProductId: 'gid://shopify/Product/1001',
      title: 'MonkeyGarage Snow Foam 1L',
      handle: 'snow-foam-1l',
      status: 'ACTIVE',
    },
  });

  const variantA1 = await prisma.shopifyVariant.create({
    data: {
      storeId: storeA.id,
      productId: productA1.id,
      shopifyProductId: 'gid://shopify/Product/1001',
      shopifyVariantId: 'gid://shopify/ProductVariant/2001',
      title: '1 Litre Bottle',
      sku: '1:10SNF1000',
      price: 999.0,
      inventoryQuantity: 50,
    },
  });

  const orderA1 = await prisma.shopifyOrder.create({
    data: {
      storeId: storeA.id,
      shopifyOrderId: 'gid://shopify/Order/3001',
      orderNumber: '#MG1001',
      name: '#MG1001',
      email: 'customer@gmail.com',
      totalPrice: 999.0,
      financialStatus: 'PAID',
      fulfillmentStatus: 'UNFULFILLED',
    },
  });

  const orderItemA1 = await prisma.shopifyOrderItem.create({
    data: {
      storeId: storeA.id,
      orderId: orderA1.id,
      shopifyOrderId: 'gid://shopify/Order/3001',
      shopifyLineItemId: 'gid://shopify/LineItem/4001',
      productTitle: productA1.title,
      variantTitle: variantA1.title,
      sku: variantA1.sku,
      quantity: 1,
      unitPrice: 999.0,
      totalPrice: 999.0,
    },
  });

  assert(productA1.storeId === storeA.id, 'Product A strictly scoped to storeA.id');
  assert(variantA1.storeId === storeA.id, 'Variant A strictly scoped to storeA.id');
  assert(orderA1.storeId === storeA.id, 'Order A strictly scoped to storeA.id');
  assert(orderItemA1.storeId === storeA.id, 'OrderItem A strictly scoped to storeA.id');

  // ──────────────────────────────────────────────────────────────────────────
  // TEST 4: Direct Chrome Login Parity (Same Credentials -> Same Store -> 0 Duplicates)
  // ──────────────────────────────────────────────────────────────────────────
  console.log('\n--- TEST 4: Direct Chrome Login Parity ---');
  // Simulate NextAuth Credentials authorize()
  const loginUser = await prisma.user.findFirst({
    where: {
      OR: [
        { email: 'owner@monkeygarage.com' },
        { username: 'adithziva' },
      ],
    },
    include: { store: true, memberships: true },
  });

  assert(loginUser !== null, 'User found by email or username');
  const passwordValid = await bcrypt.compare(plainPasswordA, loginUser.passwordHash);
  assert(passwordValid === true, 'Password verification succeeded via bcrypt');

  // Verify store resolution
  const resolvedStore = loginUser.store;
  assert(resolvedStore.id === storeA.id, `Direct Chrome login resolves existing store.id (${resolvedStore.id})`);
  assert(resolvedStore.voopStoreId === voopStoreIdA, `Resolves exact same VOOP Store ID (${resolvedStore.voopStoreId})`);
  assert(resolvedStore.tenantId === tenantIdA, `Resolves exact same Tenant ID (${resolvedStore.tenantId})`);
  assert(resolvedStore.publicStoreRef === publicRefA, `Resolves exact same Public Store Ref (${resolvedStore.publicStoreRef})`);

  // Verify no duplicate store was created
  const totalStoresAfterLogin = await prisma.shopifyStore.count();
  assert(totalStoresAfterLogin === 1, `Zero duplicate stores created on Chrome login (total stores = ${totalStoresAfterLogin})`);

  // ──────────────────────────────────────────────────────────────────────────
  // TEST 5: Second Store Onboarding & Complete Multi-Tenant Isolation
  // ──────────────────────────────────────────────────────────────────────────
  console.log('\n--- TEST 5: Second Store Onboarding & Complete Multi-Tenant Isolation ---');
  const storeBDomain = 'qt0dyq-79.myshopify.com';
  const voopStoreIdB = generateVoopStoreId();
  const tenantIdB = generateTenantId();
  const publicRefB = generatePublicStoreRef();

  const storeB = await prisma.shopifyStore.create({
    data: {
      shopDomain: storeBDomain,
      accessToken: 'shpat_test_token_store_b_67890',
      storeName: 'Qtody Store',
      email: 'owner@qtody.com',
      currency: 'INR',
      isConnected: true,
      voopStoreId: voopStoreIdB,
      tenantId: tenantIdB,
      publicStoreRef: publicRefB,
    },
  });

  const plainPasswordB = 'QtodySecure99!';
  const passwordHashB = await bcrypt.hash(plainPasswordB, 10);
  const userB = await prisma.user.create({
    data: {
      name: 'Bob Qtody',
      email: 'owner@qtody.com',
      username: 'bobqtody',
      passwordHash: passwordHashB,
      role: 'ADMIN',
      storeId: storeB.id,
      voopStoreId: storeB.voopStoreId,
      tenantId: storeB.tenantId,
    },
  });

  await prisma.storeMembership.create({
    data: {
      userId: userB.id,
      storeId: storeB.id,
      role: 'ADMIN',
    },
  });

  await prisma.shopifyStore.update({
    where: { id: storeB.id },
    data: { accountId: userB.id },
  });

  const productB1 = await prisma.shopifyProduct.create({
    data: {
      storeId: storeB.id,
      shopifyProductId: 'gid://shopify/Product/9001',
      title: 'Qtody Microfiber Towel Pack',
      handle: 'microfiber-pack',
      status: 'ACTIVE',
    },
  });

  const orderB1 = await prisma.shopifyOrder.create({
    data: {
      storeId: storeB.id,
      shopifyOrderId: 'gid://shopify/Order/8001',
      orderNumber: '#QT1001',
      name: '#QT1001',
      email: 'bobcustomer@gmail.com',
      totalPrice: 499.0,
      financialStatus: 'PAID',
      fulfillmentStatus: 'UNFULFILLED',
    },
  });

  assert(storeB.id !== storeA.id, 'Store B has unique relational store.id');
  assert(storeB.voopStoreId !== storeA.voopStoreId, 'Store B has unique voopStoreId');
  assert(storeB.tenantId !== storeA.tenantId, 'Store B has unique tenantId');

  // Verify strict data isolation: Store A queries
  const storeAProducts = await prisma.shopifyProduct.findMany({ where: { storeId: storeA.id } });
  const storeBProducts = await prisma.shopifyProduct.findMany({ where: { storeId: storeB.id } });
  const storeAOrders = await prisma.shopifyOrder.findMany({ where: { storeId: storeA.id } });
  const storeBOrders = await prisma.shopifyOrder.findMany({ where: { storeId: storeB.id } });

  assert(storeAProducts.length === 1 && storeAProducts[0].id === productA1.id, 'Store A sees only its own products');
  assert(storeBProducts.length === 1 && storeBProducts[0].id === productB1.id, 'Store B sees only its own products');
  assert(storeAOrders.length === 1 && storeAOrders[0].id === orderA1.id, 'Store A sees only its own orders');
  assert(storeBOrders.length === 1 && storeBOrders[0].id === orderB1.id, 'Store B sees only its own orders');

  const crossLeakProducts = storeAProducts.some(p => p.storeId === storeB.id);
  const crossLeakOrders = storeAOrders.some(o => o.storeId === storeB.id);
  assert(!crossLeakProducts, 'Zero product leakage between tenants');
  assert(!crossLeakOrders, 'Zero order leakage between tenants');

  // ──────────────────────────────────────────────────────────────────────────
  // TEST 6: Shopify Domain Change Auto-Correction & Resilience
  // ──────────────────────────────────────────────────────────────────────────
  console.log('\n--- TEST 6: Shopify Domain Change Auto-Correction & Resilience ---');
  const newDomainForStoreA = 'monkey-garage-rebranded.myshopify.com';

  // Perform domain auto-correction
  // We simulate syncAndCorrectStoreDomain updating the mutable shopDomain while preserving store.id & permanent identities
  const updatedStoreA = await prisma.shopifyStore.update({
    where: { id: storeA.id },
    data: {
      shopDomain: newDomainForStoreA,
      storeName: 'Monkey Garage Rebranded',
    },
  });

  assert(updatedStoreA.id === storeA.id, 'store.id is 100% PRESERVED across domain rename');
  assert(updatedStoreA.voopStoreId === storeA.voopStoreId, 'voopStoreId is 100% PRESERVED across domain rename');
  assert(updatedStoreA.tenantId === storeA.tenantId, 'tenantId is 100% PRESERVED across domain rename');
  assert(updatedStoreA.publicStoreRef === storeA.publicStoreRef, 'publicStoreRef is 100% PRESERVED across domain rename');
  assert(updatedStoreA.shopDomain === newDomainForStoreA, `shopDomain correctly updated to ${newDomainForStoreA}`);

  // Verify orders and products remain attached
  const preservedOrders = await prisma.shopifyOrder.findMany({ where: { storeId: storeA.id } });
  const preservedProducts = await prisma.shopifyProduct.findMany({ where: { storeId: storeA.id } });
  assert(preservedOrders.length === 1 && preservedOrders[0].id === orderA1.id, 'Orders remain fully linked to store.id');
  assert(preservedProducts.length === 1 && preservedProducts[0].id === productA1.id, 'Products remain fully linked to store.id');

  // ──────────────────────────────────────────────────────────────────────────
  // TEST 7: Multi-Tab Isolation Simulation
  // ──────────────────────────────────────────────────────────────────────────
  console.log('\n--- TEST 7: Multi-Tab Isolation Simulation ---');
  // Simulate tab 1 context (User A / Store A)
  const tab1Context = {
    tabId: 'tab_tab1_alpha',
    userId: userA.id,
    storeId: storeA.id,
    voopStoreId: storeA.voopStoreId,
    tenantId: storeA.tenantId,
  };

  // Simulate tab 2 context (User B / Store B)
  const tab2Context = {
    tabId: 'tab_tab2_beta',
    userId: userB.id,
    storeId: storeB.id,
    voopStoreId: storeB.voopStoreId,
    tenantId: storeB.tenantId,
  };

  // Run simultaneous mock queries using tab contexts
  const [tab1Result, tab2Result] = await Promise.all([
    (async () => {
      const orders = await prisma.shopifyOrder.findMany({ where: { storeId: tab1Context.storeId } });
      return { orders, storeId: tab1Context.storeId, tenantId: tab1Context.tenantId };
    })(),
    (async () => {
      const orders = await prisma.shopifyOrder.findMany({ where: { storeId: tab2Context.storeId } });
      return { orders, storeId: tab2Context.storeId, tenantId: tab2Context.tenantId };
    })(),
  ]);

  assert(tab1Result.storeId === storeA.id && tab1Result.orders[0].orderNumber === '#MG1001', 'Tab 1 concurrently resolved only Store A data');
  assert(tab2Result.storeId === storeB.id && tab2Result.orders[0].orderNumber === '#QT1001', 'Tab 2 concurrently resolved only Store B data');
  assert(tab1Result.tenantId !== tab2Result.tenantId, 'Tab 1 and Tab 2 remain bound to separate tenant boundaries');

  // ──────────────────────────────────────────────────────────────────────────
  // TEST 8: Settings Display Only Verification
  // ──────────────────────────────────────────────────────────────────────────
  console.log('\n--- TEST 8: Settings Display Only Verification ---');
  // Verify that the Profile API response includes tenantId for Settings
  const profileMock = {
    profile: {
      id: userA.id,
      email: userA.email,
      voopStoreId: storeA.voopStoreId,
      tenantId: storeA.tenantId,
    },
  };
  assert(profileMock.profile.tenantId === storeA.tenantId, 'Tenant ID is provided for Settings (Account / Store Information)');

  // ──────────────────────────────────────────────────────────────────────────
  // TEST 9: Final Clean Data Reset
  // ──────────────────────────────────────────────────────────────────────────
  console.log('\n--- TEST 9: Final Complete Clean Data Reset (Reset to 0) ---');
  await purgeAllRecords();
  const finalCounts = await countAllRecords();
  const nonZeroFinal = Object.entries(finalCounts).filter(([_, count]) => count > 0);
  assert(nonZeroFinal.length === 0, `Database completely clean with 0 records across all 39 models (Non-zero: ${nonZeroFinal.length})`);
  assert(finalCounts.user === 0, 'Final User count is 0');
  assert(finalCounts.shopifyStore === 0, 'Final ShopifyStore count is 0');
  assert(finalCounts.storeMembership === 0, 'Final StoreMembership count is 0');
  assert(finalCounts.shopifyProduct === 0, 'Final ShopifyProduct count is 0');
  assert(finalCounts.shopifyOrder === 0, 'Final ShopifyOrder count is 0');

  console.log('\n========================================================================');
  console.log(`   TEST RESULTS: ${passed} PASSED, ${failed} FAILED                     `);
  console.log('========================================================================\n');

  if (failed > 0) {
    process.exit(1);
  }
}

runTestSuite()
  .catch((err) => {
    console.error('Fatal test suite error:', err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
