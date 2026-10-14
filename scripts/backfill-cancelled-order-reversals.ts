import { PrismaClient } from "../lib/generated/client";
import { InventoryService } from "../lib/services/InventoryService";

const prisma = new PrismaClient();

async function main() {
  console.log("[BACKFILL] Checking for cancelled orders with unreversed inventory deductions...");

  // Find cancelled or voided orders
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
    },
  });

  console.log(`[BACKFILL] Found ${cancelledOrders.length} cancelled/voided orders in database.`);

  let totalReversals = 0;
  for (const order of cancelledOrders) {
    const unreversedItems = order.items.filter(
      (item) => item.deductedQuantity > (item.reversedQuantity || 0)
    );

    if (unreversedItems.length === 0) {
      continue;
    }

    console.log(`[BACKFILL] Order #${order.orderNumber} (ID: ${order.id}) has ${unreversedItems.length} unreversed item(s):`);
    for (const item of unreversedItems) {
      console.log(`  - Line ${item.shopifyLineItemId} (${item.sku}): deducted=${item.deductedQuantity}, reversed=${item.reversedQuantity || 0}`);
      
      const result = await InventoryService.reverseOrderLineFulfillment(order.storeId, {
        orderId: order.id,
        shopifyOrderId: order.shopifyOrderId,
        shopifyLineItemId: item.shopifyLineItemId,
        orderNumber: order.orderNumber,
        cancelledQty: item.deductedQuantity - (item.reversedQuantity || 0),
        cancellationRef: `BACKFILL_${order.orderNumber}_${item.shopifyLineItemId}`,
        reason: "Historical Cancelled Order Inventory Backfill",
      });

      console.log(`    Result: reversed=${result.reversed}, restored=${result.restoredQuantity}, message=${result.message || "OK"}`);
      if (result.reversed) {
        totalReversals++;
      }
    }
  }

  console.log(`[BACKFILL] Completed. Total lines reversed: ${totalReversals}`);
}

main().catch(console.error).finally(() => prisma.$disconnect());
