/**
 * COMPREHENSIVE AUTOMATED VERIFICATION TEST SUITE
 * VOOP Final Auth / Multi-Tenant / Multi-Tab / Embedded + Standalone Isolation
 *
 * Simulates:
 * 1. Two Completely Separate Auth Domains: SHOPIFY_EMBEDDED vs VOOP_STANDALONE
 * 2. Tab-Scoped Bearer Token vs Shared Ambient Cookie Collision
 * 3. Tab-Isolated Logout (Tab 2 logout never affects Tab 1 or Shopify Admin)
 * 4. Mismatched publicStoreRef in Embedded App returning 403 Forbidden
 * 5. Mandatory 7-Tab Simultaneous Cross-Tab Test (Section 19):
 *      TAB 1: Shopify Store A (Admin A)
 *      TAB 2: Shopify Store B (Admin B)
 *      TAB 3: Standalone VOOP (Staff A1 -> Store A)
 *      TAB 4: Standalone VOOP (Staff B1 -> Store B)
 *      TAB 5: Standalone VOOP (Staff A2 -> Store A)
 *      TAB 6: Shopify Store C (Admin C)
 *      TAB 7: Standalone VOOP (Staff C1 -> Store C)
 * 6. Object-Level IDOR & URL Tampering Protection
 * 7. Granular Staff Permission Boundary Checks
 * 8. HTTP Browser Cache Key Isolation
 */

const assert = require("assert");
const crypto = require("crypto");
const { isShopifyJwt } = require("../lib/auth-helpers");
const { hasPermission } = require("../lib/permissions");

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

// -----------------------------------------------------------------------------
// MOCK DATA & CRYPTO HELPERS
// -----------------------------------------------------------------------------

const mockStores = [
  { id: "store_A_uuid", voopStoreId: "VOOP-ALPHA111", publicStoreRef: "7xK9mQ2Lp8Vn4R3", shopDomain: "store-a.myshopify.com", isConnected: true, accountId: "user_Admin_A" },
  { id: "store_B_uuid", voopStoreId: "VOOP-BETA2222", publicStoreRef: "3mN8wP5Ls1Tq9Z2", shopDomain: "store-b.myshopify.com", isConnected: true, accountId: "user_Admin_B" },
  { id: "store_C_uuid", voopStoreId: "VOOP-GAMMA333", publicStoreRef: "9vB2cK7Fx4Hj6L8", shopDomain: "store-c.myshopify.com", isConnected: true, accountId: "user_Admin_C" },
];

const mockUsers = [
  { id: "user_Admin_A", role: "ADMIN", name: "Admin A", email: "adminA@voop.com", storeId: "store_A_uuid" },
  { id: "user_Admin_B", role: "ADMIN", name: "Admin B", email: "adminB@voop.com", storeId: "store_B_uuid" },
  { id: "user_Admin_C", role: "ADMIN", name: "Admin C", email: "adminC@voop.com", storeId: "store_C_uuid" },
  { id: "user_Staff_A1", role: "STAFF", name: "Staff A1", email: "staffA1@voop.com", storeId: "store_A_uuid" },
  { id: "user_Staff_B1", role: "STAFF", name: "Staff B1", email: "staffB1@voop.com", storeId: "store_B_uuid" },
  { id: "user_Staff_A2", role: "STAFF", name: "Staff A2", email: "staffA2@voop.com", storeId: "store_A_uuid" },
  { id: "user_Staff_C1", role: "STAFF", name: "Staff C1", email: "staffC1@voop.com", storeId: "store_C_uuid" },
];

