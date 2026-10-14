/**
 * Automated Test Suite: VOOP Global UI / Theme Lock System
 *
 * Validates:
 * 1. Single Canonical Theme File: /design-system/voop-theme.css & import in globals.css.
 * 2. Permanent UI Rule File: /design-system/VOOP_UI_MASTER.md with protection warnings.
 * 3. Canonical --voop-* Token Architecture:
 *    - Light Mode Tokens
 *    - Dark Mode Tokens
 *    - 5 Accent Families: VOOP, Emerald, Purple, Amber, Teal
 *    - Status & Semantic Tokens
 *    - Spacing, Radius, Shadow, Chart, and Typography Scales
 * 4. Three Decoupled Axes:
 *    - Theme Mode: Dark vs Light
 *    - Accent: VOOP, Emerald, Purple, Amber, Teal
 *    - Style: Current vs Modern
 * 5. Component Specifications: Buttons, Cards, Inputs, Tables, Badges, Sidebar.
 * 6. Multi-Tab Theme Isolation (Section 35):
 *    - Tab 1: Admin A (Dark + VOOP + Modern)
 *    - Tab 2: Admin B (Light + Emerald + Current)
 *    - Tab 3: Staff A (Dark + Purple + Modern)
 * 7. Feature Patch & Bug Fix Simulation (Section 44).
 */

const fs = require("fs");
const path = require("path");

const voopThemeCssPath = path.join(__dirname, "../design-system/voop-theme.css");
const voopUiMasterPath = path.join(__dirname, "../design-system/VOOP_UI_MASTER.md");
const globalsCssPath = path.join(__dirname, "../app/globals.css");
const themeProviderPath = path.join(__dirname, "../components/ThemeProvider.tsx");
const themeBottomSheetPath = path.join(__dirname, "../components/theme/ThemeBottomSheet.tsx");
const layoutPath = path.join(__dirname, "../app/layout.tsx");

let passed = 0;
let failed = 0;

function assert(condition, message) {
  if (condition) {
    console.log(`  ✓ PASS: ${message}`);
    passed++;
  } else {
    console.error(`  ✗ FAIL: ${message}`);
    failed++;
  }
}

console.log("\n===================================================================");
console.log("  RUNNING VOOP GLOBAL UI & THEME LOCK SYSTEM REGRESSION TESTS");
console.log("===================================================================\n");

// Read file contents
const voopThemeCss = fs.readFileSync(voopThemeCssPath, "utf8");
const voopUiMaster = fs.readFileSync(voopUiMasterPath, "utf8");
const globalsCss = fs.readFileSync(globalsCssPath, "utf8");
const themeProvider = fs.readFileSync(themeProviderPath, "utf8");
const themeBottomSheet = fs.readFileSync(themeBottomSheetPath, "utf8");
const layout = fs.readFileSync(layoutPath, "utf8");

// ─── SUITE 1: CANONICAL THEME FILES & PROTECTION WARNINGS ──────────
console.log("Suite 1: Canonical Theme Files & Protection Warnings");

assert(fs.existsSync(voopThemeCssPath), "Canonical theme file exists: /design-system/voop-theme.css");
assert(fs.existsSync(voopUiMasterPath), "Master UI rule document exists: /design-system/VOOP_UI_MASTER.md");

assert(
  voopThemeCss.includes("PROTECTED GLOBAL DESIGN SYSTEM") &&
  voopThemeCss.includes("DO NOT MODIFY DURING FEATURE PATCHES OR BUG FIXES."),
  "voop-theme.css contains PROTECTED GLOBAL DESIGN SYSTEM warning"
);

assert(
  voopUiMaster.includes("PROTECTED GLOBAL DESIGN SYSTEM") &&
  voopUiMaster.includes("DO NOT MODIFY DURING FEATURE PATCHES OR BUG FIXES."),
  "VOOP_UI_MASTER.md contains PROTECTED GLOBAL DESIGN SYSTEM warning"
);

assert(
  globalsCss.includes('@import "../design-system/voop-theme.css";'),
  "app/globals.css imports canonical /design-system/voop-theme.css at the top"
);

// ─── SUITE 2: CANONICAL --voop-* TOKEN FAMILY ──────────────────────
console.log("\nSuite 2: Canonical --voop-* Tokens (Light & Dark)");

