import { resolveShipmentDates, formatShipmentDate } from "../lib/shipment-dates";

function assert(condition: boolean, message: string) {
  if (!condition) {
    console.error(`❌ FAILED: ${message}`);
    process.exit(1);
  }
  console.log(`✓ PASSED: ${message}`);
}

console.log("=================================================");
console.log("TEST SUITE: Shipment Dates Resolution Engine");
console.log("=================================================");

// Test 1: Forward In-Transit Shipment
{
  const shipment = {
    awb: "1234567890",
    orderCreatedAt: new Date("2026-09-08T09:30:00.000Z"),
    pickupDate: new Date("2026-09-08T14:15:00.000Z"),
    etdDate: "2026-09-11",
    status: "In Transit",
    normalizedStatus: "IN-TRANSIT",
  };

  const res = resolveShipmentDates(shipment);
  assert(res.lifecycle === "FORWARD", "Test 1: Lifecycle is FORWARD");
  assert(!res.isForwardDelivered, "Test 1: isForwardDelivered is false");
  assert(!res.isRtoDelivered, "Test 1: isRtoDelivered is false");
  assert(res.entries.length === 3, `Test 1: entries count is 3 (got ${res.entries.length})`);
  assert(res.orderDate.label === "Order", "Test 1: First entry is Order");
  assert(res.orderDate.displayDate === "08 Sep 2026", `Test 1: Order date is 08 Sep 2026 (got ${res.orderDate.displayDate})`);
  assert(res.pickupDate.label === "Pickup", "Test 1: Second entry is Pickup");
  assert(res.pickupDate.displayDate === "08 Sep 2026", `Test 1: Pickup date is 08 Sep 2026 (got ${res.pickupDate.displayDate})`);
  assert(res.etdDate.label === "ETD", "Test 1: Third entry is ETD");
  assert(res.etdDate.displayDate === "11 Sep 2026", `Test 1: ETD date is 11 Sep 2026 (got ${res.etdDate.displayDate})`);
}

// Test 2: Normal Forward DELIVERED Shipment
{
  const shipment = {
    awb: "1234567891",
    orderCreatedAt: "2026-09-08T10:00:00.000Z",
    pickupDate: "2026-09-08T14:15:00.000Z",
    etdDate: "2026-09-11",
    deliveryDate: "2026-09-10T16:45:00.000Z",
    status: "Delivered",
    normalizedStatus: "DELIVERED",
  };

  const res = resolveShipmentDates(shipment);
  assert(res.lifecycle === "FORWARD", "Test 2: Lifecycle is FORWARD");
  assert(res.isForwardDelivered, "Test 2: isForwardDelivered is true");
  assert(!res.isRtoDelivered, "Test 2: isRtoDelivered is false");
  assert(res.entries.length === 4, `Test 2: entries count is 4 (got ${res.entries.length})`);
  assert(res.entries[3].label === "Delivered", "Test 2: 4th entry is Delivered");
  assert(res.entries[3].displayDate === "10 Sep 2026", `Test 2: Delivered date is 10 Sep 2026 (got ${res.entries[3].displayDate})`);
}

// Test 3: RTO In-Transit Shipment
{
  const shipment = {
    awb: "1234567892",
    orderCreatedAt: "2026-09-08",
    pickupDate: "2026-09-08",
    etdDate: "2026-09-11",
    rtoDate: "2026-09-08",
    status: "RTO Initiated",
    normalizedStatus: "RTO",
  };

  const res = resolveShipmentDates(shipment);
  assert(res.lifecycle === "RTO", "Test 3: Lifecycle is RTO");
  assert(!res.isForwardDelivered, "Test 3: isForwardDelivered is false");
  assert(!res.isRtoDelivered, "Test 3: isRtoDelivered is false");
  assert(res.entries.length === 4, `Test 3: entries count is 4 (got ${res.entries.length})`);
  assert(res.entries[3].label === "RTO", "Test 3: 4th entry is RTO");
  assert(res.entries.every((e) => e.label !== "Delivered"), "Test 3: Must NOT contain normal Delivered");
}

// Test 4: RTO DELIVERED Shipment (CRITICAL: Courier reports Delivered on RTO lifecycle)
{
  const shipment = {
    awb: "46932210008293",
    orderCreatedAt: "2026-09-08T08:00:00Z",
    pickupDate: "2026-09-08T12:00:00Z",
    etdDate: "2026-09-11",
    rtoDate: "2026-09-08T18:00:00Z",
    deliveryDate: "2026-09-10T14:30:00Z",
    status: "Delivered", // Courier reports delivered, but shipment had RTO
    normalizedStatus: "RTO",
  };

  const res = resolveShipmentDates(shipment);
  assert(res.lifecycle === "RTO", "Test 4: Lifecycle is RTO");
  assert(res.isRtoDelivered, "Test 4: isRtoDelivered is TRUE");
  assert(res.effectiveStatus === "RTO_DELIVERED", `Test 4: effectiveStatus is RTO_DELIVERED (got ${res.effectiveStatus})`);
  assert(res.entries.length === 5, `Test 4: entries count is 5 (got ${res.entries.length})`);
  assert(res.entries[3].label === "RTO", "Test 4: 4th entry is RTO");
  assert(res.entries[4].label === "RTO Delivered", `Test 4: 5th entry MUST be 'RTO Delivered' (got ${res.entries[4].label})`);
  assert(res.entries.every((e) => e.label !== "Delivered"), "Test 4: Must NEVER contain normal Delivered");
  assert(res.entries[4].displayDate === "10 Sep 2026", `Test 4: RTO Delivered date is 10 Sep 2026 (got ${res.entries[4].displayDate})`);
}

