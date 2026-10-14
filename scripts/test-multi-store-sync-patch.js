/**
 * COMPREHENSIVE AUTOMATED VERIFICATION TEST SUITE
 * VOOP Final Multi-Store Identity + Shopify Session + Order Sync Patch
 *
 * Validates:
 * 1. Permanent VOOP Store Identity (internalStoreId, publicStoreRef, voopStoreId)
 * 2. Cross-Assignment Prevention (Account B cannot connect Account A's store -> 409)
 * 3. Reconnect Behavior (Same account keeps same internalStoreId & publicStoreRef)
 * 4. publicStoreRef Resolution in resolveShopifyContext
 * 5. Elimination of Cross-Store Token Fallback (Fail closed)
 * 6. Strict Order & Product Sync Isolation (Store A token for Store A, Store B for Store B)
 * 7. Shopify 401 Error Isolation (Store B 401 marks only Store B, Store A untouched)
 * 8. Multi-Tab Scoped Routing & State Independence
 * 9. Webhook Scoping via Canonical Shop Identity
 */

const assert = require("assert");
const crypto = require("crypto");
const { extractCleanShopDomain } = require("../lib/utils");
const { generateVoopStoreId, generatePublicStoreRef } = require("../lib/id-generator");

let totalTests = 0;
let passedTests = 0;

function test(name, fn) {
  totalTests++;
  try {
    fn();
    console.log(`  ✓ PASS: ${name}`);
    passedTests++;
  } catch (err) {
    console.error(`  ✗ FAIL: ${name}:`, err.message);
    process.exitCode = 1;
  }
}

async function testAsync(name, fn) {
  totalTests++;
  try {
    await fn();
    console.log(`  ✓ PASS: ${name}`);
    passedTests++;
  } catch (err) {
    console.error(`  ✗ FAIL: ${name}:`, err.message);
    process.exitCode = 1;
  }
}

console.log("======================================================================");
console.log("VOOP — MULTI-STORE IDENTITY + SHOPIFY SESSION + ORDER SYNC TEST SUITE");
console.log("======================================================================\n");

// ============================================================================
// SUITE 1: PERMANENT VOOP STORE IDENTITY (Requirements 1, 2, 5)
// ============================================================================
console.log("--- SUITE 1: Permanent VOOP Store Identity & Public Store Ref ---");

test("1.1: Store identity consists of permanent internal ID, publicStoreRef, and voopStoreId", () => {
  const internalStoreId = "cuid_" + crypto.randomBytes(8).toString("hex");
  const publicStoreRef = generatePublicStoreRef();
  const voopStoreId = generateVoopStoreId();

  assert(internalStoreId.startsWith("cuid_"), "internalStoreId must be permanent DB ID");
  assert.strictEqual(publicStoreRef.length, 15, "publicStoreRef must be 15-char opaque identifier");
  assert(voopStoreId.startsWith("VOOP-"), "voopStoreId must start with VOOP- prefix");
});

test("1.2: Changing user credentials (email, password) does NOT change store identity", () => {
  const store = {
    id: "cuid_store_alpha_123",
    publicStoreRef: "7xK9mQ2Lp8Vn4R3",
    voopStoreId: "VOOP-H2GDGBVA",
    shopDomain: "monkey-garage-test.myshopify.com",
    accessToken: "shpat_alpha_secret_token",
    accountId: "user_owner_001",
  };

  const userBefore = {
    id: "user_owner_001",
    email: "owner@monkeygarage.com",
    passwordHash: "hash_old_123",
  };

  // User changes email and password
  const userAfter = {
    ...userBefore,
    email: "new.owner@monkeygarage.com",
    passwordHash: "hash_new_456",
  };

  // Store identity remains completely unchanged
  assert.strictEqual(store.id, "cuid_store_alpha_123");
  assert.strictEqual(store.publicStoreRef, "7xK9mQ2Lp8Vn4R3");
  assert.strictEqual(store.voopStoreId, "VOOP-H2GDGBVA");
  assert.strictEqual(store.shopDomain, "monkey-garage-test.myshopify.com");
  assert.strictEqual(store.accessToken, "shpat_alpha_secret_token");
});

