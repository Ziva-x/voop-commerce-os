"use client";

import React, { useEffect, useState } from "react";
import { BottomSheet } from "@/components/ui/BottomSheet";
import { Bell, CheckCircle2, AlertTriangle, RefreshCw, Clock } from "lucide-react";
import { appFetch } from "@/lib/api";
import { formatDate } from "@/lib/utils";

interface NotificationBottomSheetProps {
  isOpen: boolean;
  onClose: () => void;
}

export function NotificationBottomSheet({ isOpen, onClose }: NotificationBottomSheetProps) {
  const [logs, setLogs] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!isOpen) return;
    setLoading(true);
    appFetch("/api/sync-logs?limit=8")
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (data?.logs) setLogs(data.logs);
      })
      .catch((e) => console.error("Error loading notification logs:", e))
      .finally(() => setLoading(false));
  }, [isOpen]);

  return (
    <BottomSheet
      isOpen={isOpen}
      onClose={onClose}
      title="Notifications & System Activity"
      subtitle="Recent synchronization updates, events, and health alerts"
    >
      <div className="space-y-3">
        {loading ? (
          <div className="py-8 text-center text-slate-500 text-xs flex items-center justify-center gap-2">
            <RefreshCw size={14} className="animate-spin text-theme-primary" />
            <span>Loading recent activity...</span>
          </div>
        ) : logs.length === 0 ? (
          <div className="py-8 text-center text-slate-400 space-y-1">
            <Bell size={24} className="mx-auto text-slate-600 mb-2" />
            <p className="text-sm font-semibold text-slate-300">All systems normal</p>
            <p className="text-xs text-slate-500">No recent errors or warnings recorded.</p>
          </div>
        ) : (
          <div className="divide-y divide-slate-800/60">
            {logs.map((log: any) => {
              const isSuccess = log.status === "SUCCESS";
              return (
                <div key={log.id} className="py-3 flex items-start gap-3">
                  <div
                    className={`p-2 rounded-xl shrink-0 mt-0.5 ${
                      isSuccess
                        ? "bg-emerald-500/10 text-emerald-400"
                        : "bg-amber-500/10 text-amber-400"
                    }`}
                  >
                    {isSuccess ? <CheckCircle2 size={16} /> : <AlertTriangle size={16} />}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-xs font-bold text-white capitalize">
                        {log.syncType || "Shopify Sync"}
                      </span>
                      <span className="text-[10px] text-slate-500 font-mono">
                        {log.createdAt ? formatDate(log.createdAt) : ""}
                      </span>
                    </div>
                    <p className="text-xs text-slate-400 mt-0.5 line-clamp-2">
                      {log.details || log.message || (isSuccess ? "Sync executed successfully." : "Notice recorded.")}
                    </p>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </BottomSheet>
  );
}
