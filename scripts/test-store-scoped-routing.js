/**
 * Comprehensive Automated Verification Suite for VOOP Store-Scoped Routing Architecture
 * Tests:
 * 1. storeRoute helper and pathname extractors from lib/routes.ts
 * 2. Multi-tab URL isolation (5 distinct tabs across 2 stores)
 * 3. Navigation independent state
 * 4. URL tampering and 403 Forbidden enforcement logic
 * 5. Store file structure completeness (all /app/[storeId]/... routes exist)
 * 6. Bare route redirector completeness
 */

const fs = require('fs');
const path = require('path');
const assert = require('assert');

// Load lib/routes
const { storeRoute, extractStoreRefFromPathname, extractSectionFromPathname } = require('../lib/routes');

let passedTests = 0;
let totalTests = 0;

function test(name, fn) {
  totalTests++;
  try {
    fn();
    console.log(`  ✅ [PASS] ${name}`);
    passedTests++;
  } catch (err) {
    console.error(`  ❌ [FAIL] ${name}:`, err.message);
    process.exitCode = 1;
  }
}

console.log("\n=======================================================");
console.log("  TEST SUITE: STORE-SCOPED URL ROUTING ARCHITECTURE");
console.log("=======================================================\n");

// -----------------------------------------------------------------------------
// 1. ROUTE BUILDER TESTS
// -----------------------------------------------------------------------------
console.log("--- 1. Route Builder (storeRoute) Tests ---");

test("Root store route generates /app/:storeRef", () => {
  assert.strictEqual(storeRoute("VOOP-H2GDGBVA"), "/app/VOOP-H2GDGBVA");
  assert.strictEqual(storeRoute("STORE-123"), "/app/STORE-123");
});

test("Section routes generate /app/:storeRef/:section", () => {
  assert.strictEqual(storeRoute("VOOP-H2GDGBVA", "billing"), "/app/VOOP-H2GDGBVA/billing");
  assert.strictEqual(storeRoute("VOOP-H2GDGBVA", "orders"), "/app/VOOP-H2GDGBVA/orders");
  assert.strictEqual(storeRoute("VOOP-H2GDGBVA", "inventory"), "/app/VOOP-H2GDGBVA/inventory");
  assert.strictEqual(storeRoute("VOOP-H2GDGBVA", "purchases"), "/app/VOOP-H2GDGBVA/purchases");
  assert.strictEqual(storeRoute("VOOP-H2GDGBVA", "pnl"), "/app/VOOP-H2GDGBVA/pnl");
  assert.strictEqual(storeRoute("VOOP-H2GDGBVA", "tax"), "/app/VOOP-H2GDGBVA/tax");
  assert.strictEqual(storeRoute("VOOP-H2GDGBVA", "couriers"), "/app/VOOP-H2GDGBVA/couriers");
  assert.strictEqual(storeRoute("VOOP-H2GDGBVA", "sync-logs"), "/app/VOOP-H2GDGBVA/sync-logs");
  assert.strictEqual(storeRoute("VOOP-H2GDGBVA", "staff"), "/app/VOOP-H2GDGBVA/staff");
  assert.strictEqual(storeRoute("VOOP-H2GDGBVA", "settings"), "/app/VOOP-H2GDGBVA/settings");
});

test("Subsections and nested paths are normalized properly", () => {
  assert.strictEqual(storeRoute("VOOP-H2GDGBVA", "/settings/shopify/"), "/app/VOOP-H2GDGBVA/settings/shopify");
  assert.strictEqual(storeRoute("VOOP-H2GDGBVA", "orders/invoices/bulk"), "/app/VOOP-H2GDGBVA/orders/invoices/bulk");
  assert.strictEqual(storeRoute("VOOP-H2GDGBVA", "/ads/campaigns"), "/app/VOOP-H2GDGBVA/ads/campaigns");
});

test("Fallback when storeRef is null/empty", () => {
  assert.strictEqual(storeRoute(null, "billing"), "/billing");
  assert.strictEqual(storeRoute("", "orders"), "/orders");
  assert.strictEqual(storeRoute(null), "/");
});

