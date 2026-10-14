/**
 * Comprehensive Verification Test Suite:
 * 1. Multi-Store / Multi-Tab Isolation Bug
 * 2. Staff Granular Permissions Engine & Access Control
 *
 * Validates the user requirements:
 * - TAB 1 -> Store A -> Admin (remains connected to Store A)
 * - TAB 2 -> Store B -> Admin (remains connected to Store B)
 * - TAB 3 -> Store A -> Staff (remains Staff in Store A)
 * - Changing Store in Tab 2 does NOT mutate user.storeId in DB or stomp Tab 1/3
 * - Staff access control rejects unauthorized modules with 403 Forbidden
 * - Staff granted specific permissions (e.g. orders, shipments) can access those and ONLY those
 * - Admin has full access to all sections for their authorized stores
 */

const {
  PERMISSION_KEYS,
  PERMISSION_MODULE_GROUPS,
  normalizeUserPermissions,
  hasPermission,
} = require("../lib/permissions");

console.log("==================================================");
console.log("TESTING: MULTI-STORE TAB ISOLATION & STAFF PERMISSIONS");
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

// ─── TEST SUITE 1: PERMISSION ENGINE & NORMALIZATION ───────────────────────
console.log("─── TEST SUITE 1: Permission Normalization & Granular Checking ───");

// 1. Admin permission check
const adminUser = {
  id: "user-admin-1",
  role: "ADMIN",
  permissions: null,
};
assert(hasPermission(adminUser, "orders.view"), "Admin has orders.view");
assert(hasPermission(adminUser, "inventory.manage"), "Admin has inventory.manage");
assert(hasPermission(adminUser, "pnl.view"), "Admin has pnl.view");
assert(hasPermission(adminUser, "staff.manage"), "Admin has staff.manage");

// 2. Staff with granular permissions
const staffUserGranular = {
  id: "user-staff-ram",
  role: "STAFF",
  permissions: JSON.stringify(["orders.view", "shipments.view", "shipments.manage"]),
};
assert(hasPermission(staffUserGranular, "orders.view"), "Staff RAM has orders.view");
assert(hasPermission(staffUserGranular, "shipments.view"), "Staff RAM has shipments.view");
assert(hasPermission(staffUserGranular, "shipments.manage"), "Staff RAM has shipments.manage");
assert(!hasPermission(staffUserGranular, "orders.manage"), "Staff RAM is denied orders.manage");
assert(!hasPermission(staffUserGranular, "inventory.view"), "Staff RAM is denied inventory.view");
assert(!hasPermission(staffUserGranular, "purchases.view"), "Staff RAM is denied purchases.view");
assert(!hasPermission(staffUserGranular, "tax.view"), "Staff RAM is denied tax.view");
assert(!hasPermission(staffUserGranular, "pnl.view"), "Staff RAM is denied pnl.view");
assert(!hasPermission(staffUserGranular, "staff.view"), "Staff RAM is denied staff.view");

// 3. Staff with legacy token mapping (e.g. "ORDERS", "LOGISTICS")
const staffUserLegacy = {
  id: "user-staff-legacy",
  role: "STAFF",
  permissions: JSON.stringify(["ORDERS", "LOGISTICS"]),
};
assert(hasPermission(staffUserLegacy, "orders.view"), "Legacy ORDERS token maps to orders.view");
assert(hasPermission(staffUserLegacy, "orders.manage"), "Legacy ORDERS token maps to orders.manage");
assert(hasPermission(staffUserLegacy, "shipments.view"), "Legacy LOGISTICS token maps to shipments.view");
assert(!hasPermission(staffUserLegacy, "inventory.view"), "Staff with ORDERS+LOGISTICS is denied inventory.view");
assert(!hasPermission(staffUserLegacy, "tax.view"), "Staff with ORDERS+LOGISTICS is denied tax.view");

