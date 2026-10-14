const { PrismaClient } = require("../lib/generated/client");
const prisma = new PrismaClient();

async function main() {
  console.log("Checking existing stores for scanner inventory settings...");
  const stores = await prisma.shopifyStore.findMany({
    select: { id: true, storeName: true, shopDomain: true },
  });

  console.log(`Found ${stores.length} store(s).`);

  let createdCount = 0;
  for (const store of stores) {
    const existing = await prisma.scannerInventorySetting.findUnique({
      where: { storeId: store.id },
    });

    if (!existing) {
      await prisma.scannerInventorySetting.create({
        data: {
          storeId: store.id,
          outwardInventoryMovement: false,
          rtoInwardInventoryMovement: false,
          damageInventoryMovement: true,
        },
      });
      console.log(`Created default scanner settings for store: ${store.storeName || store.shopDomain} (${store.id})`);
      createdCount++;
    } else {
      console.log(`Preserved existing scanner settings for store: ${store.storeName || store.shopDomain} (${store.id})`);
    }
  }

  console.log(`Backfill complete: ${createdCount} store(s) initialized.`);
}

main()
  .catch((e) => {
    console.error("Migration error:", e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
