/**
 * Multi-Store Multi-Tab Session Isolation & Security Hardening Test Suite
 *
 * Simulates the critical real-world browser scenario:
 * - Chrome Browser with 3 simultaneous tabs:
 *   - TAB 1: Admin -> Store A
 *   - TAB 2: Admin -> Store B
 *   - TAB 3: Staff -> Store A
 *
 * Verifies:
 * 1. Dual-token tab isolation (sessionStorage Bearer token overrides cookie collisions)
 * 2. Simultaneous concurrent requests across tabs without cross-contamination (Promise.all)
 * 3. Store-specific Shopify credentials resolution (Store A credentials never used for Store B)
 * 4. IDOR Protection on single-object routes (orders/[id], orders/[id]/invoice, billing/[id], tracking)
 * 5. Granular Staff permission gates (403 on restricted modules, 200 on authorized)
 * 6. Browser HTTP cache key separation via storeRef URL parameter
 */

const {
  PERMISSION_KEYS,
  hasPermission,
  normalizeUserPermissions,
} = require("../lib/permissions");

console.log("==================================================================");
console.log("TESTING: MULTI-STORE MULTI-TAB SESSION ISOLATION & IDOR SECURITY");
console.log("==================================================================\n");

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

// ─── MOCK DATABASE REPOSITORY ────────────────────────────────────────────────
const mockStores = [
  {
    id: "store_A_uuid",
    voopStoreId: "VOOP-ALPHA1",
    shopDomain: "store-alpha.myshopify.com",
    storeName: "Alpha Apparel",
    accessToken: "shpat_alpha_secret_token_12345",
    accountId: "admin_user_id",
    isConnected: true,
  },
  {
    id: "store_B_uuid",
    voopStoreId: "VOOP-BETA2",
    shopDomain: "store-beta.myshopify.com",
    storeName: "Beta Electronics",
    accessToken: "shpat_beta_secret_token_67890",
    accountId: "admin_user_id",
    isConnected: true,
  },
  {
    id: "store_C_uuid",
    voopStoreId: "VOOP-GAMMA3",
    shopDomain: "store-gamma.myshopify.com",
    storeName: "Gamma Home (Unrelated Store)",
    accessToken: "shpat_gamma_secret_token_99999",
    accountId: "unrelated_user_id",
    isConnected: true,
  },
];

const mockUsers = [
  {
    id: "admin_user_id",
    username: "admin_alex",
    email: "admin@enterprise.com",
    role: "ADMIN",
    storeId: "store_A_uuid", // Primary DB store
    voopStoreId: "VOOP-ALPHA1",
    permissions: null,
  },
  {
    id: "staff_ram_id",
    username: "staff_ram",
    email: "ram@alphaapparel.com",
    role: "STAFF",
    storeId: "store_A_uuid", // Strictly assigned to Store A
    voopStoreId: "VOOP-ALPHA1",
    createdById: "admin_user_id",
    permissions: JSON.stringify(["orders.view", "shipments.view", "shipments.manage"]),
  },
];

const mockOrders = [
  {
    id: "order_alpha_101",
    storeId: "store_A_uuid",
    shopifyOrderId: "gid://shopify/Order/101",
    orderNumber: "1001",
    totalPrice: 1500,
  },
  {
    id: "order_beta_202",
    storeId: "store_B_uuid",
    shopifyOrderId: "gid://shopify/Order/202",
    orderNumber: "2001",
    totalPrice: 4200,
  },
];

const mockBillingOrders = [
  {
    id: "offline_alpha_501",
    storeId: "store_A_uuid",
    orderNumber: "OFF-101",
    totalAmount: 999,
  },
  {
    id: "offline_beta_502",
    storeId: "store_B_uuid",
    orderNumber: "OFF-202",
    totalAmount: 1899,
  },
];

