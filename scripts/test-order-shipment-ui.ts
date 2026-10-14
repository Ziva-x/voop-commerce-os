import React from "react";
import ReactDOMServer from "react-dom/server";
import { OrderShipmentInfo } from "../components/views/OrderShipmentInfo";
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
console.log("VOOP — ORDERS TABLE SHIPMENT INFO UI VERIFICATION SUITE");
console.log("========================================================\n");

// 1. Acceptance Test Case
console.log("--- 1. Testing Acceptance Test Case ---");
const acceptanceHtml = ReactDOMServer.renderToStaticMarkup(
  React.createElement(OrderShipmentInfo, {
    fulfillmentStatus: "FULFILLED",
    deliveryStatus: "READY_FOR_PICKUP",
    trackingList: [
      {
        number: "46932210009693",
        company: "Delhivery",
        url: "https://www.delhivery.com/track/package/46932210009693",
        deliveryStatus: "READY_FOR_PICKUP",
      },
    ],
    pickupDate: new Date("2026-09-10T20:53:00Z"),
  })
);

console.log("Rendered HTML preview (Acceptance):", acceptanceHtml);

assert(acceptanceHtml.includes("Fulfilled"), "Renders 'Fulfilled' status badge");
assert(acceptanceHtml.includes("Ready for Pickup"), "Renders 'Ready for Pickup' status badge");
assert(acceptanceHtml.includes("Delhivery"), "Renders courier name 'Delhivery'");
assert(acceptanceHtml.includes("46932210009693"), "Renders AWB '46932210009693'");
assert(acceptanceHtml.includes("Pickup"), "Renders 'Pickup' label");
assert(acceptanceHtml.includes("AM") || acceptanceHtml.includes("PM"), "Renders formatted date with uppercase AM/PM");
assert(acceptanceHtml.includes("Warehouse"), "Renders Warehouse label");
assert(acceptanceHtml.includes("Dispatched"), "Renders 'Dispatched' status under Warehouse");
assert(!acceptanceHtml.includes("undefined"), "Does not contain 'undefined'");
assert(!acceptanceHtml.includes("null"), "Does not contain 'null'");
assert(!acceptanceHtml.includes("NaN"), "Does not contain 'NaN'");
assert(!acceptanceHtml.includes("Invalid Date"), "Does not contain 'Invalid Date'");

// 2. Delivered State
console.log("\n--- 2. Testing Delivered State ---");
const deliveredHtml = ReactDOMServer.renderToStaticMarkup(
  React.createElement(OrderShipmentInfo, {
    fulfillmentStatus: "FULFILLED",
    deliveryStatus: "DELIVERED",
    trackingList: [
      {
        number: "46932210009693",
        company: "Delhivery",
      },
    ],
    deliveryDate: new Date("2026-09-11T16:32:00Z"),
  })
);
assert(deliveredHtml.includes("Delivered"), "Renders 'Delivered' badge and date");
assert(deliveredHtml.includes("Delhivery"), "Renders 'Delhivery'");
assert(deliveredHtml.includes("Warehouse"), "Renders Warehouse verification");

// 3. In Transit State
console.log("\n--- 3. Testing In Transit State ---");
const inTransitHtml = ReactDOMServer.renderToStaticMarkup(
  React.createElement(OrderShipmentInfo, {
    fulfillmentStatus: "FULFILLED",
    deliveryStatus: "IN_TRANSIT",
    trackingList: [
      {
        number: "46932210009693",
        company: "Delhivery",
      },
    ],
    pickupDate: new Date("2026-09-10T20:53:00Z"),
  })
);
assert(inTransitHtml.includes("In Transit"), "Renders 'In Transit' badge");
assert(inTransitHtml.includes("Pickup"), "Renders 'Pickup' date label");

// 4. RTO Delivered State
console.log("\n--- 4. Testing RTO Delivered State ---");
const rtoDeliveredHtml = ReactDOMServer.renderToStaticMarkup(
  React.createElement(OrderShipmentInfo, {
    fulfillmentStatus: "FULFILLED",
    deliveryStatus: "RTO_DELIVERED",
    trackingList: [
      {
        number: "46932210009693",
        company: "Delhivery",
      },
    ],
    rtoDeliveredDate: new Date("2026-09-11T12:00:00Z"),
    rtoInwardScanned: true,
  })
);
assert(rtoDeliveredHtml.includes("RTO Delivered"), "Renders 'RTO Delivered' badge & date label");
assert(rtoDeliveredHtml.includes("RTO Received"), "Renders 'RTO Received' under Warehouse");

