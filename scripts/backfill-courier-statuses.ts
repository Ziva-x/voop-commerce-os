import { PrismaClient } from "../lib/generated/client";
const prisma = new PrismaClient();

async function main() {
  console.log("=== STARTING SHIPMENT STATUS MIGRATION ===");

  const shipments = await prisma.shipment.findMany({
    where: {
      deletedAt: null,
      OR: [
        { normalizedStatus: "DISPATCHED" },
        { normalizedStatus: "MANIFESTED" },
        { normalizedStatus: "READY_FOR_PICKUP" },
        { normalizedStatus: "PICKUP_SCHEDULED" },
        { normalizedStatus: "PICKED_UP" },
        { status: "Dispatched" },
        { status: "Manifested" },
      ],
    },
    include: {
      scans: true,
    },
  });

  console.log(`Found ${shipments.length} candidate shipments to evaluate.`);

  let updatedCount = 0;

  for (const s of shipments) {
    const validScans = (s.scans || []).sort(
      (a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime()
    );

    const physicalPickupScan = validScans.find((sc) => {
      const st = ((sc.statusType || "") as string).toUpperCase();
      const txt = `${sc.status || ""} ${sc.instructions || ""}`.toUpperCase();
      return (
        st === "PU" ||
        st === "PK" ||
        st === "P" ||
        st === "PC" ||
        txt.includes("PICKED UP") ||
        txt.includes("PICKED-UP") ||
        txt.includes("PACKAGE PICKED UP") ||
        txt.includes("SHIPMENT PICKED UP") ||
        txt.includes("PICKUP COMPLETED") ||
        txt.includes("INWARDED AT ORIGIN") ||
        txt.includes("RECEIVED FROM SHIPPER")
      );
    });

    const hasMovement = validScans.some((sc) => {
      const st = ((sc.statusType || "") as string).toUpperCase();
      const txt = `${sc.status || ""} ${sc.instructions || ""}`.toUpperCase();
      return (
        st === "IT" ||
        st === "RAD" ||
        st === "DEP" ||
        st === "ARR" ||
        txt.includes("IN TRANSIT") ||
        txt.includes("ARRIVED AT") ||
        txt.includes("DEPARTED") ||
        txt.includes("DISPATCHED FROM") ||
        txt.includes("CONNECTED TO")
      );
    });

    let newNorm = s.normalizedStatus;
    let newStatus = s.status;

    if (hasMovement) {
      newNorm = "IN_TRANSIT";
      newStatus = "In Transit";
    } else if (physicalPickupScan) {
      newNorm = "PICKUP_COMPLETED";
      newStatus = "Pickup Completed";
    } else {
      newNorm = "AWB_GENERATED";
      newStatus = "AWB Generated";
    }

    if (newNorm !== s.normalizedStatus || newStatus !== s.status) {
      await prisma.shipment.update({
        where: { id: s.id },
        data: {
          normalizedStatus: newNorm,
          status: newStatus,
        },
      });
      updatedCount++;
      if (s.awb === "46932210010032") {
        console.log(`Updated Screenshot AWB 46932210010032: ${s.normalizedStatus} -> ${newNorm} (${newStatus})`);
      }
    }
  }

  console.log(`Updated ${updatedCount} shipments to authoritative courier workflow.`);
  
  // Verify AWB 46932210010032
  const target = await prisma.shipment.findFirst({
    where: { awb: "46932210010032" },
    select: {
      awb: true,
      orderNumber: true,
      status: true,
      normalizedStatus: true,
      pickupDate: true,
    },
  });
  console.log("=== VERIFIED TARGET SHIPMENT ===", target);
}

main().catch(console.error).finally(() => prisma.$disconnect());
