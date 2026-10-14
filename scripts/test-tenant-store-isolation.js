/**
 * MASTER SUITE: VOOP TENANT / STORE ISOLATION SECURITY AUDIT & ATTACK TESTS
 *
 * Simulates direct malicious attacks, cross-tenant penetration attempts,
 * and verifies that the User -> Membership -> Tenant -> Store -> Data boundary
 * is strictly enforced at every level.
 */

const assert = require("assert");
const { PrismaClient } = require("../lib/generated/client");
const prisma = new PrismaClient();

let totalTests = 0;
let passedTests = 0;
let failedTests = 0;

async function test(name, fn) {
  totalTests++;
  try {
    await fn();
    console.log(`  ✓ PASS: ${name}`);
    passedTests++;
  } catch (err) {
    console.error(`  ✗ FAIL: ${name}:`, err.message);
    failedTests++;
  }
}

/**
 * Replicates the canonical resolveAuthorizedStoresForUser logic from lib/auth-helpers.ts
 */
async function resolveAuthorizedStoresForUser(userId) {
  if (!userId) return [];

  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { id: true, role: true, storeId: true, voopStoreId: true },
  });
  if (!user) return [];

  // Query explicit active memberships for this authenticated user
  const memberships = await prisma.storeMembership.findMany({
    where: {
      userId,
      status: "ACTIVE",
      store: { isConnected: true },
    },
    include: {
      store: true,
    },
    orderBy: { createdAt: "asc" },
  });

  const validStores = [];
  const seen = new Set();

  for (const m of memberships) {
    if (!m.store || !m.store.isConnected) continue;
    if (seen.has(m.store.id)) continue;

    // Cross-tenant verification: if membership has tenantId, it must match store tenantId
    if (m.tenantId && m.store.tenantId && m.tenantId !== m.store.tenantId) {
      console.warn(
        `[SECURITY WARNING] Cross-tenant mismatch detected! User ${userId} membership tenant (${m.tenantId}) != Store ${m.store.id} tenant (${m.store.tenantId}). Denying access.`
      );
      continue;
    }

    seen.add(m.store.id);
    validStores.push(m.store);
  }

  // Owner auto-recovery: If user is the registered accountId for a store but membership row was not yet created
  if (validStores.length === 0) {
    const ownedStore = await prisma.shopifyStore.findFirst({
      where: { accountId: userId, isConnected: true },
      orderBy: { createdAt: "desc" },
    });
    if (ownedStore) {
      await prisma.storeMembership.upsert({
        where: { userId_storeId: { userId, storeId: ownedStore.id } },
        create: {
          userId,
          storeId: ownedStore.id,
          tenantId: ownedStore.tenantId,
          role: "ADMIN",
          status: "ACTIVE",
        },
        update: {
          tenantId: ownedStore.tenantId,
          status: "ACTIVE",
        },
      }).catch(() => {});
      validStores.push(ownedStore);
    }
  }

  return validStores;
}

/**
 * Replicates the canonical requireStoreAccess logic from lib/auth-helpers.ts
 */
