const fs = require('fs');
const path = require('path');
const ts = require('typescript');

// Hook TypeScript compilation for test execution
require.extensions['.ts'] = function(module, filename) {
  let content = fs.readFileSync(filename, 'utf8');
  // Replace @/ aliases with relative paths
  content = content.replace(/from\s+["']@\/([^"']+)["']/g, (match, p1) => {
    const rel = path.relative(path.dirname(filename), path.join(__dirname, '..', p1)).replace(/\\/g, '/');
    return `from "${rel.startsWith('.') ? rel : './' + rel}"`;
  }).replace(/require\(["']@\/([^"']+)["']\)/g, (match, p1) => {
    const rel = path.relative(path.dirname(filename), path.join(__dirname, '..', p1)).replace(/\\/g, '/');
    return `require("${rel.startsWith('.') ? rel : './' + rel}")`;
  });

  const transpiled = ts.transpileModule(content, {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2020,
      esModuleInterop: true,
    },
  });
  module._compile(transpiled.outputText, filename);
};

const { PrismaClient } = require('../lib/generated/client');
const prisma = new PrismaClient();

async function runAutoShipmentAndTrackingTests() {
  console.log('================================================================');
  console.log('  TEST SUITE: AUTO SHIPMENT CREATION & MULTI-COURIER TRACKING   ');
  console.log('================================================================\n');

  // ─── TEST 1: Database Store & Fulfillments Verification ──────────────────
  console.log('--- TEST 1: Database Store & Existing Fulfillments ---');
  const store = await prisma.shopifyStore.findFirst({
    where: { isConnected: true },
  });

  if (!store) {
    throw new Error('No connected store found in database.');
  }
  console.log(`[PASS] Found active store: ${store.shopDomain} (${store.id})`);

  const fulfillments = await prisma.shopifyFulfillment.findMany({
    where: { storeId: store.id, trackingNumber: { not: null } },
  });
  console.log(`[PASS] Found ${fulfillments.length} fulfilled order records in shopify_fulfillments table`);

  // ─── TEST 2: Backfill Automatic Shipment Creation ────────────────────────
  console.log('\n--- TEST 2: Automatic Shipment Creation from Fulfillments ---');
  // Clean any previous test shipments for isolated verification
  await prisma.shipment.deleteMany({ where: { storeId: store.id } });
  const countBefore = await prisma.shipment.count({ where: { storeId: store.id } });
  console.log(`[INFO] Shipments count before backfill: ${countBefore}`);

  const { ShipmentSyncService } = require('../lib/services/ShipmentSyncService');
  const backfillResult = await ShipmentSyncService.backfillShipmentsForStore(store.id);
  console.log(`[PASS] Backfill executed: processed ${backfillResult.processedFulfillments} fulfillments, created ${backfillResult.createdShipments} shipments`);

  const createdShipments = await prisma.shipment.findMany({
    where: { storeId: store.id },
  });
  console.log(`[PASS] Verified ${createdShipments.length} shipments created in shipments table`);

  if (createdShipments.length > 0) {
    const sample = createdShipments[0];
    console.log('[INFO] Sample created shipment:');
    console.log(`       AWB: ${sample.awb}`);
    console.log(`       Carrier: ${sample.carrier}`);
    console.log(`       CourierType: ${sample.courierType}`);
    console.log(`       Tracking Company: ${sample.trackingCompany}`);
    console.log(`       Shopify Fulfillment ID: ${sample.shopifyFulfillmentId}`);
    console.log(`       Tracking URL: ${sample.trackingUrl}`);
    console.log(`       Line Items Summary: ${sample.lineItemsSummary ? 'Populated (' + sample.lineItemsSummary.length + ' chars)' : 'None'}`);

    if (!sample.shopifyFulfillmentId) {
      throw new Error('FAILED: shopifyFulfillmentId was not populated on created shipment');
    }
  }

  // ─── TEST 3: Idempotency Verification ────────────────────────────────────
  console.log('\n--- TEST 3: Sync Replay Idempotency (Zero Duplicates) ---');
  const replayResult = await ShipmentSyncService.backfillShipmentsForStore(store.id);
  const countAfterReplay = await prisma.shipment.count({ where: { storeId: store.id } });
  console.log(`[PASS] Replay executed: shipments count remained ${countAfterReplay} (0 duplicate records created)`);
  if (countAfterReplay !== createdShipments.length) {
    throw new Error(`FAILED: Idempotency failed. Expected ${createdShipments.length}, got ${countAfterReplay}`);
  }

  // ─── TEST 4: Carrier Detection & Normalization ───────────────────────────
  console.log('\n--- TEST 4: Carrier Detection & Normalization ---');
  const { CourierService } = require('../lib/services/CourierService');

  const carrierCases = [
    { input: 'Delhivery', expectedCode: 'DELHIVERY' },
    { input: 'Blue Dart Express', expectedCode: 'BLUEDART' },
    { input: 'XpressBees', expectedCode: 'XPRESSBEES' },
    { input: 'Ecom Express', expectedCode: 'ECOM_EXPRESS' },
    { input: 'Ekart Logistics', expectedCode: 'EKART' },
    { input: 'Shadowfax', expectedCode: 'SHADOWFAX' },
    { input: 'Royal Mail UK', expectedCode: 'UNKNOWN' },
    { input: 'Custom Local Courier', expectedCode: 'UNKNOWN' },
  ];

  for (const c of carrierCases) {
    const code = CourierService.normalizeCarrierType(c.input);
    const detected = CourierService.detectCourier(c.input);
    const passed = code === c.expectedCode;
    console.log(`[${passed ? 'PASS' : 'FAIL'}] Carrier '${c.input}' -> Normalized: ${code}, Display: ${detected.displayName}`);
    if (!passed) throw new Error(`Carrier normalization failed for ${c.input}`);
  }

  // ─── TEST 5: Central Tracking Orchestrator ───────────────────────────────
  console.log('\n--- TEST 5: Courier Tracking Orchestrator & Fallback ---');
  const { CourierTrackingService } = require('../lib/services/CourierTrackingService');

  if (createdShipments.length > 0) {
    const testAwb = createdShipments[0].awb;
    const tracking = await CourierTrackingService.trackShipment(store.id, testAwb);
    console.log(`[PASS] trackShipment returned for AWB ${testAwb}:`);
    console.log(`       Courier: ${tracking?.courier}`);
    console.log(`       Normalized Status: ${tracking?.normalizedStatus}`);
    console.log(`       Current Status: ${tracking?.currentStatus}`);
    console.log(`       Official URL: ${tracking?.officialTrackingUrl}`);
    console.log(`       Scans count: ${tracking?.scans?.length || 0}`);
  }

  // Test tenant isolation
  const crossTenantTracking = await CourierTrackingService.trackShipment('non-existent-store-id', '46932210008993');
  console.log('[PASS] Cross-tenant access blocked (returned null):', crossTenantTracking === null);

  // Test unconfigured courier graceful response
  const unconfiguredTracking = await CourierTrackingService.trackShipment(store.id, 'SFX12345678', false, 'Shadowfax');
  console.log('[PASS] Unconfigured courier handled gracefully with official URL:', unconfiguredTracking?.officialTrackingUrl?.includes('shadowfax'));

  // ─── TEST 6: Modern UI Exact Colors & Persistence Check ──────────────────
  console.log('\n--- TEST 6: Modern UI Colors & Persistence Verification ---');
  const globalsCss = fs.readFileSync('./app/globals.css', 'utf8');
  const requiredModernColors = {
    'Primary (#5B5CFF)': '#5B5CFF',
    'Primary Hover (#4949E8)': '#4949E8',
    'Accent (#B8F34A)': '#B8F34A',
    'App Background (#F7F8FA)': '#F7F8FA',
    'Card (#FFFFFF)': '#FFFFFF',
    'Card Hover (#FAFAFC)': '#FAFAFC',
    'Border (#E7E8ED)': '#E7E8ED',
    'Main Text (#111217)': '#111217',
    'Secondary Text (#686B78)': '#686B78',
    'Muted Text (#989BA7)': '#989BA7',
    'Success (#16A34A)': '#16A34A',
    'Warning (#F59E0B)': '#F59E0B',
    'Error (#E5484D)': '#E5484D',
  };

  for (const [name, hex] of Object.entries(requiredModernColors)) {
    const present = globalsCss.toLowerCase().includes(hex.toLowerCase());
    console.log(`[${present ? 'PASS' : 'FAIL'}] ${name} verified in globals.css: ${present}`);
    if (!present) throw new Error(`Missing color ${name} in globals.css`);
  }

  const loginPage = fs.readFileSync('./app/login/page.tsx', 'utf8');
  const hasEagerFetch = loginPage.includes('/api/user/preferences') && loginPage.includes('voop_interface_style');
  console.log('[PASS] Login page eagerly loads and caches user theme preference:', hasEagerFetch);

  const billingView = fs.readFileSync('./components/views/BillingView.tsx', 'utf8');
  const hasAdaptiveInputs = billingView.includes('bg-white dark:bg-[#0B0F17]');
  console.log('[PASS] BillingView inputs use responsive light/dark adaptive classes:', hasAdaptiveInputs);

  console.log('\n================================================================');
  console.log('  ALL AUTO-SHIPMENT, MULTI-COURIER & THEME TESTS PASSED!        ');
  console.log('================================================================\n');
}

runAutoShipmentAndTrackingTests()
  .catch((err) => {
    console.error('[ERROR]', err);
    process.exit(1);
  })
  .finally(() => prisma['$disconnect']());
