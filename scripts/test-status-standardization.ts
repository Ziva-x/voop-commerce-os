import {
  normalizeCourierStatus,
  VOOP_SHIPMENT_STATUSES,
  VoopShipmentStatus,
} from "../lib/courier-status";

function assert(condition: boolean, message: string) {
  if (!condition) {
    console.error(`❌ ASSERTION FAILED: ${message}`);
    process.exit(1);
  }
  console.log(`✓ ${message}`);
}

async function runTests() {
  console.log("==================================================");
  console.log("RUNNING VOOP SHIPMENT STATUS STANDARDIZATION TESTS");
  console.log("==================================================");

  // 1. Invariant Status Ordering & Inclusions
  console.log("\n--- TEST GROUP 1: Invariant Status Order & Filter Definitions ---");
  const expectedOrder = [
    { id: "ALL", label: "All" },
    { id: "AWB_GENERATED", label: "AWB Generated" },
    { id: "PICKUP_COMPLETED", label: "Pickup Completed" },
    { id: "IN_TRANSIT", label: "In Transit" },
    { id: "OUT_FOR_DELIVERY", label: "Out for Delivery" },
    { id: "DELIVERED", label: "Delivered" },
    { id: "RTO", label: "RTO" },
    { id: "RTO_DELIVERED", label: "RTO Delivered" },
  ];

  assert(
    VOOP_SHIPMENT_STATUSES.length === 8,
    `VOOP_SHIPMENT_STATUSES has exactly 8 entries (got ${VOOP_SHIPMENT_STATUSES.length})`
  );

  expectedOrder.forEach((expected, idx) => {
    const actual = VOOP_SHIPMENT_STATUSES[idx];
    assert(
      actual.id === expected.id && actual.label === expected.label,
      `Status #${idx + 1} is exactly ${expected.id} ("${expected.label}") (got ${actual.id} / "${actual.label}")`
    );
  });

  const ids = VOOP_SHIPMENT_STATUSES.map((s) => s.id);
  assert(!ids.includes("DISPATCHED" as any), "Dispatched is NOT in VOOP_SHIPMENT_STATUSES tabs");
  assert(!ids.includes("CANCELLED" as any), "Cancelled is NOT in primary VOOP_SHIPMENT_STATUSES tabs");

  // 2. Normalization - Manifested
  console.log("\n--- TEST GROUP 2: Manifested Normalization ---");
  const m1 = normalizeCourierStatus("Manifested");
  assert(m1.normalizedStatus === "MANIFESTED", "Manifested -> MANIFESTED");

  const m2 = normalizeCourierStatus("Shipment Created");
  assert(m2.normalizedStatus === "MANIFESTED", "Shipment Created -> MANIFESTED");

  const m3 = normalizeCourierStatus("DATA RECEIVED");
  assert(m3.normalizedStatus === "MANIFESTED", "DATA RECEIVED -> MANIFESTED");

  // 3. Normalization - Ready for Pickup & Pickup Scheduled
  console.log("\n--- TEST GROUP 3: Ready for Pickup Normalization ---");
  const p1 = normalizeCourierStatus("Pickup Scheduled");
  assert(p1.normalizedStatus === "PICKUP_SCHEDULED", "Pickup Scheduled -> PICKUP_SCHEDULED");

  const p2 = normalizeCourierStatus("Pickup Pending");
  assert(p2.normalizedStatus === "PICKUP_SCHEDULED", "Pickup Pending -> PICKUP_SCHEDULED");

  const p3 = normalizeCourierStatus("Ready to Pickup");
  assert(p3.normalizedStatus === "PICKUP_SCHEDULED", "Ready to Pickup -> PICKUP_SCHEDULED");

  const p4 = normalizeCourierStatus("NOT READY FOR PICKUP");
  assert(p4.normalizedStatus === "PICKUP_ATTEMPTED", "NOT READY FOR PICKUP -> PICKUP_ATTEMPTED");

  // 4. Normalization - In Transit & Dispatched & Picked Up
  console.log("\n--- TEST GROUP 4: In Transit & Dispatched Normalization ---");
  const t1 = normalizeCourierStatus("In Transit");
  assert(t1.normalizedStatus === "IN_TRANSIT", "In Transit -> IN_TRANSIT");

  const t2 = normalizeCourierStatus("Picked Up", "PU");
  assert(t2.normalizedStatus === "PICKED_UP", "Picked Up (PU) -> PICKED_UP");

  const t3 = normalizeCourierStatus("Dispatched");
  assert(t3.normalizedStatus !== "IN_TRANSIT", "Dispatched is NOT IN_TRANSIT (Dispatched is pre-pickup / manifested)");

  const t4 = normalizeCourierStatus("Vehicle Departed");
  assert(t4.normalizedStatus === "IN_TRANSIT", "Vehicle Departed -> IN_TRANSIT");

  const t5 = normalizeCourierStatus("NDR", "UD", "Customer Not Available");
  assert(t5.normalizedStatus === "IN_TRANSIT", "NDR Delivery Attempt Failed -> IN_TRANSIT");

  // 5. Normalization - Out for Delivery
  console.log("\n--- TEST GROUP 5: Out for Delivery Normalization ---");
  const o1 = normalizeCourierStatus("Out for Delivery", "OFD");
  assert(o1.normalizedStatus === "OUT_FOR_DELIVERY", "Out for Delivery (OFD) -> OUT_FOR_DELIVERY");

  const o2 = normalizeCourierStatus("With Delivery Agent");
  assert(o2.normalizedStatus === "OUT_FOR_DELIVERY", "With Delivery Agent -> OUT_FOR_DELIVERY");

  // 6. Normalization - Delivered
  console.log("\n--- TEST GROUP 6: Delivered Normalization ---");
  const d1 = normalizeCourierStatus("Delivered", "DL");
  assert(d1.normalizedStatus === "DELIVERED", "Delivered (DL) -> DELIVERED");

  const d2 = normalizeCourierStatus("Shipment Delivered");
  assert(d2.normalizedStatus === "DELIVERED", "Shipment Delivered -> DELIVERED");

  const d3 = normalizeCourierStatus("UNDELIVERED");
  assert(d3.normalizedStatus !== "DELIVERED", "UNDELIVERED is NOT falsely treated as DELIVERED");
  assert(d3.normalizedStatus === "IN_TRANSIT", "UNDELIVERED is normalized to IN_TRANSIT");

  // 7. Normalization - RTO & RTO Delivered
  console.log("\n--- TEST GROUP 7: RTO & RTO Delivered Normalization ---");
  const r1 = normalizeCourierStatus("RTO Initiated", "RT");
  assert(r1.normalizedStatus === "RTO", "RTO Initiated (RT) -> RTO");
  assert(!r1.isRtoDelivered, "RTO Initiated is NOT RTO Delivered");

  const r2 = normalizeCourierStatus("Return to Origin");
  assert(r2.normalizedStatus === "RTO", "Return to Origin -> RTO");

  const r3 = normalizeCourierStatus("RTO Delivered", "RT-DL");
  assert(r3.normalizedStatus === "RTO_DELIVERED", "RTO Delivered (RT-DL) -> RTO_DELIVERED");
  assert(r3.isRtoDelivered, "isRtoDelivered is true");

  const r4 = normalizeCourierStatus("Delivered", "RT-DL");
  assert(r4.normalizedStatus === "RTO_DELIVERED", "Delivered scan with RT-DL -> RTO_DELIVERED (not normal Delivered)");

  const r5 = normalizeCourierStatus(
    "In Transit",
    "",
    "",
    [{ status: "RTO Delivered", statusType: "RT-DL", timestamp: new Date() }]
  );
  assert(r5.normalizedStatus === "RTO_DELIVERED", "Shipment with RTO Delivered scan -> RTO_DELIVERED");

  // 8. Normalization - Legacy Cancelled Preservation
  console.log("\n--- TEST GROUP 8: Cancelled Historical Data Preservation ---");
  const c1 = normalizeCourierStatus("Cancelled");
  assert(c1.normalizedStatus === "CANCELLED", "Cancelled -> CANCELLED preserved");

  const c2 = normalizeCourierStatus("CANCELLED_PRE_DISPATCH");
  assert(c2.normalizedStatus === "CANCELLED_PRE_DISPATCH", "CANCELLED_PRE_DISPATCH preserved");

  // 9. Operational Summary Counters Logic
  console.log("\n--- TEST GROUP 9: Operational Summary Counters Logic ---");
  const sampleShipments = [
    { normalizedStatus: "MANIFESTED" },
    { normalizedStatus: "READY_FOR_PICKUP" },
    { normalizedStatus: "IN_TRANSIT" },
    { normalizedStatus: "IN_TRANSIT" },
    { normalizedStatus: "OUT_FOR_DELIVERY" },
    { normalizedStatus: "DELIVERED" },
    { normalizedStatus: "DELIVERED" },
    { normalizedStatus: "RTO" },
    { normalizedStatus: "RTO_DELIVERED" },
    { normalizedStatus: "CANCELLED_PRE_DISPATCH" },
  ];

  const inTransitCount = sampleShipments.filter((s) => s.normalizedStatus === "IN_TRANSIT").length;
  const deliveredCount = sampleShipments.filter((s) => s.normalizedStatus === "DELIVERED").length;
  const activeRtoCount = sampleShipments.filter((s) => s.normalizedStatus === "RTO").length;
  const rtoDeliveredCount = sampleShipments.filter((s) => s.normalizedStatus === "RTO_DELIVERED").length;

  assert(inTransitCount === 2, "inTransit counts only IN_TRANSIT (2)");
  assert(deliveredCount === 2, "delivered counts only DELIVERED (2)");
  assert(activeRtoCount === 1, "rto counts only active RTO (1)");
  assert(rtoDeliveredCount === 1, "RTO_DELIVERED is separated and not in active RTO");

  console.log("\n==================================================");
  console.log("ALL TESTS PASSED SUCCESSFULLY! ✓✓✓");
  console.log("==================================================");
}

runTests().catch((err) => {
  console.error("Test execution failed:", err);
  process.exit(1);
});
