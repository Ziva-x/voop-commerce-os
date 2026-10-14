"use client";

import React from "react";

export function TableSkeleton({ rows = 6, cols = 5 }: { rows?: number; cols?: number }) {
  return (
    <div className="w-full space-y-3 p-4 sm:p-6 animate-pulse">
      <div className="flex items-center justify-between pb-3 border-b border-[var(--border)]">
        <div className="h-4 w-40 bg-slate-200 dark:bg-slate-800 rounded-md skeleton-shimmer"></div>
        <div className="h-4 w-24 bg-slate-200 dark:bg-slate-800 rounded-md skeleton-shimmer"></div>
      </div>

      <div className="space-y-3 pt-2">
        {Array.from({ length: rows }).map((_, rIdx) => (
          <div
            key={rIdx}
            className="flex items-center gap-4 py-3 border-b border-slate-100 dark:border-[var(--border)]/50"
          >
            <div className="flex items-center gap-3 w-1/3">
              <div className="w-9 h-9 rounded-lg bg-slate-200 dark:bg-slate-800 shrink-0 skeleton-shimmer"></div>
              <div className="space-y-1.5 flex-1">
                <div className="h-3.5 w-3/4 bg-slate-200 dark:bg-slate-800 rounded skeleton-shimmer"></div>
                <div className="h-2.5 w-1/2 bg-slate-100 dark:bg-slate-800/60 rounded skeleton-shimmer"></div>
              </div>
            </div>

            {Array.from({ length: Math.max(1, cols - 2) }).map((_, cIdx) => (
              <div key={cIdx} className="flex-1">
                <div className="h-3.5 w-3/4 bg-slate-200 dark:bg-slate-800 rounded skeleton-shimmer"></div>
              </div>
            ))}

            <div className="w-20 flex justify-end">
              <div className="h-7 w-16 bg-slate-200 dark:bg-slate-800 rounded-lg skeleton-shimmer"></div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

export function CardGridSkeleton({ count = 4 }: { count?: number }) {
  return (
    <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 animate-pulse">
      {Array.from({ length: count }).map((_, idx) => (
        <div
          key={idx}
          className="glass-panel p-5 space-y-3 border border-[var(--border)]"
        >
          <div className="flex items-center justify-between">
            <div className="h-3.5 w-24 bg-slate-200 dark:bg-slate-800 rounded skeleton-shimmer"></div>
            <div className="w-5 h-5 rounded-full bg-slate-200 dark:bg-slate-800 skeleton-shimmer"></div>
          </div>
          <div className="h-7 w-36 bg-slate-300 dark:bg-slate-700 rounded-md skeleton-shimmer"></div>
          <div className="h-2.5 w-28 bg-slate-100 dark:bg-slate-800 rounded skeleton-shimmer"></div>
        </div>
      ))}
    </div>
  );
}

export function SpinnerSkeleton({ label = "Loading data..." }: { label?: string }) {
  return (
    <div className="flex flex-col items-center justify-center p-16 space-y-3 text-slate-500 animate-fade-in">
      <div className="relative w-10 h-10">
        <div className="w-10 h-10 rounded-full border-2 border-cyan-500/20 border-t-cyan-500 animate-spin"></div>
        <div className="absolute inset-0 flex items-center justify-center">
          <div className="w-2 h-2 rounded-full bg-cyan-400 animate-ping"></div>
        </div>
      </div>
      <p className="text-sm font-medium text-[var(--text-secondary)]">{label}</p>
    </div>
  );
}
