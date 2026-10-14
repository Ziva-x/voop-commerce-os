const { PrismaClient } = require('../lib/generated/client');
const prisma = new PrismaClient();

async function main() {
  const store = await prisma.shopifyStore.findFirst();
  if (!store) {
    console.log("No store found");
    return;
  }
  console.log("Found store:", store.id, store.storeName);

  // We can test calling PnL calculation logic directly
  const { PnLService } = require('../lib/services/PnLService');
  
  for (const period of ["today", "7d", "30d"]) {
    const result = await PnLService.calculatePnL(store.id, { period });
    console.log(`\n================== PNL for ${period} ==================`);
    console.log("Revenue:", result.summary.revenue);
    console.log("Orders:", result.summary.ordersCount);
    console.log("COGS:", result.summary.expenses.inventoryPurchases);
    console.log("Shipping Expense:", result.summary.expenses.shippingExpense);
    console.log("RTO Expense:", result.summary.expenses.rtoExpense);
    console.log("Packaging Expense:", result.summary.expenses.packagingExpense);
    console.log("Marketing / Ad Spend:", result.summary.expenses.marketingExpense);
    console.log("Overhead Expense:", result.summary.expenses.overheadExpense);
    console.log("Gateway Fees:", result.summary.expenses.gatewayFees);
    console.log("Total Expenses:", result.summary.expenses.totalExpenses);
    console.log("Gross Profit:", result.summary.grossProfit, `(${result.summary.grossMarginPercent.toFixed(1)}%)`);
    console.log("Net Profit:", result.summary.netProfit, `(${result.summary.netMarginPercent.toFixed(1)}%)`);
  }

  await prisma.$disconnect();
}

main().catch(console.error);
