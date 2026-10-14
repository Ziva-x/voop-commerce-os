import { NextRequest, NextResponse } from "next/server";
import { AutoSyncScheduler } from "@/lib/services/AutoSyncScheduler";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const scheduler = AutoSyncScheduler.getInstance();
    scheduler.start();
    const status = await scheduler.getStatusAsync();
    return NextResponse.json({ success: true, ...status });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json().catch(() => ({}));
    const { type = "orders" } = body;

    const scheduler = AutoSyncScheduler.getInstance();
    scheduler.start();

    if (type === "tracking") {
      const result = await scheduler.runTrackingBatchSync();
      return NextResponse.json({ type: "tracking", ...result });
    } else if (type === "full") {
      const result = await scheduler.runOrdersFullSync();
      return NextResponse.json({ type: "full", ...result });
    } else if (type === "all") {
      const [ordersRes, trackingRes] = await Promise.all([
        scheduler.runOrdersIncrementalSafetySync(),
        scheduler.runTrackingBatchSync(),
      ]);
      return NextResponse.json({
        success: ordersRes.success && trackingRes.success,
        type: "all",
        orders: ordersRes,
        tracking: trackingRes,
      });
    } else {
      const result = await scheduler.runOrdersIncrementalSafetySync();
      return NextResponse.json({ type: "orders_incremental_safety", ...result });
    }
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