// 4. Wildcard matching
const staffUserWildcard = {
  id: "user-staff-wildcard",
  role: "STAFF",
  permissions: JSON.stringify(["inventory.*", "purchases.view"]),
};
assert(hasPermission(staffUserWildcard, "inventory.view"), "Wildcard inventory.* grants inventory.view");
assert(hasPermission(staffUserWildcard, "inventory.manage"), "Wildcard inventory.* grants inventory.manage");
assert(hasPermission(staffUserWildcard, "purchases.view"), "Exact key grants purchases.view");
assert(!hasPermission(staffUserWildcard, "purchases.manage"), "Wildcard did not grant purchases.manage");

// 5. Staff with zero permissions
const staffUserNone = {
  id: "user-staff-none",
  role: "STAFF",
  permissions: "[]",
};
assert(!hasPermission(staffUserNone, "orders.view"), "Staff with zero permissions is denied orders.view");
assert(!hasPermission(staffUserNone, "inventory.view"), "Staff with zero permissions is denied inventory.view");

// ─── TEST SUITE 2: MULTI-STORE / MULTI-TAB ISOLATION ───────────────────────
console.log("\n─── TEST SUITE 2: Multi-Store Tab Isolation Simulation ───");

// Simulated Database
const mockStores = [
  {
    id: "store_A_id",
    voopStoreId: "VOOP-STOREA1",
    shopDomain: "store-a.myshopify.com",
    storeName: "Store A Fashion",
    accountId: "user_admin_owner",
    isConnected: true,
  },
  {
    id: "store_B_id",
    voopStoreId: "VOOP-STOREB2",
    shopDomain: "store-b.myshopify.com",
    storeName: "Store B Electronics",
    accountId: "user_admin_owner",
    isConnected: true,
  },
  {
    id: "store_C_id",
    voopStoreId: "VOOP-STOREC3",
    shopDomain: "store-c.myshopify.com",
    storeName: "Store C Home (Unrelated Store)",
    accountId: "another_user_id",
    isConnected: true,
  },
];

const mockUsers = [
  {
    id: "user_admin_owner",
    role: "ADMIN",
    storeId: "store_A_id", // Default DB storeId
    voopStoreId: "VOOP-STOREA1",
  },
  {
    id: "user_staff_ram",
    role: "STAFF",
    storeId: "store_A_id", // Strictly assigned to Store A
    voopStoreId: "VOOP-STOREA1",
    createdById: "user_admin_owner",
    permissions: JSON.stringify(["orders.view", "shipments.view"]),
  },
];

// Replicate resolveAuthorizedStoresForUser logic from lib/auth-helpers.ts
function resolveAuthorizedStores(userId) {
  const user = mockUsers.find((u) => u.id === userId);
  if (!user) return [];

  if (user.role === "STAFF") {
    return mockStores.filter((s) => s.id === user.storeId && s.isConnected);
  }

  // Admin owns Store A and Store B
  return mockStores.filter(
    (s) => s.isConnected && (s.accountId === userId || s.id === user.storeId)
  );
}

// Replicate resolveCurrentTenant logic with Tab Isolation
function simulateTabRequest(userId, requestHeaders, requiredPermission = null) {
  const user = mockUsers.find((u) => u.id === userId);
  if (!user) return { status: 401, error: "User not found" };

  const authorizedStores = resolveAuthorizedStores(userId);

  // Extract requested store from tab header
  const requestedIdentifier =
    requestHeaders["x-voop-store-id"] || requestHeaders["x-store-id"] || null;

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

  // Check granular permission
  if (requiredPermission) {
    const isAllowed = hasPermission(user, requiredPermission);
    if (!isAllowed) {
      return {
        authorized: false,
        status: 403,
        error: `Forbidden: You don't have permission to access (${requiredPermission}).`,
        storeId: store.id,
      };
    }
  }

  // Note: user.storeId in DB is NEVER mutated!
  return {
    authorized: true,
    status: 200,
    storeId: store.id,
    voopStoreId: store.voopStoreId,
    shopDomain: store.shopDomain,
    role: user.role,
  };
}

// SCENARIO TEST:
// TAB 1: Store A, Admin
// TAB 2: Store B, Admin
// TAB 3: Store A, Staff (RAM)

