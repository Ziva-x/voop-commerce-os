import { prisma } from "../lib/prisma";
import { generateInvoiceForOrder } from "../lib/invoice-generator";

async function main() {
  console.log("===================================================================");
  console.log("  VERIFYING ORDER #2026-1927 INVOICE TAX RECONCILIATION");
  console.log("===================================================================");

  const storeId = "cmton0z2a01g264enx5tcmo1y";
  const orderNumber = "1927";

  const invoice: any = await generateInvoiceForOrder(orderNumber, undefined, undefined, storeId);
  if (!invoice) {
    console.error("FAILED: Invoice could not be generated for Order #2026-1927");
    process.exit(1);
  }

  console.log("\nInvoice Generated Successfully:");
  console.log(`Invoice Number: ${invoice.invoiceNumber}`);
  console.log(`Order Number:   ${invoice.orderNumber}`);
  console.log(`Is Intra-State: ${invoice.isIntraState}`);
  console.log("\nLine Items Breakdown:");

  let fmsComponent: any = null;
  let snfComponent: any = null;

  for (const item of invoice.items) {
    console.log(`\n- Type: [${item.type}] SKU: ${item.sku} | Title: ${item.title}`);
    console.log(`  Qty: ${item.quantity} | Unit Price: ₹${item.unitPrice} | Gross: ₹${item.grossTotal}`);
    console.log(`  GST Rate: ${item.taxRate}% | Taxable: ₹${item.taxableValue}`);
    if (invoice.isIntraState) {
      console.log(`  CGST (${item.cgstRate}%): ₹${item.cgstAmount} | SGST (${item.sgstRate}%): ₹${item.sgstAmount}`);
    } else {
      console.log(`  IGST (${item.igstRate}%): ₹${item.igstAmount}`);
    }

    if (item.type === "COMPONENT" && item.sku === "FMS") {
      fmsComponent = item;
    }
    if (item.type === "COMPONENT" && (item.sku === "SNF200" || item.sku === "1:10SNF200")) {
      snfComponent = item;
    }
  }

  console.log("\nInvoice Summary:");
  console.log(`  Subtotal Taxable: ₹${invoice.summary.subtotalTaxable}`);
  console.log(`  Total CGST:       ₹${invoice.summary.totalCgst}`);
  console.log(`  Total SGST:       ₹${invoice.summary.totalSgst}`);
  console.log(`  Total IGST:       ₹${invoice.summary.totalIgst}`);
  console.log(`  Total Tax:        ₹${invoice.summary.totalTax}`);
  console.log(`  Grand Total:      ₹${invoice.summary.grandTotal}`);

  console.log("\n--- ASSERTIONS ---");
  let passed = true;

  if (fmsComponent?.taxRate === 5) {
    console.log("✓ PASS: FMS Component tax rate is 5% (NOT 28%)");
  } else {
    console.error(`✗ FAIL: Expected FMS tax rate 5%, got ${fmsComponent?.taxRate}%`);
    passed = false;
  }

  if (fmsComponent?.unitPrice === 749) {
    console.log("✓ PASS: FMS Component allocated unit price is ₹749");
  } else {
    console.error(`✗ FAIL: Expected FMS unit price ₹749, got ${fmsComponent?.unitPrice}`);
    passed = false;
  }

  if (Math.abs(fmsComponent?.taxableValue - 713.33) < 0.05) {
    console.log(`✓ PASS: FMS Component taxable value is ₹${fmsComponent?.taxableValue} (Expected ~₹713.33)`);
  } else {
    console.error(`✗ FAIL: Expected FMS taxable ~₹713.33, got ${fmsComponent?.taxableValue}`);
    passed = false;
  }

  const fmsTax = (fmsComponent?.cgstAmount || 0) + (fmsComponent?.sgstAmount || 0) + (fmsComponent?.igstAmount || 0);
  if (Math.abs(fmsTax - 35.67) < 0.05) {
    console.log(`✓ PASS: FMS Component tax amount is ₹${fmsTax.toFixed(2)} (Expected ~₹35.67)`);
  } else {
    console.error(`✗ FAIL: Expected FMS tax ~₹35.67, got ${fmsTax}`);
    passed = false;
  }

  if (snfComponent?.taxRate === 18) {
    console.log("✓ PASS: 1:10SNF200 Component tax rate is 18%");
  } else {
    console.error(`✗ FAIL: Expected 1:10SNF200 tax rate 18%, got ${snfComponent?.taxRate}%`);
    passed = false;
  }

  if (snfComponent?.unitPrice === 150) {
    console.log("✓ PASS: 1:10SNF200 Component allocated unit price is ₹150");
  } else {
    console.error(`✗ FAIL: Expected 1:10SNF200 unit price ₹150, got ${snfComponent?.unitPrice}`);
    passed = false;
  }

  if (invoice.summary.grandTotal === 899) {
    console.log("✓ PASS: Invoice Grand Total is ₹899.00");
  } else {
    console.error(`✗ FAIL: Expected Grand Total ₹899.00, got ${invoice.summary.grandTotal}`);
    passed = false;
  }

  // Also verify database snapshot was synchronized on the order item
  const orderItem = await prisma.shopifyOrderItem.findFirst({
    where: { order: { orderNumber: "1927" } },
  });
  console.log("\nPersisted Line Item Snapshot in DB:");
  console.log(orderItem?.comboInvoiceComponents);

  const parsedSnapshot = JSON.parse(orderItem?.comboInvoiceComponents || "[]");
  const fmsInDb = parsedSnapshot.find((c: any) => c.componentSku === "FMS");
  if (fmsInDb?.gstRate === 5) {
    console.log("✓ PASS: Database line item snapshot has gstRate = 5%");
  } else {
    console.error(`✗ FAIL: Database line item snapshot has gstRate = ${fmsInDb?.gstRate}%`);
    passed = false;
  }

  if (!passed) process.exit(1);
}

main().finally(() => prisma.$disconnect());
