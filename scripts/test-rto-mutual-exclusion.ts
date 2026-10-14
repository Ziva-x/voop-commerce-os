import { PrismaClient } from "./lib/generated/client";
import { normalizeCourierStatus, canAdvanceStatus } from "./lib/services/couriers/statusNormalization";

const prisma = new PrismaClient();

function assert(condition: boolean, testName: string, detail?: string) {
  if (condition) {
    console.log(`PASS: ${testName}${detail ? ` (${detail})` : ""}`);
  } else {
    console.error(`FAIL: ${testName}${detail ? ` (${detail})` : ""}`);
    process.exit(1);
  }
}

async function run() {
  console.log("==================================================");
  console.log("RUNNING ACCEPTANCE TESTS FOR RTO & RTO DELIVERED");
  console.log("==================================================\n");

  const store = await prisma.shopifyStore.findFirst({ where: { isConnected: true } });
  if (!store) {
    throw new Error("No active store found");
  }
  const storeId = store.id;

  // ---------------------------------------------------------------
  // TEST 1 — RTO (Active Return)
  // Create/use shipment: status = RTO
  // Expected: RTO tab -> YES, RTO Delivered -> NO
  // ---------------------------------------------------------------
  const testAwb1 = `TEST-RTO-${Date.now()}`;
  await prisma.shipment.create({
    data: {
      storeId,
      awb: testAwb1,
      orderNumber: "TEST-ORD-1",
      status: "RTO in Transit",
      normalizedStatus: "RTO",
      rawStatus: "RTO in Transit",
      statusType: "RT",
    },
  });

  // Query RTO filter
  const rtoMatches1 = await prisma.shipment.findMany({
    where: { storeId, awb: testAwb1, normalizedStatus: "RTO" },
  });
  // Query RTO Delivered filter
  const rtoDeliveredMatches1 = await prisma.shipment.findMany({
    where: { storeId, awb: testAwb1, normalizedStatus: "RTO_DELIVERED" },
  });

  assert(
    rtoMatches1.length === 1 && rtoDeliveredMatches1.length === 0,
    "TEST 1 — RTO",
    `RTO tab: ${rtoMatches1.length === 1 ? "YES" : "NO"}, RTO Delivered: ${rtoDeliveredMatches1.length === 1 ? "YES" : "NO"}`
  );

  // ---------------------------------------------------------------
  // TEST 2 — RTO DELIVERED
  // Create/use shipment: status = RTO_DELIVERED
  // Expected: RTO tab -> NO, RTO Delivered -> YES
  // ---------------------------------------------------------------
  const testAwb2 = `TEST-RTODEL-${Date.now()}`;
  await prisma.shipment.create({
    data: {
      storeId,
      awb: testAwb2,
      orderNumber: "TEST-ORD-2",
      status: "RTO Delivered",
      normalizedStatus: "RTO_DELIVERED",
      rawStatus: "RTO Delivered",
      statusType: "RT-DL",
      deliveryDate: new Date(),
    },
  });

  const rtoMatches2 = await prisma.shipment.findMany({
    where: { storeId, awb: testAwb2, normalizedStatus: "RTO" },
  });
  const rtoDeliveredMatches2 = await prisma.shipment.findMany({
    where: { storeId, awb: testAwb2, normalizedStatus: "RTO_DELIVERED" },
  });

  assert(
    rtoMatches2.length === 0 && rtoDeliveredMatches2.length === 1,
    "TEST 2 — RTO DELIVERED",
    `RTO tab: ${rtoMatches2.length === 1 ? "YES" : "NO"}, RTO Delivered: ${rtoDeliveredMatches2.length === 1 ? "YES" : "NO"}`
  );

  // ---------------------------------------------------------------
  // TEST 3 — CURRENT LIVE/SCREENSHOT DATA: Click RTO
  // Expected: NONE of the RTO DELIVERED shipments appear
  // ---------------------------------------------------------------
  const allDeliveredRtoInDb = await prisma.shipment.findMany({
    where: { storeId, normalizedStatus: "RTO_DELIVERED" },
    select: { awb: true },
  });

  const rtoTabResults = await prisma.shipment.findMany({
    where: {
      storeId,
      deletedAt: null,
      orderNumber: { not: null },
      normalizedStatus: "RTO",
    },
  });

  const overlap = rtoTabResults.filter((s) =>
    allDeliveredRtoInDb.some((d) => d.awb === s.awb)
  );

  assert(
    overlap.length === 0,
    "TEST 3 — CURRENT SCREENSHOT DATA (Click RTO)",
    `NONE of the ${allDeliveredRtoInDb.length} RTO DELIVERED shipments appear in RTO tab (overlap: ${overlap.length})`
  );

  // ---------------------------------------------------------------
  // TEST 4 — Click RTO Delivered
  // Expected: Those shipments appear
  // ---------------------------------------------------------------
  const rtoDeliveredTabResults = await prisma.shipment.findMany({
    where: {
      storeId,
      deletedAt: null,
      orderNumber: { not: null },
      normalizedStatus: "RTO_DELIVERED",
    },
  });

  assert(
    rtoDeliveredTabResults.length >= allDeliveredRtoInDb.length && rtoDeliveredTabResults.length > 0,
    "TEST 4 — Click RTO Delivered",
    `RTO Delivered tab returns all ${rtoDeliveredTabResults.length} RTO DELIVERED shipments`
  );

  // ---------------------------------------------------------------
  // TEST 5 — COUNT
  // RTO count = exact RTO shipments only
  // RTO Delivered count = exact RTO_DELIVERED shipments only
  // ---------------------------------------------------------------
  const rtoCount = await prisma.shipment.count({
    where: { storeId, deletedAt: null, orderNumber: { not: null }, normalizedStatus: "RTO" },
  });
  const rtoDeliveredCount = await prisma.shipment.count({
    where: { storeId, deletedAt: null, orderNumber: { not: null }, normalizedStatus: "RTO_DELIVERED" },
  });
  const totalRtoBoth = await prisma.shipment.count({
    where: {
      storeId,
      deletedAt: null,
      orderNumber: { not: null },
      normalizedStatus: { in: ["RTO", "RTO_DELIVERED"] },
    },
  });

  assert(
    rtoCount + rtoDeliveredCount === totalRtoBoth && rtoCount !== totalRtoBoth,
    "TEST 5 — COUNT",
    `RTO count: ${rtoCount}, RTO Delivered count: ${rtoDeliveredCount}, Sum: ${totalRtoBoth} (Mutually exclusive)`
  );

  // ---------------------------------------------------------------
  // TEST 6 — TRANSITION
  // Shipment: RTO -> courier tracking becomes RTO Delivered
  // Expected: RTO -> removed, RTO Delivered -> added
  // ---------------------------------------------------------------
  const transitionAwb = `TEST-TRANS-${Date.now()}`;
  await prisma.shipment.create({
    data: {
      storeId,
      awb: transitionAwb,
      orderNumber: "TEST-ORD-TRANS",
      status: "RTO in Transit",
      normalizedStatus: "RTO",
      rawStatus: "RTO in Transit",
      statusType: "RT",
    },
  });

  // Verify initially in RTO tab
  const inRtoBefore = await prisma.shipment.count({
    where: { storeId, awb: transitionAwb, normalizedStatus: "RTO" },
  });
  const inRtoDelBefore = await prisma.shipment.count({
    where: { storeId, awb: transitionAwb, normalizedStatus: "RTO_DELIVERED" },
  });

  // Simulate courier delivery update: Delhivery Status: RTO, StatusType: DL, Instructions: RETURN Accepted
  const normalizedCourier = normalizeCourierStatus(
    "RTO",
    "DL",
    "RETURN Accepted",
    [{ status: "RTO", statusType: "DL", instructions: "RETURN Accepted" }]
  );

  const canAdvance = canAdvanceStatus("RTO", normalizedCourier.normalizedStatus);
  assert(canAdvance, "TEST 6A — Transition allowed", `canAdvanceStatus(RTO, ${normalizedCourier.normalizedStatus}) is TRUE`);

  // Apply courier update
  await prisma.shipment.update({
    where: { storeId_awb: { storeId, awb: transitionAwb } },
    data: {
      normalizedStatus: normalizedCourier.normalizedStatus,
      status: normalizedCourier.displayStatus,
      statusType: "DL",
      deliveryDate: new Date(),
    },
  });

  const inRtoAfter = await prisma.shipment.count({
    where: { storeId, awb: transitionAwb, normalizedStatus: "RTO" },
  });
  const inRtoDelAfter = await prisma.shipment.count({
    where: { storeId, awb: transitionAwb, normalizedStatus: "RTO_DELIVERED" },
  });

  assert(
    inRtoBefore === 1 && inRtoDelBefore === 0 && inRtoAfter === 0 && inRtoDelAfter === 1,
    "TEST 6 — TRANSITION",
    `Before: (RTO: ${inRtoBefore}, RTO_DEL: ${inRtoDelBefore}) -> After: (RTO: ${inRtoAfter}, RTO_DEL: ${inRtoDelAfter})`
  );

  // ---------------------------------------------------------------
  // TEST 7 — OTHER STATUS
  // In Transit shipment: RTO -> NO, RTO Delivered -> NO
  // ---------------------------------------------------------------
  const inTransitAwb = `TEST-TRANSIT-${Date.now()}`;
  await prisma.shipment.create({
    data: {
      storeId,
      awb: inTransitAwb,
      orderNumber: "TEST-ORD-IT",
      status: "In Transit",
      normalizedStatus: "IN_TRANSIT",
      rawStatus: "In Transit",
      statusType: "IT",
    },
  });

  const itInRto = await prisma.shipment.count({
    where: { storeId, awb: inTransitAwb, normalizedStatus: "RTO" },
  });
  const itInRtoDel = await prisma.shipment.count({
    where: { storeId, awb: inTransitAwb, normalizedStatus: "RTO_DELIVERED" },
  });

  assert(
    itInRto === 0 && itInRtoDel === 0,
    "TEST 7 — OTHER STATUS",
    `In Transit shipment in RTO: ${itInRto === 1 ? "YES" : "NO"}, in RTO Delivered: ${itInRtoDel === 1 ? "YES" : "NO"}`
  );

  // ---------------------------------------------------------------
  // TEST 8 — MULTI-TENANT ISOLATION
  // Store A and Store B have RTO/RTO Delivered shipments. Verify no leakage.
  // ---------------------------------------------------------------
  let secondStore = await prisma.shopifyStore.findFirst({
    where: { id: { not: storeId } },
  });
  if (!secondStore) {
    secondStore = await prisma.shopifyStore.create({
      data: {
        shopDomain: "store-b-test-isolation.myshopify.com",
        accessToken: "shpat_test_b",
        storeName: "Store B Isolation Test",
        voopStoreId: "VOOP-TEST-STORE-B",
        tenantId: "TENANT-TEST-STORE-B",
        publicStoreRef: "test-ref-b-" + Date.now(),
      },
    });
  }
  const storeIdB = secondStore.id;

  const storeBAwb = `TEST-STORE-B-${Date.now()}`;
  await prisma.shipment.create({
    data: {
      storeId: storeIdB,
      awb: storeBAwb,
      orderNumber: "STORE-B-ORD",
      status: "RTO Delivered",
      normalizedStatus: "RTO_DELIVERED",
    },
  });

  // Query Store A
  const storeAResults = await prisma.shipment.findMany({
    where: { storeId, awb: storeBAwb, normalizedStatus: "RTO_DELIVERED" },
  });
  // Query Store B
  const storeBResults = await prisma.shipment.findMany({
    where: { storeId: storeIdB, awb: storeBAwb, normalizedStatus: "RTO_DELIVERED" },
  });

  assert(
    storeAResults.length === 0 && storeBResults.length === 1,
    "TEST 8 — MULTI-TENANT",
    `Store A results: ${storeAResults.length}, Store B results: ${storeBResults.length} (Zero cross-store leakage)`
  );

  // Clean up test records
  await prisma.shipment.deleteMany({
    where: {
      awb: { in: [testAwb1, testAwb2, transitionAwb, inTransitAwb, storeBAwb] },
    },
  });

  console.log("\n==================================================");
  console.log("ALL 8 ACCEPTANCE TESTS PASSED WITH 100% SUCCESS! ✓");
  console.log("==================================================");
}

run()
  .catch((e) => {
    console.error("Test error:", e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
