"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import {
  RefreshCw,
  CheckCircle2,
  AlertTriangle,
  X,
  ChevronDown,
  ChevronUp,
  RotateCcw,
  Package,
  ShoppingCart,
  Zap,
} from "lucide-react";
import { appFetch } from "@/lib/api";

type JobStatus = "QUEUED" | "IN_PROGRESS" | "COMPLETED" | "FAILED";
type SyncType = "products" | "orders" | "all" | "single_order";

interface SyncJob {
  id: string;
  type: SyncType;
  status: JobStatus;
  currentBatch: number;
  totalBatches: number | null;
  processedCount: number;
  totalCount: number | null;
  errorMessage: string | null;
  startedAt: string | null;
  completedAt: string | null;
  heartbeat: string | null;
  etaSeconds: number | null;
  progressPct: number | null;
}

const TYPE_LABELS: Record<SyncType, string> = {
  products: "Products",
  orders: "Orders",
  all: "Full Sync",
  single_order: "Order",
};

const TYPE_ICONS: Record<SyncType, React.ReactNode> = {
  products: <Package size={13} />,
  orders: <ShoppingCart size={13} />,
  all: <Zap size={13} />,
  single_order: <ShoppingCart size={13} />,
};

function formatEta(seconds: number): string {
  if (seconds < 60) return `~${seconds}s`;
  if (seconds < 3600) return `~${Math.ceil(seconds / 60)}m`;
  return `~${(seconds / 3600).toFixed(1)}h`;
}

function formatCount(n: number): string {
  if (n >= 1000) return `${(n / 1000).toFixed(1)}k`;
  return String(n);
}

const POLL_INTERVAL_ACTIVE = 3000; // 3s while job is running
const POLL_INTERVAL_IDLE = 30000;  // 30s when no active job (recovery check)
const COMPLETED_DISPLAY_MS = 8000; // 8s toast after completion

