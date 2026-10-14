import { prisma } from "../lib/prisma";

async function run() {
  console.log("=== RUNNING SHIPMENT STATUS MIGRATION OVER PROXY ===");

  // 1. Check current status breakdown
  const beforeStats: any[] = await prisma.$queryRawUnsafe(`
    SELECT "normalizedStatus", COUNT(*)::int as count
    FROM shipments
    GROUP BY "normalizedStatus"
    ORDER BY count DESC;
  `);
  console.log("Status breakdown BEFORE migration:", beforeStats);

  // 2. Migrate IN-TRANSIT to IN_TRANSIT
  const inTransitCount = await prisma.$executeRawUnsafe(`
    UPDATE shipments
    SET "normalizedStatus" = 'IN_TRANSIT', "status" = 'In Transit'
    WHERE "normalizedStatus" = 'IN-TRANSIT';
  `);
  console.log(`Migrated ${inTransitCount} rows from IN-TRANSIT -> IN_TRANSIT`);

  // 3. Migrate OUT-FOR-DELIVERY to OUT_FOR_DELIVERY
  const ofdCount = await prisma.$executeRawUnsafe(`
    UPDATE shipments
    SET "normalizedStatus" = 'OUT_FOR_DELIVERY', "status" = 'Out for Delivery'
    WHERE "normalizedStatus" = 'OUT-FOR-DELIVERY';
  `);
  console.log(`Migrated ${ofdCount} rows from OUT-FOR-DELIVERY -> OUT_FOR_DELIVERY`);

  // 4. Migrate DISPATCHED to IN_TRANSIT
  const dispatchedCount = await prisma.$executeRawUnsafe(`
    UPDATE shipments
    SET "normalizedStatus" = 'IN_TRANSIT', "status" = 'In Transit'
    WHERE "normalizedStatus" = 'DISPATCHED';
  `);
  console.log(`Migrated ${dispatchedCount} rows from DISPATCHED -> IN_TRANSIT`);

  // 5. Check if any RTO shipments are RTO Delivered
  const rtoDeliveredCount = await prisma.$executeRawUnsafe(`
    UPDATE shipments
    SET "normalizedStatus" = 'RTO_DELIVERED', "status" = 'RTO Delivered'
    WHERE ("normalizedStatus" = 'RTO' OR "status" ILIKE '%RTO%')
      AND (
        "status" ILIKE '%DELIVERED%'
        OR "rawStatus" ILIKE '%DELIVERED%'
        OR "statusType" = 'RT-DL'
        OR EXISTS (
          SELECT 1 FROM shipment_scans ss
          WHERE ss."shipmentId" = shipments.id
            AND (ss."statusType" = 'RT-DL' OR ss."status" ILIKE '%RTO DELIVERED%' OR ss."status" ILIKE '%RETURN DELIVERED%')
        )
      );
  `);
  console.log(`Migrated ${rtoDeliveredCount} rows to RTO_DELIVERED`);

  // 6. Check status breakdown after migration
  const afterStats: any[] = await prisma.$queryRawUnsafe(`
    SELECT "normalizedStatus", COUNT(*)::int as count
    FROM shipments
    GROUP BY "normalizedStatus"
    ORDER BY count DESC;
  `);
  console.log("Status breakdown AFTER migration:", afterStats);

  // 7. Verify distinct statuses and total count
  const allCounts = await prisma.shipment.groupBy({
    by: ["normalizedStatus", "status"],
    _count: { _all: true },
    orderBy: { _count: { normalizedStatus: "desc" } },
  });
  console.table(
    allCounts.map((c) => ({
      normalizedStatus: c.normalizedStatus,
      status: c.status,
      count: c._count._all,
    }))
  );

  console.log("=== SHIPMENT STATUS MIGRATION COMPLETE ===");
}

run()
  .catch((e) => {
    console.error("Migration failed:", e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
