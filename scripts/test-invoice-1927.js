const { generateInvoiceForOrder } = require('../lib/invoice-generator');
const { PrismaClient } = require('../lib/generated/client');
const prisma = new PrismaClient();

async function main() {
  const storeId = "cmton0z2a01g264enx5tcmo1y";
  const invoice = await generateInvoiceForOrder("1927", undefined, undefined, storeId);
  if (!invoice) {
    console.log("Invoice not found!");
    return;
  }

  console.log("Invoice Number:", invoice.invoiceNumber);
  console.log("Items count:", invoice.items.length);
  for (const it of invoice.items) {
    console.log({
      type: it.type,
      sku: it.sku,
      title: it.title,
      grossTotal: it.grossTotal,
      taxRate: it.taxRate,
      taxableValue: it.taxableValue,
      cgstRate: it.cgstRate,
      cgstAmount: it.cgstAmount,
      sgstRate: it.sgstRate,
      sgstAmount: it.sgstAmount,
      igstRate: it.igstRate,
      igstAmount: it.igstAmount,
    });
  }
  console.log("Summary:", invoice.summary);
}

main().finally(() => prisma.$disconnect());
