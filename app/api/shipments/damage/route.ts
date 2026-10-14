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
    const query = searchParams.get("query") || searchParams.get("awb") || searchParams.get("orderNumber");

    if (!query) {
      return NextResponse.json({ error: "Missing required 'query', 'awb', or 'orderNumber' parameter." }, { status: 400 });
    }

    const details = await RtoService.getShipmentReturnDetails(storeId, query);
    return NextResponse.json({ success: true, ...details });
  } catch (error: any) {
    return NextResponse.json({ error: error.message || "Failed to fetch item details for damage inspection." }, { status: 400 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const storeId = await resolveStoreId(request);
    if (!storeId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await request.json();
    const { identifier, damagedItems, receivedBy, notes, idempotencyKey } = body;

    if (!identifier) {
      return NextResponse.json({ error: "Missing required 'identifier' (AWB or Order #)." }, { status: 400 });
    }

    if (!damagedItems || !Array.isArray(damagedItems) || damagedItems.length === 0) {
      return NextResponse.json({ error: "Please select at least one damaged SKU to move." }, { status: 400 });
    }

    const result = await RtoService.flagDamageAndMoveStock(storeId, {
      identifier,
      damagedItems,
      receivedBy: receivedBy || "Warehouse Staff",
      notes,
      idempotencyKey,
    });

    return NextResponse.json(result);
  } catch (error: any) {
    return NextResponse.json({ error: error.message || "Failed to process damage scan." }, { status: 400 });
  }
}
