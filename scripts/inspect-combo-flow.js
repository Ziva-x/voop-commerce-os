const { PrismaClient } = require('../lib/generated/client');
const prisma = new PrismaClient();

async function main() {
  console.log("=== INSPECTING ORDER #2026-1927 ===");
  const orders = await prisma.shopifyOrder.findMany({
    where: {
      OR: [
        { orderNumber: "2026-1927" },
        { orderNumber: "#2026-1927" },
        { name: "2026-1927" },
        { name: "#2026-1927" },
      ],
    },
    include: {
      items: true,
      fulfillments: true,
    },
  });

  console.log(`Found ${orders.length} order(s):`);
  for (const o of orders) {
    console.log("Order ID:", o.id);
    console.log("Store ID:", o.storeId);
    console.log("OrderNumber:", o.orderNumber);
    console.log("OutwardScanned:", o.outwardScanned);
    console.log("DeliveryStatus:", o.deliveryStatus);
    console.log("FulfillmentStatus:", o.fulfillmentStatus);
    console.log("FinancialStatus:", o.financialStatus);
    console.log("Items:");
    for (const it of o.items) {
      console.log("  - Item ID:", it.id);
      console.log("    SKU:", it.sku);
      console.log("    UnitPrice:", it.unitPrice);
      console.log("    Quantity:", it.quantity);
      console.log("    ComboInvoiceComponents:", it.comboInvoiceComponents);
      console.log("    UpdatedAt:", it.updatedAt);
    }
  }

  console.log("\n=== COMBO INVOICE COMPONENTS IN DB ===");
  const combos = await prisma.comboInvoiceComponent.findMany({
    where: {
      comboSku: { contains: "FMS" },
    },
  });
  for (const c of combos) {
    console.log({
      id: c.id,
      storeId: c.storeId,
      comboSku: c.comboSku,
      componentSku: c.componentSku,
      quantity: c.quantity,
      allocatedValue: c.allocatedValue,
      gstRate: c.gstRate,
      taxMode: c.taxMode,
      hsnCode: c.hsnCode,
      updatedAt: c.updatedAt,
    });
  }

  console.log("\n=== STANDALONE PRODUCT TAX CONFIG ===");
  const taxes = await prisma.productTaxConfig.findMany({
    where: {
      sku: { in: ["FMS", "SNF200", "1:10SNF200", "FMS-1:10SNF200"] },
    },
  });
  for (const t of taxes) {
    console.log({
      sku: t.sku,
      storeId: t.storeId,
      taxRate: t.taxRate,
      overridePrice: t.overridePrice,
      isTaxInclusive: t.isTaxInclusive,
      hsnCode: t.hsnCode,
    });
  }
}

main().finally(() => prisma.$disconnect());
