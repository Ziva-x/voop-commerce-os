import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { resolveStoreId } from "@/lib/auth-helpers";

export const dynamic = "force-dynamic";

/**
 * GET /api/sync/status
 *
 * Returns current SyncJob state for polling by the UI.
 *
 * Query params:
 *   ?jobId=xxx        → fetch specific job by ID
 *   ?active=true      → fetch the latest active (QUEUED/IN_PROGRESS) job for the auth user's store
 *   ?recent=true      → fetch the most recently completed/failed job for the auth user's store
 */
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const jobId = searchParams.get("jobId");
    const activeOnly = searchParams.get("active") === "true";
    const recentOnly = searchParams.get("recent") === "true";

    // ─── Fetch by specific job ID ────────────────────────────────────────────
    if (jobId) {
      const job = await prisma.syncJob.findUnique({ where: { id: jobId } });
      if (!job) return NextResponse.json({ job: null });
      return NextResponse.json({ job: serializeJob(job) });
    }

    // ─── Require auth for store-scoped queries ───────────────────────────────
    const storeId = await resolveStoreId(request);
    if (!storeId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    if (activeOnly) {
      const job = await prisma.syncJob.findFirst({
        where: { storeId, status: { in: ["QUEUED", "IN_PROGRESS"] } },
        orderBy: { createdAt: "desc" },
      });
      return NextResponse.json({ job: job ? serializeJob(job) : null });
    }

    if (recentOnly) {
      const job = await prisma.syncJob.findFirst({
        where: { storeId, status: { in: ["COMPLETED", "FAILED"] } },
        orderBy: { updatedAt: "desc" },
      });
      return NextResponse.json({ job: job ? serializeJob(job) : null });
    }

    // ─── Default: return last 10 jobs for this store ─────────────────────────
    const jobs = await prisma.syncJob.findMany({
      where: { storeId },
      orderBy: { createdAt: "desc" },
      take: 10,
    });
    return NextResponse.json({ jobs: jobs.map(serializeJob) });
  } catch (error: any) {
    console.error("[SyncStatus] Error:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

/** Serialize job for client — include computed ETA and progress pct */
function serializeJob(job: any) {
  const processed = job.processedCount ?? 0;
  const total = job.totalCount ?? null;
  const started = job.startedAt ? new Date(job.startedAt) : null;
  const now = new Date();

  let etaSeconds: number | null = null;
  let progressPct: number | null = null;

  if (processed > 0 && started) {
    const elapsedSeconds = (now.getTime() - started.getTime()) / 1000;
    const rate = processed / elapsedSeconds; // records per second

    if (total && total > processed && rate > 0) {
      etaSeconds = Math.ceil((total - processed) / rate);
      progressPct = Math.min(99, Math.round((processed / total) * 100));
    } else if (total && total <= processed) {
      progressPct = 100;
    }
  }

  if (job.status === "COMPLETED") progressPct = 100;
  if (job.status === "QUEUED") progressPct = 0;

  return {
    id: job.id,
    storeId: job.storeId,
    type: job.type,
    status: job.status,
    currentBatch: job.currentBatch,
    totalBatches: job.totalBatches,
    processedCount: job.processedCount,
    totalCount: job.totalCount,
    errorMessage: job.errorMessage,
    startedAt: job.startedAt,
    completedAt: job.completedAt,
    heartbeat: job.heartbeat,
    createdAt: job.createdAt,
    updatedAt: job.updatedAt,
    // Computed
    etaSeconds,
    progressPct,
  };
}
