const { PrismaClient } = require('../lib/generated/client');
const prisma = new PrismaClient();

async function main() {
  const stockItems = await prisma.stockItem.findMany({
    select: { id: true, sku: true, name: true, type: true, avgUnitCost: true, sellingPrice: true, costPrice: true }
  });
  console.log("Stock Items:", stockItems);

  const bills = await prisma.purchaseBill.findMany({
    select: { id: true, billNumber: true, billType: true, supplier: true, totalAmount: true, status: true, billDate: true }
  });
  console.log("Purchase Bills:", bills);

  const allBills = await prisma.purchaseBill.findMany();
  console.log("Total purchase bills in DB:", allBills.length, allBills);
  const allExpenses = await prisma.businessExpense.findMany();
  console.log("Total business expenses in DB:", allExpenses.length, allExpenses);
  const stores = await prisma.shopifyStore.findMany({ select: { id: true, name: true, shopDomain: true } });
  console.log("Stores:", stores);

  await prisma.$disconnect();
}

main().catch(console.error);
