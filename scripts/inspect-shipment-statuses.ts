import { prisma } from "../lib/prisma";

async function inspect() {
  try {
    const counts = await prisma.shipment.groupBy({
      by: ["normalizedStatus", "status"],
      _count: {
        _all: true,
      },
      orderBy: {
        _count: {
          normalizedStatus: "desc",
        },
      },
    });

    console.log("=========================================");
    console.log("EXISTING SHIPMENT STATUSES IN DATABASE");
    console.log("=========================================");
    console.table(
      counts.map((c) => ({
        normalizedStatus: c.normalizedStatus,
        status: c.status,
        count: c._count._all,
      }))
    );

    const distinctNormalized = await prisma.shipment.findMany({
      select: { normalizedStatus: true },
      distinct: ["normalizedStatus"],
    });
    console.log("Distinct normalizedStatus values:", distinctNormalized.map((d) => d.normalizedStatus));

    const distinctStatus = await prisma.shipment.findMany({
      select: { status: true },
      distinct: ["status"],
    });
    console.log("Distinct status values:", distinctStatus.map((d) => d.status));

    const total = await prisma.shipment.count();
    console.log("Total shipments:", total);
  } catch (err: any) {
    console.error("Error inspecting database:", err.message);
  } finally {
    await prisma.$disconnect();
  }
}

inspect();
