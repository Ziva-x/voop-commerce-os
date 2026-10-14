const { PrismaClient } = require('./lib/generated/client');
const prisma = new PrismaClient();

function normalizeStatusNew(rawStatus = "", statusType = "", instructions = "") {
  const raw = (rawStatus || "").toUpperCase().trim();
  const type = (statusType || "").toUpperCase().trim();
  const inst = (instructions || "").toUpperCase().trim();

  // 1. RTO / Return
  if (
    type === "RT" ||
    type === "RT-DL" ||
    raw.includes("RTO") ||
    raw.includes("RETURN") ||
    inst.includes("RTO") ||
    inst.includes("RETURN TO ORIGIN") ||
    inst.includes("RETURN ACCEPTED")
  ) {
    return { normalizedStatus: "RTO", displayStatus: "RTO" };
  }

  // 2. Delivered
  if (
    type === "DL" ||
    raw.includes("DELIVERED") ||
    inst.includes("DELIVERED TO CONSIGNEE")
  ) {
    return { normalizedStatus: "DELIVERED", displayStatus: "Delivered" };
  }

  // 3. Cancelled Pre-Dispatch / Not Picked
  if (
    raw === "NOT PICKED" ||
    inst.includes("SHIPMENT NOT RECEIVED FROM CLIENT") ||
    inst.includes("CANCEL") ||
    raw.includes("CANCEL") ||
    type === "CC"
  ) {
    return { normalizedStatus: "CANCELLED_PRE_DISPATCH", displayStatus: "Cancelled" };
  }

  // 4. Manifested / Pickup Pending (Sitting in warehouse, not yet picked up by courier)
  if (
    raw.includes("MANIFEST") ||
    inst.includes("MANIFEST") ||
    inst.includes("NOT READY FOR PICKUP") ||
    inst.includes("PICKUP SCHEDULED") ||
    inst.includes("PICKUP PENDING") ||
    inst.includes("PACKAGE DETAILS")
  ) {
    return { normalizedStatus: "MANIFESTED", displayStatus: "Manifested" };
  }

  // 5. Out For Delivery
  if (
    type === "OFD" ||
    raw.includes("OUT FOR DELIVERY") ||
    inst.includes("OUT FOR DELIVERY") ||
    inst.includes("CALL PLACED TO CONSIGNEE") ||
    inst.includes("PAID THROUGH LINK")
  ) {
    return { normalizedStatus: "OUT-FOR-DELIVERY", displayStatus: "Out for Delivery" };
  }

  // 6. In Transit / Dispatched / Arrived at Hub
  if (
    type === "IT" ||
    type === "PU" ||
    raw.includes("IN TRANSIT") ||
    raw.includes("INTRANSIT") ||
    raw.includes("PICKED UP") ||
    raw.includes("DISPATCHED") ||
    inst.includes("BAG RECEIVED") ||
    inst.includes("FACILITY") ||
    inst.includes("VEHICLE") ||
    inst.includes("DEPARTED") ||
    inst.includes("ARRIVED") ||
    inst.includes("TRIP") ||
    inst.includes("WEIGHT CAPTURED")
  ) {
    return { normalizedStatus: "IN-TRANSIT", displayStatus: "In Transit" };
  }

  // 7. NDR — True Non-Delivery Report / Delivery Attempt Failed
  if (
    raw.includes("NDR") ||
    raw.includes("UNDELIVERED") ||
    raw.includes("DELIVERY FAILED") ||
    raw.includes("ATTEMPT FAILED") ||
    inst.includes("CUSTOMER NOT AVAILABLE") ||
    inst.includes("CONSIGNEE UNAVAILABLE") ||
    inst.includes("DOOR LOCKED") ||
    inst.includes("DELIVERY ATTEMPTED") ||
    inst.includes("ATTEMPTED") ||
    inst.includes("REFUSED") ||
    inst.includes("CUSTOMER REFUSED") ||
    inst.includes("RESCHEDULED") ||
    inst.includes("FUTURE DELIVERY") ||
    inst.includes("COLLECT FROM BRANCH") ||
    inst.includes("MAXIMUM ATTEMPTS") ||
    inst.includes("ADDRESS INCOMPLETE") ||
    inst.includes("WRONG ADDRESS") ||
    inst.includes("PHONE NOT REACHABLE") ||
    inst.includes("NOT REACHABLE") ||
    inst.includes("CASH NOT READY") ||
    inst.includes("NOT ATTEMPTED") ||
    inst.includes("AGENT REMARK")
  ) {
    return { normalizedStatus: "NDR", displayStatus: "NDR" };
  }

  // Default fallback
  return { normalizedStatus: "MANIFESTED", displayStatus: "Manifested" };
}

async function main() {
  const store = await prisma.shopifyStore.findFirst({ where: { voopStoreId: 'VOOP-H2GDGBVA' } });
  const all = await prisma.shipment.findMany({
    where: { storeId: store.id },
  });

  const oldBreakdown = {};
  const newBreakdown = {};

  all.forEach(s => {
    oldBreakdown[s.normalizedStatus] = (oldBreakdown[s.normalizedStatus] || 0) + 1;
    const res = normalizeStatusNew(s.rawStatus, s.statusType, s.statusInstructions);
    newBreakdown[res.normalizedStatus] = (newBreakdown[res.normalizedStatus] || 0) + 1;
  });

  console.log('OLD BREAKDOWN:', oldBreakdown);
  console.log('NEW BREAKDOWN:', newBreakdown);
}

main().finally(() => prisma.$disconnect());
