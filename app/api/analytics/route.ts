import { NextRequest, NextResponse } from "next/server";
import { AnalyticsService } from "@/lib/services/AnalyticsService";
import { authorizeStoreAccess } from "@/lib/auth-helpers";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  try {
    const auth = await authorizeStoreAccess(request, { requiredPermission: "dashboard.view" });
    if (!auth.authorized || !auth.storeId) {
      return NextResponse.json(
        { error: auth.error || "Unauthorized" },
        { status: auth.status || 401, headers: { "Cache-Control": "no-store" } }
      );
    }

    const { searchParams } = new URL(request.url);
    const period = (searchParams.get("period") as any) || "30d";
    const startDate = searchParams.get("startDate") || undefined;
    const endDate = searchParams.get("endDate") || undefined;
    const comparison = (searchParams.get("comparison") as any) || "previous_period";

    const data = await AnalyticsService.getAnalyticsOverview(auth.storeId, {
      period,
      startDate,
      endDate,
      comparison,
    });

    return NextResponse.json(
      { success: true, ...data },
      { headers: { "Cache-Control": "no-store, no-cache, must-revalidate" } }
    );
  } catch (error: any) {
    console.error("[ANALYTICS_GET_ERROR]", error);
    return NextResponse.json(
      { success: false, error: error.message || "Failed to load analytics dashboard" },
      { status: 500 }
    );
  }
}
