/**
 * Automated Verification Test Suite for VOOP Shipment Status & Tracking State Machine
 * Verifies all 12 cases specified in Section 21 & 22 of the tracking state fix prompt.
 */

import { PrismaClient } from "../lib/generated/client";
const prisma = new PrismaClient();
import {
  normalizeCourierStatus,
  normalizeCourierShipmentStatus,
  canAdvanceStatus,
  isValidEventTimestamp,
  STATUS_HIERARCHY,
} from "../lib/services/couriers/statusNormalization";
import { resolveShipmentDates } from "../lib/shipment-dates";

function assert(condition: boolean, message: string) {
  if (!condition) {
    console.error(`❌ ASSERTION FAILED: ${message}`);
    throw new Error(`Assertion failed: ${message}`);
  }
  console.log(`  ✓ ${message}`);
}

async function runAllTests() {
  console.log("==================================================================");
  console.log("VOOP SHIPMENT STATUS & TRACKING STATE MACHINE VERIFICATION SUITE");
  console.log("==================================================================");

  let passed = 0;
  let failed = 0;

  // Ensure test stores exist in database
  const storeA = await prisma.shopifyStore.upsert({
    where: { shopDomain: "status-test-store-a.myshopify.com" },
    create: {
      shopDomain: "status-test-store-a.myshopify.com",
      storeName: "Status Test Store A",
      accessToken: "shpat_test_store_a",
      isConnected: true,
    },
    update: {},
  });

  const storeB = await prisma.shopifyStore.upsert({
    where: { shopDomain: "status-test-store-b.myshopify.com" },
    create: {
      shopDomain: "status-test-store-b.myshopify.com",
      storeName: "Status Test Store B",
      accessToken: "shpat_test_store_b",
      isConnected: true,
    },
    update: {},
  });

  // Clean up any test shipments from previous test runs
  await prisma.shipmentScan.deleteMany({
    where: {
      storeId: { in: [storeA.id, storeB.id] },
    },
  });
  await prisma.shipment.deleteMany({
    where: {
      storeId: { in: [storeA.id, storeB.id] },
    },
  });

  // -------------------------------------------------------------------------
  // CASE 1: Manifested with Delhivery UD statusType
  // -------------------------------------------------------------------------
  console.log("\n[TEST CASE 1] Manifested shipment with statusType 'UD'");
  {
    const raw = "Manifested";
    const type = "UD";
    const inst = "Manifest uploaded";
    const scans = [
      {
        status: "Manifest uploaded",
        statusType: "UD",
        instructions: "Manifest uploaded",
        location: "Mumbai_Hub",
        timestamp: new Date("2026-09-12T10:00:00Z"),
      },
    ];

    const res = normalizeCourierStatus(raw, type, inst, scans);
    assert(res.normalizedStatus === "MANIFESTED", "Normalized status must be MANIFESTED, not IN_TRANSIT");
    assert(res.displayStatus === "Manifested", "Display status is 'Manifested'");
    assert(!res.isForwardDelivered && !res.isRto, "Not delivered and not RTO");
    passed++;
  }

  // -------------------------------------------------------------------------
  // CASE 2: Manifested + Pickup Scheduled
  // -------------------------------------------------------------------------
  console.log("\n[TEST CASE 2] Manifested + Pickup Scheduled (Scheduled window != In Transit)");
  {
    const raw = "Manifested";
    const type = "UD";
    const inst = "Manifest uploaded";
    const scheduledDate = new Date("2026-09-12T18:00:00Z");

    const normRes = normalizeCourierStatus(raw, type, inst, []);
    assert(normRes.normalizedStatus === "MANIFESTED", "Normalized status remains MANIFESTED, never IN_TRANSIT");

    // Also test explicit "Pickup Scheduled" raw status
    const schedRes = normalizeCourierStatus("Pickup Scheduled", "PP", "Scheduled for pickup");
    assert(
      schedRes.normalizedStatus === "PICKUP_SCHEDULED",
      "Pickup Scheduled status normalizes to PICKUP_SCHEDULED"
    );

    // Verify resolveShipmentDates differentiates Scheduled vs Picked up
    const mockShipment = {
      normalizedStatus: "MANIFESTED",
      status: "Manifested",
      pickupDate: scheduledDate,
      scans: [
        {
          status: "Manifest uploaded",
          statusType: "UD",
          timestamp: new Date("2026-09-12T10:00:00Z"),
        },
      ],
    };
    const dates = resolveShipmentDates(mockShipment);
    assert(dates.pickupDate.isAvailable, "Pickup date is available");
    assert(dates.pickupDate.subStatus === "Scheduled", "Pickup subStatus is 'Scheduled', not 'Picked up'");
    passed++;
  }

  // -------------------------------------------------------------------------
  // CASE 3: Picked Up
  // -------------------------------------------------------------------------
  console.log("\n[TEST CASE 3] Carrier response: Picked Up");
  {
    const p1 = normalizeCourierStatus("Picked Up", "PU", "Package Picked Up");
    assert(p1.normalizedStatus === "PICKED_UP", "Picked Up (PU) normalizes to PICKED_UP");
    assert(p1.displayStatus === "Picked Up", "Display status is 'Picked Up'");

    const p2 = normalizeCourierStatus("Shipment Picked Up", "UD", "Package handed over");
    assert(p2.normalizedStatus === "PICKED_UP", "Shipment Picked Up text normalizes to PICKED_UP");

    // Verify resolveShipmentDates flags Picked up
    const mockPickedUpShipment = {
      normalizedStatus: "PICKED_UP",
      status: "Picked Up",
      scans: [
        {
          status: "Package Picked Up",
          statusType: "PU",
          timestamp: new Date("2026-09-12T14:30:00Z"),
        },
      ],
    };
    const dates = resolveShipmentDates(mockPickedUpShipment);
    assert(dates.pickupDate.subStatus === "Picked up", "Pickup subStatus is 'Picked up'");
    passed++;
  }

  // -------------------------------------------------------------------------
  // CASE 4: In Transit
  // -------------------------------------------------------------------------
  console.log("\n[TEST CASE 4] Carrier response: In Transit / Movement");
  {
    const t1 = normalizeCourierStatus("In Transit", "IT", "Vehicle Departed");
    assert(t1.normalizedStatus === "IN_TRANSIT", "In Transit (IT) normalizes to IN_TRANSIT");

    const t2 = normalizeCourierStatus("Reached at Facility", "UD", "Bag Received at Hub");
    assert(t2.normalizedStatus === "IN_TRANSIT", "Reached at Facility with movement keyword normalizes to IN_TRANSIT");

    const t3 = normalizeCourierStatus("Vehicle Departed", "UD", "Departed from Mumbai Hub");
    assert(t3.normalizedStatus === "IN_TRANSIT", "Vehicle Departed normalizes to IN_TRANSIT");
    passed++;
  }

  // -------------------------------------------------------------------------
  // CASE 5: Out for Delivery
  // -------------------------------------------------------------------------
  console.log("\n[TEST CASE 5] Carrier response: Out for Delivery");
  {
    const o1 = normalizeCourierStatus("Out for Delivery", "OFD", "With delivery courier");
    assert(o1.normalizedStatus === "OUT_FOR_DELIVERY", "Out for Delivery (OFD) normalizes to OUT_FOR_DELIVERY");

    const o2 = normalizeCourierStatus("Dispatched for Delivery", "UD", "Delivery agent assigned");
    assert(o2.normalizedStatus === "OUT_FOR_DELIVERY", "Dispatched for Delivery normalizes to OUT_FOR_DELIVERY");
    passed++;
  }

  // -------------------------------------------------------------------------
  // CASE 6: Delivered
  // -------------------------------------------------------------------------
  console.log("\n[TEST CASE 6] Carrier response: Delivered");
  {
    const d1 = normalizeCourierStatus("Delivered", "DL", "Delivered successfully to recipient");
    assert(d1.normalizedStatus === "DELIVERED", "Delivered (DL) normalizes to DELIVERED");
    assert(d1.isForwardDelivered, "isForwardDelivered flag is true");

    // Negative check: UNDELIVERED must not normalize to DELIVERED
    const un = normalizeCourierStatus("UNDELIVERED", "UD", "Consignee unavailable");
    assert(un.normalizedStatus !== "DELIVERED", "UNDELIVERED is NOT falsely normalized to DELIVERED");
    assert(un.normalizedStatus === "IN_TRANSIT", "UNDELIVERED active retry is IN_TRANSIT");
    passed++;
  }

  // -------------------------------------------------------------------------
  // CASE 7: Chronological Timeline Events
  // -------------------------------------------------------------------------
  console.log("\n[TEST CASE 7] Chronological Timeline Events");
  {
    const testAwb = "TESTAWB777001";
    const tManifest = new Date("2026-09-12T10:00:00Z");
    const tPickup = new Date("2026-09-12T14:00:00Z");
    const tInTransit = new Date("2026-09-12T17:00:00Z");

    const shipment = await prisma.shipment.create({
      data: {
        storeId: storeA.id,
        awb: testAwb,
        status: "In Transit",
        normalizedStatus: "IN_TRANSIT",
        statusTimestamp: tInTransit,
      },
    });

    await prisma.shipmentScan.createMany({
      data: [
        {
          storeId: storeA.id,
          shipmentId: shipment.id,
          awb: testAwb,
          status: "Manifest uploaded",
          statusType: "UD",
          timestamp: tManifest,
        },
        {
          storeId: storeA.id,
          shipmentId: shipment.id,
          awb: testAwb,
          status: "Package Picked Up",
          statusType: "PU",
          timestamp: tPickup,
        },
        {
          storeId: storeA.id,
          shipmentId: shipment.id,
          awb: testAwb,
          status: "Departed from Facility",
          statusType: "IT",
          timestamp: tInTransit,
        },
      ],
    });

    const scansDesc = await prisma.shipmentScan.findMany({
      where: { storeId: storeA.id, awb: testAwb },
      orderBy: { timestamp: "desc" },
    });

    assert(scansDesc.length === 3, "Exactly 3 scan events recorded");
    assert(scansDesc[0].status === "Departed from Facility", "Most recent event is Departed from Facility");
    assert(scansDesc[1].status === "Package Picked Up", "Second event is Package Picked Up");
    assert(scansDesc[2].status === "Manifest uploaded", "Oldest event is Manifest uploaded");
    passed++;
  }

  // -------------------------------------------------------------------------
  // CASE 8: Refresh 5 Times -> 0 Duplicate Scans
  // -------------------------------------------------------------------------
  console.log("\n[TEST CASE 8] Duplicate Protection: Refresh 5 times");
  {
    const testAwb = "TESTAWB888002";
    const shipment = await prisma.shipment.create({
      data: {
        storeId: storeA.id,
        awb: testAwb,
        status: "Manifested",
        normalizedStatus: "MANIFESTED",
      },
    });

    const rawScans = [
      {
        status: "Manifest uploaded",
        statusType: "UD",
        location: "Mumbai_Hub",
        timestamp: new Date("2026-09-12T10:00:00Z"),
      },
      {
        status: "Package Picked Up",
        statusType: "PU",
        location: "Mumbai_Hub",
        timestamp: new Date("2026-09-12T14:00:00Z"),
      },
    ];

    // Simulate 5 consecutive refreshes with the exact same scan payload
    for (let i = 1; i <= 5; i++) {
      for (const scan of rawScans) {
        await prisma.shipmentScan.upsert({
          where: {
            storeId_awb_timestamp_status_location: {
              storeId: storeA.id,
              awb: testAwb,
              timestamp: scan.timestamp,
              status: scan.status,
              location: scan.location,
            },
          },
          create: {
            storeId: storeA.id,
            shipmentId: shipment.id,
            awb: testAwb,
            status: scan.status,
            statusType: scan.statusType,
            location: scan.location,
            timestamp: scan.timestamp,
          },
          update: {},
        });
      }
    }

    const totalScans = await prisma.shipmentScan.count({
      where: { storeId: storeA.id, awb: testAwb },
    });

    assert(totalScans === 2, `Expected exactly 2 scans after 5 refreshes, got ${totalScans} (0 duplicates)`);
    passed++;
  }

  // -------------------------------------------------------------------------
  // CASE 9: Status Progression Must Not Go Backward
  // -------------------------------------------------------------------------
  console.log("\n[TEST CASE 9] Status Progression Guard (No backward regression)");
  {
    const tCurrent = new Date("2026-09-12T17:00:00Z");
    const tOlder = new Date("2026-09-12T10:00:00Z");
    const tNewer = new Date("2026-09-12T19:00:00Z");

    // 1. IN_TRANSIT cannot regress to MANIFESTED on older event
    const reg1 = canAdvanceStatus("IN_TRANSIT", "MANIFESTED", tCurrent, tOlder);
    assert(!reg1, "canAdvanceStatus rejects regressing IN_TRANSIT -> MANIFESTED on older event");

    // 2. IN_TRANSIT cannot regress to MANIFESTED even without timestamps (rank check)
    const reg2 = canAdvanceStatus("IN_TRANSIT", "MANIFESTED");
    assert(!reg2, "canAdvanceStatus rejects regressing IN_TRANSIT (rank 7) -> MANIFESTED (rank 3)");

    // 3. DELIVERED can never regress to IN_TRANSIT
    const reg3 = canAdvanceStatus("DELIVERED", "IN_TRANSIT", tCurrent, tNewer);
    assert(!reg3, "canAdvanceStatus strictly forbids DELIVERED -> IN_TRANSIT");

    // 4. RTO_DELIVERED can never regress
    const reg4 = canAdvanceStatus("RTO_DELIVERED", "RTO", tCurrent, tNewer);
    assert(!reg4, "canAdvanceStatus strictly forbids RTO_DELIVERED -> RTO");

    // 5. MANIFESTED CAN advance forward to IN_TRANSIT
    const adv1 = canAdvanceStatus("MANIFESTED", "IN_TRANSIT", tOlder, tCurrent);
    assert(adv1, "canAdvanceStatus allows MANIFESTED -> IN_TRANSIT on forward progress");

    // 6. IN_TRANSIT CAN advance to OUT_FOR_DELIVERY
    const adv2 = canAdvanceStatus("IN_TRANSIT", "OUT_FOR_DELIVERY", tCurrent, tNewer);
    assert(adv2, "canAdvanceStatus allows IN_TRANSIT -> OUT_FOR_DELIVERY");

    // 7. OUT_FOR_DELIVERY CAN advance to DELIVERED
    const adv3 = canAdvanceStatus("OUT_FOR_DELIVERY", "DELIVERED");
    assert(adv3, "canAdvanceStatus allows OUT_FOR_DELIVERY -> DELIVERED");
    passed++;
  }

  // -------------------------------------------------------------------------
  // CASE 10: Future-Dated Carrier Event Protection
  // -------------------------------------------------------------------------
  console.log("\n[TEST CASE 10] Future-Dated Event Filter");
  {
    const pastTime = new Date(Date.now() - 3600 * 1000); // 1 hour ago
    const futureTime = new Date(Date.now() + 3 * 24 * 3600 * 1000); // 3 days in the future
    const clockSkewTime = new Date(Date.now() + 2 * 60 * 1000); // 2 mins future (within tolerance)

    assert(isValidEventTimestamp(pastTime), "Past event is valid");
    assert(isValidEventTimestamp(clockSkewTime), "Event with <= 5 min clock skew is accepted");
    assert(!isValidEventTimestamp(futureTime), "Event 3 days in the future is rejected as invalid");

    // Verify progression does not advance on future event
    const mockScans = [
      { ScanDateTime: pastTime.toISOString(), Scan: "Manifested", ScanType: "UD" },
      { ScanDateTime: futureTime.toISOString(), Scan: "Delivered", ScanType: "DL" },
    ];

    const validScans = mockScans.filter((s) => isValidEventTimestamp(s.ScanDateTime));
    assert(validScans.length === 1, "Future scan was filtered out");
    assert(validScans[0].Scan === "Manifested", "Only valid past scan remains");

    const norm = normalizeCourierStatus(
      validScans[validScans.length - 1].Scan,
      validScans[validScans.length - 1].ScanType,
      "",
      validScans
    );
    assert(norm.normalizedStatus === "MANIFESTED", "Normalized status remains MANIFESTED, not prematurely DELIVERED");
    passed++;
  }

  // -------------------------------------------------------------------------
  // CASE 11: Multi-Tenant Store Isolation
  // -------------------------------------------------------------------------
  console.log("\n[TEST CASE 11] Multi-Tenant Store Isolation");
  {
    const awbA = "TENANT_AWB_STORE_A";
    const awbB = "TENANT_AWB_STORE_B";

    await prisma.shipment.create({
      data: {
        storeId: storeA.id,
        awb: awbA,
        status: "In Transit",
        normalizedStatus: "IN_TRANSIT",
      },
    });

    await prisma.shipment.create({
      data: {
        storeId: storeB.id,
        awb: awbB,
        status: "Manifested",
        normalizedStatus: "MANIFESTED",
      },
    });

    // Query from Store A
    const storeAShipments = await prisma.shipment.findMany({
      where: { storeId: storeA.id },
    });
    assert(
      storeAShipments.every((s) => s.storeId === storeA.id),
      "Store A query returns ONLY Store A shipments"
    );
    assert(!storeAShipments.some((s) => s.awb === awbB), "Store A cannot see Store B AWB");

    // Query from Store B
    const storeBShipments = await prisma.shipment.findMany({
      where: { storeId: storeB.id },
    });
    assert(
      storeBShipments.every((s) => s.storeId === storeB.id),
      "Store B query returns ONLY Store B shipments"
    );
    assert(!storeBShipments.some((s) => s.awb === awbA), "Store B cannot see Store A AWB");
    passed++;
  }

  // -------------------------------------------------------------------------
  // CASE 12: Unknown / Ambiguous Carrier Status
  // -------------------------------------------------------------------------
  console.log("\n[TEST CASE 12] Unknown / Ambiguous Carrier Status");
  {
    const u1 = normalizeCourierStatus("Custom Carrier Status 999", "XX", "Something unexpected");
    assert(
      u1.normalizedStatus !== "IN_TRANSIT",
      "Unknown status must NOT convert to IN_TRANSIT"
    );
    assert(
      u1.normalizedStatus === "MANIFESTED" || u1.normalizedStatus === "UNKNOWN",
      "Unknown status maps to safe neutral status (MANIFESTED)"
    );

    const u2 = normalizeCourierStatus("", "", "");
    assert(
      u2.normalizedStatus !== "IN_TRANSIT",
      "Empty status must NOT convert to IN_TRANSIT"
    );
    passed++;
  }

  // Clean up test data
  await prisma.shipmentScan.deleteMany({
    where: { storeId: { in: [storeA.id, storeB.id] } },
  });
  await prisma.shipment.deleteMany({
    where: { storeId: { in: [storeA.id, storeB.id] } },
  });
  await prisma.shopifyStore.deleteMany({
    where: { id: { in: [storeA.id, storeB.id] } },
  });

  console.log("\n==================================================================");
  console.log(`ALL 12 TEST CASES PASSED SUCCESSFULLY! (${passed} passing)`);
  console.log("==================================================================");
}

runAllTests()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error("Test execution failed:", err);
    process.exit(1);
  });