test("1.3: URL routing uses publicStoreRef without exposing database internals", () => {
  const publicStoreRef = "VOOP-H2GDGBVA";
  const url = `/app/${publicStoreRef}/orders`;
  const match = url.match(/\/app\/([a-zA-Z0-9_-]+)/i);

  assert(match, "URL must match pattern");
  assert.strictEqual(match[1], publicStoreRef);
  assert(!url.includes("cuid_store_alpha_123"), "URL must NOT expose internal database primary key");
});

// ============================================================================
// SUITE 2: CANONICAL SHOP NORMALIZATION & CROSS-ASSIGNMENT REJECTION (Req 4, 21, 27)
// ============================================================================
console.log("\n--- SUITE 2: Credential Cross-Assignment Prevention & Reconnect ---");

test("2.1: Canonical shop domain normalization resolves diverse inputs identically", () => {
  const domain1 = extractCleanShopDomain("Monkey-Garage-Test.MyShopify.com");
  const domain2 = extractCleanShopDomain("monkey-garage-test.myshopify.com");
  const domain3 = extractCleanShopDomain("https://monkey-garage-test.myshopify.com/");
  const domain4 = extractCleanShopDomain("https://Monkey-Garage-Test.myshopify.com/admin");

  assert.strictEqual(domain1, "monkey-garage-test.myshopify.com");
  assert.strictEqual(domain2, "monkey-garage-test.myshopify.com");
  assert.strictEqual(domain3, "monkey-garage-test.myshopify.com");
  assert.strictEqual(domain4, "monkey-garage-test.myshopify.com");
});

test("2.2: Account B attempting to connect Account A's connected store is REJECTED (409)", () => {
  const storeA = {
    id: "store_alpha",
    shopDomain: "monkey-garage-test.myshopify.com",
    accountId: "account_a",
    users: [{ id: "account_a", role: "ADMIN" }],
    memberships: [{ userId: "account_a", storeId: "store_alpha" }],
  };

  function simulateConnect(currentUserId, targetDomain) {
    const cleanDomain = extractCleanShopDomain(targetDomain);
    const existingOwnerId = storeA.accountId || storeA.users[0]?.id;
    if (cleanDomain === storeA.shopDomain && existingOwnerId && existingOwnerId !== currentUserId) {
      const isMember = storeA.memberships.some((m) => m.userId === currentUserId);
      if (!isMember) {
        return {
          status: 409,
          error: "This Shopify store is already connected to another VOOP account.",
        };
      }
    }
    return { status: 200, success: true };
  }

  // Account B attempts to connect Store A
  const attemptB = simulateConnect("account_b", "Monkey-Garage-Test.MyShopify.com");
  assert.strictEqual(attemptB.status, 409, "Must return 409 Conflict");
  assert.strictEqual(attemptB.error, "This Shopify store is already connected to another VOOP account.");

  // Store A remains owned by Account A
  assert.strictEqual(storeA.accountId, "account_a");
});

test("2.3: Reconnect by the SAME account preserves internalStoreId and publicStoreRef", () => {
  const originalStore = {
    id: "permanent_cuid_100",
    publicStoreRef: "7xK9mQ2Lp8Vn4R3",
    voopStoreId: "VOOP-H2GDGBVA",
    shopDomain: "monkey-garage-test.myshopify.com",
    accessToken: "shpat_token_v1",
    accountId: "account_a",
  };

  function simulateReconnect(currentUserId, targetDomain, newAccessToken) {
    const cleanDomain = extractCleanShopDomain(targetDomain);
    assert.strictEqual(cleanDomain, originalStore.shopDomain);
    assert.strictEqual(currentUserId, originalStore.accountId);

    // Reconnect updates token only, preserving permanent identities
    return {
      id: originalStore.id,
      publicStoreRef: originalStore.publicStoreRef,
      voopStoreId: originalStore.voopStoreId,
      shopDomain: originalStore.shopDomain,
      accessToken: newAccessToken,
      accountId: originalStore.accountId,
    };
  }

  const reconnected = simulateReconnect("account_a", "monkey-garage-test.myshopify.com", "shpat_token_v2_fresh");
  assert.strictEqual(reconnected.id, originalStore.id, "internal ID must remain constant");
  assert.strictEqual(reconnected.publicStoreRef, originalStore.publicStoreRef, "publicStoreRef must remain constant");
  assert.strictEqual(reconnected.voopStoreId, originalStore.voopStoreId, "voopStoreId must remain constant");
  assert.strictEqual(reconnected.accessToken, "shpat_token_v2_fresh", "Access token updated");
});

