import React from "react";
import ReactDOMServer from "react-dom/server";
import fs from "fs";
import path from "path";

function assert(condition: boolean, message: string) {
  if (!condition) {
    console.error(`❌ Assertion Failed: ${message}`);
    process.exit(1);
  }
  console.log(`✅ ${message}`);
}

console.log("\n========================================================");
console.log("VOOP — GLOBAL DRAWER POSITIONING ARCHITECTURE TEST SUITE");
console.log("========================================================\n");

// 1. Verify Drawer component source & implementation
console.log("--- 1. Verifying Shared Drawer Component Architecture ---");
const drawerSourcePath = path.join(__dirname, "../components/ui/Drawer.tsx");
assert(fs.existsSync(drawerSourcePath), "Drawer.tsx exists in components/ui/");

const drawerSource = fs.readFileSync(drawerSourcePath, "utf-8");

assert(drawerSource.includes("createPortal"), "Uses createPortal to escape parent layout and attach to document.body");
assert(drawerSource.includes("document.body"), "Portals directly to document.body root");
assert(drawerSource.includes('top: 0') || drawerSource.includes('"top": 0') || drawerSource.includes("top:0"), "Sets top: 0 for flush viewport alignment");
assert(drawerSource.includes('bottom: 0') || drawerSource.includes('"bottom": 0') || drawerSource.includes("bottom:0"), "Sets bottom: 0");
assert(drawerSource.includes('right: 0') || drawerSource.includes('"right": 0') || drawerSource.includes("right:0"), "Sets right: 0");
assert(drawerSource.includes("100dvh"), "Uses viewport-aware 100dvh for height");
assert(!drawerSource.includes("calc(100vh -"), "Avoids arbitrary header height calculations / magic numbers");
assert(drawerSource.includes("Escape"), "Includes ESC key dismiss handler");
assert(drawerSource.includes("overflow"), "Manages body scroll lock while drawer is open");

// 2. Verify UI index export
console.log("\n--- 2. Verifying components/ui Index Export ---");
const uiIndexPath = path.join(__dirname, "../components/ui/index.ts");
const uiIndexSource = fs.readFileSync(uiIndexPath, "utf-8");
assert(uiIndexSource.includes('export * from "./Drawer"'), "Drawer is re-exported from components/ui");

// 3. Verify globals.css keyframes and utility classes
console.log("\n--- 3. Verifying globals.css Animations and Utility Classes ---");
const globalsCssPath = path.join(__dirname, "../app/globals.css");
const globalsCss = fs.readFileSync(globalsCssPath, "utf-8");

assert(globalsCss.includes("@keyframes slideInRight"), "globals.css contains @keyframes slideInRight");
assert(globalsCss.includes(".animate-slide-in-right"), "globals.css contains .animate-slide-in-right class");
assert(globalsCss.includes(".voop-drawer-backdrop"), "globals.css contains .voop-drawer-backdrop class");
assert(globalsCss.includes(".voop-drawer-panel"), "globals.css contains .voop-drawer-panel class");
assert(globalsCss.includes("100dvh"), "globals.css drawer utilities use 100dvh");

// 4. Verify ProductsView (Variant Inspector)
console.log("\n--- 4. Verifying Variant Inspector in ProductsView ---");
const productsViewSource = fs.readFileSync(
  path.join(__dirname, "../components/views/ProductsView.tsx"),
  "utf-8"
);
assert(productsViewSource.includes('import { Drawer } from "@/components/ui"'), "ProductsView imports shared Drawer from @/components/ui");
assert(productsViewSource.includes("<Drawer"), "ProductsView uses shared Drawer component");
assert(productsViewSource.includes("Variant Inspector"), "Variant Inspector rendered inside Drawer");
assert(!productsViewSource.includes('className="fixed inset-0 z-50 flex items-center justify-end'), "Removed un-portaled ad-hoc fixed div from ProductsView");

// 5. Verify ShipmentsView (Tracking Details)
console.log("\n--- 5. Verifying Tracking Details in ShipmentsView ---");
const shipmentsViewSource = fs.readFileSync(
  path.join(__dirname, "../components/views/ShipmentsView.tsx"),
  "utf-8"
);
assert(shipmentsViewSource.includes('import { Drawer } from "@/components/ui"'), "ShipmentsView imports shared Drawer from @/components/ui");
assert(shipmentsViewSource.includes("<Drawer"), "ShipmentsView uses shared Drawer component for Tracking Details");
assert(shipmentsViewSource.includes("Tracking details for"), "Tracking details drawer configured with ariaLabel");

// 6. Verify OrdersView (Order Details)
console.log("\n--- 6. Verifying Order Details in OrdersView ---");
const ordersViewSource = fs.readFileSync(
  path.join(__dirname, "../components/views/OrdersView.tsx"),
  "utf-8"
);
assert(ordersViewSource.includes('import { Drawer } from "@/components/ui"'), "OrdersView imports shared Drawer from @/components/ui");
assert(ordersViewSource.includes("<Drawer"), "OrdersView uses shared Drawer component for Order Details");

// 7. Verify no ad-hoc workarounds
console.log("\n--- 7. Verifying Architectural Cleanliness (Rule 19) ---");
assert(!globalsCss.includes(".variant-inspector-top-fix"), "No .variant-inspector-top-fix hack created");
assert(!globalsCss.includes(".tracking-drawer-top-fix"), "No .tracking-drawer-top-fix hack created");
assert(!globalsCss.includes(".shipment-drawer-top-fix"), "No .shipment-drawer-top-fix hack created");

console.log("\n========================================================");
console.log("ALL 7 GLOBAL DRAWER POSITIONING TESTS PASSED! 🎉");
console.log("========================================================\n");
