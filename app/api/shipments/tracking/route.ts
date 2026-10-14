import { NextRequest, NextResponse } from "next/server";
import { resolveStoreId } from "@/lib/auth-helpers";
import { CourierTrackingService } from "@/lib/services/CourierTrackingService";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  try {
    const storeId = await resolveStoreId(request);
    if (!storeId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const awb = searchParams.get("awb");
    const carrier = searchParams.get("carrier") || undefined;
    const forceRefresh = searchParams.get("refresh") === "true";

    if (!awb) {
      return NextResponse.json({ error: "AWB query parameter is required" }, { status: 400 });
    }

    const tracking = await CourierTrackingService.trackShipment(storeId, awb, forceRefresh, carrier);

    if (!tracking) {
      return NextResponse.json(
        { error: `No tracking information found for AWB ${awb}` },
        { status: 404 }
      );
    }

    return NextResponse.json({
      success: true,
      tracking,
    });
  } catch (error: any) {
    console.error("Courier Tracking Error:", error);
    return NextResponse.json(
      { error: error.message || "Failed to fetch tracking data" },
      { status: 500 }
    );
  }
}