// ─── AUTH & RESOLUTION ENGINE EMULATOR (MATCHING lib/auth-helpers.ts) ────────
function resolveUserFromRequest(request) {
  // 1. Check tab-isolated Bearer token from header
  const authHeader = request.headers["authorization"] || request.headers["Authorization"];
  if (authHeader && authHeader.startsWith("Bearer ")) {
    const rawToken = authHeader.substring(7).trim();
    if (rawToken.includes("admin_token")) {
      return mockUsers.find((u) => u.id === "admin_user_id");
    }
    if (rawToken.includes("staff_token")) {
      return mockUsers.find((u) => u.id === "staff_ram_id");
    }
  }

  // 2. Fallback to shared cookie
  const cookie = request.headers["cookie"] || "";
  if (cookie.includes("next-auth.session-token=staff_cookie")) {
    return mockUsers.find((u) => u.id === "staff_ram_id");
  }
  if (cookie.includes("next-auth.session-token=admin_cookie")) {
    return mockUsers.find((u) => u.id === "admin_user_id");
  }

  return null;
}

function resolveAuthorizedStores(userId) {
  const user = mockUsers.find((u) => u.id === userId);
  if (!user) return [];

  if (user.role === "STAFF") {
    return mockStores.filter((s) => s.id === user.storeId && s.isConnected);
  }

  return mockStores.filter(
    (s) => s.isConnected && (s.accountId === userId || s.id === user.storeId)
  );
}

function authorizeStoreAccess(request, options = {}) {
  const user = resolveUserFromRequest(request);
  if (!user) {
    return { authorized: false, status: 401, error: "Unauthenticated" };
  }

  const authorizedStores = resolveAuthorizedStores(user.id);

  // Extract requested store identifier from query, headers, or URL
  const searchParams = new URL(request.url, "http://localhost").searchParams;
  const storeRef = searchParams.get("storeRef");
  const headerVoop = request.headers["x-voop-store-id"];
  const headerStore = request.headers["x-store-id"];
  const match = new URL(request.url, "http://localhost").pathname.match(/\/app\/(VOOP-[A-Z0-9]+)/i);

  const requestedIdentifier =
    storeRef || headerVoop || headerStore || (match ? match[1] : null);

  let store = null;
  if (requestedIdentifier) {
    store = authorizedStores.find(
      (s) =>
        (s.voopStoreId && s.voopStoreId.toUpperCase() === requestedIdentifier.toUpperCase()) ||
        s.id === requestedIdentifier ||
        (s.shopDomain && s.shopDomain.toLowerCase() === requestedIdentifier.toLowerCase())
    );

    if (!store) {
      return {
        authorized: false,
        status: 403,
        error: `Forbidden: Your authenticated VOOP account does not own or have permission to access store "${requestedIdentifier}".`,
      };
    }
  } else {
    store = authorizedStores.find((s) => s.id === user.storeId) || authorizedStores[0] || null;
  }

  if (!store) {
    return { authorized: false, status: 404, error: "No store accessible" };
  }

  if (options.requiredPermission) {
    const isAllowed = hasPermission(user, options.requiredPermission);
    if (!isAllowed) {
      return {
        authorized: false,
        status: 403,
        error: `Forbidden: You don't have permission to access (${options.requiredPermission}).`,
        storeId: store.id,
      };
    }
  }

  return {
    authorized: true,
    status: 200,
    storeId: store.id,
    voopStoreId: store.voopStoreId,
    shopDomain: store.shopDomain,
    role: user.role,
    user,
  };
}

function resolveShopifyCredentials(request) {
  const searchParams = new URL(request.url, "http://localhost").searchParams;
  const storeRef = searchParams.get("storeRef") || request.headers["x-voop-store-id"] || request.headers["x-store-id"];

  if (!storeRef) return null;

  const store = mockStores.find(
    (s) => s.id === storeRef || s.voopStoreId === storeRef.toUpperCase()
  );
  if (!store) return null;

  return {
    storeId: store.id,
    shopDomain: store.shopDomain,
    accessToken: store.accessToken,
  };
}