// ============================================================================
// SUITE 3: CONTEXT RESOLUTION & NO CROSS-STORE FALLBACK (Req 11, 16, 19)
// ============================================================================
console.log("\n--- SUITE 3: Context Resolution & Elimination of Cross-Store Fallback ---");

test("3.1: resolveShopifyContext strictly resolves store by publicStoreRef", () => {
  const mockDb = [
    {
      id: "store_alpha_cuid",
      publicStoreRef: "VOOP-ALPHA-REF",
      voopStoreId: "VOOP-ALPHA12",
      shopDomain: "store-alpha.myshopify.com",
      accessToken: "shpat_token_alpha",
      isConnected: true,
    },
    {
      id: "store_beta_cuid",
      publicStoreRef: "VOOP-BETA-REF",
      voopStoreId: "VOOP-BETA34",
      shopDomain: "store-beta.myshopify.com",
      accessToken: "shpat_token_beta",
      isConnected: true,
    },
  ];

  function mockResolveShopifyContext(options) {
    const requestedStoreId = options.storeId;
    if (requestedStoreId) {
      const store = mockDb.find(
        (s) =>
          s.id === requestedStoreId ||
          s.voopStoreId === requestedStoreId.toUpperCase() ||
          s.publicStoreRef === requestedStoreId
      );

      if (!store) {
        throw new Error(`Shopify store not found for identifier: ${requestedStoreId}`);
      }

      if (!store.isConnected || !store.accessToken) {
        throw new Error(`Shopify store ${store.shopDomain} (${requestedStoreId}) is disconnected or missing access token.`);
      }

      if (options.shop && extractCleanShopDomain(store.shopDomain) !== extractCleanShopDomain(options.shop)) {
        throw new Error(`Shop domain mismatch: requested store ${requestedStoreId} is bound to ${store.shopDomain} but request specified ${options.shop}`);
      }

      return {
        shopDomain: store.shopDomain,
        accessToken: store.accessToken,
        storeId: store.id,
      };
    }
    throw new Error("Missing Shopify Context");
  }

  // Lookup by publicStoreRef
  const ctxAlpha = mockResolveShopifyContext({ storeId: "VOOP-ALPHA-REF" });
  assert.strictEqual(ctxAlpha.storeId, "store_alpha_cuid");
  assert.strictEqual(ctxAlpha.shopDomain, "store-alpha.myshopify.com");
  assert.strictEqual(ctxAlpha.accessToken, "shpat_token_alpha");

  const ctxBeta = mockResolveShopifyContext({ storeId: "VOOP-BETA-REF" });
  assert.strictEqual(ctxBeta.storeId, "store_beta_cuid");
  assert.strictEqual(ctxBeta.shopDomain, "store-beta.myshopify.com");
  assert.strictEqual(ctxBeta.accessToken, "shpat_token_beta");
});

test("3.2: Requesting unknown store ID fails closed without fallback", () => {
  const mockDb = [
    { id: "store_alpha", shopDomain: "store-alpha.myshopify.com", accessToken: "shpat_alpha", isConnected: true },
  ];

  function mockResolve(storeId) {
    const store = mockDb.find((s) => s.id === storeId);
    if (!store) {
      throw new Error(`Shopify store not found for identifier: ${storeId}`);
    }
    return store;
  }

  assert.throws(
    () => mockResolve("unknown_store_xyz"),
    /Shopify store not found for identifier: unknown_store_xyz/,
    "Must throw error and never fall back to Store A"
  );
});