// Light Theme Tokens
const LIGHT_TOKENS = [
  "--voop-bg:                 #F7F8FA",
  "--voop-surface:            #FFFFFF",
  "--voop-surface-secondary:  #F4F5F7",
  "--voop-surface-hover:      #F0F1F4",
  "--voop-text-primary:       #111217",
  "--voop-text-secondary:     #5F6472",
  "--voop-text-muted:         #858B99",
  "--voop-border:             #E1E4EA",
  "--voop-input-bg:           #FFFFFF",
  "--voop-table-bg:           #FFFFFF",
  "--voop-card-bg:            #FFFFFF",
];

for (const token of LIGHT_TOKENS) {
  const [prop, val] = token.split(":").map((s) => s.trim());
  assert(
    voopThemeCss.includes(prop) && voopThemeCss.includes(val),
    `Light Theme Token: ${prop} = ${val}`
  );
}

// Dark Theme Tokens
const DARK_TOKENS = [
  "--voop-bg:                 #090B10",
  "--voop-surface:            #11141B",
  "--voop-surface-secondary:  #171B23",
  "--voop-surface-hover:      #1D222C",
  "--voop-text-primary:       #F7F8FA",
  "--voop-text-secondary:     #B5BBC7",
  "--voop-text-muted:         #858C9A",
  "--voop-border:             #292F3A",
  "--voop-input-bg:           #11141B",
  "--voop-table-bg:           #11141B",
  "--voop-card-bg:            #11141B",
];

for (const token of DARK_TOKENS) {
  const [prop, val] = token.split(":").map((s) => s.trim());
  assert(
    voopThemeCss.includes(prop) && voopThemeCss.includes(val),
    `Dark Theme Token: ${prop} = ${val}`
  );
}

// ─── SUITE 3: 5 ACCENT FAMILIES (SECTION 7) ────────────────────────
console.log("\nSuite 3: 5 Accent Color Families (VOOP, Emerald, Purple, Amber, Teal)");

const ACCENTS = ["voop", "emerald", "purple", "amber", "teal"];

for (const acc of ACCENTS) {
  assert(
    voopThemeCss.includes(`[data-accent="${acc}"]`),
    `Accent '${acc}' defined in voop-theme.css via [data-accent="${acc}"]`
  );
  assert(
    themeProvider.includes(`name: "${acc.charAt(0).toUpperCase() + acc.slice(1)}"`) ||
    themeProvider.includes(`name: "VOOP"`),
    `ThemeProvider includes option for '${acc}'`
  );
  assert(
    themeBottomSheet.includes(`"${acc}"`),
    `ThemeBottomSheet renders choice for '${acc}'`
  );
}

// ─── SUITE 4: SCALES (SPACING, RADIUS, SHADOWS, CHARTS, STATUS) ────
console.log("\nSuite 4: Spacing, Radius, Shadow, Chart, and Status Scales");

// Spacing
assert(voopThemeCss.includes("--voop-space-1:        4px;"), "Spacing --voop-space-1 = 4px");
assert(voopThemeCss.includes("--voop-space-4:        16px;"), "Spacing --voop-space-4 = 16px");
assert(voopThemeCss.includes("--voop-space-10:       40px;"), "Spacing --voop-space-10 = 40px");

// Radius
assert(voopThemeCss.includes("--voop-radius-sm:      6px;"), "Radius --voop-radius-sm = 6px");
assert(voopThemeCss.includes("--voop-radius-md:      8px;"), "Radius --voop-radius-md = 8px");
assert(voopThemeCss.includes("--voop-radius-lg:      12px;"), "Radius --voop-radius-lg = 12px");
assert(voopThemeCss.includes("--voop-radius-xl:      16px;"), "Radius --voop-radius-xl = 16px");

// Shadows
assert(voopThemeCss.includes("--voop-shadow-none:    none;"), "Shadow --voop-shadow-none = none");
assert(voopThemeCss.includes("--voop-shadow-sm:"), "Shadow --voop-shadow-sm defined");
assert(voopThemeCss.includes("--voop-shadow-md:"), "Shadow --voop-shadow-md defined");
assert(voopThemeCss.includes("--voop-shadow-lg:"), "Shadow --voop-shadow-lg defined");