async function simulateRequireStoreAccess(userId, request, options = {}) {
  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user) return { authorized: false, status: 401, error: "Unauthorized" };

  const authorizedStores = await resolveAuthorizedStoresForUser(userId);

  // Extract requested identifier
  let requestedIdentifier = options.requestedVoopStoreId || null;
  if (!requestedIdentifier) {
    const headerVoop = request.headers.get("x-voop-store-id");
    const headerPublic = request.headers.get("x-public-store-ref");
    const headerStore = request.headers.get("x-store-id");
    requestedIdentifier = headerVoop || headerPublic || headerStore || null;
  }

  let targetStore = null;
  if (requestedIdentifier) {
    targetStore = authorizedStores.find((s) => {
      return (
        (s.publicStoreRef && s.publicStoreRef.toLowerCase() === requestedIdentifier.toLowerCase()) ||
        (s.voopStoreId && s.voopStoreId.toUpperCase() === requestedIdentifier.toUpperCase()) ||
        (s.tenantId && s.tenantId.toUpperCase() === requestedIdentifier.toUpperCase()) ||
        s.id === requestedIdentifier ||
        (s.shopDomain && s.shopDomain.toLowerCase() === requestedIdentifier.toLowerCase())
      );
    });

    if (!targetStore) {
      return {
        authorized: false,
        status: 403,
        error: `Forbidden: Account does not have permission to access store "${requestedIdentifier}".`,
      };
    }
  } else {
    targetStore = authorizedStores[0] || null;
  }

  if (!targetStore) {
    return { authorized: false, status: 404, error: "No connected store" };
  }

  // Strict membership check
  const membership = await prisma.storeMembership.findUnique({
    where: { userId_storeId: { userId: user.id, storeId: targetStore.id } },
  });

  if (!membership) {
    return { authorized: false, status: 403, error: "No active membership" };
  }

  if (membership.status !== "ACTIVE") {
    return { authorized: false, status: 403, error: `Membership is ${membership.status}` };
  }

  if (membership.tenantId && targetStore.tenantId && membership.tenantId !== targetStore.tenantId) {
    return { authorized: false, status: 403, error: "Cross-tenant mismatch" };
  }

  // Role & permission check
  const role = membership.role || user.role || "STAFF";
  let permissions = [];
  if (membership.permissions) {
    try {
      permissions = typeof membership.permissions === "string" ? JSON.parse(membership.permissions) : membership.permissions;
    } catch {
      permissions = [membership.permissions];
    }
  }

  if (options.requiredPermission && role !== "ADMIN") {
    if (!permissions.includes(options.requiredPermission)) {
      return { authorized: false, status: 403, error: `Permission required: ${options.requiredPermission}` };
    }
  }

  return {
    authorized: true,
    status: 200,
    storeId: targetStore.id,
    tenantId: targetStore.tenantId,
    role,
    permissions,
  };
}

function createMockRequest(headers = {}, urlPath = "/api/products") {
  const url = new URL(`http://localhost:3000${urlPath}`);
  return {
    url: url.toString(),
    headers: {
      get: (h) => headers[h.toLowerCase()] || null,
    },
    nextUrl: url,
  };
}

