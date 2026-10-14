import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getAppBaseUrl } from "@/lib/url-helper";

export const dynamic = "force-dynamic";

// Jobs are considered stale if no heartbeat for this many minutes
const STALE_THRESHOLD_MINUTES = 5;

/**
 * POST /api/sync/recover
 *
 * Crash recovery endpoint. Finds all SyncJobs stuck IN_PROGRESS with no
 * heartbeat for STALE_THRESHOLD_MINUTES, and either:
 *   - Auto-resumes them by re-firing the worker from the last checkpoint (pageInfo cursor)
 *   - Or marks them FAILED if recovery cannot be attempted
 *
 * Called by ClientLayout on mount (once per app session), and by /api/sync/status periodically.
 */
export async function POST(request: NextRequest) {
  try {
    const staleThreshold = new Date(Date.now() - STALE_THRESHOLD_MINUTES * 60 * 1000);

    // Find all stale IN_PROGRESS jobs or abandoned QUEUED jobs
    const staleQueuedThreshold = new Date(Date.now() - 2 * 60 * 1000);
    const staleJobs = await prisma.syncJob.findMany({
      where: {
        OR: [
          {
            status: "IN_PROGRESS",
            OR: [
              { heartbeat: null },
              { heartbeat: { lt: staleThreshold } },
            ],
          },
          {
            status: "QUEUED",
            createdAt: { lt: staleQueuedThreshold },
          },
        ],
      },
    });

    const results: any[] = [];

    for (const job of staleJobs) {
      try {
        // Verify the store still exists and is connected
        const store = await prisma.shopifyStore.findUnique({
          where: { id: job.storeId },
          select: { id: true, isConnected: true },
        });

        if (!store || !store.isConnected) {
          // Can't resume — mark failed
          await prisma.syncJob.update({
            where: { id: job.id },
            data: {
              status: "FAILED",
              errorMessage: "Store disconnected — sync abandoned",
              heartbeat: new Date(),
            },
          });
          results.push({ jobId: job.id, action: "failed", reason: "store_disconnected" });
          continue;
        }

        // Auto-resume: re-fire the worker from the last committed pageInfo cursor
        const baseUrl = getAppBaseUrl(request);

        fetch(`${baseUrl}/api/sync/worker`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ jobId: job.id }),
        }).catch((err) => {
          console.error(`[SyncRecover] Failed to re-fire worker for job ${job.id}:`, err.message);
        });

        results.push({
          jobId: job.id,
          action: "resumed",
          type: job.type,
          resumedFromBatch: job.currentBatch,
          resumedFromCount: job.processedCount,
        });
      } catch (jobErr: any) {
        console.error(`[SyncRecover] Error processing job ${job.id}:`, jobErr.message);
        results.push({ jobId: job.id, action: "error", error: jobErr.message });
      }
    }

    // Also auto-fix any SyncLog records stuck IN_PROGRESS with no corresponding active SyncJob
    try {
      const staleLogThreshold = new Date(Date.now() - 10 * 60 * 1000); // 10 min
      const staleLogs = await prisma.syncLog.findMany({
        where: {
          status: "IN_PROGRESS",
          startedAt: { lt: staleLogThreshold },
        },
        select: { id: true, storeId: true },
      });

      for (const log of staleLogs) {
        const activeJob = await prisma.syncJob.findFirst({
          where: { storeId: log.storeId, status: { in: ["QUEUED", "IN_PROGRESS"] } },
        });

        if (!activeJob) {
          await prisma.syncLog.update({
            where: { id: log.id },
            data: {
              status: "FAILED",
              completedAt: new Date(),
              errorDetails: "Worker lost — auto-recovered by system",
            },
          });
        }
      }
    } catch (logFixErr: any) {
      console.warn("[SyncRecover] SyncLog cleanup warning:", logFixErr.message);
    }

    return NextResponse.json({
      success: true,
      staleJobsFound: staleJobs.length,
      results,
    });
  } catch (error: any) {
    console.error("[SyncRecover] Error:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

/**
 * GET /api/sync/recover — health check, returns count of stale jobs without acting
 */
export async function GET(request: NextRequest) {
  try {
    const staleThreshold = new Date(Date.now() - STALE_THRESHOLD_MINUTES * 60 * 1000);
    const count = await prisma.syncJob.count({
      where: {
        status: "IN_PROGRESS",
        OR: [{ heartbeat: null }, { heartbeat: { lt: staleThreshold } }],
      },
    });
    return NextResponse.json({ staleJobCount: count });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