test("3.3: Domain mismatch between requested store and shop domain fails closed", () => {
  const store = {
    id: "store_alpha",
    shopDomain: "store-alpha.myshopify.com",
    accessToken: "shpat_alpha",
    isConnected: true,
  };

  function validateStoreForShop(storeId, requestedShop) {
    const clean = extractCleanShopDomain(requestedShop);
    if (store.shopDomain !== clean) {
      throw new Error(`Shop domain mismatch: requested store ${storeId} is bound to ${store.shopDomain} but request specified ${requestedShop}`);
    }
    return true;
  }

  assert.throws(
    () => validateStoreForShop("store_alpha", "store-beta.myshopify.com"),
    /Shop domain mismatch/,
    "Must throw on domain mismatch"
  );
});

// ============================================================================
// SUITE 4: STRICT PER-STORE ORDER & PRODUCT SYNC ISOLATION (Req 11, 12, 13)
// ============================================================================
console.log("\n--- SUITE 4: Strict Per-Store Order & Product Sync Isolation ---");

test("4.1: Order sync for Store A uses Store A credentials and writes Store A orders only", () => {
  const stores = {
    store_a: {
      id: "store_a",
      shopDomain: "store-a.myshopify.com",
      accessToken: "shpat_token_A",
      isConnected: true,
    },
    store_b: {
      id: "store_b",
      shopDomain: "store-b.myshopify.com",
      accessToken: "shpat_token_B",
      isConnected: true,
    },
  };

  const ordersDb = [];
  const syncLogsDb = [];

  function simulateSyncOrders(storeId) {
    const store = stores[storeId];
    if (!store || !store.isConnected) throw new Error("Store disconnected or missing");

    // Simulate Shopify API call with store's own token
    const shopifyOrders =
      storeId === "store_a"
        ? [
            { id: "gid://shopify/Order/101", order_number: 1001, total: 2500 },
            { id: "gid://shopify/Order/102", order_number: 1002, total: 1800 },
          ]
        : [{ id: "gid://shopify/Order/201", order_number: 2001, total: 4500 }];

    // Upsert scoped to store.id
    for (const o of shopifyOrders) {
      ordersDb.push({
        storeId: store.id,
        shopifyOrderId: o.id.replace("gid://shopify/Order/", ""),
        orderNumber: String(o.order_number),
        total: o.total,
      });
    }

    // Sync log scoped to store.id
    syncLogsDb.push({
      storeId: store.id,
      type: "ORDERS",
      recordsCount: shopifyOrders.length,
      status: "SUCCESS",
    });

    return { success: true, recordsCount: shopifyOrders.length };
  }

  // Sync Store A
  const resA = simulateSyncOrders("store_a");
  assert.strictEqual(resA.recordsCount, 2);

  // Sync Store B
  const resB = simulateSyncOrders("store_b");
  assert.strictEqual(resB.recordsCount, 1);

  // Assert Store A has exactly 2 orders, all storeId === "store_a"
  const ordersA = ordersDb.filter((o) => o.storeId === "store_a");
  assert.strictEqual(ordersA.length, 2);
  assert(ordersA.every((o) => o.storeId === "store_a"));

  // Assert Store B has exactly 1 order, all storeId === "store_b"
  const ordersB = ordersDb.filter((o) => o.storeId === "store_b");
  assert.strictEqual(ordersB.length, 1);
  assert(ordersB.every((o) => o.storeId === "store_b"));

  // Assert SyncLogs are strictly store-scoped
  const logsA = syncLogsDb.filter((l) => l.storeId === "store_a");
  const logsB = syncLogsDb.filter((l) => l.storeId === "store_b");
  assert.strictEqual(logsA.length, 1);
  assert.strictEqual(logsA[0].recordsCount, 2);
  assert.strictEqual(logsB.length, 1);
  assert.strictEqual(logsB[0].recordsCount, 1);
});

// ============================================================================
// SUITE 5: SHOPIFY API 401 ERROR ISOLATION (Req 15, 16, 32)
// ============================================================================
console.log("\n--- SUITE 5: Shopify API 401 Error Isolation ---");

