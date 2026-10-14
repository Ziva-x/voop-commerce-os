import { NextRequest, NextResponse } from "next/server";
import { authorizeStoreAccess } from "@/lib/auth-helpers";
import { CourierTrackingService } from "@/lib/services/CourierTrackingService";

export const dynamic = "force-dynamic";

export async function GET(
  request: NextRequest,
  { params }: { params: { awb: string } }
) {
  try {
    const auth = await authorizeStoreAccess(request, { requiredPermission: "shipments.view" });
    if (!auth.authorized || !auth.storeId) {
      return NextResponse.json(
        { error: auth.error || "Unauthorized" },
        {
          status: auth.status || 401,
          headers: {
            "Cache-Control": "no-store, no-cache, must-revalidate",
            Pragma: "no-cache",
          },
        }
      );
    }

    const awb = params.awb;
    const { searchParams } = new URL(request.url);
    const forceRefresh = searchParams.get("refresh") === "true";
    const carrier = searchParams.get("carrier") || undefined;

    if (!awb) {
      return NextResponse.json(
        { error: "AWB parameter is required" },
        {
          status: 400,
          headers: { "Cache-Control": "no-store" },
        }
      );
    }

    const tracking = await CourierTrackingService.trackShipment(auth.storeId, awb, forceRefresh, carrier);

    if (!tracking) {
      return NextResponse.json(
        { error: `No tracking information found for AWB ${awb}` },
        {
          status: 404,
          headers: {
            "Cache-Control": "no-store, no-cache, must-revalidate",
            Pragma: "no-cache",
          },
        }
      );
    }

    return NextResponse.json(
      { success: true, tracking },
      {
        headers: {
          "Cache-Control": "no-store, no-cache, must-revalidate",
          Pragma: "no-cache",
          Vary: "x-voop-store-id, x-store-id, Authorization",
        },
      }
    );
  } catch (error: any) {
    console.error("Courier Tracking Error:", error);
    return NextResponse.json(
      { error: error.message || "Failed to fetch tracking data" },
      {
        status: 500,
        headers: { "Cache-Control": "no-store" },
      }
    );
  }
}
