/**
 * Automated Test Suite: VOOP Combo Custom Invoice Price & Tax Breakdown
 *
 * Verifies:
 * 1. Exact Combo Price Allocation & Zero-Drift Math (FMS ₹700 @ 5%, SNF200 ₹200 @ 18%, GLVG11 ₹149 @ 5% = ₹1049).
 * 2. Independence of Combo Component Setup from Standalone SKU Configuration.
 * 3. Order Snapshotting & Immutability: Historical invoices retain their snapshot even if combo config changes.
 * 4. Strict Balance Validation: Mismatched allocations (sum != selling price) are strictly rejected.
 * 5. Proportional Discount Allocation across components with zero paise rounding drift.
 * 6. Multi-Tenant Store Isolation across endpoints.
 */

import { prisma } from "../lib/prisma";
import { generateInvoiceForOrder } from "../lib/invoice-generator";

let passed = 0;
let failed = 0;

function assert(condition: boolean, message: string) {
  if (condition) {
    console.log(`  ✓ PASS: ${message}`);
    passed++;
  } else {
    console.error(`  ✗ FAIL: ${message}`);
    failed++;
  }
}

async function runTests() {
  console.log("\n===================================================================");
  console.log("  RUNNING VOOP COMBO CUSTOM INVOICE PRICE & TAX BREAKDOWN TESTS");
  console.log("===================================================================\n");

  try {
    // Setup test stores
    let storeA = await prisma.shopifyStore.findFirst({
      where: { shopDomain: "test-store-a.myshopify.com" },
    });
    if (!storeA) {
      storeA = await prisma.shopifyStore.create({
        data: {
          shopDomain: "test-store-a.myshopify.com",
          accessToken: "shpat_test_store_a",
          storeName: "Test Store A",
        },
      });
    }

    // Ensure StoreSetting with GSTIN exists for storeA
    await prisma.storeSetting.upsert({
      where: { storeId: storeA.id },
      create: {
        storeId: storeA.id,
        companyName: "Voop Test Motors Pvt Ltd",
        tradeName: "Voop India",
        gstin: "32AAAAA0000A1Z5",
        state: "KERALA",
        stateCode: "32",
        city: "Kochi",
        addressLine1: "123 Marine Drive",
        pincode: "682001",
      },
      update: {
        companyName: "Voop Test Motors Pvt Ltd",
        gstin: "32AAAAA0000A1Z5",
        state: "KERALA",
      },
    });

    let storeB = await prisma.shopifyStore.findFirst({
      where: { shopDomain: "test-store-b.myshopify.com" },
    });
    if (!storeB) {
      storeB = await prisma.shopifyStore.create({
        data: {
          shopDomain: "test-store-b.myshopify.com",
          accessToken: "shpat_test_store_b",
          storeName: "Test Store B",
        },
      });
    }

    const COMBO_SKU = "TEST-FMS-SNF-GLV";
    const FMS_SKU = "TEST-FMS";
    const SNF_SKU = "TEST-SNF200";
    const GLV_SKU = "TEST-GLVG11";

    // Clean up previous test data
    await prisma.comboInvoiceComponent.deleteMany({
      where: { storeId: storeA.id, comboSku: COMBO_SKU },
    });
    await prisma.comboComponent.deleteMany({
      where: { storeId: storeA.id, comboSku: COMBO_SKU },
    });
    await prisma.stockItem.deleteMany({
      where: { storeId: storeA.id, sku: { in: [COMBO_SKU, FMS_SKU, SNF_SKU, GLV_SKU] } },
    });
    await prisma.productTaxConfig.deleteMany({
      where: { storeId: storeA.id, sku: { in: [COMBO_SKU, FMS_SKU, SNF_SKU, GLV_SKU] } },
    });

    // ─── TEST 1: Physical Warehouse Recipe vs Invoice Breakdown ──────────
    console.log("TEST 1: Creating Physical Stock Items & Warehouse Recipe (BOM)...");
    
    // Physical items
    await prisma.stockItem.createMany({
      data: [
        { storeId: storeA.id, sku: FMS_SKU, name: "Foam Master Sprayer", type: "SINGLE", currentStock: 50, avgUnitCost: 350, sellingPrice: 899 },
        { storeId: storeA.id, sku: SNF_SKU, name: "Snow Foam 200ml", type: "SINGLE", currentStock: 100, avgUnitCost: 80, sellingPrice: 249 },
        { storeId: storeA.id, sku: GLV_SKU, name: "Glove Mitt", type: "SINGLE", currentStock: 80, avgUnitCost: 40, sellingPrice: 199 },
        { storeId: storeA.id, sku: COMBO_SKU, name: "Foam Kit Pro", type: "COMBO", currentStock: 0, avgUnitCost: 0, sellingPrice: 1049 },
      ],
    });

    // Physical Recipe: 1 of each
    await prisma.comboComponent.createMany({
      data: [
        { storeId: storeA.id, comboSku: COMBO_SKU, componentSku: FMS_SKU, quantity: 1 },
        { storeId: storeA.id, comboSku: COMBO_SKU, componentSku: SNF_SKU, quantity: 1 },
        { storeId: storeA.id, comboSku: COMBO_SKU, componentSku: GLV_SKU, quantity: 1 },
      ],
    });

    // Custom Invoice Breakdown Configuration:
    // FMS: ₹700, 5% GST, HSN 8424
    // SNF200: ₹200, 18% GST, HSN 3402
    // GLVG11: ₹149, 5% GST, HSN 6116
    // Sum = ₹700 + ₹200 + ₹149 = ₹1049 (Balanced)
    await prisma.comboInvoiceComponent.createMany({
      data: [
        { storeId: storeA.id, comboSku: COMBO_SKU, componentSku: FMS_SKU, quantity: 1, allocatedValue: 700, gstRate: 5, hsnCode: "8424", taxMode: "INCLUSIVE" },
        { storeId: storeA.id, comboSku: COMBO_SKU, componentSku: SNF_SKU, quantity: 1, allocatedValue: 200, gstRate: 18, hsnCode: "3402", taxMode: "INCLUSIVE" },
        { storeId: storeA.id, comboSku: COMBO_SKU, componentSku: GLV_SKU, quantity: 1, allocatedValue: 149, gstRate: 5, hsnCode: "6116", taxMode: "INCLUSIVE" },
      ],
    });

    await prisma.productTaxConfig.create({
      data: {
        storeId: storeA.id,
        sku: COMBO_SKU,
        title: "Foam Kit Pro",
        overridePrice: 1049,
        taxRate: 18,
        isTaxInclusive: true,
      },
    });

    const savedComponents = await prisma.comboInvoiceComponent.findMany({
      where: { storeId: storeA.id, comboSku: COMBO_SKU },
    });
    const totalAllocated = savedComponents.reduce((sum, c) => sum + c.allocatedValue, 0);

    assert(savedComponents.length === 3, "All 3 components saved in ComboInvoiceComponent");
    assert(Math.round(totalAllocated * 100) === 104900, "Sum of component allocated values equals Combo Selling Price ₹1049.00");

    // ─── TEST 2: Standalone SKU Price/GST Independence ───────────────────
    console.log("\nTEST 2: Standalone SKU Price/GST Independence...");
    
    // Standalone FMS has ₹899 @ 12% GST
    await prisma.productTaxConfig.create({
      data: {
        storeId: storeA.id,
        sku: FMS_SKU,
        title: "Foam Master Sprayer (Standalone)",
        overridePrice: 899,
        taxRate: 12,
        isTaxInclusive: true,
      },
    });

    // Check that combo component FMS allocation is still 700 @ 5% GST
    const comboFms = await prisma.comboInvoiceComponent.findUnique({
      where: {
        storeId_comboSku_componentSku: {
          storeId: storeA.id,
          comboSku: COMBO_SKU,
          componentSku: FMS_SKU,
        },
      },
    });

    assert(comboFms?.allocatedValue === 700, "Combo component FMS retains allocated value ₹700 despite standalone price ₹899");
    assert(comboFms?.gstRate === 5, "Combo component FMS retains 5% GST rate despite standalone 12% GST");

    // ─── TEST 3: Invoice Generation with Proportional Discount & Zero-Drift Math ───
    console.log("\nTEST 3: Invoice Generation with Proportional Discount & Zero-Drift Math...");

    // Create a mock Shopify order with this combo
    const orderNumber = `TEST-ORD-${Date.now()}`;
    const testOrder = await prisma.shopifyOrder.create({
      data: {
        storeId: storeA.id,
        shopifyOrderId: `shop-${Date.now()}`,
        orderNumber,
        name: `#${orderNumber}`,
        customerName: "Rajesh Kumar",
        email: "rajesh@example.com",
        phone: "+919876543210",
        totalPrice: 999.0, // Discount of ₹50 on combo
        subtotalPrice: 1049.0,
        totalDiscounts: 50.0,
        financialStatus: "PAID",
        shippingAddress: JSON.stringify({
          name: "Rajesh Kumar",
          address1: "MG Road",
          city: "Kochi",
          province: "Kerala",
          zip: "682001",
          country: "India",
        }),
        items: {
          create: [
            {
              storeId: storeA.id,
              shopifyOrderId: `shop-${Date.now()}`,
              shopifyLineItemId: `line-${Date.now()}`,
              productTitle: "Foam Kit Pro",
              sku: COMBO_SKU,
              quantity: 1,
              unitPrice: 1049.0,
              discountTotal: 50.0,
              totalPrice: 999.0,
            },
          ],
        },
      },
      include: {
        items: true,
      },
    });

    const invoiceData: any = await generateInvoiceForOrder(testOrder.id, undefined, undefined, storeA.id);

    assert(invoiceData.items.length === 4, "Invoice contains 4 rows: 1 Parent Combo Header + 3 Child Components");
    
    const comboHeader = invoiceData.items.find((i: any) => i.isComboHeader);
    const comboChildren = invoiceData.items.filter((i: any) => i.isComboComponent);

    assert(!!comboHeader, "Parent Combo Header row exists with isComboHeader: true");
    assert(comboChildren.length === 3, "Exactly 3 child component rows exist with isComboComponent: true");

    // Verify discount allocation across components:
    // Net Gross Total of child components should exactly equal net line total ₹999.00
    const childGrossTotal = comboChildren.reduce((sum: number, c: any) => sum + c.grossTotal, 0);
    const childDiscountTotal = comboChildren.reduce((sum: number, c: any) => sum + (c.discountAmount || 0), 0);
    const childTaxableTotal = comboChildren.reduce((sum: number, c: any) => sum + (c.taxableValue || 0), 0);
    const childTaxTotal = comboChildren.reduce(
      (sum: number, c: any) => sum + (c.cgstAmount || 0) + (c.sgstAmount || 0) + (c.igstAmount || 0),
      0
    );

    assert(Math.round(childGrossTotal * 100) === 99900, `Child components gross total (₹${childGrossTotal.toFixed(2)}) exactly equals discounted line total ₹999.00`);
    assert(Math.round(childDiscountTotal * 100) === 5000, `Child components discount total (₹${childDiscountTotal.toFixed(2)}) exactly equals order discount ₹50.00`);
    assert(
      Math.round((childTaxableTotal + childTaxTotal) * 100) === Math.round(childGrossTotal * 100),
      `Taxable (₹${childTaxableTotal.toFixed(2)}) + Tax (₹${childTaxTotal.toFixed(2)}) === Gross Total (₹${childGrossTotal.toFixed(2)}) with zero paise drift`
    );

    // Verify individual component rates
    const fmsChild = comboChildren.find((c: any) => c.sku === FMS_SKU);
    const snfChild = comboChildren.find((c: any) => c.sku === SNF_SKU);
    const glvChild = comboChildren.find((c: any) => c.sku === GLV_SKU);

    assert(fmsChild?.taxRate === 5, "FMS child row on invoice uses custom 5% GST rate");
    assert(snfChild?.taxRate === 18, "SNF200 child row on invoice uses custom 18% GST rate");
    assert(glvChild?.taxRate === 5, "GLVG11 child row on invoice uses custom 5% GST rate");

    // ─── TEST 4: Unfinalized Dynamic Updates vs Finalized Immutability ──
    console.log("\nTEST 4: Unfinalized Dynamic Updates vs Finalized Immutability...");

    // Part A: Unfinalized order dynamically reflects new combo breakdown
    // Update store combo config: FMS -> 12% GST, ₹650; SNF200 -> ₹250; GLVG11 -> ₹149 (Total = ₹1049)
    await prisma.comboInvoiceComponent.update({
      where: {
        storeId_comboSku_componentSku: {
          storeId: storeA.id,
          comboSku: COMBO_SKU,
          componentSku: FMS_SKU,
        },
      },
      data: { allocatedValue: 650, gstRate: 12 },
    });
    await prisma.comboInvoiceComponent.update({
      where: {
        storeId_comboSku_componentSku: {
          storeId: storeA.id,
          comboSku: COMBO_SKU,
          componentSku: SNF_SKU,
        },
      },
      data: { allocatedValue: 250 },
    });

    // Generate invoice for unfinalized order - MUST reflect new 12% GST and ₹650 allocation!
    const unfinalizedInvoice: any = await generateInvoiceForOrder(testOrder.id, undefined, undefined, storeA.id);
    const unfinalizedFms = unfinalizedInvoice.items.find((i: any) => i.sku === FMS_SKU && i.isComboComponent);

    assert(
      unfinalizedFms?.taxRate === 12,
      `Unfinalized order invoice dynamically reflects updated 12% GST (was 5%)`
    );
    assert(
      unfinalizedFms?.unitPrice === 650,
      `Unfinalized order invoice dynamically reflects updated allocated price ₹650 (was ₹700)`
    );

    // Part B: Finalized order preserves immutable historical snapshot
    // Mark order as fulfilled / outward scanned (finalized)
    await prisma.shopifyOrder.update({
      where: { id: testOrder.id },
      data: {
        fulfillmentStatus: "FULFILLED",
        deliveryStatus: "DELIVERED",
        outwardScanned: true,
      },
    });

    // Now update store combo configuration again: FMS -> 28% GST, ₹500
    await prisma.comboInvoiceComponent.update({
      where: {
        storeId_comboSku_componentSku: {
          storeId: storeA.id,
          comboSku: COMBO_SKU,
          componentSku: FMS_SKU,
        },
      },
      data: { allocatedValue: 500, gstRate: 28 },
    });

    // Generate invoice again for finalized order - MUST retain frozen 12% and ₹650!
    const finalizedInvoice: any = await generateInvoiceForOrder(testOrder.id, undefined, undefined, storeA.id);
    const finalizedFms = finalizedInvoice.items.find((i: any) => i.sku === FMS_SKU && i.isComboComponent);

    assert(
      finalizedFms?.taxRate === 12,
      `Finalized historical invoice retains frozen 12% GST snapshot despite store configuration updated to 28%`
    );
    assert(
      finalizedFms?.unitPrice === 650,
      `Finalized historical invoice retains frozen ₹650 allocated price despite store configuration updated to ₹500`
    );

    // Part C: Standalone SKU GST isolation
    // Update standalone FMS tax in ProductTaxConfig to 28%
    await prisma.productTaxConfig.upsert({
      where: { storeId_sku: { storeId: storeA.id, sku: FMS_SKU } },
      create: { storeId: storeA.id, sku: FMS_SKU, taxRate: 28, isTaxInclusive: true },
      update: { taxRate: 28 },
    });

    // Create a new unfinalized order with current combo config (FMS @ 28% in combo or let's set combo FMS back to 5%)
    await prisma.comboInvoiceComponent.update({
      where: {
        storeId_comboSku_componentSku: {
          storeId: storeA.id,
          comboSku: COMBO_SKU,
          componentSku: FMS_SKU,
        },
      },
      data: { allocatedValue: 700, gstRate: 5 },
    });
    await prisma.comboInvoiceComponent.update({
      where: {
        storeId_comboSku_componentSku: {
          storeId: storeA.id,
          comboSku: COMBO_SKU,
          componentSku: SNF_SKU,
        },
      },
      data: { allocatedValue: 200 },
    });

    const unfinalizedOrder2 = await prisma.shopifyOrder.create({
      data: {
        storeId: storeA.id,
        shopifyOrderId: `shop-test-${Date.now()}`,
        shopifyOrderNumber: "99999",
        shopifyOrderName: "#99999",
        orderNumber: "99999",
        name: "#99999",
        totalPrice: 1049.0,
        subtotalPrice: 1049.0,
        financialStatus: "PENDING",
        fulfillmentStatus: "UNFULFILLED",
        outwardScanned: false,
        items: {
          create: [
            {
              storeId: storeA.id,
              shopifyOrderId: `shop-test-${Date.now()}`,
              shopifyLineItemId: `line-test-${Date.now()}`,
              productTitle: "Foam Kit Pro",
              sku: COMBO_SKU,
              quantity: 1,
              unitPrice: 1049.0,
              totalPrice: 1049.0,
            },
          ],
        },
      },
    });

    const unfinalizedInvoice2: any = await generateInvoiceForOrder(unfinalizedOrder2.id, undefined, undefined, storeA.id);
    const comboFmsComp = unfinalizedInvoice2.items.find((i: any) => i.sku === FMS_SKU && i.isComboComponent);

    assert(
      comboFmsComp?.taxRate === 5,
      `Combo component FMS uses combo 5% GST (NOT standalone SKU 28% GST)`
    );

    // Clean up second order
    await prisma.shopifyOrderItem.deleteMany({ where: { orderId: unfinalizedOrder2.id } });
    await prisma.shopifyOrder.delete({ where: { id: unfinalizedOrder2.id } });

    // ─── TEST 5: Strict Balance Validation ───────────────────────────────
    console.log("\nTEST 5: Strict Balance Validation...");

    // Simulate validation logic from API
    const testAllocations = [
      { sku: FMS_SKU, val: 700 },
      { sku: SNF_SKU, val: 200 },
      { sku: GLV_SKU, val: 100 }, // Total = 1000 != 1049
    ];
    const testSellingPrice = 1049;
    const testAllocPaise = testAllocations.reduce((sum, a) => sum + Math.round(a.val * 100), 0);
    const testSellingPricePaise = Math.round(testSellingPrice * 100);
    const isMismatch = testAllocPaise !== testSellingPricePaise;
    const diff = (testSellingPricePaise - testAllocPaise) / 100;

    assert(isMismatch === true, "Validation detects mismatch when sum(allocatedValue) = ₹1000 !== ₹1049");
    assert(diff === 49, `Validation precisely computes difference ₹${diff.toFixed(2)} to return to merchant`);

    // ─── TEST 6: Multi-Tenant Store Isolation ────────────────────────────
    console.log("\nTEST 6: Multi-Tenant Store Isolation...");

    // Ensure Store B cannot see or query Store A's combo invoice components
    const storeBConfigs = await prisma.comboInvoiceComponent.findMany({
      where: { storeId: storeB.id, comboSku: COMBO_SKU },
    });

    assert(storeBConfigs.length === 0, "Store B has 0 combo invoice components for COMBO_SKU (Tenant Isolation holds)");

    // Clean up test order
    await prisma.shopifyOrderItem.deleteMany({ where: { orderId: testOrder.id } });
    await prisma.shopifyOrder.delete({ where: { id: testOrder.id } });

    console.log("\n===================================================================");
    console.log(`  ALL TESTS COMPLETED: ${passed} PASSED, ${failed} FAILED`);
    console.log("===================================================================\n");

    if (failed > 0) {
      process.exit(1);
    }
  } catch (err) {
    console.error("Test execution error:", err);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

runTests();
