import { NextRequest, NextResponse } from "next/server";
import { resolveStoreId } from "@/lib/auth-helpers";
import { prisma } from "@/lib/prisma";

export async function POST(request: NextRequest) {
  try {
    const storeId = await resolveStoreId(request);
    if (!storeId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Delete shipments without an order number or that were created as manual orphans
    const deleted = await prisma.shipment.deleteMany({
      where: {
        storeId,
        OR: [
          { orderNumber: null },
          { orderNumber: "" },
          { orderNumber: "—" },
        ],
      },
    });

    return NextResponse.json({ success: true, deletedCount: deleted.count });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