async function run() {
  console.log("==================================================");
  console.log("VOOP MASTER TENANT / STORE ISOLATION TEST SUITE");
  console.log("==================================================");

  // Load actual database state
  const stores = await prisma.shopifyStore.findMany({
    select: {
      id: true,
      shopDomain: true,
      storeName: true,
      voopStoreId: true,
      tenantId: true,
      publicStoreRef: true,
      accountId: true,
    },
  });

  const storeA = stores.find((s) => s.shopDomain === "qt0dyq-79.myshopify.com");
  const storeB = stores.find((s) => s.shopDomain === "monkey-garage-test.myshopify.com");

  assert(storeA, "Store A (MonkeyGarage) must exist in database");
  assert(storeB, "Store B (monkey-garage-test) must exist in database");
  assert.notStrictEqual(storeA.tenantId, storeB.tenantId, "Store A and Store B must have distinct Tenant IDs");

  const userAdminA = await prisma.user.findFirst({ where: { email: "hellomonkeygarage@gmail.com" } });
  const userAdminB = await prisma.user.findFirst({ where: { email: "adithziva12@gmail.com" } });
  const userStaffA = await prisma.user.findFirst({ where: { email: "adithziva46@gmail.com" } });
  const userStaffB = await prisma.user.findFirst({ where: { email: "adithziva66@gmail.com" } });

  assert(userAdminA, "Admin A must exist");
  assert(userAdminB, "Admin B must exist");
  assert(userStaffA, "Staff A must exist");
  assert(userStaffB, "Staff B must exist");

  console.log("\n--- SECTION 1: DATABASE MEMBERSHIP & TENANT BOUNDARY CHECKS ---");

  await test("Zero rogue cross-tenant memberships exist in database", async () => {
    const allMemberships = await prisma.storeMembership.findMany({
      include: {
        store: true,
        user: true,
      },
    });

    for (const m of allMemberships) {
      assert(m.store, `Membership ${m.id} must be linked to a store`);
      assert(m.tenantId, `Membership ${m.id} must have explicit tenantId`);
      assert.strictEqual(
        m.tenantId,
        m.store.tenantId,
        `Membership ${m.id} tenantId (${m.tenantId}) must match Store tenantId (${m.store.tenantId})`
      );
      assert.strictEqual(m.status, "ACTIVE", `Membership ${m.id} must have ACTIVE status`);
    }
  });

  await test("User A (hellomonkeygarage) has membership ONLY to Store A", async () => {
    const membershipsA = await prisma.storeMembership.findMany({
      where: { userId: userAdminA.id },
      include: { store: true },
    });
    assert.strictEqual(membershipsA.length, 1, "User A must have exactly 1 membership");
    assert.strictEqual(membershipsA[0].storeId, storeA.id, "User A membership must be Store A");
    assert.strictEqual(membershipsA[0].tenantId, storeA.tenantId, "User A membership tenant must be Store A tenant");
  });

  await test("User B (adithziva12) has membership ONLY to Store B", async () => {
    const membershipsB = await prisma.storeMembership.findMany({
      where: { userId: userAdminB.id },
      include: { store: true },
    });
    assert.strictEqual(membershipsB.length, 1, "User B must have exactly 1 membership");
    assert.strictEqual(membershipsB[0].storeId, storeB.id, "User B membership must be Store B");
    assert.strictEqual(membershipsB[0].tenantId, storeB.tenantId, "User B membership tenant must be Store B tenant");
  });

  console.log("\n--- SECTION 2: STORE SWITCHER RESOLUTION ISOLATION ---");

  await test("resolveAuthorizedStoresForUser(Admin A) returns ONLY Store A", async () => {
    const storesForA = await resolveAuthorizedStoresForUser(userAdminA.id);
    assert.strictEqual(storesForA.length, 1, "Must return exactly 1 store for Admin A");
    assert.strictEqual(storesForA[0].id, storeA.id, "Returned store must be Store A");
    assert.strictEqual(storesForA[0].tenantId, storeA.tenantId, "Tenant must match Store A");
  });

  await test("resolveAuthorizedStoresForUser(Admin B) returns ONLY Store B", async () => {
    const storesForB = await resolveAuthorizedStoresForUser(userAdminB.id);
    assert.strictEqual(storesForB.length, 1, "Must return exactly 1 store for Admin B");
    assert.strictEqual(storesForB[0].id, storeB.id, "Returned store must be Store B");
    assert.strictEqual(storesForB[0].tenantId, storeB.tenantId, "Tenant must match Store B");
  });

  await test("resolveAuthorizedStoresForUser(Staff A) returns ONLY Store A", async () => {
    const storesForStaffA = await resolveAuthorizedStoresForUser(userStaffA.id);
    assert.strictEqual(storesForStaffA.length, 1, "Must return exactly 1 store for Staff A");
    assert.strictEqual(storesForStaffA[0].id, storeA.id, "Staff A must only access Store A");
  });

  await test("resolveAuthorizedStoresForUser(Staff B) returns ONLY Store B", async () => {
    const storesForStaffB = await resolveAuthorizedStoresForUser(userStaffB.id);
    assert.strictEqual(storesForStaffB.length, 1, "Must return exactly 1 store for Staff B");
    assert.strictEqual(storesForStaffB[0].id, storeB.id, "Staff B must only access Store B");
  });

  console.log("\n--- SECTION 3: AUTHORIZATION LOGIC MATRIX (requireStoreAccess) ---");

  await test("User A -> Store A -> ALLOW (200)", async () => {
    const req = createMockRequest({ "x-voop-store-id": storeA.voopStoreId });
    const result = await simulateRequireStoreAccess(userAdminA.id, req);
    assert.strictEqual(result.authorized, true);
    assert.strictEqual(result.status, 200);
    assert.strictEqual(result.storeId, storeA.id);
  });

  await test("User A -> Store B -> DENIED (403 Forbidden)", async () => {
    const req = createMockRequest({ "x-voop-store-id": storeB.voopStoreId });
    const result = await simulateRequireStoreAccess(userAdminA.id, req);
    assert.strictEqual(result.authorized, false);
    assert.strictEqual(result.status, 403);
  });

  await test("User A -> Store B by Database ID -> DENIED (403 Forbidden)", async () => {
    const req = createMockRequest({ "x-store-id": storeB.id });
    const result = await simulateRequireStoreAccess(userAdminA.id, req);
    assert.strictEqual(result.authorized, false);
    assert.strictEqual(result.status, 403);
  });

  await test("User A -> Store B by Public Ref -> DENIED (403 Forbidden)", async () => {
    const req = createMockRequest({ "x-public-store-ref": storeB.publicStoreRef });
    const result = await simulateRequireStoreAccess(userAdminA.id, req);
    assert.strictEqual(result.authorized, false);
    assert.strictEqual(result.status, 403);
  });

  await test("User A -> Tenant B ID -> DENIED (403 Forbidden)", async () => {
    const req = createMockRequest({ "x-voop-store-id": storeB.tenantId });
    const result = await simulateRequireStoreAccess(userAdminA.id, req);
    assert.strictEqual(result.authorized, false);
    assert.strictEqual(result.status, 403);
  });

  await test("User B -> Store B -> ALLOW (200)", async () => {
    const req = createMockRequest({ "x-voop-store-id": storeB.voopStoreId });
    const result = await simulateRequireStoreAccess(userAdminB.id, req);
    assert.strictEqual(result.authorized, true);
    assert.strictEqual(result.status, 200);
    assert.strictEqual(result.storeId, storeB.id);
  });

  await test("User B -> Store A -> DENIED (403 Forbidden)", async () => {
    const req = createMockRequest({ "x-voop-store-id": storeA.voopStoreId });
    const result = await simulateRequireStoreAccess(userAdminB.id, req);
    assert.strictEqual(result.authorized, false);
    assert.strictEqual(result.status, 403);
  });

  await test("Staff A -> Store A with orders.view -> ALLOW (200)", async () => {
    const req = createMockRequest({ "x-voop-store-id": storeA.voopStoreId });
    const result = await simulateRequireStoreAccess(userStaffA.id, req, { requiredPermission: "orders.view" });
    assert.strictEqual(result.authorized, true);
    assert.strictEqual(result.status, 200);
  });

  await test("Staff A -> Store A with unpermitted settings.manage -> DENIED (403 Forbidden)", async () => {
    const req = createMockRequest({ "x-voop-store-id": storeA.voopStoreId });
    const result = await simulateRequireStoreAccess(userStaffA.id, req, { requiredPermission: "settings.manage" });
    assert.strictEqual(result.authorized, false);
    assert.strictEqual(result.status, 403);
  });

  await test("Staff A -> Store B -> DENIED (403 Forbidden)", async () => {
    const req = createMockRequest({ "x-voop-store-id": storeB.voopStoreId });
    const result = await simulateRequireStoreAccess(userStaffA.id, req);
    assert.strictEqual(result.authorized, false);
    assert.strictEqual(result.status, 403);
  });

  await test("Staff B -> Store A -> DENIED (403 Forbidden)", async () => {
    const req = createMockRequest({ "x-voop-store-id": storeA.voopStoreId });
    const result = await simulateRequireStoreAccess(userStaffB.id, req);
    assert.strictEqual(result.authorized, false);
    assert.strictEqual(result.status, 403);
  });

  console.log("\n--- SECTION 4: DISABLED MEMBERSHIP LIFECYCLE ---");

  await test("Disabled membership is rejected with 403", async () => {
    // Temporarily set Staff A membership status to DISABLED
    const staffAMem = await prisma.storeMembership.findFirst({ where: { userId: userStaffA.id } });
    await prisma.storeMembership.update({
      where: { id: staffAMem.id },
      data: { status: "DISABLED" },
    });

    try {
      const req = createMockRequest({ "x-voop-store-id": storeA.voopStoreId });
      const result = await simulateRequireStoreAccess(userStaffA.id, req);
      assert.strictEqual(result.authorized, false, "Disabled membership must not be authorized");
      assert.strictEqual(result.status, 403, "Must return 403 for disabled membership");
    } finally {
      // Restore status to ACTIVE
      await prisma.storeMembership.update({
        where: { id: staffAMem.id },
        data: { status: "ACTIVE" },
      });
    }
  });

  console.log("\n==================================================");
  console.log(`TEST SUMMARY: ${passedTests} passed, ${failedTests} failed, ${totalTests} total`);
  console.log("==================================================");

  if (failedTests > 0) {
    process.exit(1);
  }
}

run()
  .catch((err) => {
    console.error("Test suite runtime error:", err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
