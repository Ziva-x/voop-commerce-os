import { NextRequest, NextResponse } from "next/server";
import { PnLService } from "@/lib/services/PnLService";
import { authorizeStoreAccess } from "@/lib/auth-helpers";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  try {
    const auth = await authorizeStoreAccess(request, { requiredPermission: "pnl.view" });
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

    const data = await PnLService.calculatePnL(auth.storeId, { period, startDate, endDate });
    return NextResponse.json(
      { success: true, ...data },
      { headers: { "Cache-Control": "no-store, no-cache, must-revalidate" } }
    );
  } catch (error: any) {
    console.error("[PNL_GET_ERROR]", error);
    return NextResponse.json({ success: false, error: error.message || "Failed to calculate P&L" }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const auth = await authorizeStoreAccess(request, { requiredPermission: "pnl.view" });
    if (!auth.authorized || !auth.storeId) {
      return NextResponse.json(
        { error: auth.error || "Unauthorized" },
        { status: auth.status || 401, headers: { "Cache-Control": "no-store" } }
      );
    }

    const body = await request.json();
    const updatedSettings = await PnLService.saveExpenseSettings(auth.storeId, body);
    return NextResponse.json({ success: true, settings: updatedSettings });
  } catch (error: any) {
    console.error("[PNL_POST_ERROR]", error);
    return NextResponse.json({ success: false, error: error.message || "Failed to update expense rules" }, { status: 400 });
  }
}

export async function PUT(request: NextRequest) {
  return POST(request);
}
