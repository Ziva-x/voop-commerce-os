let PrismaClient;
try {
  PrismaClient = require('./lib/generated/client').PrismaClient;
} catch (_e) {
  PrismaClient = require('@prisma/client').PrismaClient;
}
const prisma = new PrismaClient();

async function main() {
  console.log("=== REPAIRING STORE LINK FOR ADITHZIVA ===");

  // 1. Find user adithziva
  const user = await prisma.user.findFirst({
    where: {
      OR: [
        { username: "adithziva" },
        { email: "adithziva@gmail.com" }
      ]
    }
  });

  if (!user) {
    console.log("User adithziva not found!");
    return;
  }
  console.log(`Found user: ${user.id} (${user.username}, ${user.email})`);

  // 2. Find store qt0dyq-79.myshopify.com or VOOP-H2GDGBVA
  const store = await prisma.shopifyStore.findFirst({
    where: {
      OR: [
        { shopDomain: "qt0dyq-79.myshopify.com" },
        { voopStoreId: "VOOP-H2GDGBVA" }
      ]
    }
  });

  if (!store) {
    console.log("Store qt0dyq-79 / VOOP-H2GDGBVA not found!");
    return;
  }
  console.log(`Found store: ${store.id} (${store.shopDomain}, ${store.voopStoreId})`);

  // 3. Remove or clear placeholder user qt0dyq79 FIRST so voopStoreId is free
  const dummyUser = await prisma.user.findFirst({
    where: {
      OR: [
        { username: "qt0dyq79" },
        { passwordHash: "SHOPIFY_EMBEDDED_MANAGED_ACCOUNT" }
      ]
    }
  });

  if (dummyUser) {
    await prisma.user.delete({ where: { id: dummyUser.id } });
    console.log(`✓ Deleted placeholder user ${dummyUser.id} (${dummyUser.username})`);
  }

  // 4. Now update adithziva with storeId and voopStoreId
  await prisma.user.update({
    where: { id: user.id },
    data: {
      storeId: store.id,
      voopStoreId: store.voopStoreId || "VOOP-H2GDGBVA"
    }
  });
  console.log(`✓ Updated user ${user.id} with storeId=${store.id}, voopStoreId=${store.voopStoreId}`);

  // 5. Update store accountId to point to real user adithziva
  await prisma.shopifyStore.update({
    where: { id: store.id },
    data: {
      accountId: user.id,
      voopStoreId: store.voopStoreId || "VOOP-H2GDGBVA"
    }
  });
  console.log(`✓ Updated store ${store.id} with accountId=${user.id}`);

  console.log("=== REPAIR COMPLETE! ===");
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