// Test 5: Missing Pickup and Missing ETD (NEVER fabricate dates)
{
  const shipment = {
    awb: "1234567893",
    orderCreatedAt: "2026-09-08",
    pickupDate: null,
    etdDate: null,
    status: "Manifested",
    normalizedStatus: "MANIFESTED",
    scans: [],
  };

  const res = resolveShipmentDates(shipment);
  assert(res.pickupDate.displayDate === "Not available", `Test 5: Missing pickup displays 'Not available' (got ${res.pickupDate.displayDate})`);
  assert(!res.pickupDate.isAvailable, "Test 5: pickup isAvailable is false");
  assert(res.etdDate.displayDate === "Not available", `Test 5: Missing ETD displays 'Not available' (got ${res.etdDate.displayDate})`);
  assert(!res.etdDate.isAvailable, "Test 5: ETD isAvailable is false");
}

// Test 6: Fallback Pickup Resolution from Scans
{
  const shipment = {
    awb: "1234567894",
    orderCreatedAt: "2026-09-08",
    pickupDate: null, // missing directly
    etdDate: "2026-09-12",
    status: "In Transit",
    scans: [
      {
        status: "Shipment Picked Up from origin",
        statusType: "PU",
        timestamp: "2026-09-08T11:20:00Z",
      },
    ],
  };

  const res = resolveShipmentDates(shipment);
  assert(res.pickupDate.isAvailable, "Test 6: Pickup was resolved from scans");
  assert(res.pickupDate.displayDate === "08 Sep 2026", `Test 6: Pickup date is 08 Sep 2026 (got ${res.pickupDate.displayDate})`);
}

// Test 7: Date Formatting & Timestamps
{
  const withTime = formatShipmentDate(new Date(2026, 8, 8, 14, 15)); // 08 Sep 2026, 02:15 PM
  assert(withTime.displayDate === "08 Sep 2026", `Test 7: displayDate is 08 Sep 2026 (got ${withTime.displayDate})`);
  assert(withTime.fullTimestamp === "08 Sep 2026, 02:15 PM", `Test 7: fullTimestamp is 08 Sep 2026, 02:15 PM (got ${withTime.fullTimestamp})`);

  const dateOnly = formatShipmentDate("2026-09-08");
  assert(dateOnly.displayDate === "08 Sep 2026", `Test 7: dateOnly displayDate is 08 Sep 2026 (got ${dateOnly.displayDate})`);
  assert(dateOnly.fullTimestamp === "08 Sep 2026", `Test 7: dateOnly fullTimestamp is 08 Sep 2026 (got ${dateOnly.fullTimestamp})`);
}

// Test 8: Empty / Null Safe Handling
{
  const resNull = resolveShipmentDates(null);
  assert(resNull.orderDate.displayDate === "Not available", "Test 8: Null shipment orderDate is safe");
  assert(resNull.pickupDate.displayDate === "Not available", "Test 8: Null shipment pickupDate is safe");
  assert(resNull.etdDate.displayDate === "Not available", "Test 8: Null shipment etdDate is safe");
  assert(resNull.entries.length === 3, "Test 8: Null shipment has 3 base entries");

  const resEmpty = resolveShipmentDates({});
  assert(resEmpty.entries.length === 3, "Test 8: Empty object has 3 base entries");
}

// Test 9: RTO Inward Physical Scan Triggers RTO Delivered
{
  const shipment = {
    awb: "1234567895",
    orderCreatedAt: "2026-09-08",
    pickupDate: "2026-09-08",
    etdDate: "2026-09-11",
    status: "RTO Received",
    rtoInwardScanned: true,
    rtoInwardScannedAt: new Date("2026-09-10T11:00:00Z"),
  };

  const res = resolveShipmentDates(shipment);
  assert(res.lifecycle === "RTO", "Test 9: Lifecycle is RTO");
  assert(res.isRtoDelivered, "Test 9: isRtoDelivered is true when rtoInwardScanned");
  assert(res.effectiveStatus === "RTO_DELIVERED", "Test 9: effectiveStatus is RTO_DELIVERED");
  assert(res.entries[res.entries.length - 1].label === "RTO Delivered", "Test 9: Last entry is RTO Delivered");
}

console.log("\n=================================================");
console.log("🎉 ALL 9 TEST SUITES PASSED SUCCESSFULLY!");
console.log("=================================================");
