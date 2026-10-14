import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { authorizeStoreAccess } from "@/lib/auth-helpers";

export const dynamic = "force-dynamic";

/**
 * GET /api/sync-logs
 *
 * Returns paginated SyncLog history.
 * On every call, auto-repairs stale IN_PROGRESS SyncLog records that have no
 * corresponding active SyncJob — eliminates the "forever IN_PROGRESS" bug.
 */
export async function GET(request: NextRequest) {
  try {
    const auth = await authorizeStoreAccess(request);
    if (!auth.authorized || !auth.storeId) {
      return NextResponse.json(
        { error: auth.error || "Unauthorized" },
        { status: auth.status || 401, headers: { "Cache-Control": "no-store" } }
      );
    }
    const storeId = auth.storeId;

    const { searchParams } = new URL(request.url);
    const type = searchParams.get("type");
    const status = searchParams.get("status");
    const limit = Math.min(parseInt(searchParams.get("limit") || "50", 10), 100);
    const page = Math.max(parseInt(searchParams.get("page") || "1", 10), 1);
    const skip = (page - 1) * limit;

    // ─── Auto-repair stale IN_PROGRESS SyncLogs ──────────────────────────────
    // Find logs stuck IN_PROGRESS for more than 5 minutes
    if (storeId) {
      try {
        const staleThreshold = new Date(Date.now() - 5 * 60 * 1000);
        const staleLogs = await prisma.syncLog.findMany({
          where: {
            storeId,
            status: "IN_PROGRESS",
            startedAt: { lt: staleThreshold },
          },
          select: { id: true },
        });

        if (staleLogs.length > 0) {
          // Check if any active SyncJob exists for this store
          const activeJob = await prisma.syncJob.findFirst({
            where: { storeId, status: { in: ["QUEUED", "IN_PROGRESS"] } },
            select: { id: true },
          });

          // If no active job, all IN_PROGRESS logs are stale — mark them FAILED
          if (!activeJob) {
            await prisma.syncLog.updateMany({
              where: {
                id: { in: staleLogs.map((l) => l.id) },
              },
              data: {
                status: "FAILED",
                completedAt: new Date(),
                errorDetails: "Worker lost — automatically recovered by system",
              },
            });
          }
        }
      } catch (repairErr: any) {
        // Non-fatal — just log and continue
        console.warn("[SyncLogs GET] Stale log repair warning:", repairErr.message);
      }
    }

    // ─── Build where clause ──────────────────────────────────────────────────
    const where: any = {};
    if (storeId) where.storeId = storeId;
    if (type && type !== "ALL") where.type = type;
    if (status && status !== "ALL") where.status = status;

    const [total, logs] = await Promise.all([
      prisma.syncLog.count({ where }),
      prisma.syncLog.findMany({
        where,
        take: limit,
        skip,
        orderBy: { startedAt: "desc" },
      }),
    ]);

    return NextResponse.json({
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
      logs,
    });
  } catch (error: any) {
    console.error("[SyncLogs GET] Error:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