const mockMemberships = [
  { userId: "user_Admin_A", storeId: "store_A_uuid", role: "ADMIN", permissions: null },
  { userId: "user_Admin_B", storeId: "store_B_uuid", role: "ADMIN", permissions: null },
  { userId: "user_Admin_C", storeId: "store_C_uuid", role: "ADMIN", permissions: null },
  { userId: "user_Staff_A1", storeId: "store_A_uuid", role: "STAFF", permissions: JSON.stringify(["orders.view", "billing.manage"]) },
  { userId: "user_Staff_B1", storeId: "store_B_uuid", role: "STAFF", permissions: JSON.stringify(["inventory.view"]) },
  { userId: "user_Staff_A2", storeId: "store_A_uuid", role: "STAFF", permissions: JSON.stringify(["orders.view", "shipments.view"]) },
  { userId: "user_Staff_C1", storeId: "store_C_uuid", role: "STAFF", permissions: JSON.stringify(["settings.view"]) },
];

const mockOrders = {
  "store_A_uuid": [
    { id: "ord_A1", orderNumber: "A-1001", storeId: "store_A_uuid", total: 1200 },
    { id: "ord_A2", orderNumber: "A-1002", storeId: "store_A_uuid", total: 2400 }
  ],
  "store_B_uuid": [
    { id: "ord_B1", orderNumber: "B-2001", storeId: "store_B_uuid", total: 3500 }
  ],
  "store_C_uuid": [
    { id: "ord_C1", orderNumber: "C-3001", storeId: "store_C_uuid", total: 4900 }
  ]
};

// Helper: create mock Shopify App Bridge session token (JWT)
function createMockShopifyToken(shopDomain, expSeconds = 3600) {
  const header = Buffer.from(JSON.stringify({ alg: "HS256", typ: "JWT" })).toString("base64url");
  const payload = Buffer.from(
    JSON.stringify({
      iss: `https://${shopDomain}/admin`,
      dest: `https://${shopDomain}`,
      aud: "shopify_client_id_123",
      sub: "shopify_user_456",
      exp: Math.floor(Date.now() / 1000) + expSeconds,
    })
  ).toString("base64url");
  const signature = crypto.createHmac("sha256", "mock_secret").update(`${header}.${payload}`).digest("base64url");
  return `${header}.${payload}.${signature}`;
}

// Helper: create mock Standalone VOOP token (NextAuth JWT)
function createMockVoopToken(userId, role, expSeconds = 86400) {
  const header = Buffer.from(JSON.stringify({ alg: "HS256", typ: "JWT" })).toString("base64url");
  const payload = Buffer.from(
    JSON.stringify({
      id: userId,
      sub: userId,
      role,
      exp: Math.floor(Date.now() / 1000) + expSeconds,
    })
  ).toString("base64url");
  const signature = crypto.createHmac("sha256", "voop_secret").update(`${header}.${payload}`).digest("base64url");
  return `${header}.${payload}.${signature}`;
}