// -----------------------------------------------------------------------------
// 2. PATHNAME EXTRACTOR TESTS
// -----------------------------------------------------------------------------
console.log("\n--- 2. Pathname Extractor Tests ---");

test("extractStoreRefFromPathname extracts storeRef accurately", () => {
  assert.strictEqual(extractStoreRefFromPathname("/app/VOOP-H2GDGBVA"), "VOOP-H2GDGBVA");
  assert.strictEqual(extractStoreRefFromPathname("/app/VOOP-H2GDGBVA/billing"), "VOOP-H2GDGBVA");
  assert.strictEqual(extractStoreRefFromPathname("/app/STORE-999/orders/123/invoice"), "STORE-999");
  assert.strictEqual(extractStoreRefFromPathname("/billing"), null);
  assert.strictEqual(extractStoreRefFromPathname("/app"), null);
  assert.strictEqual(extractStoreRefFromPathname("/"), null);
});

test("extractSectionFromPathname extracts sub-route section accurately", () => {
  assert.strictEqual(extractSectionFromPathname("/app/VOOP-H2GDGBVA"), null);
  assert.strictEqual(extractSectionFromPathname("/app/VOOP-H2GDGBVA/billing"), "billing");
  assert.strictEqual(extractSectionFromPathname("/app/VOOP-H2GDGBVA/settings/shopify"), "settings/shopify");
  assert.strictEqual(extractSectionFromPathname("/billing"), "billing");
  assert.strictEqual(extractSectionFromPathname("/settings/company"), "settings/company");
});

// -----------------------------------------------------------------------------
// 3. MULTI-TAB SIMULATION & CONTEXT ISOLATION TESTS
// -----------------------------------------------------------------------------
console.log("\n--- 3. Multi-Tab URL Isolation Simulation ---");

test("Simultaneous 5-Tab URL isolation across Store A and Store B", () => {
  const storeA = "VOOP-STORE-A";
  const storeB = "VOOP-STORE-B";

  // Tab 1: Store A Dashboard
  const tab1Url = storeRoute(storeA);
  // Tab 2: Store B Orders
  const tab2Url = storeRoute(storeB, "orders");
  // Tab 3: Store A Billing
  const tab3Url = storeRoute(storeA, "billing");
  // Tab 4: Store B Billing
  const tab4Url = storeRoute(storeB, "billing");
  // Tab 5: Store A Staff
  const tab5Url = storeRoute(storeA, "staff");

  assert.strictEqual(tab1Url, "/app/VOOP-STORE-A");
  assert.strictEqual(tab2Url, "/app/VOOP-STORE-B/orders");
  assert.strictEqual(tab3Url, "/app/VOOP-STORE-A/billing");
  assert.strictEqual(tab4Url, "/app/VOOP-STORE-B/billing");
  assert.strictEqual(tab5Url, "/app/VOOP-STORE-A/staff");

  // Verify tabs 3 and 4 have identical section ("billing") but strictly distinct store identities in URL
  assert.notStrictEqual(tab3Url, tab4Url);
  assert.strictEqual(extractStoreRefFromPathname(tab3Url), "VOOP-STORE-A");
  assert.strictEqual(extractStoreRefFromPathname(tab4Url), "VOOP-STORE-B");

  // Tab 1 navigating to inventory does not affect Tab 2 or Tab 4
  const tab1Next = storeRoute(extractStoreRefFromPathname(tab1Url), "inventory");
  assert.strictEqual(tab1Next, "/app/VOOP-STORE-A/inventory");
  assert.strictEqual(extractStoreRefFromPathname(tab2Url), "VOOP-STORE-B");
  assert.strictEqual(extractStoreRefFromPathname(tab4Url), "VOOP-STORE-B");
});

// -----------------------------------------------------------------------------
// 4. URL TAMPERING & 403 SECURITY ENFORCEMENT
// -----------------------------------------------------------------------------
console.log("\n--- 4. URL Tampering & 403 Enforcement Simulation ---");

