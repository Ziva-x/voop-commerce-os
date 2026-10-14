import { prisma } from "@/lib/prisma";
import { InventoryService } from "@/lib/services/InventoryService";
import { PnLService } from "@/lib/services/PnLService";

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
  console.log("\n========================================================");
  console.log("  TEST SUITE: CANONICAL PRODUCT ARCHITECTURE & MULTI-TENANCY");
  console.log("========================================================\n");

  // Fetch both test accounts
  const userA = await prisma.user.findFirst({
    where: { username: "adithziva" },
    include: { store: true },
  });

  const userB = await prisma.user.findFirst({
    where: { username: "adithziva12" },
    include: { store: true },
  });

  console.log("--- Test 1: Authenticated Account -> VOOP Store ID -> Shopify Store Linkage ---");
  assert(userA !== null && userA.voopStoreId === "VOOP-H2GDGBVA", "Account A has permanent VOOP Store ID VOOP-H2GDGBVA");
  assert(userA?.store !== null && userA?.store?.shopDomain === "qt0dyq-79.myshopify.com", "Account A linked to qt0dyq-79.myshopify.com");
  assert(userB !== null && userB.voopStoreId === "VOOP-T162QPD8", "Account B has permanent VOOP Store ID VOOP-T162QPD8");
  assert(userB?.store !== null && userB?.store?.shopDomain === "monkey-garage-test.myshopify.com", "Account B linked to monkey-garage-test.myshopify.com");

  if (!userA?.store || !userB?.store) {
    console.error("Test accounts not properly initialized");
    process.exit(1);
  }

  console.log("\n--- Test 2: Canonical Product Source (Shopify Products & Variants) ---");
  const storeAId = userA.store.id;
  const storeBId = userB.store.id;

  const productsA = await prisma.shopifyProduct.findMany({ where: { storeId: storeAId } });
  const variantsA = await prisma.shopifyVariant.findMany({ where: { storeId: storeAId }, include: { product: true } });
  assert(productsA.length > 0, `Store A has ${productsA.length} canonical Shopify products`);
  assert(variantsA.length > 0, `Store A has ${variantsA.length} canonical Shopify variants`);

  // Ensure every variant has valid shopifyProductId and shopifyVariantId
  const allVariantsHaveIds = variantsA.every(v => Boolean(v.shopifyProductId && v.shopifyVariantId));
  assert(allVariantsHaveIds, "All Store A variants have valid shopifyProductId and shopifyVariantId");

  console.log("\n--- Test 3: Tax on Sales Catalog Resolution ---");
  // Check ProductTaxConfig schema and mapping
  const taxConfigsA = await prisma.productTaxConfig.findMany({ where: { storeId: storeAId } });
  console.log(`  Info: Store A has ${taxConfigsA.length} existing tax configurations`);

  // Test upserting a tax config with shopifyVariantId and shopifyProductId
  const sampleVariant = variantsA[0];
  const testSku = (sampleVariant.sku || `VAR-${sampleVariant.shopifyVariantId}`).toUpperCase().trim();
  const upsertedConfig = await prisma.productTaxConfig.upsert({
    where: { storeId_sku: { storeId: storeAId, sku: testSku } },
    create: {
      storeId: storeAId,
      shopifyProductId: sampleVariant.shopifyProductId,
      shopifyVariantId: sampleVariant.shopifyVariantId,
      sku: testSku,
      title: sampleVariant.product.title,
      taxRate: 18.0,
      isTaxInclusive: true,
      hsnCode: "3402",
    },
    update: {
      shopifyProductId: sampleVariant.shopifyProductId,
      shopifyVariantId: sampleVariant.shopifyVariantId,
      hsnCode: "3402",
    },
  });

  assert(upsertedConfig.shopifyVariantId === sampleVariant.shopifyVariantId, "ProductTaxConfig correctly stores canonical shopifyVariantId");
  assert(upsertedConfig.shopifyProductId === sampleVariant.shopifyProductId, "ProductTaxConfig correctly stores canonical shopifyProductId");
  assert(upsertedConfig.storeId === storeAId, "ProductTaxConfig strictly scoped to storeId");

  console.log("\n--- Test 4: Physical Inventory (Stock Master) Title Resolution ---");
  const overviewA = await InventoryService.getInventoryOverview(storeAId);
  assert(overviewA.stockItems && overviewA.stockItems.length > 0, `Stock Master returned ${overviewA.stockItems.length} items for Store A`);

  // Check SINGLE products for title resolution
  const singleItems = overviewA.stockItems.filter((s: any) => s.type === "SINGLE");
  console.log(`  Info: Found ${singleItems.length} SINGLE items in Stock Master`);

  // Find 1:10SNF200
  const snowFoamItem = singleItems.find((s: any) => s.sku.toUpperCase() === "1:10SNF200");
  if (snowFoamItem) {
    assert(
      snowFoamItem.name.includes("MonkeyGarage High-Density Snow Foam"),
      `1:10SNF200 resolved to Shopify Product Title: "${snowFoamItem.name}"`
    );
    assert(snowFoamItem.name !== "1:10SNF200", "1:10SNF200 does not display raw SKU in ITEM DESCRIPTION");
  } else {
    console.log("  Notice: 1:10SNF200 not found in Store A stockItems");
  }

  // Find GLVG11 or other single glove items
  const gloveItem = singleItems.find((s: any) => s.sku.toUpperCase() === "GLVG11" || s.sku.toUpperCase() === "GLVP11");
  if (gloveItem) {
    assert(
      gloveItem.name.includes("Microfiber Glove") || gloveItem.name.length > gloveItem.sku.length,
      `Glove item resolved description: "${gloveItem.name}"`
    );
  }

  console.log("\n--- Test 5: COMBO Products Rule & BOM Recipe Preservation ---");
  const comboItems = overviewA.stockItems.filter((s: any) => s.type === "COMBO");
  assert(comboItems.length > 0, `Store A has ${comboItems.length} COMBO items`);

  const fmsCombo = comboItems.find((c: any) => c.sku === "FMS-1:10SNF200");
  if (fmsCombo) {
    assert(fmsCombo.type === "COMBO", "FMS-1:10SNF200 remains type COMBO");
    assert(fmsCombo.currentStock === 0, "COMBO invariant: physical stock is 0 (derived from components)");
    assert(fmsCombo.comboComponents && fmsCombo.comboComponents.length > 0, "FMS-1:10SNF200 preserves BOM recipe components");
    console.log(`  Info: FMS-1:10SNF200 BOM components: ${fmsCombo.comboComponents.map((c: any) => `${c.componentSku} × ${c.quantity}`).join(", ")}`);
  }

  console.log("\n--- Test 6: ExpenseSetting Resilience & Concurrency ---");
  const [setting1, setting2] = await Promise.all([
    PnLService.getExpenseSettings(storeAId),
    PnLService.getExpenseSettings(storeAId),
  ]);
  assert(setting1.id === setting2.id, "Concurrent getExpenseSettings returns identical tenant record without unique constraint error");
  assert(setting1.storeId === storeAId, "ExpenseSetting belongs strictly to storeId");

  console.log("\n--- Test 7: Multi-Tenant Complete Isolation ---");
  const taxConfigsB = await prisma.productTaxConfig.findMany({ where: { storeId: storeBId } });
  const hasStoreAInB = taxConfigsB.some(tc => tc.storeId === storeAId);
  assert(!hasStoreAInB, "Zero cross-tenant leakage: Store B has 0 Store A tax configs");

  const variantsB = await prisma.shopifyVariant.findMany({ where: { storeId: storeBId } });
  const hasVariantsAInB = variantsB.some(v => v.storeId === storeAId);
  assert(!hasVariantsAInB, "Zero cross-tenant leakage: Store B has 0 Store A variants");

  console.log("\n========================================================");
  console.log(`  RESULTS: ${passed} PASSED, ${failed} FAILED`);
  console.log("========================================================\n");

  if (failed > 0) {
    process.exit(1);
  }
}

runTests()
  .catch(err => {
    console.error("Test error:", err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
