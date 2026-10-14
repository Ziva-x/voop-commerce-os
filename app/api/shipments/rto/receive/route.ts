import { NextRequest, NextResponse } from "next/server";
import { RtoService } from "@/lib/services/RtoService";
import { resolveStoreId } from "@/lib/auth-helpers";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  try {
    const storeId = await resolveStoreId(request);
    if (!storeId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const awb = searchParams.get("awb");

    if (!awb) {
      return NextResponse.json({ error: "Missing required 'awb' parameter." }, { status: 400 });
    }

    const details = await RtoService.getShipmentReturnDetails(storeId, awb);
    return NextResponse.json({ success: true, ...details });
  } catch (error: any) {
    return NextResponse.json({ error: error.message || "Failed to fetch return details." }, { status: 400 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const storeId = await resolveStoreId(request);
    if (!storeId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await request.json();
    const { awb, condition, items, receivedBy, notes } = body;

    if (!awb) {
      return NextResponse.json({ error: "Missing required 'awb' field in request body." }, { status: 400 });
    }

    const result = await RtoService.receiveRtoShipment(storeId, {
      awb,
      condition: condition || "some_damaged",
      items: items || [],
      receivedBy: receivedBy || "Warehouse Staff",
      notes,
    });

    return NextResponse.json(result);
  } catch (error: any) {
    return NextResponse.json({ error: error.message || "Failed to receive RTO shipment." }, { status: 400 });
  }
}