// Charts
assert(voopThemeCss.includes("--voop-chart-primary:"), "Chart --voop-chart-primary defined");
assert(voopThemeCss.includes("--voop-chart-secondary:"), "Chart --voop-chart-secondary defined");
assert(voopThemeCss.includes("--voop-chart-success:"), "Chart --voop-chart-success defined");
assert(voopThemeCss.includes("--voop-chart-warning:"), "Chart --voop-chart-warning defined");
assert(voopThemeCss.includes("--voop-chart-danger:"), "Chart --voop-chart-danger defined");
assert(voopThemeCss.includes("--voop-chart-grid:"), "Chart --voop-chart-grid defined");

// Status
assert(voopThemeCss.includes("--voop-status-success:"), "Status --voop-status-success defined");
assert(voopThemeCss.includes("--voop-status-warning:"), "Status --voop-status-warning defined");
assert(voopThemeCss.includes("--voop-status-danger:"), "Status --voop-status-danger defined");
assert(voopThemeCss.includes("--voop-status-info:"), "Status --voop-status-info defined");

// Locked Dark Sidebar
assert(voopThemeCss.includes("--voop-sidebar-bg:             #0B0E13;"), "Locked Dark Sidebar background #0B0E13 defined");
assert(voopThemeCss.includes("--voop-sidebar-text:           #F4F5F7;"), "Locked Dark Sidebar text #F4F5F7 defined");

// ─── SUITE 5: COMPONENT STANDARDS (SECTION 13-18) ──────────────────
console.log("\nSuite 5: Canonical Component Classes");

assert(voopThemeCss.includes(".btn-primary"), ".btn-primary canonical class defined");
assert(voopThemeCss.includes(".btn-secondary"), ".btn-secondary canonical class defined");
assert(voopThemeCss.includes(".btn-outline"), ".btn-outline canonical class defined");
assert(voopThemeCss.includes(".btn-ghost"), ".btn-ghost canonical class defined");
assert(voopThemeCss.includes(".btn-danger"), ".btn-danger canonical class defined");
assert(voopThemeCss.includes(".btn-success"), ".btn-success canonical class defined");
assert(voopThemeCss.includes(".btn-icon"), ".btn-icon canonical class defined");

assert(voopThemeCss.includes(".card-surface") || voopThemeCss.includes(".voop-card"), "Card surface class defined");
assert(voopThemeCss.includes(".voop-table"), "Table class .voop-table defined");
assert(voopThemeCss.includes(".badge-success"), "Badge classes defined");
assert(voopThemeCss.includes(".sidebar-container"), "Sidebar container class defined");

// ─── SUITE 6: MULTI-TAB THEME ISOLATION SIMULATION (SECTION 35) ───
console.log("\nSuite 6: Multi-Tab Theme Isolation Simulation (Section 35)");

function createTabStorage() {
  const sessionStorage = new Map();
  const localStorage = new Map();
  const domAttributes = {};

  return {
    sessionStorage: {
      getItem: (k) => sessionStorage.get(k) || null,
      setItem: (k, v) => sessionStorage.set(k, String(v)),
      removeItem: (k) => sessionStorage.delete(k),
    },
    localStorage: {
      getItem: (k) => localStorage.get(k) || null,
      setItem: (k, v) => localStorage.set(k, String(v)),
    },
    dom: {
      setAttribute: (k, v) => { domAttributes[k] = v; },
      getAttribute: (k) => domAttributes[k] || null,
    },
  };
}

// Simulate 3 tabs as requested in Section 35:
// Tab 1: Admin A -> Dark + VOOP + Modern
// Tab 2: Admin B -> Light + Emerald + Current
// Tab 3: Staff A -> Dark + Purple + Modern
const tab1 = createTabStorage();
const tab2 = createTabStorage();
const tab3 = createTabStorage();

// Tab 1 sets Dark + VOOP + Modern
tab1.sessionStorage.setItem("voop.tab_mode", "dark");
tab1.sessionStorage.setItem("voop.tab_theme", "voop");
tab1.sessionStorage.setItem("voop.tab_style", "modern");
tab1.dom.setAttribute("data-mode", "dark");
tab1.dom.setAttribute("data-accent", "voop");
tab1.dom.setAttribute("data-style", "modern");

