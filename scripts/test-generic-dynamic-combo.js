const { InventoryService } = require("../lib/services/InventoryService");
const assert = require("assert");

console.log("=================================================");
console.log("TESTING DYNAMIC SKU-AGNOSTIC COMBO ENGINE");
console.log("=================================================");

let passed = 0;
let failed = 0;

function runTest(name, fn) {
  try {
    fn();
    console.log(`✓ PASS: ${name}`);
    passed++;
  } catch (err) {
    console.error(`✗ FAIL: ${name}`, err);
    failed++;
  }
}

// Test 1: Store A (RED-BOTTLE)
runTest("Store A: RED-BOTTLE dynamically parses components", () => {
  const catalogMap = new Map();
  catalogMap.set("RED", { price: 100, product: { title: "Red Solution" } });
  catalogMap.set("BOTTLE", { price: 50, product: { title: "500ml Spray Bottle" } });

  const result = InventoryService.parseComboSegments("RED-BOTTLE", catalogMap);
  assert(result.isCombo === true, "RED-BOTTLE should be identified as COMBO");
  assert.strictEqual(result.components.length, 2, "Should have 2 components");
  assert.strictEqual(result.components[0].componentSku, "RED");
  assert.strictEqual(result.components[0].quantity, 1);
  assert.strictEqual(result.components[1].componentSku, "BOTTLE");
  assert.strictEqual(result.components[1].quantity, 1);
});

// Test 2: Store B (BLUE-CLOTH)
runTest("Store B: BLUE-CLOTH dynamically parses components", () => {
  const catalogMap = new Map();
  catalogMap.set("BLUE", { price: 80, product: { title: "Blue Microfiber" } });
  catalogMap.set("CLOTH", { price: 40, product: { title: "Cleaning Cloth" } });

  const result = InventoryService.parseComboSegments("BLUE-CLOTH", catalogMap);
  assert(result.isCombo === true, "BLUE-CLOTH should be identified as COMBO");
  assert.strictEqual(result.components.length, 2);
  assert.strictEqual(result.components[0].componentSku, "BLUE");
  assert.strictEqual(result.components[1].componentSku, "CLOTH");
});

// Test 3: Store C (ABC-123-XYZ)
runTest("Store C: ABC-123-XYZ dynamically parses 3 components", () => {
  const catalogMap = new Map();
  catalogMap.set("ABC", { price: 10, product: { title: "Item ABC" } });
  catalogMap.set("123", { price: 20, product: { title: "Item 123" } });
  catalogMap.set("XYZ", { price: 30, product: { title: "Item XYZ" } });

  const result = InventoryService.parseComboSegments("ABC-123-XYZ", catalogMap);
  assert(result.isCombo === true, "ABC-123-XYZ should be COMBO");
  assert.strictEqual(result.components.length, 3);
  assert.strictEqual(result.components[0].componentSku, "ABC");
  assert.strictEqual(result.components[1].componentSku, "123");
  assert.strictEqual(result.components[2].componentSku, "XYZ");
});

// Test 4: PRODUCT1-PRODUCT2
runTest("Generic: PRODUCT1-PRODUCT2 parses correctly", () => {
  const catalogMap = new Map();
  catalogMap.set("PRODUCT1", { price: 50, product: { title: "Product 1" } });
  catalogMap.set("PRODUCT2", { price: 60, product: { title: "Product 2" } });

  const result = InventoryService.parseComboSegments("PRODUCT1-PRODUCT2", catalogMap);
  assert(result.isCombo === true);
  assert.strictEqual(result.components.length, 2);
  assert.strictEqual(result.components[0].componentSku, "PRODUCT1");
  assert.strictEqual(result.components[1].componentSku, "PRODUCT2");
});

// Test 5: FOAM-BOTTLE-500ML
runTest("Generic: FOAM-BOTTLE-500ML parses correctly", () => {
  const catalogMap = new Map();
  catalogMap.set("FOAM", { price: 200, product: { title: "Snow Foam" } });
  catalogMap.set("BOTTLE", { price: 100, product: { title: "Bottle Body" } });
  catalogMap.set("500ML", { price: 50, product: { title: "500ml Nozzle" } });

  const result = InventoryService.parseComboSegments("FOAM-BOTTLE-500ML", catalogMap);
  assert(result.isCombo === true);
  assert.strictEqual(result.components.length, 3);
  assert.strictEqual(result.components[0].componentSku, "FOAM");
  assert.strictEqual(result.components[1].componentSku, "BOTTLE");
  assert.strictEqual(result.components[2].componentSku, "500ML");
});

// Test 6: Multiplier support (2X-ABC-XYZ)
runTest("Generic: Multipliers (2X-ABC-XYZ) parse properly", () => {
  const catalogMap = new Map();
  catalogMap.set("ABC", { price: 10, product: { title: "Item ABC" } });
  catalogMap.set("XYZ", { price: 20, product: { title: "Item XYZ" } });

  const result = InventoryService.parseComboSegments("2X-ABC-XYZ", catalogMap);
  assert(result.isCombo === true);
  assert.strictEqual(result.components[0].componentSku, "ABC");
  assert.strictEqual(result.components[0].quantity, 2);
  assert.strictEqual(result.components[1].componentSku, "XYZ");
  assert.strictEqual(result.components[1].quantity, 1);
});

// Test 7: Non-combo single item with hyphens (e.g. TSHIRT-BLUE-XL where parts are NOT in catalog)
runTest("Hyphenated SKU without catalog components is preserved as SINGLE item", () => {
  const catalogMap = new Map();
  catalogMap.set("TSHIRT-BLUE-XL", { price: 500, product: { title: "T-Shirt Blue XL" } });

  const result = InventoryService.parseComboSegments("TSHIRT-BLUE-XL", catalogMap);
  assert(result.isCombo === false, "Should NOT be detected as combo when components do not exist");
  assert.strictEqual(result.components.length, 0);
});

// Test 8: Codebase audit for hardcoded SKU strings in application logic
runTest("Codebase contains zero hardcoded SKU checks", () => {
  const fs = require("fs");
  const path = require("path");

  const filesToCheck = [
    path.join(__dirname, "../lib/services/InventoryService.ts"),
    path.join(__dirname, "../lib/shopify.ts"),
    path.join(__dirname, "../lib/services/OrderReconciliationService.ts"),
    path.join(__dirname, "../lib/invoice-generator.ts"),
  ];

  const bannedPatterns = [
    /rawSku\s*===\s*["']FMS/i,
    /sku\.includes\(["']FMS/i,
    /sku\.includes\(["']GLVG/i,
    /rawSku\.startsWith\(["']FMS/i,
    /effectiveSku\.startsWith\(["']FMS/i,
    /1200MCROCLOTH/i,
  ];

  for (const filePath of filesToCheck) {
    const content = fs.readFileSync(filePath, "utf-8");
    for (const pattern of bannedPatterns) {
      assert(!pattern.test(content), `Found banned hardcoded pattern ${pattern} in ${filePath}`);
    }
  }
});

console.log("\n=================================================");
console.log(`RESULTS: ${passed} passed, ${failed} failed`);
console.log("=================================================");
if (failed > 0) process.exit(1);
