"use client";

import { useEffect, useState, useRef, useCallback } from "react";
import {
  History,
  RefreshCw,
  CheckCircle2,
  AlertTriangle,
  Clock,
  RotateCcw,
  Zap,
  Truck,
  ShoppingCart,
  Package,
  X,
} from "lucide-react";
import { formatDate } from "@/lib/utils";
import { appFetch } from "@/lib/api";

type JobStatus = "QUEUED" | "IN_PROGRESS" | "COMPLETED" | "FAILED" | "CANCELLED";

interface ActiveJob {
  id: string;
  type: string;
  status: JobStatus;
  currentBatch: number;
  totalBatches: number | null;
  processedCount: number;
  totalCount: number | null;
  errorMessage: string | null;
  startedAt: string | null;
  completedAt: string | null;
  etaSeconds: number | null;
  progressPct: number | null;
}

const POLL_ACTIVE_MS = 2500;

function formatDurationSeconds(seconds: number): string {
  if (seconds < 60) return `${Math.round(seconds)}s`;
  const mins = Math.floor(seconds / 60);
  const secs = Math.round(seconds % 60);
  return `${mins}m ${secs}s`;
}

function formatEta(seconds: number): string {
  if (seconds < 60) return `~${seconds}s`;
  if (seconds < 3600) return `~${Math.ceil(seconds / 60)}m`;
  return `~${(seconds / 3600).toFixed(1)}h`;
}

