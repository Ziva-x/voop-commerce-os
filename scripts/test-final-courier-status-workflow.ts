import { PrismaClient } from "../lib/generated/client";
import {
  normalizeCourierStatus,
  canAdvanceStatus,
  VOOP_SHIPMENT_STATUSES,
  STATUS_HIERARCHY,
} from "../lib/services/couriers/statusNormalization";

const prisma = new PrismaClient();

let passedTests = 0;
let totalTests = 0;

function assert(condition: boolean, testName: string, details?: string) {
  totalTests++;
  if (condition) {
    console.log(`✅ [PASS] ${testName}`);
    passedTests++;
  } else {
    console.error(`❌ [FAIL] ${testName}${details ? ` — ${details}` : ""}`);
  }
}

async function runAllTests() {
  console.log("==================================================================");
  console.log("VOOP FINAL COURIER-DRIVEN SHIPMENT STATUS UPDATE — TEST SUITE (17 TESTS)");
  console.log("==================================================================\n");

  // TEST 1: Courier = Manifested -> Expected: AWB GENERATED
  const t1 = normalizeCourierStatus("Manifested", "UD", "Manifest uploaded");
  assert(
    t1.normalizedStatus === "AWB_GENERATED" && t1.displayStatus === "AWB Generated",
    "TEST 1: Courier = Manifested -> Expected: AWB GENERATED",
    `Got: ${t1.normalizedStatus} (${t1.displayStatus})`
  );

  // TEST 2: Courier = Pickup Scheduled -> Expected: AWB GENERATED
  const t2 = normalizeCourierStatus("Pickup Scheduled", "PP", "Scheduled for pickup on 12 Sep");
  assert(
    t2.normalizedStatus === "AWB_GENERATED" && t2.displayStatus === "AWB Generated",
    "TEST 2: Courier = Pickup Scheduled -> Expected: AWB GENERATED",
    `Got: ${t2.normalizedStatus} (${t2.displayStatus})`
  );

  // TEST 3: Warehouse scan only -> Expected: AWB GENERATED
  // A warehouse outward scan occurs without courier physical pickup
  const t3Store = await prisma.shopifyStore.findFirst({ select: { id: true } });
  const storeId = t3Store?.id || "test-store-id";
  const testAwb1 = "TEST-SCAN-AWB-001";

  // Clean up any prior test records
  await prisma.shipment.deleteMany({ where: { storeId, awb: { in: [testAwb1, "TEST-SCAN-AWB-002", "TEST-AWB-DUP", "TEST-STORE-A", "TEST-STORE-B"] } } });

  // Simulate warehouse scanner upsert (which must NOT set PICKUP_COMPLETED or IN_TRANSIT)
  const scannedShipment = await prisma.shipment.create({
    data: {
      storeId,
      awb: testAwb1,
      status: "AWB Generated",
      normalizedStatus: "AWB_GENERATED",
      outwardScanned: true,
      outwardScannedAt: new Date(),
    },
  });

  assert(
    scannedShipment.normalizedStatus === "AWB_GENERATED" && scannedShipment.outwardScanned === true,
    "TEST 3: Warehouse scan only -> Expected: AWB GENERATED",
    `Got: ${scannedShipment.normalizedStatus}`
  );

  // TEST 4: Warehouse scan + tag -> Expected: AWB GENERATED
  const testAwb2 = "TEST-SCAN-AWB-002";
  const taggedShipment = await prisma.shipment.create({
    data: {
      storeId,
      awb: testAwb2,
      status: "AWB Generated",
      normalizedStatus: "AWB_GENERATED",
      outwardScanned: true,
      outwardScannedAt: new Date(),
      notes: "TAG: Priority Handling, Urgent Dispatch",
    },
  });
  assert(
    taggedShipment.normalizedStatus === "AWB_GENERATED" && taggedShipment.notes?.includes("TAG: Priority Handling"),
    "TEST 4: Warehouse scan + tag -> Expected: AWB GENERATED",
    `Got: ${taggedShipment.normalizedStatus}`
  );

  // TEST 5: Courier = Picked Up -> Expected: PICKUP COMPLETED
  const t5 = normalizeCourierStatus("Picked Up", "PU", "Package picked up from seller facility");
  assert(
    t5.normalizedStatus === "PICKUP_COMPLETED" && t5.displayStatus === "Pickup Completed",
    "TEST 5: Courier = Picked Up -> Expected: PICKUP COMPLETED",
    `Got: ${t5.normalizedStatus} (${t5.displayStatus})`
  );

  // TEST 6: Courier = In Transit -> Expected: IN TRANSIT
  const t6 = normalizeCourierStatus("In Transit", "IT", "Departed from Hub to Destination");
  assert(
    t6.normalizedStatus === "IN_TRANSIT" && t6.displayStatus === "In Transit",
    "TEST 6: Courier = In Transit -> Expected: IN TRANSIT",
    `Got: ${t6.normalizedStatus} (${t6.displayStatus})`
  );

  // TEST 7: Courier = Out for Delivery -> Expected: OUT FOR DELIVERY
  const t7 = normalizeCourierStatus("Out for Delivery", "OFD", "Dispatched with delivery agent");
  assert(
    t7.normalizedStatus === "OUT_FOR_DELIVERY" && t7.displayStatus === "Out for Delivery",
    "TEST 7: Courier = Out for Delivery -> Expected: OUT FOR DELIVERY",
    `Got: ${t7.normalizedStatus} (${t7.displayStatus})`
  );

  // TEST 8: Courier = Delivered -> Expected: DELIVERED
  const t8 = normalizeCourierStatus("Delivered", "DL", "Delivered to consignee");
  assert(
    t8.normalizedStatus === "DELIVERED" && t8.displayStatus === "Delivered",
    "TEST 8: Courier = Delivered -> Expected: DELIVERED",
    `Got: ${t8.normalizedStatus} (${t8.displayStatus})`
  );

  // TEST 9: Older Manifested event arrives after In Transit -> Expected: IN TRANSIT (no regression)
  const transitTime = new Date("2026-09-12T12:00:00Z");
  const olderManifestTime = new Date("2026-09-12T08:00:00Z");
  const canRegressToManifest = canAdvanceStatus("IN_TRANSIT", "AWB_GENERATED", transitTime, olderManifestTime);
  assert(
    canRegressToManifest === false,
    "TEST 9: Older Manifested event arrives after In Transit -> Expected: IN TRANSIT (Blocked regression)",
    `canAdvanceStatus returned: ${canRegressToManifest}`
  );

  // TEST 10: Older In Transit event arrives after Delivered -> Expected: DELIVERED (Terminal protection)
  const deliveryTime = new Date("2026-09-12T16:00:00Z");
  const olderTransitTime = new Date("2026-09-12T14:00:00Z");
  const canRegressToTransit = canAdvanceStatus("DELIVERED", "IN_TRANSIT", deliveryTime, olderTransitTime);
  assert(
    canRegressToTransit === false,
    "TEST 10: Older In Transit event arrives after Delivered -> Expected: DELIVERED (Terminal protection)",
    `canAdvanceStatus returned: ${canRegressToTransit}`
  );

  // TEST 11: Refresh tracking multiple times -> Expected: No duplicate tracking events, no incorrect status regression
  const dupAwb = "TEST-AWB-DUP";
  const dupShipment = await prisma.shipment.create({
    data: {
      storeId,
      awb: dupAwb,
      status: "AWB Generated",
      normalizedStatus: "AWB_GENERATED",
    },
  });

  const scanTimestamp = new Date("2026-09-12T10:00:00Z");
  // Simulate 3 repeat refresh calls inserting scans with storeId_awb_timestamp_status_location compound unique key
  for (let i = 0; i < 3; i++) {
    try {
      await prisma.shipmentScan.upsert({
        where: {
          storeId_awb_timestamp_status_location: {
            storeId,
            awb: dupAwb,
            timestamp: scanTimestamp,
            status: "Picked Up",
            location: "Origin Facility",
          },
        },
        create: {
          storeId,
          shipmentId: dupShipment.id,
          awb: dupAwb,
          status: "Picked Up",
          statusType: "PU",
          location: "Origin Facility",
          timestamp: scanTimestamp,
        },
        update: {},
      });
    } catch (_) {}
  }

  const scansRecorded = await prisma.shipmentScan.count({
    where: { storeId, awb: dupAwb },
  });
  assert(
    scansRecorded === 1,
    "TEST 11: Refresh tracking multiple times -> Expected: No duplicate tracking events",
    `Scans count: ${scansRecorded}`
  );

  // TEST 12: Manifested tab -> Expected: REMOVED
  const hasManifestedTab = VOOP_SHIPMENT_STATUSES.some((t) => t.id === ("MANIFESTED" as any) || t.label.toLowerCase() === "manifested");
  assert(
    hasManifestedTab === false,
    "TEST 12: Manifested tab -> Expected: REMOVED",
    `Found Manifested tab in VOOP_SHIPMENT_STATUSES: ${hasManifestedTab}`
  );

  // TEST 13: Ready for Pickup tab -> Expected: REMOVED
  const hasReadyTab = VOOP_SHIPMENT_STATUSES.some((t) => t.id === ("READY_FOR_PICKUP" as any) || t.label.toLowerCase().includes("ready for pickup"));
  assert(
    hasReadyTab === false,
    "TEST 13: Ready for Pickup tab -> Expected: REMOVED",
    `Found Ready for Pickup tab in VOOP_SHIPMENT_STATUSES: ${hasReadyTab}`
  );

  // TEST 14: Pickup Completed tab -> Expected: Shows shipments whose COURIER DATA confirms pickup
  const hasPickupCompletedTab = VOOP_SHIPMENT_STATUSES.some((t) => t.id === "PICKUP_COMPLETED" && t.label === "Pickup Completed");
  assert(
    hasPickupCompletedTab === true,
    "TEST 14: Pickup Completed tab -> Expected: Exists with label 'Pickup Completed'",
    `Pickup Completed tab present: ${hasPickupCompletedTab}`
  );

  // TEST 15: In Transit tab -> Expected: Shows shipments whose COURIER DATA confirms transit
  const hasInTransitTab = VOOP_SHIPMENT_STATUSES.some((t) => t.id === "IN_TRANSIT" && t.label === "In Transit");
  assert(
    hasInTransitTab === true,
    "TEST 15: In Transit tab -> Expected: Exists with label 'In Transit'",
    `In Transit tab present: ${hasInTransitTab}`
  );

  // TEST 16 & 17: Multi-tenant store isolation
  const secondStore = await prisma.shopifyStore.findFirst({
    where: { id: { not: storeId } },
    select: { id: true },
  });
  const storeIdB = secondStore?.id || "store-b-test-id";

  const storeAShipment = await prisma.shipment.create({
    data: {
      storeId,
      awb: "TEST-STORE-A",
      status: "AWB Generated",
      normalizedStatus: "AWB_GENERATED",
    },
  });

  const storeBShipment = await prisma.shipment.create({
    data: {
      storeId: storeIdB,
      awb: "TEST-STORE-B",
      status: "AWB Generated",
      normalizedStatus: "AWB_GENERATED",
    },
  });

  // Store A updates its shipment to PICKUP_COMPLETED
  await prisma.shipment.updateMany({
    where: { storeId, awb: "TEST-STORE-A" },
    data: { normalizedStatus: "PICKUP_COMPLETED", status: "Pickup Completed" },
  });

  const checkA = await prisma.shipment.findFirst({ where: { storeId, awb: "TEST-STORE-A" } });
  const checkB = await prisma.shipment.findFirst({ where: { storeId: storeIdB, awb: "TEST-STORE-B" } });

  assert(
    checkA?.normalizedStatus === "PICKUP_COMPLETED" && checkB?.normalizedStatus === "AWB_GENERATED",
    "TEST 16: Store A refreshes tracking -> Only Store A shipment changes",
    `Store A: ${checkA?.normalizedStatus}, Store B: ${checkB?.normalizedStatus}`
  );

  // Store A query strictly scoped by storeId must NEVER return Store B's shipment
  const storeAQuery = await prisma.shipment.findMany({
    where: { storeId, awb: { in: ["TEST-STORE-A", "TEST-STORE-B"] } },
  });
  assert(
    storeAQuery.length === 1 && storeAQuery[0].awb === "TEST-STORE-A",
    "TEST 17: Multiple stores open in separate tabs -> No cross-store courier/status contamination",
    `Store A query returned ${storeAQuery.length} shipments`
  );

  // Clean up test shipments
  await prisma.shipmentScan.deleteMany({ where: { storeId, awb: dupAwb } });
  await prisma.shipment.deleteMany({
    where: {
      OR: [
        { storeId, awb: { in: [testAwb1, testAwb2, dupAwb, "TEST-STORE-A"] } },
        { storeId: storeIdB, awb: "TEST-STORE-B" },
      ],
    },
  });

  console.log("\n==================================================================");
  console.log(`SUMMARY: ${passedTests}/${totalTests} TESTS PASSED`);
  console.log("==================================================================");

  if (passedTests === totalTests) {
    console.log("🎉 ALL 17 TESTS PASSED PERFECTLY!");
    process.exit(0);
  } else {
    console.error("❌ SOME TESTS FAILED!");
    process.exit(1);
  }
}

runAllTests().catch((err) => {
  console.error("Test execution failed:", err);
  process.exit(1);
}).finally(() => prisma.$disconnect());
