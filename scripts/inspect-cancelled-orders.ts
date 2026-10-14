import { PrismaClient } from "../lib/generated/client";
const prisma = new PrismaClient();

async function main() {
  const cancelledOrders = await prisma.shopifyOrder.findMany({
    where: {
      OR: [
        { cancelledAt: { not: null } },
        { financialStatus: "VOIDED" },
        { financialStatus: "CANCELLED" },
      ],
    },
    include: {
      items: true,
      fulfillments: true,
    },
  });

  console.log(`Found ${cancelledOrders.length} cancelled/voided Shopify orders in DB:`);
  for (const o of cancelledOrders) {
    console.log(`- Order #${o.orderNumber} (ID: ${o.id}, cancelledAt: ${o.cancelledAt}, financialStatus: ${o.financialStatus})`);
    for (const item of o.items) {
      console.log(`  Line ${item.shopifyLineItemId} (${item.sku}): qty=${item.quantity}, fulfilled=${item.fulfilledQuantity}, deducted=${item.deductedQuantity}, isDeducted=${item.isDeducted}`);
      // Find corresponding ledger entries
      const deductions = await prisma.inventoryLedger.findMany({
        where: {
          storeId: o.storeId,
          orderId: o.id,
          sku: item.sku || undefined,
        },
      });
      console.log(`    Ledger entries for this order/sku: ${deductions.length}`);
      for (const d of deductions) {
        console.log(`      Ledger ID: ${d.id}, type: ${d.type}, qty: ${d.quantity}, bucket: ${d.inventoryBucket}, date: ${d.createdAt.toISOString()}`);
      }
    }
  }

  // Also check total ledger entries
  const totalLedger = await prisma.inventoryLedger.count();
  const olderThan7Days = await prisma.inventoryLedger.count({
    where: {
      createdAt: { lt: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000) },
    },
  });
  console.log(`Total inventory ledger entries in DB: ${totalLedger}`);
  console.log(`Ledger entries older than 7 days: ${olderThan7Days}`);
}

main().catch(console.error).finally(() => prisma.$disconnect());