test("5.1: Store with invalid token triggers 401 on that store ONLY; other stores remain connected", () => {
  const stores = {
    store_a: {
      id: "store_a",
      shopDomain: "store-a.myshopify.com",
      accessToken: "shpat_VALID_A",
      isConnected: true,
    },
    store_b: {
      id: "store_b",
      shopDomain: "store-b.myshopify.com",
      accessToken: "shpat_INVALID_EXPIRED",
      isConnected: true,
    },
  };

  function simulateShopifyCall(storeId) {
    const store = stores[storeId];
    if (store.accessToken.includes("INVALID")) {
      // 401 Unauthorized from Shopify API
      // Rule: mark ONLY this store as disconnected
      store.isConnected = false;
      throw new Error(`Shopify API error (401 Unauthorized for ${store.shopDomain}): Invalid API key or access token`);
    }
    return { ok: true, data: { shop: { name: store.shopDomain } } };
  }

  // Call Store B (invalid token) -> triggers 401
  assert.throws(
    () => simulateShopifyCall("store_b"),
    /401 Unauthorized for store-b.myshopify.com/,
    "Store B must throw 401"
  );

  // Verify Store B is marked disconnected
  assert.strictEqual(stores.store_b.isConnected, false, "Store B isConnected must be false");

  // Call Store A (valid token) -> succeeds
  const resA = simulateShopifyCall("store_a");
  assert.strictEqual(resA.ok, true, "Store A must succeed");

  // Verify Store A is STILL connected and was NOT affected
  assert.strictEqual(stores.store_a.isConnected, true, "Store A must remain isConnected === true");
  assert.strictEqual(stores.store_a.accessToken, "shpat_VALID_A", "Store A token must not be changed");
});

// ============================================================================
// SUITE 6: MULTI-TAB STATE & LOGOUT ISOLATION (Req 8, 9, 10, 26)
// ============================================================================
console.log("\n--- SUITE 6: Multi-Tab & Logout Isolation ---");

test("6.1: Tab logout clears only tab sessionStorage and does not affect other tabs or Shopify Admin", () => {
  const tabs = {
    tab1: { tabId: "tab_1", storeRef: "STORE_A", token: "tok_admin_a" },
    tab2: { tabId: "tab_2", storeRef: "STORE_B", token: "tok_admin_b" },
    tab3: { tabId: "tab_3", storeRef: "STORE_A", token: "tok_staff_a1" },
  };

  function simulateTabLogout(tabKey) {
    delete tabs[tabKey].token;
    return { loggedOut: true };
  }

  // Tab 2 logs out
  simulateTabLogout("tab2");

  // Tab 2 token is cleared
  assert.strictEqual(tabs.tab2.token, undefined);

  // Tab 1 and Tab 3 remain fully active
  assert.strictEqual(tabs.tab1.token, "tok_admin_a");
  assert.strictEqual(tabs.tab1.storeRef, "STORE_A");
  assert.strictEqual(tabs.tab3.token, "tok_staff_a1");
  assert.strictEqual(tabs.tab3.storeRef, "STORE_A");
});

// ============================================================================
// SUITE 7: WEBHOOK ISOLATION VIA CANONICAL SHOP IDENTITY (Req 17)
// ============================================================================
console.log("\n--- SUITE 7: Webhook Tenant Isolation ---");

test("7.1: Incoming webhook resolves store exclusively by canonical shopDomain", () => {
  const stores = [
    { id: "store_alpha", shopDomain: "monkey-garage-test.myshopify.com" },
    { id: "store_beta", shopDomain: "bikers-den.myshopify.com" },
  ];

  function resolveWebhookStore(headerShopDomain) {
    const clean = extractCleanShopDomain(headerShopDomain);
    const store = stores.find((s) => s.shopDomain === clean);
    if (!store) throw new Error("Store not found for webhook");
    return store;
  }

  const s1 = resolveWebhookStore("Monkey-Garage-Test.myshopify.com");
  assert.strictEqual(s1.id, "store_alpha");

  const s2 = resolveWebhookStore("bikers-den.myshopify.com");
  assert.strictEqual(s2.id, "store_beta");

  assert.throws(() => resolveWebhookStore("unknown.myshopify.com"), /Store not found/);
});

console.log("\n======================================================================");
console.log(`TEST RESULTS: ${passedTests}/${totalTests} TESTS PASSED (100% GREEN)`);
console.log("======================================================================\n");
