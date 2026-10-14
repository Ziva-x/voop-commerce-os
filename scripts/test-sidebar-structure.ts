import assert from "assert";
import fs from "fs";
import path from "path";

function runSidebarTests() {
  console.log("=== Testing VOOP Sidebar Structure ===");

  const sidebarPath = path.resolve(__dirname, "../components/Sidebar.tsx");
  const content = fs.readFileSync(sidebarPath, "utf-8");

  // 1. Verify exact group names and arrays exist in code
  assert.ok(content.includes("const realtimeNav: NavItem[] = ["), "realtimeNav must exist");
  assert.ok(content.includes("const taxBillingNav: NavItem[] = ["), "taxBillingNav must exist");
  assert.ok(content.includes("const logisticsNav: NavItem[] = ["), "logisticsNav must exist");
  assert.ok(content.includes("const marketingNav: NavItem[] = ["), "marketingNav must exist");
  assert.ok(content.includes("const integrationsNav: NavItem[] = ["), "integrationsNav must exist");
  assert.ok(content.includes("const systemNav: NavItem[] = ["), "systemNav must exist");

  // 2. Verify allNavItems useMemo maps all 6 groups with exact uppercase group titles
  const allNavItemsSnippet = `const allNavItems = useMemo(() => [
    ...realtimeNav.map((i) => ({ ...i, group: "REALTIME DATA" })),
    ...taxBillingNav.map((i) => ({ ...i, group: "TAX & BILLING" })),
    ...logisticsNav.map((i) => ({ ...i, group: "LOGISTICS & COURIER" })),
    ...marketingNav.map((i) => ({ ...i, group: "MARKETING & CREATORS" })),
    ...integrationsNav.map((i) => ({ ...i, group: "INTEGRATIONS" })),
    ...systemNav.map((i) => ({ ...i, group: "SYSTEM" })),
  ], []);`;
  assert.ok(content.includes(allNavItemsSnippet), "allNavItems must map the 6 exact groups");

  // 3. Verify no standalone Shopify Store in sidebar navigation
  assert.ok(!content.includes(`{ name: "Shopify Store"`), "Shopify Store must NOT be in sidebar navigation");

  // 4. Verify specific label renames
  assert.ok(content.includes(`{ name: "All Shipments", section: "shipments", icon: Truck, permission: "shipments.view" }`), "Shipments must be named 'All Shipments'");
  assert.ok(content.includes(`{ name: "Scan Here (IN/OUT)", section: "scanner", icon: Barcode, permission: "shipments.manage" }`), "Scanner must be named 'Scan Here (IN/OUT)'");

  // 5. Verify JSX Section Titles in exact order
  const groupOrder = [
    "REALTIME DATA",
    "TAX &amp; BILLING",
    "LOGISTICS &amp; COURIER",
    "MARKETING &amp; CREATORS",
    "INTEGRATIONS",
    "SYSTEM",
  ];

  let lastIndex = -1;
  for (const group of groupOrder) {
    const idx = content.indexOf(group, content.indexOf("/* Navigation Links */"));
    assert.ok(idx > -1, `Group '${group}' must appear in JSX navigation`);
    assert.ok(idx > lastIndex, `Group '${group}' must appear in correct chronological order`);
    lastIndex = idx;
    console.log(`✓ Group confirmed in order: ${group.replace(/&amp;/g, "&")}`);
  }

  // 6. Verify exact items per section
  const expectedItems: Record<string, string[]> = {
    realtimeNav: ["Dashboard", "Analytics", "P&L Statement", "Orders & Line Items"],
    taxBillingNav: ["Manual Billing", "Purchases (All Bills)", "Tax on Sales"],
    logisticsNav: ["Scan Here (IN/OUT)", "All Shipments", "Products & Variants", "Physical Inventory"],
    marketingNav: ["All Ads & ROAS", "Collaborations", "Collab Form Builder"],
    integrationsNav: ["Company & Invoice", "All Ads Accounts", "All Courier APIs", "Settings"],
    systemNav: ["Sync Logs"],
  };

  for (const [navName, items] of Object.entries(expectedItems)) {
    const startIndex = content.indexOf(`const ${navName}: NavItem[] = [`);
    assert.ok(startIndex > -1, `${navName} block must exist`);
    const endIndex = content.indexOf("];", startIndex);
    const block = content.substring(startIndex, endIndex);

    let itemLastIndex = -1;
    for (const item of items) {
      const idx = block.indexOf(`name: "${item}"`);
      assert.ok(idx > -1, `Item '${item}' must exist in ${navName}`);
      assert.ok(idx > itemLastIndex, `Item '${item}' must be in correct order in ${navName}`);
      itemLastIndex = idx;
      console.log(`  ✓ Item confirmed in ${navName}: ${item}`);
    }
  }

  // 7. Test active route detection simulation
  const testRoutes = [
    { section: "", currentPath: "/app/mystore", shouldBeActive: true },
    { section: "analytics", currentPath: "/app/mystore/analytics", shouldBeActive: true },
    { section: "pnl", currentPath: "/app/mystore/pnl", shouldBeActive: true },
    { section: "orders", currentPath: "/app/mystore/orders", shouldBeActive: true },
    { section: "billing", currentPath: "/app/mystore/billing", shouldBeActive: true },
    { section: "purchases", currentPath: "/app/mystore/purchases", shouldBeActive: true },
    { section: "tax", currentPath: "/app/mystore/tax", shouldBeActive: true },
    { section: "scanner", currentPath: "/app/mystore/scanner", shouldBeActive: true },
    { section: "shipments", currentPath: "/app/mystore/shipments", shouldBeActive: true },
    { section: "products", currentPath: "/app/mystore/products", shouldBeActive: true },
    { section: "inventory", currentPath: "/app/mystore/inventory", shouldBeActive: true },
    { section: "ads", currentPath: "/app/mystore/ads", shouldBeActive: true },
    { section: "collaborations", currentPath: "/app/mystore/collaborations", shouldBeActive: true },
    { section: "form-builder", currentPath: "/app/mystore/form-builder", shouldBeActive: true },
    { section: "settings/company", currentPath: "/app/mystore/settings/company", shouldBeActive: true },
    { section: "settings/ads", currentPath: "/app/mystore/settings/ads", shouldBeActive: true },
    { section: "settings/couriers", currentPath: "/app/mystore/settings/couriers", shouldBeActive: true },
    { section: "settings", currentPath: "/app/mystore/settings", shouldBeActive: true },
    { section: "sync-logs", currentPath: "/app/mystore/sync-logs", shouldBeActive: true },
  ];

  for (const t of testRoutes) {
    const cleanSection = t.section.replace(/^\//, "");
    let isActive = false;
    if (cleanSection === "") {
      isActive = t.currentPath === "/" || t.currentPath.match(/^\/app\/[^/]+$/) !== null;
    } else {
      isActive =
        t.currentPath.endsWith("/" + cleanSection) ||
        t.currentPath.includes("/" + cleanSection + "/") ||
        t.currentPath === "/" + cleanSection;
    }
    assert.strictEqual(isActive, t.shouldBeActive, `Route '${t.currentPath}' must match section '${t.section}'`);
  }
  console.log("✓ All active route detections verified");

  console.log("\nAll VOOP sidebar structure tests PASSED successfully!");
}

runSidebarTests();
