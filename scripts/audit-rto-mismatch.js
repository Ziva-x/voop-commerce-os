const { PrismaClient } = require('../lib/generated/client');
const p = new PrismaClient();


async function audit() {
  const allShipments = await p.shipment.findMany({
    include: { scans: true }
  });

  console.log(`Total shipments in DB: ${allShipments.length}`);

  function testNormalize(s) {
    const raw = (s.rawStatus || s.status || "").toUpperCase().trim();
    const type = (s.statusType || "").toUpperCase().trim();
    const inst = (s.statusInstructions || "").toUpperCase().trim();
    const scans = s.scans || [];

    const hasRtoDeliveredScan = scans.some((sc) => {
      const st = (sc.statusType || sc.type || "").toUpperCase();
      const txt = `${sc.status || ""} ${sc.instructions || ""} ${sc.description || ""}`.toUpperCase();
      return (
        st === "RT-DL" ||
        (st === "DL" && (txt.includes("RTO") || txt.includes("RETURN") || txt.includes("ACCEPTED") || txt.includes("ORIGIN"))) ||
        txt.includes("RTO DELIVERED") ||
        txt.includes("RETURN DELIVERED") ||
        txt.includes("DELIVERED TO ORIGIN") ||
        txt.includes("DELIVERED TO CLIENT") ||
        txt.includes("RETURNED TO ORIGIN") ||
        txt.includes("RETURNED TO SHIPPER") ||
        txt.includes("RECEIVED AT ORIGIN") ||
        txt.includes("RECEIVED AT RETURN") ||
        txt.includes("RETURN RECEIVED") ||
        txt.includes("RETURN ACCEPTED") ||
        txt.includes("RD-AC")
      );
    });

    const hasRtoActiveScan = scans.some((sc) => {
      const st = (sc.statusType || sc.type || "").toUpperCase();
      const txt = `${sc.status || ""} ${sc.instructions || ""} ${sc.description || ""}`.toUpperCase();
      return (
        st === "RT" ||
        txt.includes("RTO INITIATED") ||
        txt.includes("RTO IN TRANSIT") ||
        txt.includes("RTO IN-TRANSIT") ||
        txt.includes("RETURN TO ORIGIN") ||
        txt.includes("RETURNING TO ORIGIN") ||
        txt.includes("RETURNING") ||
        (txt.includes("RTO") && !txt.includes("RT-DL") && !txt.includes("RTO DELIVERED"))
      );
    });

    const isRtoCandidate =
      type === "RT" ||
      type === "RT-DL" ||
      raw.includes("RTO") ||
      raw.includes("RETURN TO ORIGIN") ||
      raw.includes("RETURNED TO ORIGIN") ||
      raw.includes("RETURNING TO ORIGIN") ||
      raw.includes("RETURNED") ||
      raw.includes("RETURNING") ||
      inst.includes("RTO") ||
      inst.includes("RETURN TO ORIGIN") ||
      inst.includes("RETURN ACCEPTED") ||
      hasRtoDeliveredScan ||
      hasRtoActiveScan ||
      Boolean(s.rtoInwardScanned) ||
      Boolean(s.rtoDate);

    if (isRtoCandidate) {
      const isRtoTerminal =
        type === "RT-DL" ||
        (type === "DL" && isRtoCandidate) ||
        hasRtoDeliveredScan ||
        raw.includes("RTO DELIVERED") ||
        raw.includes("RETURN DELIVERED") ||
        raw.includes("DELIVERED TO ORIGIN") ||
        raw.includes("DELIVERED TO CLIENT") ||
        raw.includes("RETURNED TO ORIGIN") ||
        raw.includes("RECEIVED AT ORIGIN") ||
        raw.includes("RECEIVED AT RETURN") ||
        inst.includes("RTO DELIVERED") ||
        inst.includes("RETURN DELIVERED") ||
        inst.includes("DELIVERED TO ORIGIN") ||
        inst.includes("RETURN ACCEPTED") ||
        inst.includes("RD-AC") ||
        Boolean(s.rtoInwardScanned) ||
        (!raw.includes("UNDELIVERED") && (raw.includes("DELIVERED") || raw === "DL" || type === "DL") && isRtoCandidate);

      if (isRtoTerminal) {
        return "RTO_DELIVERED";
      }
      return "RTO";
    }

    if (
      !raw.includes("UNDELIVERED") &&
      !inst.includes("UNDELIVERED") &&
      (type === "DL" || raw === "DELIVERED" || raw.includes("DELIVERED"))
    ) {
      return "DELIVERED";
    }

    return s.normalizedStatus;
  }

  const counts = {};
  for (const s of allShipments) {
    const norm = testNormalize(s);
    counts[norm] = (counts[norm] || 0) + 1;
  }
  console.log('\nNew normalized counts across all 200 shipments:', counts);
}

audit().catch(console.error).finally(() => p.$disconnect());