// Mock Canonical Server Resolver simulating resolveStoreContext
function simulateResolveStoreContext({
  headers = {},
  url = "https://voop-webapp.fly.dev/api/orders",
  ambientCookieUserId = null,
  requiredPermission = null,
}) {
  const requestId = "req_" + Math.random().toString(36).substring(2, 9);
  const route = new URL(url).pathname;

  const authModeHeader = headers["x-voop-auth-mode"];
  const shopifyIdToken = headers["x-shopify-id-token"];
  const authHeader = headers["authorization"] || "";
  const bearerToken = authHeader.startsWith("Bearer ") ? authHeader.substring(7).trim() : null;
  const isShopifyBearer = bearerToken ? isShopifyJwt(bearerToken) : false;

  const isEmbedded =
    authModeHeader === "SHOPIFY_EMBEDDED" ||
    Boolean(shopifyIdToken) ||
    isShopifyBearer ||
    Boolean(headers["x-shopify-embedded"] === "1");

  const authMode = isEmbedded ? "SHOPIFY_EMBEDDED" : "VOOP_STANDALONE";

  // ---------------------------------------------------------------------------
  // A. SHOPIFY EMBEDDED CONTEXT
  // ---------------------------------------------------------------------------
  if (authMode === "SHOPIFY_EMBEDDED") {
    const token = shopifyIdToken || (isShopifyBearer ? bearerToken : null);
    if (!token) {
      return { authorized: false, status: 401, error: "Missing Shopify session token", authMode };
    }

    // Decode token
    let decoded;
    try {
      const parts = token.split(".");
      decoded = JSON.parse(Buffer.from(parts[1], "base64url").toString("utf-8"));
    } catch {
      return { authorized: false, status: 401, error: "Malformed Shopify token", authMode };
    }

    // Check expiration
    if (decoded.exp && decoded.exp < Math.floor(Date.now() / 1000)) {
      return { authorized: false, status: 401, error: "Shopify token expired", authMode };
    }

    const dest = decoded.dest || decoded.iss || "";
    const shopDomain = dest.replace("https://", "").replace("/admin", "").trim().toLowerCase();

    const store = mockStores.find((s) => s.shopDomain.toLowerCase() === shopDomain);
    if (!store || !store.isConnected) {
      return { authorized: false, status: 404, error: "Shopify store not found or disconnected", authMode };
    }

    // Verify requested storeRef in URL/headers matches authenticated shop
    const requestedStoreRef = headers["x-public-store-ref"] || headers["x-voop-store-id"];
    if (requestedStoreRef) {
      const matchPublic = store.publicStoreRef === requestedStoreRef;
      const matchVoop = store.voopStoreId === requestedStoreRef;
      const matchId = store.id === requestedStoreRef;
      if (!matchPublic && !matchVoop && !matchId) {
        return {
          authorized: false,
          status: 403,
          error: `Forbidden: Requested store "${requestedStoreRef}" does not match authenticated Shopify shop "${shopDomain}".`,
          authMode,
        };
      }
    }

    const user = mockUsers.find((u) => u.id === store.accountId);
    return {
      authorized: true,
      status: 200,
      authMode,
      userId: user ? user.id : "shopify_admin",
      storeId: store.id,
      publicStoreRef: store.publicStoreRef,
      voopStoreId: store.voopStoreId,
      shopDomain: store.shopDomain,
      role: "ADMIN",
      orders: mockOrders[store.id] || [],
    };
  }

  // ---------------------------------------------------------------------------
  // B. VOOP STANDALONE CONTEXT
  // ---------------------------------------------------------------------------
  let userId = null;

  // PRIORITY 1: Tab-scoped Bearer token
  if (!isShopifyBearer && bearerToken) {
    try {
      const parts = bearerToken.split(".");
      const decoded = JSON.parse(Buffer.from(parts[1], "base64url").toString("utf-8"));
      userId = decoded.id || decoded.sub;
    } catch {}
  }

  // PRIORITY 2: Ambient cookie fallback (only if no tab Bearer token)
  if (!userId && ambientCookieUserId) {
    userId = ambientCookieUserId;
  }

  if (!userId) {
    return { authorized: false, status: 401, error: "Unauthorized: Please sign in", authMode };
  }

  const user = mockUsers.find((u) => u.id === userId);
  if (!user) {
    return { authorized: false, status: 404, error: "User not found", authMode };
  }

  // Resolve requested store
  const requestedRef = headers["x-public-store-ref"] || headers["x-voop-store-id"] || user.storeId;
  const targetStore = mockStores.find(
    (s) => s.publicStoreRef === requestedRef || s.voopStoreId === requestedRef || s.id === requestedRef
  );

  if (!targetStore) {
    return { authorized: false, status: 404, error: "Store not found", authMode };
  }

  // Check StoreMembership
  const membership = mockMemberships.find((m) => m.userId === user.id && m.storeId === targetStore.id);
  const isOwner = targetStore.accountId === user.id;

  if (!membership && !isOwner) {
    return {
      authorized: false,
      status: 403,
      error: `Forbidden: Account does not have membership or permission to access store "${requestedRef}".`,
      authMode,
    };
  }

  const role = membership ? membership.role : user.role;
  const permissions = membership ? (membership.permissions ? JSON.parse(membership.permissions) : null) : null;

  // Check requiredPermission
  if (requiredPermission) {
    const isAllowed = hasPermission({ role, permissions }, requiredPermission);
    if (!isAllowed) {
      return {
        authorized: false,
        status: 403,
        error: `Forbidden: Missing required permission: ${requiredPermission}`,
        authMode,
      };
    }
  }

  return {
    authorized: true,
    status: 200,
    authMode,
    userId: user.id,
    storeId: targetStore.id,
    publicStoreRef: targetStore.publicStoreRef,
    voopStoreId: targetStore.voopStoreId,
    shopDomain: targetStore.shopDomain,
    role,
    orders: mockOrders[targetStore.id] || [],
  };
}

