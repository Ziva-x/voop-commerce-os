import { prisma } from "../lib/prisma";

async function main() {
  console.log("=== DIAGNOSING ORDER #2026-1927 AND COMBO TAX CONFIG ===");

  // 1. Find Order #2026-1927
  const orders = await prisma.shopifyOrder.findMany({
    where: {
      OR: [
        { orderNumber: "2026-1927" },
        { orderNumber: "#2026-1927" },
        { name: "2026-1927" },
        { name: "#2026-1927" },
        { shopifyOrderNumber: "2026-1927" },
        { shopifyOrderName: "#2026-1927" },
      ],
    },
    include: {
      items: true,
    },
  });

  console.log(`Found ${orders.length} order(s) matching 1927:`);
  for (const order of orders) {
    console.log(`\nOrder ID: ${order.id}, Store ID: ${order.storeId}, OrderNumber: ${order.orderNumber}, Name: ${order.name}`);
    console.log(`FinancialStatus: ${order.financialStatus}, DeliveryStatus: ${order.deliveryStatus}`);
    console.log(`invoiceCompanySnapshot: ${order.invoiceCompanySnapshot ? "EXISTS" : "NONE"}`);
    for (const item of order.items) {
      console.log(`  Line Item: ID: ${item.id}, SKU: "${item.sku}", Title: "${item.productTitle}"`);
      console.log(`  comboInvoiceComponents snapshot: ${item.comboInvoiceComponents || "NULL"}`);
    }
  }

  // 2. Inspect ComboInvoiceComponent records for FMS-1:10SNF200
  const comboConfigs = await prisma.comboInvoiceComponent.findMany({
    where: {
      comboSku: {
        contains: "FMS",
        mode: "insensitive",
      },
    },
  });
  console.log(`\nFound ${comboConfigs.length} ComboInvoiceComponent record(s):`);
  for (const cc of comboConfigs) {
    console.log(`  ComboSku: "${cc.comboSku}", CompSku: "${cc.componentSku}", StoreId: "${cc.storeId}", AllocVal: ${cc.allocatedValue}, GstRate: ${cc.gstRate}%, TaxMode: "${cc.taxMode}", Hsn: "${cc.hsnCode}", UpdatedAt: ${cc.updatedAt.toISOString()}`);
  }

  // 3. Inspect ProductTaxConfig for FMS and FMS-1:10SNF200
  const taxConfigs = await prisma.productTaxConfig.findMany({
    where: {
      sku: {
        in: ["FMS", "SNF200", "FMS-1:10SNF200", "1:10SNF200"],
      },
    },
  });
  console.log(`\nFound ${taxConfigs.length} ProductTaxConfig record(s):`);
  for (const tc of taxConfigs) {
    console.log(`  Sku: "${tc.sku}", StoreId: "${tc.storeId}", TaxRate: ${tc.taxRate}%, Price: ${tc.overridePrice}, InclTax: ${tc.isTaxInclusive}, Hsn: "${tc.hsnCode}"`);
  }

  // 4. Also check StockItem for FMS and combo
  const stockItems = await prisma.stockItem.findMany({
    where: {
      sku: {
        in: ["FMS", "SNF200", "FMS-1:10SNF200", "1:10SNF200"],
      },
    },
    include: {
      comboComponents: true,
    },
  });
  console.log(`\nFound ${stockItems.length} StockItem record(s):`);
  for (const si of stockItems) {
    console.log(`  Sku: "${si.sku}", Type: "${si.type}", SellingPrice: ${si.sellingPrice}, Recipe: ${si.comboComponents.map(c => `${c.componentSku}x${c.quantity}`).join(", ")}`);
  }
}

main().catch(console.error).finally(() => prisma.$disconnect());
