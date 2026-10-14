import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { authorizeStoreAccess } from "@/lib/auth-helpers";

export const dynamic = "force-dynamic";

const ACTIVE_STATUSES = ["QUEUED", "IN_PROGRESS"];

/**
 * POST /api/sync/start
 *
 * Starts a background sync job for the authenticated user's store.
 * - Prevents duplicate active jobs for the same store+type
 * - Creates a SyncJob record immediately (QUEUED)
 * - Fires the worker in the background (non-blocking)
 * - Returns { jobId } immediately
 */
export async function POST(request: NextRequest) {
  try {
    const auth = await authorizeStoreAccess(request, { requiredPermission: "settings.manage" });
    if (!auth.authorized || !auth.storeId) {
      return NextResponse.json(
        { error: auth.error || "Unauthorized / no store connected" },
        {
          status: auth.status || 401,
          headers: { "Cache-Control": "no-store" },
        }
      );
    }

    const storeId = auth.storeId;
    const store = await prisma.shopifyStore.findUnique({ where: { id: storeId } });
    if (!store || !store.isConnected) {
      return NextResponse.json(
        { error: "Store not connected" },
        {
          status: 400,
          headers: { "Cache-Control": "no-store" },
        }
      );
    }

    const body = await request.json().catch(() => ({}));
    const type: string = body.type || "all"; // "products" | "orders" | "all" | "single_order"
    const metadata = body.metadata || null; // e.g. { orderId } for single_order

    // ─── Duplicate prevention ───────────────────────────────────────────────
    // For "all" type, block if ANY active sync is running (products or orders)
    const activeJobWhere =
      type === "all"
        ? { storeId, status: { in: ACTIVE_STATUSES } }
        : { storeId, type, status: { in: ACTIVE_STATUSES } };

    const existingJob = await prisma.syncJob.findFirst({ where: activeJobWhere });
    if (existingJob) {
      return NextResponse.json({
        duplicate: true,
        jobId: existingJob.id,
        status: existingJob.status,
        type: existingJob.type,
        currentBatch: existingJob.currentBatch,
        totalBatches: existingJob.totalBatches,
        processedCount: existingJob.processedCount,
        message: `A ${existingJob.type} sync is already running (batch ${existingJob.currentBatch}/${existingJob.totalBatches ?? "?"}). Please wait for it to complete.`,
      });
    }

    // ─── Create the job ─────────────────────────────────────────────────────
    const job = await prisma.syncJob.create({
      data: {
        storeId,
        type,
        status: "QUEUED",
        metadata: metadata ?? undefined,
      },
    });

    // ─── Fire worker (non-blocking) ─────────────────────────────────────────
    const baseUrl = process.env.NEXTAUTH_URL || process.env.NEXT_PUBLIC_BASE_URL || "http://localhost:3000";
    // Fire and forget — do NOT await
    fetch(`${baseUrl}/api/sync/worker`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ jobId: job.id }),
    }).catch((err) => {
      console.error("[SyncStart] Failed to fire worker:", err.message);
    });

    return NextResponse.json({
      success: true,
      jobId: job.id,
      type: job.type,
      status: job.status,
    });
  } catch (error: any) {
    console.error("[SyncStart] Error:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