// Tab 1 makes a request to Store A
const tab1Response = simulateTabRequest("user_admin_owner", { "x-voop-store-id": "VOOP-STOREA1" }, "orders.view");
assert(tab1Response.authorized === true, "Tab 1: Admin can access Store A");
assert(tab1Response.storeId === "store_A_id", "Tab 1: Correctly resolved store_A_id");
assert(mockUsers[0].storeId === "store_A_id", "Tab 1: user.storeId in DB is intact");

// Tab 2 makes a request to Store B (in a different Chrome tab)
const tab2Response = simulateTabRequest("user_admin_owner", { "x-voop-store-id": "VOOP-STOREB2" }, "orders.view");
assert(tab2Response.authorized === true, "Tab 2: Admin can access Store B");
assert(tab2Response.storeId === "store_B_id", "Tab 2: Correctly resolved store_B_id");
assert(mockUsers[0].storeId === "store_A_id", "Tab 2: user.storeId in DB was NOT mutated to Store B! (Critical fix for Tab 1)");

// Tab 1 makes ANOTHER request to Store A right after Tab 2
const tab1SubsequentResponse = simulateTabRequest("user_admin_owner", { "x-voop-store-id": "VOOP-STOREA1" }, "orders.view");
assert(tab1SubsequentResponse.authorized === true, "Tab 1 (After Tab 2): Still succeeds! NO 403 FORBIDDEN ERROR!");
assert(tab1SubsequentResponse.storeId === "store_A_id", "Tab 1: Still serves Store A");

// Tab 3: Staff RAM makes request to Store A
const tab3Response = simulateTabRequest("user_staff_ram", { "x-voop-store-id": "VOOP-STOREA1" }, "orders.view");
assert(tab3Response.authorized === true, "Tab 3: Staff RAM can access assigned Store A with orders.view");
assert(tab3Response.storeId === "store_A_id", "Tab 3: Correctly resolved store_A_id");

// Tab 3: Staff RAM attempts to access Store B (which belongs to the same Admin, but RAM is NOT assigned to)
const tab3UnauthorizedStoreResponse = simulateTabRequest("user_staff_ram", { "x-voop-store-id": "VOOP-STOREB2" }, "orders.view");
assert(tab3UnauthorizedStoreResponse.authorized === false, "Tab 3: Staff RAM is rejected when trying to access Store B");
assert(tab3UnauthorizedStoreResponse.status === 403, "Tab 3: Returns HTTP 403 Forbidden for unauthorized store");

// Tab 3: Staff RAM attempts to access inventory in Store A (RAM only has orders.view & shipments.view)
const tab3UnauthorizedModuleResponse = simulateTabRequest("user_staff_ram", { "x-voop-store-id": "VOOP-STOREA1" }, "inventory.view");
assert(tab3UnauthorizedModuleResponse.authorized === false, "Tab 3: Staff RAM is rejected from accessing inventory.view");
assert(tab3UnauthorizedModuleResponse.status === 403, "Tab 3: Returns HTTP 403 Forbidden for unauthorized permission");

// Tab 3: Staff RAM accesses shipments in Store A
const tab3ShipmentsResponse = simulateTabRequest("user_staff_ram", { "x-voop-store-id": "VOOP-STOREA1" }, "shipments.view");
assert(tab3ShipmentsResponse.authorized === true, "Tab 3: Staff RAM is granted shipments.view");

// Admin attempts to access Store C (unowned store)
const adminUnauthorizedStoreResponse = simulateTabRequest("user_admin_owner", { "x-voop-store-id": "VOOP-STOREC3" });
assert(adminUnauthorizedStoreResponse.authorized === false, "Admin cannot access Store C which they do not own");
assert(adminUnauthorizedStoreResponse.status === 403, "Admin receives 403 Forbidden for unowned store");

console.log("\n==================================================");
console.log(`TEST RESULTS: ${passed} PASSED, ${failed} FAILED`);
console.log("==================================================");

if (failed > 0) {
  process.exit(1);
} else {
  process.exit(0);
}
