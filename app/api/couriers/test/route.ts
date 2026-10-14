import { NextRequest, NextResponse } from "next/server";
import { resolveStoreId } from "@/lib/auth-helpers";
import { CourierIntegrationService } from "@/lib/services/couriers/CourierIntegrationService";
import { CourierType } from "@/lib/services/couriers/types";

export const dynamic = "force-dynamic";

/**
 * POST /api/couriers/test
 * Test connection to courier API using provided or stored credentials.
 */
export async function POST(request: NextRequest) {
  try {
    const storeId = await resolveStoreId(request);
    if (!storeId) {
      return NextResponse.json({ error: "Unauthorized. Please log in." }, { status: 401 });
    }

    const body = await request.json();
    const { courier, credentials, environment } = body;

    if (!courier) {
      return NextResponse.json({ error: "Courier type is required." }, { status: 400 });
    }

    const courierKey = courier.toUpperCase().trim() as CourierType;
    const testResult = await CourierIntegrationService.testConnection(
      storeId,
      courierKey,
      credentials,
      environment
    );

    return NextResponse.json({
      ...testResult,
      courier: courierKey,
    });
  } catch (error: any) {
    console.error("POST /api/couriers/test error:", error);
    return NextResponse.json({
      success: false,
      message: error.message || "Failed to test courier connection",
    }, { status: 500 });
  }
}
