import { NextRequest, NextResponse } from "next/server";
import { resolveStoreId } from "@/lib/auth-helpers";
import { DelhiveryService } from "@/lib/services/DelhiveryService";
import { CourierIntegrationService } from "@/lib/services/couriers/CourierIntegrationService";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  try {
    const storeId = await resolveStoreId(request);
    if (!storeId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const config = await DelhiveryService.getConfig(storeId);
    return NextResponse.json({ success: true, config });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const storeId = await resolveStoreId(request);
    if (!storeId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const body = await request.json();
    const config = await DelhiveryService.saveConfig(storeId, body);

    // Also sync to CourierIntegrationService
    try {
      if (body.apiToken) {
        await CourierIntegrationService.saveIntegration(storeId, "DELHIVERY", {
          credentials: {
            apiToken: body.apiToken,
            clientName: body.clientName,
            warehousePin: body.warehousePin,
          },
          environment: body.mode || "PRODUCTION",
          status: body.isActive !== false ? "CONNECTED" : "DISCONNECTED",
        });
      }
    } catch (bridgeErr) {
      console.error("Delhivery legacy sync bridge error:", bridgeErr);
    }

    return NextResponse.json({ success: true, config });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }
}
