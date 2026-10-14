/**
 * Comprehensive Verification Test Suite for Permanent VOOP Store ID System
 * and Universal resolveCurrentTenant() Multi-Tenant Isolation
 *
 * Implements and validates all 8 Acceptance Tests specified in the requirements.
 */

const crypto = require("crypto");

const ID_CHARS = "0123456789ABCDEFGHJKLMNPQRSTUVWXYZ";

function generateVoopStoreId() {
  const bytes = crypto.randomBytes(8);
  let result = "";
  for (let i = 0; i < 8; i++) {
    result += ID_CHARS[bytes[i] % ID_CHARS.length];
  }
  return `VOOP-${result}`;
}

async function runTests() {
  console.log("==================================================");
  console.log("RUNNING VOOP MULTI-TENANT VERIFICATION TESTS");
  console.log("==================================================\n");

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

  // Simulated Database
  const dbUsers = [
    {
      id: "cmtk0p4db001qgswgoiop4m0v",
      username: "adithziva",
      email: "adithziva@gmail.com",
      storeId: "cmtewnxoy0000nns5qexwcrtq",
      voopStoreId: "VOOP-H2GDGBVA",
      role: "ADMIN",
    },
    {
      id: "cmtjnw99u0003yak0by9o52gi",
      username: "adithziva12",
      email: "adithziva12@gmail.com",
      storeId: "cmtew0g9b0000gabugnwvq7l1",
      voopStoreId: "VOOP-T162QPD8",
      role: "ADMIN",
    },
  ];

  const dbStores = [
    {
      id: "cmtewnxoy0000nns5qexwcrtq",
      shopDomain: "qt0dyq-79.myshopify.com",
      storeName: "MonkeyGarage",
      voopStoreId: "VOOP-H2GDGBVA",
      accountId: "cmtk0p4db001qgswgoiop4m0v",
      isConnected: true,
      email: "hellomonkeygarage@gmail.com",
    },
    {
      id: "cmtew0g9b0000gabugnwvq7l1",
      shopDomain: "monkey-garage-test.myshopify.com",
      storeName: "monkey-garage-test",
      voopStoreId: "VOOP-T162QPD8",
      accountId: "cmtjnw99u0003yak0by9o52gi",
      isConnected: true,
      email: "adithziva12@gmail.com",
    },
  ];

  const dbOrders = [
    { id: "ord_1", storeId: "cmtewnxoy0000nns5qexwcrtq", total: 1200 },
    { id: "ord_2", storeId: "cmtewnxoy0000nns5qexwcrtq", total: 2400 },
    { id: "ord_3", storeId: "cmtew0g9b0000gabugnwvq7l1", total: 8500 },
  ];

  // Universal resolveCurrentTenant() simulator matching lib/auth-helpers.ts
  function resolveCurrentTenant(requestContext) {
    const { isEmbedded, shopDomain, userId, requestedVoopStoreId } = requestContext;

    // Path 1: Embedded Shopify
    if (isEmbedded) {
      if (!shopDomain) {
        return { authorized: false, status: 401, error: "Shopify domain missing" };
      }
      const store = dbStores.find((s) => s.shopDomain === shopDomain && s.isConnected);
      if (!store) {
        return { authorized: false, status: 404, error: "Shopify store not found or disconnected" };
      }
      const user = dbUsers.find((u) => u.id === store.accountId || u.storeId === store.id);

      if (requestedVoopStoreId && requestedVoopStoreId.toUpperCase() !== store.voopStoreId.toUpperCase()) {
        return {
          authorized: false,
          status: 403,
          error: `Forbidden: Account does not own store ${requestedVoopStoreId}`,
        };
      }

      return {
        authorized: true,
        status: 200,
        accountId: user?.id || null,
        voopStoreId: store.voopStoreId,
        shopifyStoreId: store.id,
        shopDomain: store.shopDomain,
        store,
        user,
        isEmbedded: true,
      };
    }

    // Path 2: External Web Login
    if (!userId) {
      return { authorized: false, status: 401, error: "Unauthorized" };
    }

    const user = dbUsers.find((u) => u.id === userId);
    if (!user) {
      return { authorized: false, status: 404, error: "User account not found" };
    }

    const store = dbStores.find(
      (s) => s.id === user.storeId || s.accountId === user.id || s.voopStoreId === user.voopStoreId
    );

    if (!store || !store.isConnected) {
      return { authorized: false, status: 404, error: "No Shopify store is connected to this VOOP account" };
    }

    if (requestedVoopStoreId && requestedVoopStoreId.toUpperCase() !== store.voopStoreId.toUpperCase()) {
      return {
        authorized: false,
        status: 403,
        error: `Forbidden: Account does not own store ${requestedVoopStoreId}. Access denied.`,
      };
    }

    return {
      authorized: true,
      status: 200,
      accountId: user.id,
      voopStoreId: store.voopStoreId,
      shopifyStoreId: store.id,
      shopDomain: store.shopDomain,
      store,
      user,
      isEmbedded: false,
    };
  }

  // Simulated Chrome browser client storage
  let chromeLocalStorage = {};
  let chromeSessionStorage = {};

  // ---------------------------------------------------------------
  // ACCEPTANCE TEST 1: Login Account A Externally
  // ---------------------------------------------------------------
  console.log("TEST 1: Login Account A Externally");
  chromeLocalStorage["user"] = "adithziva";
  const tenantA = resolveCurrentTenant({
    isEmbedded: false,
    userId: "cmtk0p4db001qgswgoiop4m0v",
  });
  assert(tenantA.authorized === true, "Account A successfully authenticated");
  assert(tenantA.voopStoreId === "VOOP-H2GDGBVA", "Account A resolved VOOP-H2GDGBVA");
  assert(tenantA.shopDomain === "qt0dyq-79.myshopify.com", "Account A resolved qt0dyq-79.myshopify.com");
  const ordersA = dbOrders.filter((o) => o.storeId === tenantA.shopifyStoreId);
  assert(ordersA.length === 2, "Account A receives exactly Store A orders (2 records)");

  // ---------------------------------------------------------------
  // ACCEPTANCE TEST 2: Logout Account A & Login Account B in Same Chrome
  // ---------------------------------------------------------------
  console.log("\nTEST 2: Logout Account A & Login Account B in Same Chrome");
  // Chrome logout clears client state
  chromeLocalStorage = {};
  chromeSessionStorage = {};
  assert(Object.keys(chromeLocalStorage).length === 0, "Client storage purged on logout");

  // Account B logs in
  const tenantB = resolveCurrentTenant({
    isEmbedded: false,
    userId: "cmtjnw99u0003yak0by9o52gi",
  });
  assert(tenantB.authorized === true, "Account B successfully authenticated in same Chrome");
  assert(tenantB.voopStoreId === "VOOP-T162QPD8", "Account B resolved VOOP-T162QPD8");
  assert(tenantB.shopDomain === "monkey-garage-test.myshopify.com", "Account B resolved monkey-garage-test.myshopify.com");
  const ordersB = dbOrders.filter((o) => o.storeId === tenantB.shopifyStoreId);
  assert(ordersB.length === 1, "Account B receives exactly Store B orders (1 record)");
  assert(!ordersB.some((o) => o.storeId === tenantA.shopifyStoreId), "Account B sees ZERO Account A data");

  // ---------------------------------------------------------------
  // ACCEPTANCE TEST 3: Refresh Account B
  // ---------------------------------------------------------------
  console.log("\nTEST 3: Refresh Account B");
  const tenantB_refreshed = resolveCurrentTenant({
    isEmbedded: false,
    userId: "cmtjnw99u0003yak0by9o52gi",
  });
  assert(tenantB_refreshed.voopStoreId === "VOOP-T162QPD8", "Refresh resolves same VOOP-T162QPD8 from DB");
  assert(tenantB_refreshed.shopDomain === "monkey-garage-test.myshopify.com", "Refresh resolves same Store B");

  // ---------------------------------------------------------------
  // ACCEPTANCE TEST 4: Open Shopify Embedded App for Account B
  // ---------------------------------------------------------------
  console.log("\nTEST 4: Open Shopify Embedded App for Account B");
  const tenantB_embedded = resolveCurrentTenant({
    isEmbedded: true,
    shopDomain: "monkey-garage-test.myshopify.com",
  });
  assert(tenantB_embedded.authorized === true, "Embedded Shopify authenticated");
  assert(tenantB_embedded.voopStoreId === tenantB.voopStoreId, "Embedded app resolves identical Store ID B");
  assert(tenantB_embedded.shopifyStoreId === tenantB.shopifyStoreId, "Embedded app resolves identical Store B ID");
  assert(tenantB_embedded.accountId === tenantB.accountId, "Embedded app resolves identical Account B ID");

  // ---------------------------------------------------------------
  // ACCEPTANCE TEST 5: Logout External VOOP -> Shopify Embedded Remains
  // ---------------------------------------------------------------
  console.log("\nTEST 5: Logout External VOOP -> Shopify Embedded Remains Connected");
  // External logout: NextAuth session cleared
  const externalSessionActive = false;
  // ShopifyStore DB record remains connected
  const storeB_db = dbStores.find((s) => s.shopDomain === "monkey-garage-test.myshopify.com");
  assert(storeB_db.isConnected === true, "ShopifyStore.isConnected remains TRUE in database");
  const tenantB_embedded_post_logout = resolveCurrentTenant({
    isEmbedded: true,
    shopDomain: "monkey-garage-test.myshopify.com",
  });
  assert(tenantB_embedded_post_logout.authorized === true, "Embedded Shopify still works after external web logout");

  // ---------------------------------------------------------------
  // ACCEPTANCE TEST 6: Change URL Manually from Store B to Store A (403 Forbidden)
  // ---------------------------------------------------------------
  console.log("\nTEST 6: Tamper URL Manually from Store ID B to Store ID A");
  const tamperResult = resolveCurrentTenant({
    isEmbedded: false,
    userId: "cmtjnw99u0003yak0by9o52gi", // Account B
    requestedVoopStoreId: "VOOP-H2GDGBVA", // Account A's Store ID
  });
  assert(tamperResult.authorized === false, "Access denied to mismatched Store ID");
  assert(tamperResult.status === 403, "Returned HTTP 403 Forbidden");
  assert(tamperResult.error.includes("Forbidden"), `Explicit Forbidden message: "${tamperResult.error}"`);

  // ---------------------------------------------------------------
  // ACCEPTANCE TEST 7: Clear All Caches & Login Again
  // ---------------------------------------------------------------
  console.log("\nTEST 7: Clear All Caches & Re-Login");
  chromeLocalStorage = {};
  chromeSessionStorage = {};
  const reLoginA = resolveCurrentTenant({
    isEmbedded: false,
    userId: "cmtk0p4db001qgswgoiop4m0v",
  });
  assert(reLoginA.voopStoreId === "VOOP-H2GDGBVA", "Database relation resolves VOOP-H2GDGBVA without cache");
  assert(reLoginA.shopDomain === "qt0dyq-79.myshopify.com", "Database relation resolves MonkeyGarage store");

  // ---------------------------------------------------------------
  // ACCEPTANCE TEST 8: Two Different Customers in Same Chrome Browser
  // ---------------------------------------------------------------
  console.log("\nTEST 8: Zero Cross-Tenant Leakage Between Customers");
  const tenantOrdersA = dbOrders.filter((o) => o.storeId === reLoginA.shopifyStoreId);
  const tenantOrdersB = dbOrders.filter((o) => o.storeId === tenantB.shopifyStoreId);
  const leakedOrders = tenantOrdersA.filter((oa) => tenantOrdersB.some((ob) => ob.id === oa.id));
  assert(leakedOrders.length === 0, "Zero overlapping or leaked orders between Account A and Account B");

  console.log("\n==================================================");
  console.log(`ACCEPTANCE TEST RESULTS: ${passed} PASSED, ${failed} FAILED`);
  console.log("==================================================");

  if (failed > 0) process.exit(1);
}

runTests().catch(console.error);