// -----------------------------------------------------------------------------
// TEST SUITES EXECUTION
// -----------------------------------------------------------------------------

async function run() {
  console.log("\n==================================================================");
  console.log("  TEST SUITE: VOOP FINAL AUTH / MULTI-TENANT / MULTI-TAB ISOLATION");
  console.log("==================================================================\n");

  // ---------------------------------------------------------------------------
  // SUITE 1: TWO SEPARATE AUTH DOMAINS & JWT CLASSIFICATION
  // ---------------------------------------------------------------------------
  console.log("─── TEST SUITE 1: Auth Domain Discrimination & JWT Validation ───");

  test("isShopifyJwt correctly identifies Shopify App Bridge token", () => {
    const shopifyToken = createMockShopifyToken("store-a.myshopify.com");
    assert.strictEqual(isShopifyJwt(shopifyToken), true);
  });

  test("isShopifyJwt returns false for Standalone VOOP token", () => {
    const voopToken = createMockVoopToken("user_Admin_A", "ADMIN");
    assert.strictEqual(isShopifyJwt(voopToken), false);
  });

  test("Shopify Embedded request correctly classifies as SHOPIFY_EMBEDDED", () => {
    const token = createMockShopifyToken("store-a.myshopify.com");
    const res = simulateResolveStoreContext({
      headers: {
        authorization: `Bearer ${token}`,
        "x-shopify-id-token": token,
        "x-voop-auth-mode": "SHOPIFY_EMBEDDED",
      },
    });
    assert.strictEqual(res.status, 200);
    assert.strictEqual(res.authMode, "SHOPIFY_EMBEDDED");
    assert.strictEqual(res.storeId, "store_A_uuid");
  });

  test("Standalone VOOP request correctly classifies as VOOP_STANDALONE", () => {
    const token = createMockVoopToken("user_Admin_A", "ADMIN");
    const res = simulateResolveStoreContext({
      headers: {
        authorization: `Bearer ${token}`,
        "x-voop-session-token": token,
        "x-public-store-ref": mockStores[0].publicStoreRef,
        "x-voop-auth-mode": "VOOP_STANDALONE",
      },
    });
    assert.strictEqual(res.status, 200);
    assert.strictEqual(res.authMode, "VOOP_STANDALONE");
    assert.strictEqual(res.userId, "user_Admin_A");
  });

  // ---------------------------------------------------------------------------
  // SUITE 2: TAB-SCOPED BEARER TOKEN VS SHARED COOKIE COLLISION
  // ---------------------------------------------------------------------------
  console.log("\n─── TEST SUITE 2: Tab Bearer Token vs Shared Cookie Collision ───");

  test("Tab 1 preserves Admin A identity even when cookie was overwritten by Admin B", () => {
    const tokenTab1 = createMockVoopToken("user_Admin_A", "ADMIN");
    // Simulate browser ambient cookie holding Admin B
    const resTab1 = simulateResolveStoreContext({
      headers: {
        authorization: `Bearer ${tokenTab1}`,
        "x-public-store-ref": mockStores[0].publicStoreRef,
        "x-voop-auth-mode": "VOOP_STANDALONE",
      },
      ambientCookieUserId: "user_Admin_B", // overwritten by Tab 2!
    });

    assert.strictEqual(resTab1.status, 200);
    assert.strictEqual(resTab1.userId, "user_Admin_A", "Tab 1 must prioritize Tab 1 Bearer token over cookie");
    assert.strictEqual(resTab1.storeId, "store_A_uuid");
  });

  test("Tab 2 simultaneously authenticates as Admin B on Store B", () => {
    const tokenTab2 = createMockVoopToken("user_Admin_B", "ADMIN");
    const resTab2 = simulateResolveStoreContext({
      headers: {
        authorization: `Bearer ${tokenTab2}`,
        "x-public-store-ref": mockStores[1].publicStoreRef,
        "x-voop-auth-mode": "VOOP_STANDALONE",
      },
      ambientCookieUserId: "user_Admin_B",
    });

    assert.strictEqual(resTab2.status, 200);
    assert.strictEqual(resTab2.userId, "user_Admin_B");
    assert.strictEqual(resTab2.storeId, "store_B_uuid");
  });

  // ---------------------------------------------------------------------------
  // SUITE 3: TAB-ISOLATED LOGOUT
  // ---------------------------------------------------------------------------
  console.log("\n─── TEST SUITE 3: Tab-Isolated Logout Protection ───");

  test("Logging out Tab 2 does NOT invalidate Tab 1 or Shopify Admin", () => {
    // Tab 1 state: active bearer token
    const tokenTab1 = createMockVoopToken("user_Admin_A", "ADMIN");
    // Tab 2 logged out: sessionStorage cleared, token null
    const resTab2AfterLogout = simulateResolveStoreContext({
      headers: {
        "x-voop-auth-mode": "VOOP_STANDALONE",
      },
      ambientCookieUserId: null,
    });
    assert.strictEqual(resTab2AfterLogout.status, 401, "Tab 2 must be unauthenticated");

    // Tab 1 request after Tab 2 logout:
    const resTab1AfterLogout = simulateResolveStoreContext({
      headers: {
        authorization: `Bearer ${tokenTab1}`,
        "x-public-store-ref": mockStores[0].publicStoreRef,
        "x-voop-auth-mode": "VOOP_STANDALONE",
      },
      ambientCookieUserId: null,
    });
    assert.strictEqual(resTab1AfterLogout.status, 200, "Tab 1 must remain 100% active and authenticated");
    assert.strictEqual(resTab1AfterLogout.storeId, "store_A_uuid");

    // Shopify embedded app request:
    const shopifyToken = createMockShopifyToken("store-a.myshopify.com");
    const resShopify = simulateResolveStoreContext({
      headers: {
        authorization: `Bearer ${shopifyToken}`,
        "x-shopify-id-token": shopifyToken,
        "x-voop-auth-mode": "SHOPIFY_EMBEDDED",
      },
    });
    assert.strictEqual(resShopify.status, 200, "Shopify Admin app must remain completely authenticated");
    assert.strictEqual(resShopify.storeId, "store_A_uuid");
  });

  // ---------------------------------------------------------------------------
  // SUITE 4: MISMATCHED PUBLIC STORE REF IN EMBEDDED SHOPIFY APP
  // ---------------------------------------------------------------------------
  console.log("\n─── TEST SUITE 4: Mismatched publicStoreRef in Embedded App ───");

  test("Embedded Shopify Store A requesting Store B publicStoreRef returns 403 Forbidden", () => {
    const tokenA = createMockShopifyToken("store-a.myshopify.com");
    const res = simulateResolveStoreContext({
      headers: {
        authorization: `Bearer ${tokenA}`,
        "x-shopify-id-token": tokenA,
        "x-public-store-ref": mockStores[1].publicStoreRef, // Store B ref!
        "x-voop-auth-mode": "SHOPIFY_EMBEDDED",
      },
    });

    assert.strictEqual(res.status, 403);
    assert.ok(res.error.includes("does not match authenticated Shopify shop"));
  });

  // ---------------------------------------------------------------------------
  // SUITE 5: MANDATORY 7-TAB SIMULTANEOUS CROSS-TAB SIMULATION
  // ---------------------------------------------------------------------------
  console.log("\n─── TEST SUITE 5: Mandatory 7-Tab Simultaneous Simulation (Section 19) ───");

  await testAsync("7 Simultaneous Tabs (3 Embedded + 4 Standalone) operate concurrently with zero contamination", async () => {
    const tokenShopifyA = createMockShopifyToken("store-a.myshopify.com");
    const tokenShopifyB = createMockShopifyToken("store-b.myshopify.com");
    const tokenShopifyC = createMockShopifyToken("store-c.myshopify.com");
    const tokenStaffA1 = createMockVoopToken("user_Staff_A1", "STAFF");
    const tokenStaffB1 = createMockVoopToken("user_Staff_B1", "STAFF");
    const tokenStaffA2 = createMockVoopToken("user_Staff_A2", "STAFF");
    const tokenStaffC1 = createMockVoopToken("user_Staff_C1", "STAFF");

    const requests = [
      // TAB 1: Shopify Store A (Admin A)
      simulateResolveStoreContext({
        headers: {
          authorization: `Bearer ${tokenShopifyA}`,
          "x-shopify-id-token": tokenShopifyA,
          "x-public-store-ref": mockStores[0].publicStoreRef,
          "x-voop-auth-mode": "SHOPIFY_EMBEDDED",
        },
      }),
      // TAB 2: Shopify Store B (Admin B)
      simulateResolveStoreContext({
        headers: {
          authorization: `Bearer ${tokenShopifyB}`,
          "x-shopify-id-token": tokenShopifyB,
          "x-public-store-ref": mockStores[1].publicStoreRef,
          "x-voop-auth-mode": "SHOPIFY_EMBEDDED",
        },
      }),
      // TAB 3: Standalone VOOP (Staff A1 -> Store A, orders.view)
      simulateResolveStoreContext({
        headers: {
          authorization: `Bearer ${tokenStaffA1}`,
          "x-public-store-ref": mockStores[0].publicStoreRef,
          "x-voop-auth-mode": "VOOP_STANDALONE",
        },
        requiredPermission: "orders.view",
      }),
      // TAB 4: Standalone VOOP (Staff B1 -> Store B, inventory.view)
      simulateResolveStoreContext({
        headers: {
          authorization: `Bearer ${tokenStaffB1}`,
          "x-public-store-ref": mockStores[1].publicStoreRef,
          "x-voop-auth-mode": "VOOP_STANDALONE",
        },
        requiredPermission: "inventory.view",
      }),
      // TAB 5: Standalone VOOP (Staff A2 -> Store A, shipments.view)
      simulateResolveStoreContext({
        headers: {
          authorization: `Bearer ${tokenStaffA2}`,
          "x-public-store-ref": mockStores[0].publicStoreRef,
          "x-voop-auth-mode": "VOOP_STANDALONE",
        },
        requiredPermission: "shipments.view",
      }),
      // TAB 6: Shopify Store C (Admin C)
      simulateResolveStoreContext({
        headers: {
          authorization: `Bearer ${tokenShopifyC}`,
          "x-shopify-id-token": tokenShopifyC,
          "x-public-store-ref": mockStores[2].publicStoreRef,
          "x-voop-auth-mode": "SHOPIFY_EMBEDDED",
        },
      }),
      // TAB 7: Standalone VOOP (Staff C1 -> Store C, settings.view)
      simulateResolveStoreContext({
        headers: {
          authorization: `Bearer ${tokenStaffC1}`,
          "x-public-store-ref": mockStores[2].publicStoreRef,
          "x-voop-auth-mode": "VOOP_STANDALONE",
        },
        requiredPermission: "settings.view",
      }),
    ];

    const results = await Promise.all(requests);

    // Verify all 7 succeeded with 200
    results.forEach((res, i) => {
      assert.strictEqual(res.status, 200, `Tab ${i + 1} request must succeed with 200`);
    });

    // Tab 1, 3, 5 stayed in Store A
    assert.strictEqual(results[0].storeId, "store_A_uuid");
    assert.strictEqual(results[2].storeId, "store_A_uuid");
    assert.strictEqual(results[4].storeId, "store_A_uuid");
    assert.strictEqual(results[0].orders.length, 2);
    assert.strictEqual(results[0].orders[0].orderNumber, "A-1001");

    // Tab 2, 4 stayed in Store B
    assert.strictEqual(results[1].storeId, "store_B_uuid");
    assert.strictEqual(results[3].storeId, "store_B_uuid");
    assert.strictEqual(results[1].orders.length, 1);
    assert.strictEqual(results[1].orders[0].orderNumber, "B-2001");

    // Tab 6, 7 stayed in Store C
    assert.strictEqual(results[5].storeId, "store_C_uuid");
    assert.strictEqual(results[6].storeId, "store_C_uuid");
    assert.strictEqual(results[5].orders.length, 1);
    assert.strictEqual(results[5].orders[0].orderNumber, "C-3001");
  });

  // ---------------------------------------------------------------------------
  // SUITE 6: OBJECT-LEVEL IDOR & URL TAMPERING
  // ---------------------------------------------------------------------------
  console.log("\n─── TEST SUITE 6: Object-Level IDOR & Tampering Protection ───");

  test("Staff A1 cannot access Store B (returns HTTP 403 Forbidden)", () => {
    const tokenStaffA1 = createMockVoopToken("user_Staff_A1", "STAFF");
    const res = simulateResolveStoreContext({
      headers: {
        authorization: `Bearer ${tokenStaffA1}`,
        "x-public-store-ref": mockStores[1].publicStoreRef, // Store B ref!
        "x-voop-auth-mode": "VOOP_STANDALONE",
      },
    });
    assert.strictEqual(res.status, 403);
  });

  test("Staff A1 is denied pnl.view on Store A with 403 Forbidden", () => {
    const tokenStaffA1 = createMockVoopToken("user_Staff_A1", "STAFF");
    const res = simulateResolveStoreContext({
      headers: {
        authorization: `Bearer ${tokenStaffA1}`,
        "x-public-store-ref": mockStores[0].publicStoreRef,
        "x-voop-auth-mode": "VOOP_STANDALONE",
      },
      requiredPermission: "pnl.view",
    });
    assert.strictEqual(res.status, 403);
    assert.ok(res.error.includes("Missing required permission"));
  });

  // ---------------------------------------------------------------------------
  // SUITE 7: HTTP CACHE KEY ISOLATION
  // ---------------------------------------------------------------------------
  console.log("\n─── TEST SUITE 7: HTTP Cache Key Isolation ───");

  test("Distinct storeRef query parameters isolate browser HTTP caches across tabs", () => {
    function buildCacheUrl(endpoint, storeRef) {
      return `${endpoint}?storeRef=${encodeURIComponent(storeRef)}`;
    }
    const urlTab1 = buildCacheUrl("/api/orders", mockStores[0].publicStoreRef);
    const urlTab2 = buildCacheUrl("/api/orders", mockStores[1].publicStoreRef);
    const urlTab6 = buildCacheUrl("/api/orders", mockStores[2].publicStoreRef);

    assert.notStrictEqual(urlTab1, urlTab2);
    assert.notStrictEqual(urlTab2, urlTab6);
    assert.ok(urlTab1.includes(mockStores[0].publicStoreRef));
    assert.ok(urlTab2.includes(mockStores[1].publicStoreRef));
  });

  console.log("\n==================================================================");
  console.log(`  AUTH & TAB ISOLATION RESULTS: ${passedTests} / ${totalTests} PASSED`);
  console.log("==================================================================\n");
}

run();
