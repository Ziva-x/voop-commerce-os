const { PrismaClient } = require('../lib/generated/client');
const bcrypt = require('bcrypt');
const prisma = new PrismaClient();

// In-line permission checker matching lib/permissions.ts exactly
const PERMISSION_KEYS = {
  ORDERS_VIEW: "orders.view",
  ORDERS_MANAGE: "orders.manage",
  INVENTORY_VIEW: "inventory.view",
  INVENTORY_MANAGE: "inventory.manage",
  PRODUCTS_VIEW: "products.view",
  DASHBOARD_VIEW: "dashboard.view",
};

function normalizeUserPermissions(rawPermissions) {
  if (!rawPermissions) return [];
  let parsed = [];
  if (Array.isArray(rawPermissions)) {
    parsed = rawPermissions;
  } else if (typeof rawPermissions === "string") {
    try {
      const json = JSON.parse(rawPermissions);
      parsed = Array.isArray(json) ? json : [rawPermissions];
    } catch {
      parsed = rawPermissions.split(",").map((p) => p.trim()).filter(Boolean);
    }
  }
  const result = new Set();
  for (const item of parsed) {
    if (!item) continue;
    const clean = String(item).trim();
    result.add(clean);
    if (clean.endsWith(".*")) {
      const prefix = clean.replace(".*", "");
      for (const val of Object.values(PERMISSION_KEYS)) {
        if (val.startsWith(`${prefix}.`)) result.add(val);
      }
    }
  }
  return Array.from(result);
}

function hasPermission(user, requiredPermission) {
  if (!user) return false;
  const role = (user.role || "").toUpperCase();
  if (role === "ADMIN") return true;
  if (role !== "STAFF") return false;
  if (requiredPermission === PERMISSION_KEYS.DASHBOARD_VIEW || requiredPermission === "dashboard") return true;

  const granted = normalizeUserPermissions(user.permissions);
  if (granted.includes(requiredPermission)) return true;

  const [module] = requiredPermission.split(".");
  if (
    granted.includes(`${module}.*`) ||
    granted.includes(module) ||
    granted.includes(module.toUpperCase()) ||
    granted.includes(module.toLowerCase())
  ) {
    return true;
  }
  return false;
}

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

