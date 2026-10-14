const { PrismaClient } = require('../lib/generated/client');
const prisma = new PrismaClient();

async function main() {
  const store = await prisma.shopifyStore.findFirst();
  console.log("Store ID:", store.id);

  const { PnLService } = require('../lib/services/PnLService');
  const pnl7d = await PnLService.calculatePnL(store.id, { period: "7d" });
  console.log("\n--- PnL 7d Output ---");
  console.log("Revenue:", pnl7d.summary.revenue);
  console.log("Orders:", pnl7d.summary.ordersCount);
  console.log("COGS:", pnl7d.summary.expenses.inventoryPurchases);
  console.log("Gross Profit:", pnl7d.summary.grossProfit, `(${pnl7d.summary.grossMarginPercent.toFixed(2)}%)`);
  console.log("Shipping Expense:", pnl7d.summary.expenses.shippingExpense);
  console.log("Packaging Expense:", pnl7d.summary.expenses.packagingExpense);
  console.log("Gateway Fees:", pnl7d.summary.expenses.gatewayFees);
  console.log("Ad Spend:", pnl7d.summary.expenses.marketingExpense);
  console.log("RTO Expense:", pnl7d.summary.expenses.rtoExpense);
  console.log("Overhead Expense:", pnl7d.summary.expenses.overheadExpense);
  console.log("Net Profit:", pnl7d.summary.netProfit, `(${pnl7d.summary.netMarginPercent.toFixed(2)}%)`);

  const pnl30d = await PnLService.calculatePnL(store.id, { period: "30d" });
  console.log("\n--- PnL 30d Output ---");
  console.log("Revenue:", pnl30d.summary.revenue);
  console.log("Orders:", pnl30d.summary.ordersCount);
  console.log("COGS:", pnl30d.summary.expenses.inventoryPurchases);
  console.log("Gross Profit:", pnl30d.summary.grossProfit, `(${pnl30d.summary.grossMarginPercent.toFixed(2)}%)`);
  console.log("Shipping Expense:", pnl30d.summary.expenses.shippingExpense);
  console.log("Packaging Expense:", pnl30d.summary.expenses.packagingExpense);
  console.log("Gateway Fees:", pnl30d.summary.expenses.gatewayFees);
  console.log("Ad Spend:", pnl30d.summary.expenses.marketingExpense);
  console.log("RTO Expense:", pnl30d.summary.expenses.rtoExpense);
  console.log("Overhead Expense:", pnl30d.summary.expenses.overheadExpense);
  console.log("Net Profit:", pnl30d.summary.netProfit, `(${pnl30d.summary.netMarginPercent.toFixed(2)}%)`);

  await prisma.$disconnect();
}

main().catch(console.error);