export function SyncIndicator() {
  const [job, setJob] = useState<SyncJob | null>(null);
  const [lastCompleted, setLastCompleted] = useState<SyncJob | null>(null);
  const [showCompleted, setShowCompleted] = useState(false);
  const [collapsed, setCollapsed] = useState(false);
  const [dismissed, setDismissed] = useState(false);
  const completedTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const prevStatusRef = useRef<JobStatus | null>(null);
  const triggeredJobsRef = useRef<Set<string>>(new Set());

  const clearPoll = () => {
    if (pollRef.current) clearInterval(pollRef.current);
    pollRef.current = null;
  };

  const runWorkerChunk = useCallback(async (jobId: string) => {
    try {
      const res = await appFetch("/api/sync/worker", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ jobId }),
      });
      if (!res.ok) return;
      const data = await res.json();
      if (data.moreBatches) {
        // Continue next batch chunk after 400ms pause
        setTimeout(() => runWorkerChunk(jobId), 400);
      }
    } catch {
      // Polling will recover if connection drops
    }
  }, []);

  const poll = useCallback(async () => {
    try {
      const res = await appFetch("/api/sync/status?active=true");
      if (!res.ok) return;
      const json = await res.json();
      const activeJob: SyncJob | null = json.job ?? null;

      if (activeJob) {
        setJob(activeJob);
        setDismissed(false);
        prevStatusRef.current = activeJob.status;

        // Auto-kick worker chunks if job is QUEUED or IN_PROGRESS and not yet running in this tab
        if ((activeJob.status === "QUEUED" || activeJob.status === "IN_PROGRESS") && !triggeredJobsRef.current.has(activeJob.id)) {
          triggeredJobsRef.current.add(activeJob.id);
          runWorkerChunk(activeJob.id);
        }
      } else {
        triggeredJobsRef.current.clear();
        // No active job
        const prev = prevStatusRef.current;
        if (prev === "IN_PROGRESS" || prev === "QUEUED") {
          // Transition from active → done: fetch the recent job for toast
          const recentRes = await appFetch("/api/sync/status?recent=true");
          if (recentRes.ok) {
            const recentJson = await recentRes.json();
            if (recentJson.job) {
              setLastCompleted(recentJson.job);
              setShowCompleted(true);
              setDismissed(false);
              if (completedTimerRef.current) clearTimeout(completedTimerRef.current);
              completedTimerRef.current = setTimeout(() => {
                setShowCompleted(false);
                setLastCompleted(null);
              }, COMPLETED_DISPLAY_MS);
            }
          }
        }
        setJob(null);
        prevStatusRef.current = null;
      }
    } catch {
      // Silently ignore — network errors shouldn't surface in indicator
    }
  }, []);

  // Run crash recovery on mount (once)
  useEffect(() => {
    appFetch("/api/sync/recover", { method: "POST" }).catch(() => {});
  }, []);

  // Polling — faster when active
  useEffect(() => {
    poll();
    const interval = job ? POLL_INTERVAL_ACTIVE : POLL_INTERVAL_IDLE;
    clearPoll();
    pollRef.current = setInterval(poll, interval);
    return clearPoll;
  }, [job?.id, job?.status, poll]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      clearPoll();
      if (completedTimerRef.current) clearTimeout(completedTimerRef.current);
    };
  }, []);

  // Retry a failed job
  const handleRetry = async (failedJob: SyncJob) => {
    try {
      await appFetch("/api/sync/start", {
        method: "POST",
        body: JSON.stringify({ type: failedJob.type }),
      });
      setLastCompleted(null);
      setShowCompleted(false);
      poll();
    } catch {
      // ignore
    }
  };

  // Nothing to show
  const hasActive = job !== null;
  const hasToast = showCompleted && lastCompleted !== null;

  if (!hasActive && !hasToast) return null;
  if (dismissed) return null;

  const displayJob = hasActive ? job! : lastCompleted!;
  const isCompleted = displayJob.status === "COMPLETED";
  const isFailed = displayJob.status === "FAILED";
  const isRunning = displayJob.status === "IN_PROGRESS" || displayJob.status === "QUEUED";

  const progress = displayJob.progressPct ?? (isCompleted ? 100 : 0);
  const typeLabel = TYPE_LABELS[displayJob.type] ?? displayJob.type;
  const typeIcon = TYPE_ICONS[displayJob.type] ?? <RefreshCw size={13} />;

  return (
    <div
      className="fixed bottom-4 right-4 z-50 w-72 rounded-2xl shadow-2xl border overflow-hidden transition-all duration-300"
      style={{
        background: "rgba(11, 15, 23, 0.97)",
        backdropFilter: "blur(16px)",
        borderColor: isCompleted
          ? "rgba(16, 185, 129, 0.4)"
          : isFailed
          ? "rgba(239, 68, 68, 0.4)"
          : "rgba(14, 165, 233, 0.4)",
        boxShadow: isCompleted
          ? "0 0 30px rgba(16,185,129,0.15)"
          : isFailed
          ? "0 0 30px rgba(239,68,68,0.15)"
          : "0 0 30px rgba(14,165,233,0.15)",
      }}
    >
      {/* Header Row */}
      <div
        className="flex items-center gap-2 px-3 py-2.5 cursor-pointer select-none"
        onClick={() => setCollapsed((c) => !c)}
        style={{
          background: isCompleted
            ? "rgba(16,185,129,0.08)"
            : isFailed
            ? "rgba(239,68,68,0.08)"
            : "rgba(14,165,233,0.08)",
        }}
      >
        {/* Status icon */}
        <div
          className="flex items-center justify-center w-6 h-6 rounded-full shrink-0"
          style={{
            background: isCompleted
              ? "rgba(16,185,129,0.15)"
              : isFailed
              ? "rgba(239,68,68,0.15)"
              : "rgba(14,165,233,0.15)",
          }}
        >
          {isRunning && (
            <RefreshCw
              size={12}
              className="animate-spin"
              style={{ color: "#0ea5e9" }}
            />
          )}
          {isCompleted && <CheckCircle2 size={12} style={{ color: "#10b981" }} />}
          {isFailed && <AlertTriangle size={12} style={{ color: "#ef4444" }} />}
        </div>

        {/* Label */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1.5 text-xs font-semibold text-white">
            <span style={{ opacity: 0.6 }}>{typeIcon}</span>
            <span>
              {isCompleted
                ? `${typeLabel} sync complete`
                : isFailed
                ? `${typeLabel} sync failed`
                : displayJob.status === "QUEUED"
                ? `${typeLabel} sync queued...`
                : `Syncing ${typeLabel}...`}
            </span>
          </div>
        </div>

        {/* Collapse / Dismiss */}
        <div className="flex items-center gap-1 shrink-0">
          <button
            onClick={(e) => {
              e.stopPropagation();
              setCollapsed((c) => !c);
            }}
            className="p-0.5 rounded opacity-40 hover:opacity-80 transition-opacity"
          >
            {collapsed ? <ChevronUp size={12} className="text-white" /> : <ChevronDown size={12} className="text-white" />}
          </button>
          {(isCompleted || isFailed) && (
            <button
              onClick={(e) => {
                e.stopPropagation();
                setDismissed(true);
              }}
              className="p-0.5 rounded opacity-40 hover:opacity-80 transition-opacity"
            >
              <X size={12} className="text-white" />
            </button>
          )}
        </div>
      </div>

      {/* Progress bar — always visible */}
      <div className="h-0.5 w-full" style={{ background: "rgba(255,255,255,0.06)" }}>
        <div
          className="h-full transition-all duration-700"
          style={{
            width: `${progress}%`,
            background: isCompleted
              ? "var(--success)"
              : isFailed
              ? "var(--error)"
              : "linear-gradient(90deg, var(--accent), var(--accent-supporting))",
          }}
        />
      </div>

      {/* Body — collapsible */}
      {!collapsed && (
        <div className="px-3 py-2.5 space-y-2">
          {/* Stats row */}
          <div className="grid grid-cols-3 gap-2 text-center">
            <div>
              <div className="text-[10px] uppercase font-bold opacity-40 tracking-wider">Batch</div>
              <div className="text-xs font-mono font-bold text-white">
                {displayJob.currentBatch > 0
                  ? `${displayJob.currentBatch}${displayJob.totalBatches ? `/${displayJob.totalBatches}` : "+"}`
                  : "—"}
              </div>
            </div>
            <div>
              <div className="text-[10px] uppercase font-bold opacity-40 tracking-wider">Records</div>
              <div className="text-xs font-mono font-bold text-white">
                {displayJob.processedCount > 0
                  ? formatCount(displayJob.processedCount)
                  : "—"}
              </div>
            </div>
            <div>
              <div className="text-[10px] uppercase font-bold opacity-40 tracking-wider">ETA</div>
              <div className="text-xs font-mono font-bold text-white">
                {isCompleted || isFailed
                  ? "—"
                  : displayJob.etaSeconds !== null
                  ? formatEta(displayJob.etaSeconds)
                  : "Calc..."}
              </div>
            </div>
          </div>

          {/* Error message */}
          {isFailed && displayJob.errorMessage && (
            <div
              className="text-[11px] text-red-300 font-mono bg-red-500/10 rounded-lg px-2.5 py-1.5 truncate"
              title={displayJob.errorMessage}
            >
              {displayJob.errorMessage}
            </div>
          )}

          {/* Retry button */}
          {isFailed && (
            <button
              onClick={() => handleRetry(displayJob)}
              className="w-full flex items-center justify-center gap-1.5 py-1.5 rounded-lg text-xs font-semibold text-white transition-all"
              style={{ background: "rgba(239,68,68,0.2)", border: "1px solid rgba(239,68,68,0.3)" }}
            >
              <RotateCcw size={11} />
              Retry Sync
            </button>
          )}

          {/* Completed message */}
          {isCompleted && (
            <div className="text-[11px] text-emerald-300 text-center opacity-80">
              {displayJob.processedCount === 0
                ? "No changes — store is up to date."
                : `${formatCount(displayJob.processedCount)} records synced`}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