export default function SyncLogsPage() {
  const [logs, setLogs] = useState<any[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [retryingId, setRetryingId] = useState<string | null>(null);
  const [triggeringType, setTriggeringType] = useState<string | null>(null);
  const [triggerError, setTriggerError] = useState<string | null>(null);

  // Scheduler telemetry (cron status)
  const [schedulerStatus, setSchedulerStatus] = useState<any>(null);

  // Active sync job state
  const [activeJob, setActiveJob] = useState<ActiveJob | null>(null);
  const pollTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const prevJobStatusRef = useRef<JobStatus | null>(null);

  // Filters
  const [typeFilter, setTypeFilter] = useState("ALL");
  const [statusFilter, setStatusFilter] = useState("ALL");

  const fetchSchedulerStatus = async () => {
    try {
      const res = await appFetch("/api/cron/sync");
      const json = await res.json();
      if (json.success) setSchedulerStatus(json);
    } catch {}
  };

  /**
   * Fetch sync logs table history.
   * Uses in-place update (isSilent) to prevent full-table unmounting or blinking.
   */
  const fetchLogs = useCallback(
    async (isSilent = false) => {
      if (!isSilent && logs.length === 0) {
        setLoading(true);
      }
      setRefreshing(true);

      try {
        const params = new URLSearchParams({
          page: String(page),
          limit: "50",
          type: typeFilter,
          status: statusFilter,
        });
        const res = await appFetch(`/api/sync-logs?${params}`);
        const json = await res.json();
        setLogs(json.logs || []);
        setTotal(json.total || 0);
        setTotalPages(json.totalPages || 1);
      } catch (err) {
        console.error("Failed to fetch logs:", err);
      } finally {
        setLoading(false);
        setRefreshing(false);
      }
    },
    [page, typeFilter, statusFilter, logs.length]
  );

  const stopActivePolling = useCallback(() => {
    if (pollTimerRef.current) {
      clearInterval(pollTimerRef.current);
      pollTimerRef.current = null;
    }
  }, []);

  /**
   * Check single active job status from /api/sync/status?active=true.
   * Does NOT fetch the entire sync_logs history table on every tick.
   */
  const checkActiveJobStatus = useCallback(async (): Promise<boolean> => {
    try {
      const res = await appFetch("/api/sync/status?active=true");
      if (!res.ok) return false;
      const json = await res.json();
      const currentJob: ActiveJob | null = json.job ?? null;

      const prevStatus = prevJobStatusRef.current;
      setActiveJob(currentJob);

      if (currentJob) {
        prevJobStatusRef.current = currentJob.status;
        return currentJob.status === "QUEUED" || currentJob.status === "IN_PROGRESS";
      }

      // If job was active and is now null (completed/cleared), refresh history once
      if (prevStatus === "QUEUED" || prevStatus === "IN_PROGRESS") {
        prevJobStatusRef.current = null;
        fetchLogs(true);
      }
      return false;
    } catch {
      return false;
    }
  }, [fetchLogs]);

  const startActivePolling = useCallback(() => {
    stopActivePolling();
    pollTimerRef.current = setInterval(async () => {
      const isStillActive = await checkActiveJobStatus();
      if (!isStillActive) {
        stopActivePolling();
      }
    }, POLL_ACTIVE_MS);
  }, [checkActiveJobStatus, stopActivePolling]);

  // Initial load on mount or filter change
  useEffect(() => {
    fetchLogs();
    fetchSchedulerStatus();
  }, [page, typeFilter, statusFilter]);

  // Mount effect: check if an active job is running, and start polling ONLY if active
  useEffect(() => {
    let isMounted = true;
    (async () => {
      const isActive = await checkActiveJobStatus();
      if (isMounted && isActive) {
        startActivePolling();
      }
    })();

    return () => {
      isMounted = false;
      stopActivePolling();
    };
  }, []);

  // Trigger a sync via the background job system
  const triggerSync = async (type: "products" | "orders" | "all") => {
    setTriggeringType(type);
    setTriggerError(null);
    try {
      const res = await appFetch("/api/sync/start", {
        method: "POST",
        body: JSON.stringify({ type }),
      });
      const json = await res.json();

      if (!res.ok && !json.duplicate) {
        setTriggerError(json.error || "Failed to start sync");
      } else if (json.duplicate) {
        setTriggerError(json.message || "A sync is already running");
        startActivePolling();
      } else {
        // Active job created — check immediately and start targeted polling
        await checkActiveJobStatus();
        startActivePolling();
      }
    } catch (e: any) {
      setTriggerError(e.message || "Failed to trigger sync");
    } finally {
      setTriggeringType(null);
    }
  };

  // Retry a failed sync entry
  const handleRetry = async (log: any) => {
    setRetryingId(log.id);
    try {
      const syncType = log.type === "PRODUCTS" ? "products" : log.type === "ORDERS" ? "orders" : "all";
      await appFetch("/api/sync/start", {
        method: "POST",
        body: JSON.stringify({ type: syncType }),
      });
      await checkActiveJobStatus();
      startActivePolling();
    } catch {
      // Ignore
    } finally {
      setRetryingId(null);
    }
  };

  const ordersSync = schedulerStatus?.ordersSync;
  const trackingSync = schedulerStatus?.trackingSync;
  const isAnySyncRunning = !!activeJob && (activeJob.status === "QUEUED" || activeJob.status === "IN_PROGRESS");

  // Calculate elapsed time for active job
  let elapsedText: string | null = null;
  if (activeJob?.startedAt) {
    const started = new Date(activeJob.startedAt).getTime();
    const elapsedSec = Math.max(0, (Date.now() - started) / 1000);
    elapsedText = formatDurationSeconds(elapsedSec);
  }

  return (
    <div className="space-y-6 min-w-0">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-[var(--border)]/80 pb-4">
        <div>
          <h2 className="text-xl sm:text-2xl font-bold text-[var(--text-primary)] tracking-tight flex items-center gap-2">
            <History className="text-sky-400" size={24} />
            <span>Sync Logs &amp; Engine</span>
          </h2>
          <p className="text-xs text-[var(--text-secondary)] mt-1">
            Server-side background batch sync, multi-tenant audit logs, and automatic crash recovery.
          </p>
        </div>
        <button
          onClick={() => {
            fetchLogs(true);
            fetchSchedulerStatus();
            checkActiveJobStatus();
          }}
          disabled={refreshing}
          className="flex items-center gap-1.5 px-3 py-2 rounded-lg bg-[var(--surface-hover)] hover:bg-slate-700 text-slate-200 border border-[var(--border)] text-xs font-semibold self-start sm:self-auto transition-all"
        >
          <RefreshCw size={13} className={refreshing ? "animate-spin text-sky-400" : ""} />
          <span>Refresh</span>
        </button>
      </div>

      {/* ─── ACTIVE JOB LIVE PANEL ───────────────────────────────────────── */}
      {activeJob && (
        <div
          className="glass-panel p-4 border border-sky-500/40 space-y-3"
          style={{ background: "var(--theme-primary-subtle)" }}
        >
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-xl bg-sky-500/10 border border-sky-500/20 text-sky-400">
              <RefreshCw size={20} className={isAnySyncRunning ? "animate-spin" : ""} />
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="text-sm font-bold text-white capitalize">
                  {activeJob.type === "all" ? "Full" : activeJob.type} Sync
                </span>
                <span
                  className={`badge text-[10px] px-2 py-0.5 ${
                    activeJob.status === "COMPLETED"
                      ? "badge-success"
                      : activeJob.status === "FAILED"
                      ? "badge-danger"
                      : "badge-warning"
                  }`}
                >
                  {activeJob.status}
                </span>
              </div>

              {/* Progress details */}
              <div className="flex items-center gap-3 flex-wrap text-xs text-[var(--text-secondary)] mt-1 font-mono">
                <span>
                  Batch <strong>{activeJob.currentBatch}</strong>
                  {activeJob.totalBatches ? `/${activeJob.totalBatches}` : "+"}
                </span>
                <span>·</span>
                <span>
                  <strong>{activeJob.processedCount.toLocaleString()}</strong> records
                </span>
                {elapsedText && (
                  <>
                    <span>·</span>
                    <span>Elapsed: {elapsedText}</span>
                  </>
                )}
                {activeJob.etaSeconds !== null && activeJob.etaSeconds > 0 && isAnySyncRunning && (
                  <>
                    <span>·</span>
                    <span className="text-sky-400 font-bold">
                      ETA {formatEta(activeJob.etaSeconds)}
                    </span>
                  </>
                )}
              </div>
            </div>

            {activeJob.status === "FAILED" && (
              <button
                onClick={() => triggerSync(activeJob.type as any)}
                className="flex items-center gap-1 text-xs text-red-400 bg-red-500/10 px-2.5 py-1.5 rounded-lg border border-red-500/20 hover:bg-red-500/20 transition-all shrink-0"
              >
                <RotateCcw size={11} />
                Retry
              </button>
            )}
          </div>

          {/* Progress bar */}
          <div className="h-2 w-full rounded-full overflow-hidden" style={{ background: "var(--color-surface-active)" }}>
            <div
              className="h-full rounded-full transition-all duration-500"
              style={{
                width: `${activeJob.progressPct ?? (activeJob.status === "COMPLETED" ? 100 : 0)}%`,
                background:
                  activeJob.status === "FAILED"
                    ? "var(--color-error)"
                    : activeJob.status === "COMPLETED"
                    ? "var(--color-success)"
                    : "linear-gradient(90deg, var(--theme-primary), var(--theme-primary-hover))",
              }}
            />
          </div>
        </div>
      )}

      {/* Trigger error banner */}
      {triggerError && (
        <div className="flex items-start gap-2 p-3 rounded-xl bg-amber-500/10 border border-amber-500/30 text-amber-300 text-xs">
          <AlertTriangle size={14} className="shrink-0 mt-0.5" />
          <span className="flex-1">{triggerError}</span>
          <button onClick={() => setTriggerError(null)}>
            <X size={12} />
          </button>
        </div>
      )}

      {/* ─── MANUAL SYNC TRIGGER CARDS ──────────────────────────────────────── */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        {/* Products */}
        <button
          onClick={() => triggerSync("products")}
          disabled={!!triggeringType || isAnySyncRunning}
          className="glass-panel p-4 border border-emerald-500/30 flex items-center gap-3 hover:border-emerald-500/60 transition-all group text-left disabled:opacity-50 disabled:cursor-not-allowed"
        >
          <div className="p-2.5 rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 group-hover:bg-emerald-500/20 transition-all shrink-0">
            {triggeringType === "products" ? <RefreshCw size={18} className="animate-spin" /> : <Package size={18} />}
          </div>
          <div>
            <div className="text-sm font-bold text-white">Sync Products</div>
            <div className="text-[11px] text-[var(--text-secondary)] mt-0.5">Variants, SKUs, inventory</div>
          </div>
        </button>

        {/* Orders */}
        <button
          onClick={() => triggerSync("orders")}
          disabled={!!triggeringType || isAnySyncRunning}
          className="glass-panel p-4 border border-cyan-500/30 flex items-center gap-3 hover:border-cyan-500/60 transition-all group text-left disabled:opacity-50 disabled:cursor-not-allowed"
        >
          <div className="p-2.5 rounded-xl bg-cyan-500/10 border border-cyan-500/20 text-cyan-400 group-hover:bg-cyan-500/20 transition-all shrink-0">
            {triggeringType === "orders" ? <RefreshCw size={18} className="animate-spin" /> : <ShoppingCart size={18} />}
          </div>
          <div>
            <div className="text-sm font-bold text-white">Sync Orders</div>
            <div className="text-[11px] text-[var(--text-secondary)] mt-0.5">All orders, line items</div>
          </div>
        </button>

        {/* Full Sync */}
        <button
          onClick={() => triggerSync("all")}
          disabled={!!triggeringType || isAnySyncRunning}
          className="glass-panel p-4 border border-violet-500/30 flex items-center gap-3 hover:border-violet-500/60 transition-all group text-left disabled:opacity-50 disabled:cursor-not-allowed"
        >
          <div className="p-2.5 rounded-xl bg-violet-500/10 border border-violet-500/20 text-violet-400 group-hover:bg-violet-500/20 transition-all shrink-0">
            {triggeringType === "all" ? <RefreshCw size={18} className="animate-spin" /> : <Zap size={18} />}
          </div>
          <div>
            <div className="text-sm font-bold text-white">Full Sync</div>
            <div className="text-[11px] text-[var(--text-secondary)] mt-0.5">Products + orders</div>
          </div>
        </button>
      </div>

      {/* ─── SCHEDULED WORKERS STATUS ───────────────────────────────────────── */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* 1. Hourly Orderline Sync */}
        <div className="glass-panel p-5 border border-cyan-500/30 space-y-4">
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-xl bg-cyan-500/10 border border-cyan-500/30 text-cyan-400">
              <ShoppingCart size={20} />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-sm font-bold text-[var(--text-primary)]">Orderlines Auto-Sync</h3>
                <span className="badge badge-success">
                  {ordersSync?.isRunning ? "⏳ Syncing..." : "🟢 Active (1 Hour)"}
                </span>
              </div>
              <p className="text-xs text-[var(--text-secondary)] mt-0.5">
                Automated hourly sync of Shopify orders and line items.
              </p>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-2 p-3 bg-[var(--surface)] rounded-xl border border-[var(--border)] text-xs">
            <div>
              <span className="text-[10px] uppercase font-bold text-[var(--text-muted)] block">Frequency</span>
              <span className="font-mono font-bold text-cyan-300">Every 1 Hour</span>
            </div>
            <div>
              <span className="text-[10px] uppercase font-bold text-[var(--text-muted)] block">Next Run</span>
              <span className="font-mono font-bold text-emerald-400">
                {ordersSync?.isRunning ? "In Progress..." : ordersSync?.minutesUntilNextRun === 0 ? "Due Now" : `~${ordersSync?.minutesUntilNextRun ?? 60} mins`}
              </span>
            </div>
            <div>
              <span className="text-[10px] uppercase font-bold text-[var(--text-muted)] block">Last Run</span>
              <span className="font-mono text-[var(--text-secondary)] text-[11px] truncate block">
                {ordersSync?.lastRunAt ? formatDate(ordersSync.lastRunAt) : "Pending"}
              </span>
            </div>
            <div>
              <span className="text-[10px] uppercase font-bold text-[var(--text-muted)] block">Runs</span>
              <span className="font-mono text-[var(--text-secondary)]">{ordersSync?.runsCompleted ?? 0} completed</span>
            </div>
          </div>
        </div>

        {/* 2. 3-Hour Tracking Sync */}
        <div className="glass-panel p-5 border border-purple-500/30 space-y-4">
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-xl bg-purple-500/10 border border-purple-500/30 text-purple-400">
              <Truck size={20} />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-sm font-bold text-[var(--text-primary)]">Shipping Tracking Auto-Sync</h3>
                <span className="badge badge-purple">
                  {trackingSync?.isRunning ? "⏳ Syncing..." : "🟢 Active (3 Hours)"}
                </span>
              </div>
              <p className="text-xs text-[var(--text-secondary)] mt-0.5">
                Batch queries active in-transit shipments across carriers.
              </p>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-2 p-3 bg-[var(--surface)] rounded-xl border border-[var(--border)] text-xs">
            <div>
              <span className="text-[10px] uppercase font-bold text-[var(--text-muted)] block">Frequency</span>
              <span className="font-mono font-bold text-purple-300">Every 3 Hours</span>
            </div>
            <div>
              <span className="text-[10px] uppercase font-bold text-[var(--text-muted)] block">Next Run</span>
              <span className="font-mono font-bold text-emerald-400">
                {trackingSync?.isRunning ? "In Progress..." : trackingSync?.minutesUntilNextRun === 0 ? "Due Now" : `~${trackingSync?.minutesUntilNextRun ?? 180} mins`}
              </span>
            </div>
            <div>
              <span className="text-[10px] uppercase font-bold text-[var(--text-muted)] block">Last Run</span>
              <span className="font-mono text-[var(--text-secondary)] text-[11px] truncate block">
                {trackingSync?.lastRunAt ? formatDate(trackingSync.lastRunAt) : "Pending"}
              </span>
            </div>
            <div>
              <span className="text-[10px] uppercase font-bold text-[var(--text-muted)] block">Runs</span>
              <span className="font-mono text-[var(--text-secondary)]">{trackingSync?.runsCompleted ?? 0} completed</span>
            </div>
          </div>
        </div>
      </div>

      {/* ─── FILTER BAR ─────────────────────────────────────────────────────── */}
      <div className="glass-panel p-4 flex flex-wrap gap-3 items-center">
        <div className="w-48">
          <select
            value={typeFilter}
            onChange={(e) => {
              setTypeFilter(e.target.value);
              setPage(1);
            }}
            className="w-full bg-slate-900 border border-[var(--border)] rounded-lg px-3 py-2 text-xs text-white focus:outline-none focus:border-[var(--accent)]"
          >
            <option value="ALL">All Sync Types</option>
            <option value="ORDERS">Orders Sync</option>
            <option value="PRODUCTS">Products Sync</option>
            <option value="FULL_SYNC">Full Sync</option>
            <option value="WEBHOOK">Webhook Event</option>
          </select>
        </div>
        <div className="w-48">
          <select
            value={statusFilter}
            onChange={(e) => {
              setStatusFilter(e.target.value);
              setPage(1);
            }}
            className="w-full bg-slate-900 border border-[var(--border)] rounded-lg px-3 py-2 text-xs text-white focus:outline-none focus:border-[var(--accent)]"
          >
            <option value="ALL">All Statuses</option>
            <option value="SUCCESS">Success</option>
            <option value="FAILED">Failed</option>
            <option value="IN_PROGRESS">In Progress</option>
          </select>
        </div>
        <div className="text-xs text-[var(--text-secondary)] ml-auto font-mono flex items-center gap-2">
          {refreshing && <RefreshCw size={12} className="animate-spin text-sky-400" />}
          <span>
            Showing <strong>{logs.length}</strong> of <strong>{total}</strong> entries
          </span>
        </div>
      </div>

      {/* ─── LOGS TABLE ─────────────────────────────────────────────────────── */}
      <div className="glass-panel overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs text-[var(--text-secondary)]">
            <thead className="bg-slate-900 text-[var(--text-secondary)] uppercase text-[10px] tracking-wider border-b border-[var(--border)]">
              <tr>
                <th className="py-3 px-4 font-semibold">Status</th>
                <th className="py-3 px-4 font-semibold">Type</th>
                <th className="py-3 px-4 font-semibold">Details / Records</th>
                <th className="py-3 px-4 font-semibold">Duration</th>
                <th className="py-3 px-4 font-semibold">Timestamp</th>
                <th className="py-3 px-4 font-semibold text-right">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800">
              {loading && logs.length === 0 ? (
                <tr>
                  <td colSpan={6} className="py-12 text-center text-[var(--text-secondary)]">
                    <RefreshCw className="animate-spin inline-block mr-2" size={16} />
                    Loading audit trail...
                  </td>
                </tr>
              ) : logs.length === 0 ? (
                <tr>
                  <td colSpan={6} className="py-12 text-center text-[var(--text-muted)]">
                    No sync logs matching selected criteria.
                  </td>
                </tr>
              ) : (
                logs.map((log) => (
                  <tr key={log.id} className="table-row-hover">
                    <td className="py-3 px-4">
                      {log.status === "SUCCESS" && (
                        <span className="badge badge-success">
                          <CheckCircle2 size={11} /> Success
                        </span>
                      )}
                      {log.status === "FAILED" && (
                        <span className="badge badge-danger">
                          <AlertTriangle size={11} /> Failed
                        </span>
                      )}
                      {log.status === "IN_PROGRESS" && (
                        <span className="badge badge-warning">
                          <Clock size={11} className="animate-spin" /> In Progress
                        </span>
                      )}
                    </td>
                    <td className="py-3 px-4 font-mono font-semibold text-slate-200">
                      {log.type}
                    </td>
                    <td className="py-3 px-4 max-w-xs truncate">
                      {log.details ? (
                        <span className="text-[var(--text-secondary)]">{log.details}</span>
                      ) : log.errorDetails ? (
                        <span className="text-red-400 font-mono">{log.errorDetails}</span>
                      ) : (
                        <span className="text-[var(--text-muted)] font-mono">
                          {log.recordsCount} record{log.recordsCount === 1 ? "" : "s"} processed
                        </span>
                      )}
                    </td>
                    <td className="py-3 px-4 text-[var(--text-secondary)] font-mono">
                      {log.durationMs ? `${(log.durationMs / 1000).toFixed(2)}s` : "—"}
                    </td>
                    <td className="py-3 px-4 text-[var(--text-secondary)] whitespace-nowrap">
                      {formatDate(log.startedAt || log.createdAt)}
                    </td>
                    <td className="py-3 px-4 text-right">
                      {log.status === "FAILED" && (
                        <button
                          onClick={() => handleRetry(log)}
                          disabled={retryingId === log.id || isAnySyncRunning}
                          className="inline-flex items-center gap-1 text-[11px] text-sky-400 hover:text-sky-300 bg-sky-500/10 px-2.5 py-1 rounded border border-sky-500/20 disabled:opacity-40"
                        >
                          <RotateCcw size={11} className={retryingId === log.id ? "animate-spin" : ""} />
                          <span>Retry</span>
                        </button>
                      )}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {/* Pagination */}
        {totalPages > 1 && (
          <div className="p-4 border-t border-[var(--border)] flex items-center justify-between text-xs text-[var(--text-secondary)]">
            <div>
              Page <strong className="text-white">{page}</strong> of <strong className="text-white">{totalPages}</strong>
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                disabled={page <= 1}
                className="px-3 py-1.5 rounded-lg bg-[var(--surface-hover)] text-[var(--text-secondary)] disabled:opacity-40 hover:bg-slate-700 transition-colors"
              >
                Previous
              </button>
              <button
                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                disabled={page >= totalPages}
                className="px-3 py-1.5 rounded-lg bg-[var(--surface-hover)] text-[var(--text-secondary)] disabled:opacity-40 hover:bg-slate-700 transition-colors"
              >
                Next
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
