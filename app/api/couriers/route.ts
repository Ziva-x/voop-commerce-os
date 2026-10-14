import { NextRequest, NextResponse } from "next/server";
import { authorizeStoreAccess } from "@/lib/auth-helpers";
import { CourierIntegrationService } from "@/lib/services/couriers/CourierIntegrationService";
import { CourierType } from "@/lib/services/couriers/types";

export const dynamic = "force-dynamic";

/**
 * GET /api/couriers
 * Returns all 6 courier partner cards with connection status, environment, and masked credentials.
 * Multi-tenant: strictly scoped to the authenticated VOOP Store ID.
 */
export async function GET(request: NextRequest) {
  try {
    const auth = await authorizeStoreAccess(request, { requiredPermission: "courier_api.view" });
    if (!auth.authorized || !auth.storeId) {
      return NextResponse.json(
        { error: auth.error || "Unauthorized. Please log in." },
        { status: auth.status || 401, headers: { "Cache-Control": "no-store" } }
      );
    }
    const storeId = auth.storeId;

    const data = await CourierIntegrationService.getAllIntegrations(storeId);
    return NextResponse.json({
      success: true,
      ...data,
    });
  } catch (error: any) {
    console.error("GET /api/couriers error:", error);
    return NextResponse.json({ error: error.message || "Failed to fetch courier configurations" }, { status: 500 });
  }
}

/**
 * POST /api/couriers
 * Save or update credentials for a courier partner.
 * Credentials are encrypted at rest using AES-256-GCM.
 */
export async function POST(request: NextRequest) {
  try {
    const auth = await authorizeStoreAccess(request, { requiredPermission: "courier_api.manage" });
    if (!auth.authorized || !auth.storeId) {
      return NextResponse.json(
        { error: auth.error || "Unauthorized. Please log in." },
        { status: auth.status || 401, headers: { "Cache-Control": "no-store" } }
      );
    }
    const storeId = auth.storeId;

    const body = await request.json();
    const { courier, credentials, environment, status } = body;

    if (!courier) {
      return NextResponse.json({ error: "Courier type is required." }, { status: 400 });
    }

    if (!credentials || typeof credentials !== "object") {
      return NextResponse.json({ error: "Credentials object is required." }, { status: 400 });
    }

    const courierKey = courier.toUpperCase().trim() as CourierType;
    const result = await CourierIntegrationService.saveIntegration(storeId, courierKey, {
      credentials,
      environment,
      status,
    });

    return NextResponse.json({
      success: true,
      message: `${courierKey} configuration saved successfully.`,
      result,
    });
  } catch (error: any) {
    console.error("POST /api/couriers error:", error);
    return NextResponse.json({ error: error.message || "Failed to save courier configuration" }, { status: 500 });
  }
}

/**
 * DELETE /api/couriers?courier=DELHIVERY
 * Disconnect a courier partner for this store.
 */
export async function DELETE(request: NextRequest) {
  try {
    const auth = await authorizeStoreAccess(request, { requiredPermission: "courier_api.manage" });
    if (!auth.authorized || !auth.storeId) {
      return NextResponse.json(
        { error: auth.error || "Unauthorized" },
        { status: auth.status || 401, headers: { "Cache-Control": "no-store" } }
      );
    }
    const storeId = auth.storeId;

    const { searchParams } = new URL(request.url);
    const courier = searchParams.get("courier");

    if (!courier) {
      return NextResponse.json({ error: "Courier query parameter is required." }, { status: 400 });
    }

    const courierKey = courier.toUpperCase().trim() as CourierType;
    await CourierIntegrationService.disconnect(storeId, courierKey);

    return NextResponse.json({
      success: true,
      message: `${courierKey} disconnected successfully.`,
    });
  } catch (error: any) {
    console.error("DELETE /api/couriers error:", error);
    return NextResponse.json({ error: error.message || "Failed to disconnect courier" }, { status: 500 });
  }
}