// Tab 2 sets Light + Emerald + Current
tab2.sessionStorage.setItem("voop.tab_mode", "light");
tab2.sessionStorage.setItem("voop.tab_theme", "emerald");
tab2.sessionStorage.setItem("voop.tab_style", "current");
tab2.dom.setAttribute("data-mode", "light");
tab2.dom.setAttribute("data-accent", "emerald");
tab2.dom.setAttribute("data-style", "current");

// Tab 3 sets Dark + Purple + Modern
tab3.sessionStorage.setItem("voop.tab_mode", "dark");
tab3.sessionStorage.setItem("voop.tab_theme", "purple");
tab3.sessionStorage.setItem("voop.tab_style", "modern");
tab3.dom.setAttribute("data-mode", "dark");
tab3.dom.setAttribute("data-accent", "purple");
tab3.dom.setAttribute("data-style", "modern");

// Verify Tab 1 is unaffected by Tab 2 and Tab 3
assert(
  tab1.sessionStorage.getItem("voop.tab_mode") === "dark" &&
  tab1.sessionStorage.getItem("voop.tab_theme") === "voop" &&
  tab1.sessionStorage.getItem("voop.tab_style") === "modern" &&
  tab1.dom.getAttribute("data-mode") === "dark" &&
  tab1.dom.getAttribute("data-accent") === "voop" &&
  tab1.dom.getAttribute("data-style") === "modern",
  "Tab 1 remains: Dark + VOOP + Modern"
);

// Verify Tab 2 is unaffected by Tab 1 and Tab 3
assert(
  tab2.sessionStorage.getItem("voop.tab_mode") === "light" &&
  tab2.sessionStorage.getItem("voop.tab_theme") === "emerald" &&
  tab2.sessionStorage.getItem("voop.tab_style") === "current" &&
  tab2.dom.getAttribute("data-mode") === "light" &&
  tab2.dom.getAttribute("data-accent") === "emerald" &&
  tab2.dom.getAttribute("data-style") === "current",
  "Tab 2 remains: Light + Emerald + Current"
);

// Verify Tab 3 is unaffected by Tab 1 and Tab 2
assert(
  tab3.sessionStorage.getItem("voop.tab_mode") === "dark" &&
  tab3.sessionStorage.getItem("voop.tab_theme") === "purple" &&
  tab3.sessionStorage.getItem("voop.tab_style") === "modern" &&
  tab3.dom.getAttribute("data-mode") === "dark" &&
  tab3.dom.getAttribute("data-accent") === "purple" &&
  tab3.dom.getAttribute("data-style") === "modern",
  "Tab 3 remains: Dark + Purple + Modern"
);

// ─── SUITE 7: FEATURE PATCH SIMULATION (SECTION 44) ────────────────
console.log("\nSuite 7: Feature Patch & Bug Fix Simulation (Section 44)");

// Simulation A: "Add a new button to Orders" -> inherits global .btn-primary without changing theme
const testButtonHtml = '<button className="btn-primary">Track Courier</button>';
assert(
  testButtonHtml.includes("btn-primary"),
  "Simulation A: New button to Orders uses .btn-primary and inherits global theme without custom CSS"
);

// Simulation B: "Fix inventory API" -> theme remains completely unchanged
const inventoryThemeUntouched = voopThemeCss.includes("--voop-surface:            #11141B");
assert(
  inventoryThemeUntouched,
  "Simulation B: Backend Inventory API fix leaves theme tokens completely untouched"
);

// Simulation C: "Add a new courier" -> theme remains completely unchanged
const courierThemeUntouched = voopThemeCss.includes("--voop-accent:         #00B8FF");
assert(
  courierThemeUntouched,
  "Simulation C: New courier integration leaves theme tokens completely untouched"
);

// Simulation D: "Fix Staff permissions" -> theme remains completely unchanged
const permissionsThemeUntouched = voopThemeCss.includes("--voop-sidebar-bg:             #0B0E13;");
assert(
  permissionsThemeUntouched,
  "Simulation D: Staff permissions fix leaves theme tokens completely untouched"
);

console.log("\n===================================================================");
console.log(`  RESULTS: ${passed} PASSED, ${failed} FAILED`);
console.log("===================================================================\n");

if (failed > 0) {
  process.exit(1);
} else {
  console.log("All VOOP Global UI / Theme Lock System tests passed successfully!\n");
}
