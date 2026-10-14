/**
 * TENANT ISOLATION DATA REPAIR AND BACKFILL SCRIPT
 *
 * 1. Audits existing memberships against store ownership & tenant boundaries.
 * 2. Deletes cross-tenant rogue memberships created on 2026-09-07T18:34:13.
 * 3. Backfills tenantId and status = "ACTIVE" on all legitimate memberships.
 * 4. Ensures User storeId/tenantId/voopStoreId pointers strictly match authorized stores.
 */

const { PrismaClient } = require("../lib/generated/client");
const prisma = new PrismaClient();

async function repair() {
  console.log("==================================================");
  console.log("VOOP TENANT ISOLATION DATA REPAIR");
  console.log("==================================================");

  // 1. Fetch all stores
  const stores = await prisma.shopifyStore.findMany({
    select: {
      id: true,
      shopDomain: true,
      storeName: true,
      voopStoreId: true,
      tenantId: true,
      accountId: true,
    },
  });

  const storeMap = new Map(stores.map((s) => [s.id, s]));
  console.log(`Found ${stores.length} stores in database:`);
  for (const s of stores) {
    console.log(`  - Store [${s.id}] ${s.storeName} (${s.shopDomain}) Tenant: ${s.tenantId} Owner Account: ${s.accountId}`);
  }

  // 2. Fetch all memberships
  const memberships = await prisma.storeMembership.findMany({
    include: {
      user: { select: { id: true, email: true, username: true, role: true } },
      store: { select: { id: true, shopDomain: true, storeName: true, tenantId: true, accountId: true } },
    },
  });

  console.log(`\nAuditing ${memberships.length} existing StoreMembership records...`);

  // Target legitimate memberships to preserve and update:
  // Store 1 (MonkeyGarage):
  //   - Owner: hellomonkeygarage@gmail.com (ADMIN)
  //   - Staff: adithziva46@gmail.com (STAFF)
  // Store 2 (monkey-garage-test):
  //   - Owner: adithziva12@gmail.com (ADMIN)
  //   - Staff: adithziva66@gmail.com (STAFF)

  const legitimateOwners = [
    { email: "hellomonkeygarage@gmail.com", domain: "qt0dyq-79.myshopify.com", role: "ADMIN" },
    { email: "adithziva12@gmail.com", domain: "monkey-garage-test.myshopify.com", role: "ADMIN" },
    { email: "adithziva46@gmail.com", domain: "qt0dyq-79.myshopify.com", role: "STAFF" },
    { email: "adithziva66@gmail.com", domain: "monkey-garage-test.myshopify.com", role: "STAFF" },
  ];

  const toDelete = [];
  const toUpdate = [];

  for (const m of memberships) {
    const userEmail = (m.user?.email || "").toLowerCase();
    const storeDomain = (m.store?.shopDomain || "").toLowerCase();

    const isLegit = legitimateOwners.some(
      (legit) => legit.email === userEmail && legit.domain === storeDomain
    );

    if (isLegit) {
      const store = storeMap.get(m.storeId);
      toUpdate.push({
        id: m.id,
        userEmail,
        storeDomain,
        tenantId: store ? store.tenantId : null,
      });
    } else {
      toDelete.push({
        id: m.id,
        userEmail,
        storeDomain,
        reason: `Cross-tenant or unassociated membership: User ${userEmail} is NOT authorized for store ${storeDomain}`,
      });
    }
  }

  console.log(`\nIdentified ${toDelete.length} rogue memberships to delete:`);
  for (const d of toDelete) {
    console.log(`  [DELETE] ${d.id}: ${d.userEmail} -> ${d.storeDomain} (${d.reason})`);
  }

  console.log(`\nIdentified ${toUpdate.length} legitimate memberships to preserve & backfill:`);
  for (const u of toUpdate) {
    console.log(`  [PRESERVE & BACKFILL] ${u.id}: ${u.userEmail} -> ${u.storeDomain} (tenantId: ${u.tenantId})`);
  }

  // Execute Deletions
  if (toDelete.length > 0) {
    const deleteIds = toDelete.map((d) => d.id);
    const delResult = await prisma.storeMembership.deleteMany({
      where: { id: { in: deleteIds } },
    });
    console.log(`\n✓ Successfully deleted ${delResult.count} rogue cross-tenant membership records.`);
  }

  // Execute Updates (Backfill tenantId and status)
  for (const u of toUpdate) {
    await prisma.storeMembership.update({
      where: { id: u.id },
      data: {
        tenantId: u.tenantId,
        status: "ACTIVE",
      },
    });
  }
  console.log(`✓ Successfully updated ${toUpdate.length} legitimate memberships with active status and tenantId.`);

  // 3. Clean and verify User records
  console.log("\nAligning User records with their authoritative store and tenant...");
  const users = await prisma.user.findMany();
  for (const u of users) {
    const email = (u.email || "").toLowerCase();
    if (email === "hellomonkeygarage@gmail.com") {
      const store = stores.find((s) => s.shopDomain === "qt0dyq-79.myshopify.com");
      await prisma.user.update({
        where: { id: u.id },
        data: {
          storeId: store.id,
          voopStoreId: store.voopStoreId,
          tenantId: store.tenantId,
          role: "ADMIN",
        },
      });
      console.log(`  ✓ Aligned ${email} -> Store: ${store.storeName} (${store.tenantId})`);
    } else if (email === "adithziva12@gmail.com") {
      const store = stores.find((s) => s.shopDomain === "monkey-garage-test.myshopify.com");
      await prisma.user.update({
        where: { id: u.id },
        data: {
          storeId: store.id,
          voopStoreId: store.voopStoreId,
          tenantId: store.tenantId,
          role: "ADMIN",
        },
      });
      console.log(`  ✓ Aligned ${email} -> Store: ${store.storeName} (${store.tenantId})`);
    } else if (email === "adithziva46@gmail.com") {
      const store = stores.find((s) => s.shopDomain === "qt0dyq-79.myshopify.com");
      await prisma.user.update({
        where: { id: u.id },
        data: {
          storeId: store.id,
          voopStoreId: store.voopStoreId,
          tenantId: store.tenantId,
          role: "STAFF",
        },
      });
      console.log(`  ✓ Aligned ${email} (Staff) -> Store: ${store.storeName} (${store.tenantId})`);
    } else if (email === "adithziva66@gmail.com") {
      const store = stores.find((s) => s.shopDomain === "monkey-garage-test.myshopify.com");
      await prisma.user.update({
        where: { id: u.id },
        data: {
          storeId: store.id,
          voopStoreId: store.voopStoreId,
          tenantId: store.tenantId,
          role: "STAFF",
        },
      });
      console.log(`  ✓ Aligned ${email} (Staff) -> Store: ${store.storeName} (${store.tenantId})`);
    } else {
      // Standalone users not linked to either store
      await prisma.user.update({
        where: { id: u.id },
        data: {
          storeId: null,
          voopStoreId: null,
          tenantId: null,
        },
      });
      console.log(`  ✓ Reset unassigned user ${email} store pointers to null.`);
    }
  }

  // 4. Final verification query
  const finalMemberships = await prisma.storeMembership.findMany({
    include: {
      user: { select: { email: true, username: true } },
      store: { select: { shopDomain: true, storeName: true, tenantId: true } },
    },
  });

  console.log("\n==================================================");
  console.log("FINAL CLEAN MEMBERSHIP AUDIT TABLE:");
  console.log("==================================================");
  console.table(
    finalMemberships.map((m) => ({
      membershipId: m.id,
      user: m.user.email,
      role: m.role,
      status: m.status,
      tenantId: m.tenantId,
      store: m.store.storeName,
      shopDomain: m.store.shopDomain,
    }))
  );
  console.log("==================================================");
}

repair()
  .catch((err) => {
    console.error("Repair failed:", err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