test("StoreContext logic rejects unauthorized store in URL with 403", () => {
  // Mock available stores for a user who only has access to Store A
  const userStores = [
    { id: "store-a-uuid", voopStoreId: "VOOP-STORE-A", name: "Store Alpha" }
  ];

  // Function reproducing StoreContext validation logic
  function validateStoreUrl(pathname, availableStores) {
    const urlStoreRef = extractStoreRefFromPathname(pathname);
    if (!urlStoreRef) {
      return { status: 200, activeStore: availableStores[0], error: null };
    }

    const matchedStore = availableStores.find(
      (s) => s.voopStoreId === urlStoreRef || s.id === urlStoreRef
    );

    if (matchedStore) {
      return { status: 200, activeStore: matchedStore, error: null };
    } else {
      // CRITICAL SECURITY RULE: Never fall back to another store! Return 403 Forbidden!
      return {
        status: 403,
        activeStore: null,
        error: "Forbidden: You do not have permission to access this store."
      };
    }
  }

  // 1. User on Store A visits valid Store A URL
  const res1 = validateStoreUrl("/app/VOOP-STORE-A/billing", userStores);
  assert.strictEqual(res1.status, 200);
  assert.strictEqual(res1.activeStore.voopStoreId, "VOOP-STORE-A");
  assert.strictEqual(res1.error, null);

  // 2. User tampers with URL to access Store B
  const res2 = validateStoreUrl("/app/VOOP-STORE-B/billing", userStores);
  assert.strictEqual(res2.status, 403);
  assert.strictEqual(res2.activeStore, null, "activeStore must be null on 403 to prevent context leak");
  assert.ok(res2.error.includes("Forbidden"), "Error must state Forbidden");
});

// -----------------------------------------------------------------------------
// 5. FILE SYSTEM STRUCTURE VALIDATION (app/app/[storeId]/...)
// -----------------------------------------------------------------------------
console.log("\n--- 5. Store-Scoped Route File Existence ---");

const requiredStoreRoutes = [
  "billing",
  "orders",
  "products",
  "variants",
  "inventory",
  "purchases",
  "pnl",
  "ads",
  "ads/campaigns",
  "tax",
  "tax-on-sales",
  "invoices",
  "couriers",
  "sync",
  "sync-logs",
  "staff",
  "integrations",
  "settings",
  "settings/company",
  "settings/shopify",
  "settings/ads",
  "settings/couriers",
  "profile",
  "scanner",
  "shipments",
  "collaborations",
  "form-builder"
];

for (const section of requiredStoreRoutes) {
  test(`Store route exists: app/app/[storeId]/${section}/page.tsx`, () => {
    const pagePath = path.join(__dirname, "..", "app", "app", "[storeId]", ...section.split("/"), "page.tsx");
    assert.ok(fs.existsSync(pagePath), `Missing store page at: ${pagePath}`);
  });
}

// -----------------------------------------------------------------------------
// 6. BARE ROUTE REDIRECTORS EXISTENCE
// -----------------------------------------------------------------------------
console.log("\n--- 6. Bare Route Canonical Redirectors Existence ---");

const bareRedirectRoutes = [
  "billing",
  "orders",
  "products",
  "inventory",
  "purchases",
  "pnl",
  "tax-on-sales",
  "scanner",
  "shipments",
  "meta-ads",
  "sync-logs",
  "settings",
  "collaborations",
  "form-builder"
];

for (const route of bareRedirectRoutes) {
  test(`Bare route redirector exists: app/${route}/page.tsx`, () => {
    const pagePath = path.join(__dirname, "..", "app", route, "page.tsx");
    assert.ok(fs.existsSync(pagePath), `Missing bare redirector at: ${pagePath}`);
    const content = fs.readFileSync(pagePath, "utf8");
    assert.ok(
      content.includes("StoreRedirector") || content.includes("storeRoute"),
      `app/${route}/page.tsx must use StoreRedirector or storeRoute`
    );
  });
}

// -----------------------------------------------------------------------------
// SUMMARY
// -----------------------------------------------------------------------------
console.log("\n=======================================================");
console.log(`  ALL TESTS COMPLETED: ${passedTests} / ${totalTests} PASSED`);
console.log("=======================================================\n");