async function run() {
  console.log('==================================================================');
  console.log('VOOP STAFF ARCHITECTURE & PERMISSIONS VERIFICATION SUITE');
  console.log('==================================================================\n');

  // Step 0: Verify existing stores
  const stores = await prisma.shopifyStore.findMany({
    where: { isConnected: true },
    select: {
      id: true,
      shopDomain: true,
      voopStoreId: true,
      tenantId: true,
      publicStoreRef: true,
      accountId: true,
    },
    orderBy: { createdAt: 'asc' },
  });

  assert(stores.length >= 2, `Found at least 2 connected stores in DB (Found: ${stores.length})`);
  const storeA = stores[0];
  const storeB = stores[1];
  console.log(`  Store A: ${storeA.shopDomain} | Ref: ${storeA.publicStoreRef} | Tenant: ${storeA.tenantId}`);
  console.log(`  Store B: ${storeB.shopDomain} | Ref: ${storeB.publicStoreRef} | Tenant: ${storeB.tenantId}\n`);

  const initialStoreCount = await prisma.shopifyStore.count();

  // Admin users
  const adminA = await prisma.user.findUnique({ where: { id: storeA.accountId } });
  const adminB = await prisma.user.findUnique({ where: { id: storeB.accountId } });
  assert(adminA && adminA.role === 'ADMIN', `Admin A verified for Store A (${adminA?.email})`);
  assert(adminB && adminB.role === 'ADMIN', `Admin B verified for Store B (${adminB?.email})`);

  // Step 1: Create Staff A (linked to Store A, orders.view only)
  const staffAEmail = `staff_a_${Date.now()}@example.com`;
  const passwordHashA = await bcrypt.hash('StaffPassword123!', 10);
  const staffAPermissions = JSON.stringify(['orders.view']);

  const staffA = await prisma.user.create({
    data: {
      name: 'Staff A Orders Specialist',
      email: staffAEmail,
      username: `staff_a_${Date.now()}`,
      passwordHash: passwordHashA,
      storeId: storeA.id,
      voopStoreId: storeA.voopStoreId,
      tenantId: storeA.tenantId,
      createdById: adminA.id,
      role: 'STAFF',
      permissions: staffAPermissions,
    },
  });

  const membershipA = await prisma.storeMembership.create({
    data: {
      userId: staffA.id,
      storeId: storeA.id,
      role: 'STAFF',
      permissions: staffAPermissions,
    },
  });

  // Step 2: Create Staff B (linked to Store B, inventory.view only)
  const staffBEmail = `staff_b_${Date.now()}@example.com`;
  const passwordHashB = await bcrypt.hash('StaffPassword123!', 10);
  const staffBPermissions = JSON.stringify(['inventory.view']);

  const staffB = await prisma.user.create({
    data: {
      name: 'Staff B Inventory Specialist',
      email: staffBEmail,
      username: `staff_b_${Date.now()}`,
      passwordHash: passwordHashB,
      storeId: storeB.id,
      voopStoreId: storeB.voopStoreId,
      tenantId: storeB.tenantId,
      createdById: adminB.id,
      role: 'STAFF',
      permissions: staffBPermissions,
    },
  });

  const membershipB = await prisma.storeMembership.create({
    data: {
      userId: staffB.id,
      storeId: storeB.id,
      role: 'STAFF',
      permissions: staffBPermissions,
    },
  });

  console.log('--- TEST 1: Database Relationship & Store Identity Model ---');
  assert(staffA.role === 'STAFF' && membershipA.role === 'STAFF', 'Staff A user and membership role is strictly STAFF');
  assert(staffB.role === 'STAFF' && membershipB.role === 'STAFF', 'Staff B user and membership role is strictly STAFF');
  assert(membershipA.storeId === storeA.id, 'Staff A membership.storeId points to Store A');
  assert(membershipB.storeId === storeB.id, 'Staff B membership.storeId points to Store B');
  assert(staffA.tenantId === storeA.tenantId, 'Staff A inherits Store A tenantId without generating new tenant');
  assert(staffB.tenantId === storeB.tenantId, 'Staff B inherits Store B tenantId without generating new tenant');

  const afterStoreCount = await prisma.shopifyStore.count();
  assert(afterStoreCount === initialStoreCount, 'Staff accounts did NOT create any new Store or Tenant in database');

  console.log('\n--- TEST 2: Staff Store Resolution via StoreMembership ---');
  // Re-read Staff A through StoreMembership
  const staffAMembershipLookup = await prisma.storeMembership.findFirst({
    where: { userId: staffA.id },
    include: { store: true },
  });
  assert(staffAMembershipLookup && staffAMembershipLookup.store.id === storeA.id, 'Staff A resolves Store A via StoreMembership');
  assert(staffAMembershipLookup.store.publicStoreRef === storeA.publicStoreRef, `Staff A resolves publicStoreRef (${storeA.publicStoreRef})`);

  // Re-read Staff B through StoreMembership
  const staffBMembershipLookup = await prisma.storeMembership.findFirst({
    where: { userId: staffB.id },
    include: { store: true },
  });
  assert(staffBMembershipLookup && staffBMembershipLookup.store.id === storeB.id, 'Staff B resolves Store B via StoreMembership');
  assert(staffBMembershipLookup.store.publicStoreRef === storeB.publicStoreRef, `Staff B resolves publicStoreRef (${storeB.publicStoreRef})`);

  console.log('\n--- TEST 3: Staff Role & Permission Resolution Engine ---');
  // Staff A permissions: orders.view only
  assert(hasPermission(staffA, 'orders.view') === true, 'Staff A hasPermission("orders.view") === true');
  assert(hasPermission(staffA, 'orders.manage') === false, 'Staff A hasPermission("orders.manage") === false');
  assert(hasPermission(staffA, 'inventory.view') === false, 'Staff A hasPermission("inventory.view") === false');
  assert(hasPermission(staffA, 'products.view') === false, 'Staff A hasPermission("products.view") === false');
  assert(hasPermission(staffA, 'dashboard.view') === true, 'Staff A hasPermission("dashboard.view") === true (Default Allowed)');

  // Staff B permissions: inventory.view only
  assert(hasPermission(staffB, 'inventory.view') === true, 'Staff B hasPermission("inventory.view") === true');
  assert(hasPermission(staffB, 'inventory.manage') === false, 'Staff B hasPermission("inventory.manage") === false');
  assert(hasPermission(staffB, 'orders.view') === false, 'Staff B hasPermission("orders.view") === false');
  assert(hasPermission(staffB, 'dashboard.view') === true, 'Staff B hasPermission("dashboard.view") === true');

  // Case-insensitivity check (e.g. role: 'staff' lowercase)
  const staffLowerCase = { role: 'staff', permissions: JSON.stringify(['orders.view']) };
  assert(hasPermission(staffLowerCase, 'orders.view') === true, 'hasPermission supports case-insensitive role="staff"');

  console.log('\n--- TEST 4: Store Authorization Logic Emulation ---');
  // Helper to emulate resolveStoreContext authorization logic
  async function testAuthorize(user, requestedIdentifier, requiredPermission) {
    const isStaff = (user.role || '').toUpperCase() === 'STAFF';
    let authorizedStores = [];

    if (isStaff) {
      const memberships = await prisma.storeMembership.findMany({
        where: { userId: user.id },
        include: { store: true },
      });
      authorizedStores = memberships.map((m) => m.store).filter((s) => s && s.isConnected);
    } else {
      authorizedStores = await prisma.shopifyStore.findMany({
        where: { isConnected: true, accountId: user.id },
      });
    }

    let targetStore = null;
    if (requestedIdentifier) {
      targetStore = authorizedStores.find((s) => {
        const matchPublic = s.publicStoreRef && (s.publicStoreRef === requestedIdentifier || s.publicStoreRef.toLowerCase() === requestedIdentifier.toLowerCase());
        const matchVoop = s.voopStoreId && s.voopStoreId.toUpperCase() === requestedIdentifier.toUpperCase();
        const matchId = s.id === requestedIdentifier;
        const matchDomain = s.shopDomain && s.shopDomain.toLowerCase() === requestedIdentifier.toLowerCase();
        return matchPublic || matchVoop || matchId || matchDomain;
      });

      if (!targetStore) {
        return { authorized: false, status: 403, error: `Forbidden: No permission for store ${requestedIdentifier}` };
      }
    } else {
      targetStore = authorizedStores[0] || null;
    }

    if (!targetStore) {
      return { authorized: false, status: 404, error: 'No store accessible' };
    }

    let membership = null;
    if (isStaff) {
      membership = await prisma.storeMembership.findUnique({
        where: { userId_storeId: { userId: user.id, storeId: targetStore.id } },
      });
      if (!membership) {
        return { authorized: false, status: 403, error: 'Forbidden: No active membership for target store' };
      }
    }

    const effectiveRole = isStaff ? 'STAFF' : (membership?.role || user.role || 'ADMIN');
    const effectivePermissions = membership?.permissions !== null && membership?.permissions !== undefined
      ? membership.permissions
      : user.permissions;

    if (requiredPermission) {
      const allowed = hasPermission({ role: effectiveRole, permissions: effectivePermissions }, requiredPermission);
      if (!allowed) {
        return { authorized: false, status: 403, error: `Forbidden: Missing required permission ${requiredPermission}` };
      }
    }

    return {
      authorized: true,
      status: 200,
      storeId: targetStore.id,
      publicStoreRef: targetStore.publicStoreRef,
      role: effectiveRole,
    };
  }

  // Multi-tab concurrent simulation (Tabs 1-4)
  const [tab1, tab2, tab3, tab4] = await Promise.all([
    testAuthorize(adminA, storeA.publicStoreRef, 'orders.view'),
    testAuthorize(staffA, storeA.publicStoreRef, 'orders.view'),
    testAuthorize(adminB, storeB.publicStoreRef, 'orders.view'),
    testAuthorize(staffB, storeB.publicStoreRef, 'inventory.view'),
  ]);

  assert(tab1.authorized && tab1.storeId === storeA.id && tab1.role === 'ADMIN', 'Tab 1: Admin A -> Store A (200 OK, ADMIN)');
  assert(tab2.authorized && tab2.storeId === storeA.id && tab2.role === 'STAFF', 'Tab 2: Staff A -> Store A (200 OK, STAFF, orders.view)');
  assert(tab3.authorized && tab3.storeId === storeB.id && tab3.role === 'ADMIN', 'Tab 3: Admin B -> Store B (200 OK, ADMIN)');
  assert(tab4.authorized && tab4.storeId === storeB.id && tab4.role === 'STAFF', 'Tab 4: Staff B -> Store B (200 OK, STAFF, inventory.view)');

  console.log('\n--- TEST 5: Security Gates & Attack Vectors ---');
  // Attack 1: Staff A attempts to switch URL to Store B /app/<Store-B-publicRef>
  const attack1 = await testAuthorize(staffA, storeB.publicStoreRef, 'orders.view');
  assert(!attack1.authorized && attack1.status === 403, 'Attack 1: Staff A attempting Store B publicStoreRef is REJECTED with 403');

  // Attack 2: Staff A attempts to tamper with Store B ID
  const attack2 = await testAuthorize(staffA, storeB.id, 'orders.view');
  assert(!attack2.authorized && attack2.status === 403, 'Attack 2: Staff A attempting Store B database ID is REJECTED with 403');

  // Attack 3: Staff B attempts to access Store A URL
  const attack3 = await testAuthorize(staffB, storeA.publicStoreRef, 'inventory.view');
  assert(!attack3.authorized && attack3.status === 403, 'Attack 3: Staff B attempting Store A publicStoreRef is REJECTED with 403');

  // Attack 4: Staff A calls unauthorized section (inventory.view on Store A)
  const attack4 = await testAuthorize(staffA, storeA.publicStoreRef, 'inventory.view');
  assert(!attack4.authorized && attack4.status === 403, 'Attack 4: Staff A accessing unauthorized module (inventory.view) is REJECTED with 403');

  // Attack 5: Staff B calls unauthorized section (orders.view on Store B)
  const attack5 = await testAuthorize(staffB, storeB.publicStoreRef, 'orders.view');
  assert(!attack5.authorized && attack5.status === 403, 'Attack 5: Staff B accessing unauthorized module (orders.view) is REJECTED with 403');

  console.log('\n--- TEST 6: Store Account Ownership Protection ---');
  const storeACheck = await prisma.shopifyStore.findUnique({ where: { id: storeA.id } });
  const storeBCheck = await prisma.shopifyStore.findUnique({ where: { id: storeB.id } });
  assert(storeACheck.accountId === adminA.id, `Store A accountId remained Admin A (${adminA.id})`);
  assert(storeBCheck.accountId === adminB.id, `Store B accountId remained Admin B (${adminB.id})`);

  console.log('\n==================================================================');
  console.log(`TEST SUMMARY: ${passed} PASSED | ${failed} FAILED`);
  console.log('==================================================================');

  // Cleanup test staff
  await prisma.storeMembership.deleteMany({ where: { userId: { in: [staffA.id, staffB.id] } } });
  await prisma.user.deleteMany({ where: { id: { in: [staffA.id, staffB.id] } } });
  console.log('Cleaned up test staff accounts safely.\n');

  if (failed > 0) process.exit(1);
}

run()
  .catch((err) => {
    console.error('Test Suite Failed:', err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