// 5. Outward Scanned State
console.log("\n--- 5. Testing Outward Scanned State ---");
const outwardHtml = ReactDOMServer.renderToStaticMarkup(
  React.createElement(OrderShipmentInfo, {
    fulfillmentStatus: "FULFILLED",
    deliveryStatus: "MANIFESTED",
    trackingList: [
      {
        number: "BD123456789",
        company: "Blue Dart",
      },
    ],
    outwardScanned: true,
  })
);
assert(outwardHtml.includes("Manifested"), "Renders 'Manifested' badge");
assert(outwardHtml.includes("Blue Dart"), "Renders 'Blue Dart'");
assert(outwardHtml.includes("Outward Scanned"), "Renders 'Outward Scanned' under Warehouse");

// 6. RTO Discrepancy State (Missing WH Scan)
console.log("\n--- 6. Testing Missing WH Scan Discrepancy ---");
const discrepancyHtml = ReactDOMServer.renderToStaticMarkup(
  React.createElement(OrderShipmentInfo, {
    fulfillmentStatus: "FULFILLED",
    deliveryStatus: "RTO_DELIVERED",
    trackingList: [
      {
        number: "46932210009693",
        company: "Delhivery",
      },
    ],
    hasRtoDiscrepancy: true,
  })
);
assert(discrepancyHtml.includes("Missing WH Scan"), "Renders '⚠️ Missing WH Scan'");

// 7. Unfulfilled Order (Empty Values & No Duplicate Labels)
console.log("\n--- 7. Testing Unfulfilled Order State ---");
const unfulfilledHtml = ReactDOMServer.renderToStaticMarkup(
  React.createElement(OrderShipmentInfo, {
    fulfillmentStatus: "UNFULFILLED",
    deliveryStatus: "UNFULFILLED", // same as fulfillment status
    trackingList: [],
  })
);
assert(unfulfilledHtml.includes("Unfulfilled"), "Renders 'Unfulfilled' badge");
// Must not render a second redundant UNFULFILLED pill
const unfulfilledCount = (unfulfilledHtml.match(/Unfulfilled/gi) || []).length;
assert(unfulfilledCount === 1, `Expected exactly 1 'Unfulfilled' occurrence, found ${unfulfilledCount}`);
assert(unfulfilledHtml.includes("Not Dispatched"), "Renders 'Not Dispatched' under Warehouse");
assert(!unfulfilledHtml.includes("undefined"), "No 'undefined'");
assert(!unfulfilledHtml.includes("null"), "No 'null'");
assert(!unfulfilledHtml.includes("NaN"), "No 'NaN'");

// 8. Verify Design System & Theme Variable Usage (No hardcoded colors)
console.log("\n--- 8. Verifying Design System Compliance ---");
const componentSource = fs.readFileSync(
  path.join(__dirname, "../components/views/OrderShipmentInfo.tsx"),
  "utf-8"
);

// Verify CSS variable usage
assert(componentSource.includes("var(--success"), "Uses var(--success) semantic tokens");
assert(componentSource.includes("var(--warning"), "Uses var(--warning) semantic tokens");
assert(componentSource.includes("var(--error"), "Uses var(--error) semantic tokens");
assert(componentSource.includes("var(--info"), "Uses var(--info) semantic tokens");
assert(componentSource.includes("var(--accent"), "Uses var(--accent) theme tokens");
assert(componentSource.includes("var(--text-primary"), "Uses var(--text-primary)");
assert(componentSource.includes("var(--text-secondary"), "Uses var(--text-secondary)");
assert(componentSource.includes("var(--text-muted"), "Uses var(--text-muted)");

// Ensure no hardcoded raw hex colors
const hexMatches = componentSource.match(/#[0-9a-fA-F]{3,8}/g);
assert(hexMatches === null, `No hardcoded hex colors in OrderShipmentInfo (found: ${hexMatches})`);

// Ensure no hardcoded color classes like text-purple-700, bg-emerald-500, etc.
const rawColorClassMatches = componentSource.match(/\b(text|bg|border)-(emerald|purple|indigo|amber|sky|rose|cyan|violet|blue|red|green)-\d+/g);
assert(rawColorClassMatches === null, `No hardcoded color classes in OrderShipmentInfo (found: ${rawColorClassMatches})`);

// 9. Verify OrdersView.tsx Integration
console.log("\n--- 9. Verifying OrdersView Integration ---");
const ordersViewSource = fs.readFileSync(
  path.join(__dirname, "../components/views/OrdersView.tsx"),
  "utf-8"
);
assert(ordersViewSource.includes("<OrderShipmentInfo"), "OrdersView.tsx renders OrderShipmentInfo");
assert(!ordersViewSource.includes("<th className=\"py-3.5 px-4\">Warehouse Verification</th>"), "Removed redundant Warehouse Verification column header");
assert(ordersViewSource.includes("colSpan={8}"), "Table empty state updated to colSpan={8}");

console.log("\n========================================================");
console.log("ALL 9 VERIFICATION CHECKS PASSED PERFECTLY! 🎉");
console.log("========================================================\n");