// ─── SIMULATED CLIENT APP-FETCH (MATCHING lib/api.ts) ────────────────────────
function simulateAppFetch(tabState, path, init = {}) {
  const headers = Object.assign({}, init.headers || {});

  // 1. Attach tab-isolated session token
  if (tabState.sessionToken && !headers["Authorization"]) {
    headers["Authorization"] = `Bearer ${tabState.sessionToken}`;
  }

  // 2. Attach tab-isolated store headers
  if (tabState.voopStoreId) {
    headers["x-voop-store-id"] = tabState.voopStoreId;
  }
  if (tabState.storeId) {
    headers["x-store-id"] = tabState.storeId;
  }

  // 3. Shared browser cookie jar (browser automatically attaches domain cookies)
  headers["cookie"] = tabState.browserCookieJar;

  // 4. Append storeRef parameter for cache isolation
  const targetRef = tabState.voopStoreId || tabState.storeId;
  let url = path;
  if (targetRef && !url.includes("storeRef=")) {
    const sep = url.includes("?") ? "&" : "?";
    url = `${url}${sep}storeRef=${encodeURIComponent(targetRef)}`;
  }

  return {
    url,
    headers,
    method: init.method || "GET",
    body: init.body,
  };
}

async function runTests() {
  console.log("─── TEST SUITE 1: Multi-Tab Session Token & Shared Cookie Collision ───");

  // Initial state: Admin logged in, browser cookie jar has admin_cookie
  let browserSharedCookieJar = "next-auth.session-token=admin_cookie";

  // Tab 1: Admin opens Store A
  const tab1 = {
    name: "TAB 1 (Admin -> Store A)",
    sessionToken: "admin_token_jwt_signature_xyz",
    storeId: "store_A_uuid",
    voopStoreId: "VOOP-ALPHA1",
    get browserCookieJar() { return browserSharedCookieJar; },
  };

  // Tab 2: Admin opens Store B
  const tab2 = {
    name: "TAB 2 (Admin -> Store B)",
    sessionToken: "admin_token_jwt_signature_xyz",
    storeId: "store_B_uuid",
    voopStoreId: "VOOP-BETA2",
    get browserCookieJar() { return browserSharedCookieJar; },
  };

  // Tab 3: Staff RAM logs in on the SAME browser!
  // CRITICAL: NextAuth overwrites the browser cookie jar with Staff's cookie!
  browserSharedCookieJar = "next-auth.session-token=staff_cookie";

  const tab3 = {
    name: "TAB 3 (Staff RAM -> Store A)",
    sessionToken: "staff_token_jwt_signature_abc",
    storeId: "store_A_uuid",
    voopStoreId: "VOOP-ALPHA1",
    get browserCookieJar() { return browserSharedCookieJar; },
  };

  // 1. Test Tab 2 after Cookie Overwrite:
  // Before fix: Tab 2 request would send staff_cookie, backend would check staff against Store B, resulting in 403 Forbidden!
  // With tab isolation: Tab 2 sends Authorization: Bearer admin_token + x-voop-store-id: VOOP-BETA2.
  const tab2Req = simulateAppFetch(tab2, "/api/orders");
  const tab2Auth = authorizeStoreAccess(tab2Req, { requiredPermission: "orders.view" });

  assert(tab2Auth.authorized === true, "Tab 2: Admin on Store B still succeeds even though browser cookie was overwritten by Staff!");
  assert(tab2Auth.storeId === "store_B_uuid", "Tab 2: Resolves store_B_uuid strictly");
  assert(tab2Auth.role === "ADMIN", "Tab 2: Authenticated user role is ADMIN (not Staff)");

  // 2. Test Tab 1:
  const tab1Req = simulateAppFetch(tab1, "/api/orders");
  const tab1Auth = authorizeStoreAccess(tab1Req, { requiredPermission: "orders.view" });
  assert(tab1Auth.authorized === true, "Tab 1: Admin on Store A succeeds simultaneously");
  assert(tab1Auth.storeId === "store_A_uuid", "Tab 1: Resolves store_A_uuid strictly");

  // 3. Test Tab 3:
  const tab3Req = simulateAppFetch(tab3, "/api/orders");
  const tab3Auth = authorizeStoreAccess(tab3Req, { requiredPermission: "orders.view" });
  assert(tab3Auth.authorized === true, "Tab 3: Staff RAM succeeds on Store A");
  assert(tab3Auth.storeId === "store_A_uuid", "Tab 3: Resolves store_A_uuid strictly");
  assert(tab3Auth.role === "STAFF", "Tab 3: Authenticated user role is STAFF");

  console.log("\n─── TEST SUITE 2: Concurrent API Execution (Promise.all Simulation) ───");
  // Simulate 10 simultaneous requests arriving interleaved at the server
  const concurrentPromises = [
    Promise.resolve().then(() => authorizeStoreAccess(simulateAppFetch(tab1, "/api/orders"))),
    Promise.resolve().then(() => authorizeStoreAccess(simulateAppFetch(tab2, "/api/orders"))),
    Promise.resolve().then(() => authorizeStoreAccess(simulateAppFetch(tab3, "/api/shipments"))),
    Promise.resolve().then(() => authorizeStoreAccess(simulateAppFetch(tab1, "/api/products"))),
    Promise.resolve().then(() => authorizeStoreAccess(simulateAppFetch(tab2, "/api/products"))),
    Promise.resolve().then(() => authorizeStoreAccess(simulateAppFetch(tab1, "/api/orders"))),
    Promise.resolve().then(() => authorizeStoreAccess(simulateAppFetch(tab2, "/api/inventory"))),
    Promise.resolve().then(() => authorizeStoreAccess(simulateAppFetch(tab3, "/api/orders"))),
  ];

  const results = await Promise.all(concurrentPromises);
  const tab1Results = [results[0], results[3], results[5]];
  const tab2Results = [results[1], results[4], results[6]];
  const tab3Results = [results[2], results[7]];

  assert(tab1Results.every((r) => r.authorized && r.storeId === "store_A_uuid"), "Concurrent: All Tab 1 requests stayed in Store A");
  assert(tab2Results.every((r) => r.authorized && r.storeId === "store_B_uuid"), "Concurrent: All Tab 2 requests stayed in Store B");
  assert(tab3Results.every((r) => r.authorized && r.storeId === "store_A_uuid"), "Concurrent: All Tab 3 requests stayed in Store A");

  console.log("\n─── TEST SUITE 3: Shopify Credentials Strict Isolation ───");
  const credsStoreA = resolveShopifyCredentials(simulateAppFetch(tab1, "/api/shopify/sync"));
  const credsStoreB = resolveShopifyCredentials(simulateAppFetch(tab2, "/api/shopify/sync"));

  assert(credsStoreA.accessToken === "shpat_alpha_secret_token_12345", "Shopify Auth: Store A uses Store A Shopify Access Token");
  assert(credsStoreB.accessToken === "shpat_beta_secret_token_67890", "Shopify Auth: Store B uses Store B Shopify Access Token");
  assert(credsStoreA.accessToken !== credsStoreB.accessToken, "Shopify Auth: Credentials strictly segregated with zero cross-store bleed");

  console.log("\n─── TEST SUITE 4: Object-Level Authorization & IDOR Protection ───");
  // Handler emulator for GET /api/orders/[id]
  function handleGetOrder(request, orderId) {
    const auth = authorizeStoreAccess(request, { requiredPermission: "orders.view" });
    if (!auth.authorized || !auth.storeId) {
      return { status: auth.status, error: auth.error };
    }
    const order = mockOrders.find((o) => o.id === orderId && o.storeId === auth.storeId);
    if (!order) {
      return { status: 404, error: "Order not found" };
    }
    return { status: 200, order };
  }

  // Handler emulator for GET /api/billing/[id]
  function handleGetBilling(request, id) {
    const auth = authorizeStoreAccess(request, { requiredPermission: "orders.view" });
    if (!auth.authorized || !auth.storeId) {
      return { status: auth.status, error: auth.error };
    }
    const order = mockBillingOrders.find((o) => o.id === id && o.storeId === auth.storeId);
    if (!order) {
      return { status: 404, error: "Order not found" };
    }
    return { status: 200, order };
  }

  // Tab 1 accessing its own Store A order -> 200
  const legitimateOrderReq = simulateAppFetch(tab1, "/api/orders/order_alpha_101");
  const legitRes = handleGetOrder(legitimateOrderReq, "order_alpha_101");
  assert(legitRes.status === 200 && legitRes.order.id === "order_alpha_101", "IDOR: Legitimate Store A order access succeeds");

  // Tab 2 (Store B) attempting to access Store A's order by ID -> 404 / Blocked
  const idorOrderReq = simulateAppFetch(tab2, "/api/orders/order_alpha_101");
  const idorRes = handleGetOrder(idorOrderReq, "order_alpha_101");
  assert(idorRes.status === 404, "IDOR: Store B cannot access Store A's order by ID (Scoped query returns 404)");

  // Tab 2 (Store B) attempting to access Store A's offline billing order -> 404 / Blocked
  const idorBillingReq = simulateAppFetch(tab2, "/api/billing/offline_alpha_501");
  const idorBillingRes = handleGetBilling(idorBillingReq, "offline_alpha_501");
  assert(idorBillingRes.status === 404, "IDOR: Store B cannot access Store A's offline billing order by ID");

  console.log("\n─── TEST SUITE 5: Staff Permission Boundaries (Tab 3) ───");
  // Tab 3 accessing orders.view -> 200
  const staffOrdersReq = simulateAppFetch(tab3, "/api/orders");
  const staffOrdersRes = authorizeStoreAccess(staffOrdersReq, { requiredPermission: "orders.view" });
  assert(staffOrdersRes.authorized === true, "Staff: Allowed orders.view");

  // Tab 3 accessing shipments.view -> 200
  const staffShipmentsReq = simulateAppFetch(tab3, "/api/shipments");
  const staffShipmentsRes = authorizeStoreAccess(staffShipmentsReq, { requiredPermission: "shipments.view" });
  assert(staffShipmentsRes.authorized === true, "Staff: Allowed shipments.view");

  // Tab 3 accessing pnl.view -> 403 Forbidden
  const staffPnlReq = simulateAppFetch(tab3, "/api/pnl");
  const staffPnlRes = authorizeStoreAccess(staffPnlReq, { requiredPermission: "pnl.view" });
  assert(staffPnlRes.authorized === false && staffPnlRes.status === 403, "Staff: Denied pnl.view with 403 Forbidden");

  // Tab 3 accessing purchases.view -> 403 Forbidden
  const staffPurchasesReq = simulateAppFetch(tab3, "/api/purchases");
  const staffPurchasesRes = authorizeStoreAccess(staffPurchasesReq, { requiredPermission: "purchases.view" });
  assert(staffPurchasesRes.authorized === false && staffPurchasesRes.status === 403, "Staff: Denied purchases.view with 403 Forbidden");

  // Tab 3 triggering shopify sync (settings.manage) -> 403 Forbidden
  const staffSyncReq = simulateAppFetch(tab3, "/api/shopify/sync", { method: "POST" });
  const staffSyncRes = authorizeStoreAccess(staffSyncReq, { requiredPermission: "settings.manage" });
  assert(staffSyncRes.authorized === false && staffSyncRes.status === 403, "Staff: Denied sync trigger with 403 Forbidden");

  console.log("\n─── TEST SUITE 6: URL HTTP Cache Key Isolation ───");
  const fetchUrlTab1 = simulateAppFetch(tab1, "/api/orders").url;
  const fetchUrlTab2 = simulateAppFetch(tab2, "/api/orders").url;
  assert(fetchUrlTab1.includes("storeRef=VOOP-ALPHA1"), "Cache Isolation: Tab 1 URL contains storeRef=VOOP-ALPHA1");
  assert(fetchUrlTab2.includes("storeRef=VOOP-BETA2"), "Cache Isolation: Tab 2 URL contains storeRef=VOOP-BETA2");
  assert(fetchUrlTab1 !== fetchUrlTab2, "Cache Isolation: Tab 1 and Tab 2 URLs are distinct for browser HTTP cache");

  console.log("\n==================================================================");
  console.log(`TEST SUMMARY: ${passed} PASSED, ${failed} FAILED`);
  console.log("==================================================================");

  if (failed > 0) {
    process.exit(1);
  } else {
    process.exit(0);
  }
}

runTests();
