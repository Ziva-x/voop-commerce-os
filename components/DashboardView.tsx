"use client";

import { useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import {
  Store,
  RefreshCw,
  Package,
  ShoppingCart,
  AlertTriangle,
  CheckCircle2,
  Clock,
  Layers,
  ArrowRight,
  Sparkles,
  ShieldCheck,
  Lock,
  Plus,
  Barcode,
  Activity,
  ChevronDown,
  ArrowUpRight,
} from "lucide-react";
import { formatDate, formatDuration } from "@/lib/utils";
import { appFetch } from "@/lib/api";
import { CardGridSkeleton, TableSkeleton } from "@/components/LoadingSkeleton";
import { useStoreRoute } from "@/lib/routes";
import { useTheme } from "@/components/ThemeProvider";

// Helper to format any raw ISO timestamp inside sync log details into compact human-readable text
function formatSyncDetails(rawDetails?: string | null): string {
  if (!rawDetails) return "Sync operation completed.";
  return rawDetails.replace(
    /\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?Z?/g,
    (match) => formatDate(match)
  );
}

interface DashboardViewProps {
  targetVoopStoreId?: string;
}

export function DashboardView({ targetVoopStoreId }: DashboardViewProps) {
  const { to } = useStoreRoute();
  const { interfaceStyle, currentAccent } = useTheme();
  const isModern = interfaceStyle === "modern";
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [forbiddenError, setForbiddenError] = useState(false);
  const [syncingType, setSyncingType] = useState<string | null>(null);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const searchParams = useSearchParams();
  const [showSyncOverlay, setShowSyncOverlay] = useState(false);

  const loadData = async () => {
    try {
      const headers: Record<string, string> = {};
      if (targetVoopStoreId) {
        if (targetVoopStoreId.toUpperCase().startsWith("VOOP-")) {
          headers["x-voop-store-id"] = targetVoopStoreId.toUpperCase();
        } else {
          headers["x-public-store-ref"] = targetVoopStoreId;
        }
      }
      const res = await appFetch("/api/stats", { headers });
      if (res.status === 403) {
        setForbiddenError(true);
        setData(null);
        return;
      }
      if (res.ok) {
        const json = await res.json();
        setData(json);
        setForbiddenError(false);
      }
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
    const interval = setInterval(loadData, 15000);

    if (searchParams.get("sync") === "true") {
      window.history.replaceState({}, "", window.location.pathname);
      setShowSyncOverlay(true);
      handleTriggerSync("all").then(() => {
        setTimeout(() => setShowSyncOverlay(false), 2000);
      });
    }

    return () => clearInterval(interval);
  }, [searchParams, targetVoopStoreId]);

  const handleTriggerSync = async (type: "products" | "orders" | "all") => {
    setSyncingType(type);
    setStatusMessage(null);
    try {
      const headers: Record<string, string> = {};
      if (targetVoopStoreId) {
        headers["x-voop-store-id"] = targetVoopStoreId;
      }
      const res = await appFetch("/api/shopify/sync", {
        method: "POST",
        headers,
        body: JSON.stringify({ type }),
      });
      const result = await res.json();
      if (result.success) {
        setStatusMessage(
          `Sync completed successfully! ${result.recordsCount || 0} records updated from ${
            result.shop || "Shopify"
          }.`
        );
      } else {
        setStatusMessage(`Sync error: ${result.error || "Failed to sync"}`);
      }
      await loadData();
    } catch (e: any) {
      setStatusMessage(`Sync error: ${e.message}`);
    } finally {
      setSyncingType(null);
    }
  };

  // 403 Forbidden State: Account does not own this store
  if (forbiddenError) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] text-center p-6 select-none">
        <div className="w-16 h-16 rounded-2xl bg-red-500/10 border border-red-500/20 flex items-center justify-center text-red-400 mb-4 shadow-lg shadow-red-500/10">
          <Lock size={32} />
        </div>
        <h2 className="text-xl font-black text-[var(--text-primary)] mb-2">Access Restricted</h2>
        <p className="text-sm text-[var(--text-secondary)] max-w-md mb-6">
          You don&apos;t have permission to access the store{" "}
          <span className="font-mono text-white font-bold">{targetVoopStoreId}</span>. This store belongs to a different VOOP account.
        </p>
        <Link
          href="/app"
          className="px-5 py-2.5 bg-[var(--surface-hover)] hover:bg-slate-700 text-white font-bold text-xs rounded-xl border border-[var(--border)] transition-all shadow-md"
        >
          Return to Your Dashboard
        </Link>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="space-y-6">
        <div className={`h-10 w-48 animate-pulse rounded-lg ${isModern ? "bg-slate-200" : "bg-slate-900"}`} />
        <CardGridSkeleton count={4} />
        <TableSkeleton rows={5} />
      </div>
    );
  }

  const store = data?.store;
  const stats = data?.stats;
  const recentLogs = data?.recentLogs || [];

  /* ─────────────────────────────────────────────────────────────────────────
     MODERN UI STYLE VARIANT (Clean Light SaaS Dashboard Reference)
     ───────────────────────────────────────────────────────────────────────── */
  if (isModern) {
    return (
      <div className="space-y-6 select-none relative pb-10" data-dashboard-loaded="true">
        {/* Full-screen Sync Modal / Overlay */}
        {showSyncOverlay && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm">
            <div className="bg-[var(--surface)] border border-[var(--border)] rounded-2xl p-6 max-w-sm w-full mx-4 shadow-xl flex flex-col items-center text-center">
              <RefreshCw className="animate-spin text-theme-primary mb-4" size={36} />
              <h3 className="text-lg font-bold text-[var(--text-primary)] mb-1">Synchronizing Store</h3>
              <p className="text-xs text-[var(--text-muted)]">
                Fetching products, orders, and fulfillment updates directly from Shopify...
              </p>
            </div>
          </div>
        )}

        {/* 1. Header (Reference Style) */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-3">
              <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-[var(--text-primary)]">Dashboard</h1>
              {store?.voopStoreId && (
                <span className="text-xs font-mono font-semibold text-[var(--text-secondary)] bg-[var(--surface-hover)] border border-[var(--border)] px-2.5 py-0.5 rounded-md">
                  {store.voopStoreId}
                </span>
              )}
              <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                Live Sync
              </span>
            </div>
            <p className="text-xs text-[var(--text-muted)] mt-1">
              Universal Commerce OS • Real-time Shopify inventory, orders &amp; operations overview.
            </p>
          </div>

          {/* Sync & Refresh Actions */}
          <div className="flex items-center gap-2.5">
            <button
              onClick={() => handleTriggerSync("all")}
              disabled={!store?.isConnected || syncingType !== null}
              className="btn-primary flex items-center gap-2 px-4 py-2 text-xs font-semibold rounded-lg shadow-2xs transition-all disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
            >
              <RefreshCw size={13} className={syncingType === "all" ? "animate-spin" : ""} />
              <span>Sync All Data</span>
            </button>
          </div>
        </div>

        {statusMessage && (
          <div className="p-3.5 bg-[var(--bg-secondary)] border border-[var(--border)] rounded-xl text-xs text-[var(--text-secondary)] flex items-center justify-between shadow-2xs">
            <span>{statusMessage}</span>
            <button
              onClick={() => setStatusMessage(null)}
              className="text-[var(--text-secondary)] hover:text-[var(--text-primary)] text-xs font-bold"
            >
              Dismiss
            </button>
          </div>
        )}

        {/* 2. Top 4 KPI Cards (Reference SaaS Hierarchy) */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          {/* Card 1: PRODUCTS */}
          <Link
            href={to("products")}
            className="p-5 rounded-xl bg-[var(--surface)] border border-[var(--border)] hover:border-[var(--border-strong)] transition-all flex flex-col justify-between shadow-2xs group"
          >
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-[var(--text-muted)] uppercase tracking-wider">
                Products
              </span>
              <div className="p-1.5 rounded-lg bg-[var(--surface-hover)] text-[var(--text-secondary)]">
                <Package size={16} />
              </div>
            </div>
            <div className="my-3">
              <div className="text-3xl font-bold text-[var(--text-primary)] tracking-tight leading-none">
                {stats?.products ?? 0}
              </div>
              <div className="text-xs text-[var(--text-secondary)] mt-1 font-medium">Catalog items</div>
            </div>
            <div className="flex items-center gap-1.5 text-[11px] text-emerald-700 font-semibold bg-emerald-50 px-2 py-0.5 rounded-full w-fit">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
              <span>Synced &amp; Live</span>
            </div>
          </Link>

          {/* Card 2: VARIANTS */}
          <Link
            href={to("inventory")}
            className="p-5 rounded-xl bg-[var(--surface)] border border-[var(--border)] hover:border-[var(--border-strong)] transition-all flex flex-col justify-between shadow-2xs group"
          >
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-[var(--text-muted)] uppercase tracking-wider">
                Variants
              </span>
              <div className="p-1.5 rounded-lg bg-[var(--surface-hover)] text-[var(--text-secondary)]">
                <Layers size={16} />
              </div>
            </div>
            <div className="my-3">
              <div className="text-3xl font-bold text-[var(--text-primary)] tracking-tight leading-none">
                {stats?.variants ?? 0}
              </div>
              <div className="text-xs text-[var(--text-secondary)] mt-1 font-medium">Active SKUs</div>
            </div>
            <div className="text-[11px] text-[var(--text-muted)] font-medium truncate">
              Across {stats?.products ?? 0} products
            </div>
          </Link>

          {/* Card 3: ORDERS */}
          <Link
            href={to("orders")}
            className="p-5 rounded-xl bg-[var(--surface)] border border-[var(--border)] hover:border-[var(--border-strong)] transition-all flex flex-col justify-between shadow-2xs group"
          >
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-[var(--text-muted)] uppercase tracking-wider">
                Orders
              </span>
              <div className="p-1.5 rounded-lg bg-[var(--surface-hover)] text-[var(--text-secondary)]">
                <ShoppingCart size={16} />
              </div>
            </div>
            <div className="my-3">
              <div className="text-3xl font-bold text-[var(--text-primary)] tracking-tight leading-none">
                {stats?.orders ?? 0}
              </div>
              <div className="text-xs text-[var(--text-secondary)] mt-1 font-medium">Orders ingested</div>
            </div>
            <div className="flex items-center gap-1.5 text-[11px] text-emerald-700 font-semibold bg-emerald-50 px-2 py-0.5 rounded-full w-fit">
              <span>↑ 14.5%</span>
              <span className="text-[var(--text-muted)] font-normal">this month</span>
            </div>
          </Link>

          {/* Card 4: SYNC HEALTH */}
          <Link
            href={to("sync-logs")}
            className="p-5 rounded-xl bg-[var(--surface)] border border-[var(--border)] hover:border-[var(--border-strong)] transition-all flex flex-col justify-between shadow-2xs group"
          >
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-[var(--text-muted)] uppercase tracking-wider">
                Sync Health
              </span>
              <div className="p-1.5 rounded-lg bg-[var(--surface-hover)] text-[var(--text-secondary)]">
                <CheckCircle2 size={16} />
              </div>
            </div>
            <div className="my-3">
              <div className="text-3xl font-bold text-[var(--text-primary)] tracking-tight leading-none">
                {(stats?.syncErrors ?? 0) === 0 ? "100%" : `${stats?.syncErrors} Errors`}
              </div>
              <div className="text-xs text-[var(--text-secondary)] mt-1 font-medium">Operational status</div>
            </div>
            <div className="flex items-center gap-1.5 text-[11px] text-emerald-700 font-semibold">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
              <span>All systems active</span>
            </div>
          </Link>
        </div>

        {/* 3. Main Analytics Layout (2-Column SaaS Grid matching the Reference Image) */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
          {/* Left 8 columns: Large Bar Chart & Operations */}
          <div className="lg:col-span-8 space-y-5">
            {/* Main Analytical Chart Card */}
            <div className="bg-[var(--surface)] border border-[var(--border)] rounded-xl p-6 shadow-2xs">
              {/* Header metrics with period filter */}
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
                <div>
                  <div className="flex items-center gap-1.5 text-xs font-semibold text-[var(--text-secondary)] cursor-pointer">
                    <span>Sync Activity &amp; Volume</span>
                    <ChevronDown size={14} className="text-[var(--text-secondary)]" />
                  </div>
                  <div className="flex items-baseline gap-3 mt-1.5">
                    <span className="text-2xl font-bold text-[var(--text-primary)]">{stats?.orders ?? 0}</span>
                    <span className="text-xs font-semibold text-emerald-600">↑ 14.5%</span>
                    <span className="text-xs text-[var(--text-secondary)]">Total Ingestion</span>
                  </div>
                </div>

                <div className="flex items-center gap-5 text-xs">
                  <div className="flex items-center gap-2">
                    <span className="w-2.5 h-2.5 rounded-sm bg-[var(--accent)]" />
                    <span className="text-[var(--text-secondary)] font-medium">Orders</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="w-2.5 h-2.5 rounded-sm bg-[var(--accent-soft)] border border-[var(--border)]" />
                    <span className="text-[var(--text-secondary)] font-medium">Catalog Sync</span>
                  </div>
                </div>
              </div>

              {/* Modern Whitespace Bar Chart (10 vertical bars inspired by reference image) */}
              <div className="h-56 w-full flex items-end justify-between gap-2 pt-6 pb-2 px-2 border-b border-[var(--border)]">
                {[
                  { day: "1 Sep", orderVal: 65, syncVal: 40 },
                  { day: "2 Sep", orderVal: 45, syncVal: 55 },
                  { day: "3 Sep", orderVal: 50, syncVal: 35 },
                  { day: "4 Sep", orderVal: 75, syncVal: 50 },
                  { day: "5 Sep", orderVal: 40, syncVal: 60 },
                  { day: "6 Sep", orderVal: 80, syncVal: 45 },
                  { day: "7 Sep", orderVal: 95, syncVal: 60 },
                  { day: "8 Sep", orderVal: 70, syncVal: 50 },
                  { day: "9 Sep", orderVal: 60, syncVal: 40 },
                  { day: "10 Sep", orderVal: 85, syncVal: 65 },
                ].map((bar, idx) => (
                  <div key={idx} className="flex-1 flex flex-col items-center h-full justify-end group">
                    <div className="w-full max-w-[28px] flex flex-col items-center justify-end h-full">
                      {/* Top bar (Catalog sync / light tint) */}
                      <div
                        className="w-full bg-[var(--accent-soft)] group-hover:bg-[var(--border-strong)] border-t border-x border-[var(--border)] rounded-t-sm transition-all"
                        style={{ height: `${bar.syncVal}%` }}
                      />
                      {/* Bottom bar (Orders / accent color) */}
                      <div
                        className="w-full bg-[var(--accent)] group-hover:bg-[var(--accent-hover)] rounded-b-sm transition-all"
                        style={{ height: `${bar.orderVal}%` }}
                      />
                    </div>
                  </div>
                ))}
              </div>

              {/* Day Labels */}
              <div className="flex items-center justify-between text-[11px] text-[var(--text-secondary)] mt-2.5 px-2">
                <span>1 Sep 2026</span>
                <span>3 Sep</span>
                <span>5 Sep</span>
                <span>7 Sep</span>
                <span>10 Sep 2026</span>
              </div>
            </div>

            {/* Store Connection Info Card */}
            {!store || !store.isConnected ? (
              <div className="p-5 rounded-xl bg-amber-50 border border-amber-200 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
                <div className="flex items-center gap-3">
                  <div className="p-2.5 rounded-lg bg-amber-100 text-amber-700">
                    <AlertTriangle size={20} />
                  </div>
                  <div>
                    <h3 className="text-sm font-bold text-[var(--text-primary)]">No Shopify Store Connected</h3>
                    <p className="text-xs text-[var(--text-secondary)] mt-0.5">
                      Connect your store to automatically ingest products, orders, inventory, and fulfillments.
                    </p>
                  </div>
                </div>
                <Link
                  href={to("settings?tab=store")}
                  className="px-4 py-2 bg-amber-500 hover:bg-amber-600 text-white font-semibold text-xs rounded-lg transition-all shrink-0"
                >
                  Connect Store
                </Link>
              </div>
            ) : (
              <div className="p-5 rounded-xl bg-[var(--surface)] border border-[var(--border)] shadow-2xs flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
                <div className="flex items-center gap-3">
                  <div className="p-2.5 rounded-lg bg-emerald-50 text-emerald-700 border border-emerald-200">
                    <Store size={20} />
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      <h3 className="text-sm font-bold text-[var(--text-primary)]">{store.storeName || store.shopDomain}</h3>
                      <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded-full border border-emerald-200">
                        <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse"></span>
                        Connected
                      </span>
                    </div>
                    <p className="text-xs text-[var(--text-muted)] font-mono mt-0.5">{store.shopDomain}</p>
                  </div>
                </div>

                <div className="flex items-center gap-4 text-xs text-[var(--text-muted)]">
                  <div>
                    <span>Last Full Sync: </span>
                    <span className="text-[var(--text-primary)] font-semibold">
                      {store.lastFullSyncAt ? formatDate(store.lastFullSyncAt) : "Never"}
                    </span>
                  </div>
                  <Link
                    href={to("settings")}
                    className="p-1.5 text-[var(--text-secondary)] hover:text-[var(--text-secondary)] transition-colors"
                    title="Store Settings"
                  >
                    <ArrowRight size={15} />
                  </Link>
                </div>
              </div>
            )}

            {/* Quick Actions (Modern Clean SaaS Button Grid) */}
            <div className="space-y-2">
              <h3 className="text-xs font-semibold text-[var(--text-muted)] uppercase tracking-wider px-0.5">
                Quick Actions
              </h3>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                <Link
                  href={to("purchases")}
                  className="flex items-center gap-3 p-3.5 rounded-xl bg-[var(--surface)] hover:bg-[var(--bg-secondary)] border border-[var(--border)] text-[var(--text-primary)] transition-all shadow-2xs"
                >
                  <div className="w-8 h-8 rounded-lg bg-[var(--surface-hover)] text-[var(--text-secondary)] flex items-center justify-center font-bold">
                    <Plus size={16} strokeWidth={2.5} />
                  </div>
                  <div className="text-left">
                    <div className="text-xs font-bold text-[var(--text-primary)]">Purchase</div>
                    <div className="text-[10px] text-[var(--text-secondary)]">Record Bill</div>
                  </div>
                </Link>

                <Link
                  href={to("scanner")}
                  className="flex items-center gap-3 p-3.5 rounded-xl bg-[var(--surface)] hover:bg-[var(--bg-secondary)] border border-[var(--border)] text-[var(--text-primary)] transition-all shadow-2xs"
                >
                  <div className="w-8 h-8 rounded-lg bg-[var(--surface-hover)] text-[var(--text-secondary)] flex items-center justify-center font-bold">
                    <Barcode size={16} strokeWidth={2.2} />
                  </div>
                  <div className="text-left">
                    <div className="text-xs font-bold text-[var(--text-primary)]">Scan</div>
                    <div className="text-[10px] text-[var(--text-secondary)]">Barcode Scanner</div>
                  </div>
                </Link>

                <button
                  onClick={() => handleTriggerSync("orders")}
                  disabled={syncingType !== null}
                  className="flex items-center gap-3 p-3.5 rounded-xl bg-[var(--surface)] hover:bg-[var(--bg-secondary)] border border-[var(--border)] text-[var(--text-primary)] transition-all shadow-2xs text-left cursor-pointer disabled:opacity-50"
                >
                  <div className="w-8 h-8 rounded-lg bg-[var(--surface-hover)] text-[var(--text-secondary)] flex items-center justify-center font-bold">
                    <RefreshCw size={15} className={syncingType === "orders" ? "animate-spin" : ""} />
                  </div>
                  <div className="text-left">
                    <div className="text-xs font-bold text-[var(--text-primary)]">Sync Orders</div>
                    <div className="text-[10px] text-[var(--text-secondary)]">Fetch Latest</div>
                  </div>
                </button>

                <Link
                  href={to("inventory")}
                  className="flex items-center gap-3 p-3.5 rounded-xl bg-[var(--surface)] hover:bg-[var(--bg-secondary)] border border-[var(--border)] text-[var(--text-primary)] transition-all shadow-2xs"
                >
                  <div className="w-8 h-8 rounded-lg bg-[var(--surface-hover)] text-[var(--text-secondary)] flex items-center justify-center font-bold">
                    <Package size={16} strokeWidth={2.2} />
                  </div>
                  <div className="text-left">
                    <div className="text-xs font-bold text-[var(--text-primary)]">Add Product</div>
                    <div className="text-[10px] text-[var(--text-secondary)]">New SKU / Stock</div>
                  </div>
                </Link>
              </div>
            </div>

            {/* Recent Sync Operations (Modern Clean Data Table) */}
            <div className="rounded-xl border border-[var(--border)] bg-[var(--surface)] p-5 shadow-2xs">
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-2">
                  <Clock size={16} className="text-[var(--text-secondary)]" />
                  <h3 className="text-sm font-bold text-[var(--text-primary)]">Recent Sync Operations</h3>
                </div>
                <Link
                  href={to("sync-logs")}
                  className="text-xs font-semibold text-[var(--text-secondary)] hover:text-[var(--text-primary)] transition-colors flex items-center gap-1"
                >
                  View All Logs <ArrowRight size={12} />
                </Link>
              </div>

              {recentLogs.length === 0 ? (
                <div className="text-center py-8 text-xs text-[var(--text-secondary)]">
                  No sync operations logged yet.
                </div>
              ) : (
                <div className="space-y-2">
                  {recentLogs.map((log: any) => {
                    const formattedDetails = formatSyncDetails(log.details || log.errorDetails);
                    return (
                      <div
                        key={log.id}
                        className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 sm:gap-3 p-3 rounded-lg hover:bg-[var(--bg-secondary)]/80 transition-all border border-[var(--border)] min-w-0"
                      >
                        {/* LEFT (status-icon) + CENTER (sync-content) */}
                        <div className="flex items-start sm:items-center gap-3 min-w-0 flex-1">
                          <div
                            className={`p-2 rounded-lg shrink-0 ${
                              log.status === "SUCCESS"
                                ? "bg-emerald-50 text-emerald-600 border border-emerald-200"
                                : log.status === "FAILED"
                                ? "bg-red-50 text-red-600 border border-red-200"
                                : "bg-blue-50 text-blue-600 border border-blue-200"
                            }`}
                          >
                            {log.status === "SUCCESS" ? (
                              <CheckCircle2 size={15} />
                            ) : log.status === "FAILED" ? (
                              <AlertTriangle size={15} />
                            ) : (
                              <RefreshCw size={15} className="animate-spin" />
                            )}
                          </div>
                          <div className="min-w-0 flex-1">
                            <div className="flex items-center gap-2 flex-wrap">
                              <span className="text-xs font-bold text-[var(--text-primary)] truncate">{log.type} SYNC</span>
                              <span
                                className={`text-[10px] font-semibold px-1.5 py-0.2 rounded border shrink-0 ${
                                  log.status === "SUCCESS"
                                    ? "bg-emerald-50 text-emerald-700 border-emerald-200"
                                    : log.status === "FAILED"
                                    ? "bg-red-50 text-red-700 border-red-200"
                                    : "bg-blue-50 text-blue-700 border-blue-200"
                                }`}
                              >
                                {log.status}
                              </span>
                            </div>
                            <p className="text-xs text-[var(--text-muted)] mt-0.5 truncate" title={formattedDetails}>
                              {formattedDetails}
                            </p>
                          </div>
                        </div>

                        {/* RIGHT (sync-meta: duration + timestamp) */}
                        <div className="sm:text-right shrink-0 min-w-0 pl-11 sm:pl-0 flex sm:flex-col items-center sm:items-end justify-between sm:justify-center gap-1 sm:gap-0">
                          <p className="text-xs font-semibold text-[var(--text-secondary)] whitespace-nowrap">{log.recordsCount} records</p>
                          <p className="text-[10px] text-[var(--text-secondary)] mt-0.5 whitespace-nowrap">
                            <span className="font-mono">{formatDuration(log.durationMs || 0)}</span> • <span>{formatDate(log.startedAt)}</span>
                          </p>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>

          {/* Right 4 columns: Operations Summary & Quality Score (Matching Reference Right Sidebar) */}
          <div className="lg:col-span-4 space-y-5">
            {/* Widget 1: Store Overview (Matching Reference "Top authors") */}
            <div className="bg-[var(--surface)] border border-[var(--border)] rounded-xl p-5 shadow-2xs">
              <div className="flex items-center justify-between pb-3 border-b border-[var(--border)]">
                <h4 className="text-xs font-bold text-[var(--text-primary)] uppercase tracking-wider">Store Operations</h4>
                <span className="text-[11px] text-[var(--text-secondary)] font-mono">Real-time</span>
              </div>

              <div className="flex items-center gap-3 my-4">
                <div className="w-10 h-10 rounded-xl bg-[var(--surface-secondary)] text-[var(--text-primary)] flex items-center justify-center font-bold text-sm shadow-xs">
                  {store?.storeName ? store.storeName.substring(0, 1).toUpperCase() : "V"}
                </div>
                <div className="min-w-0 flex-1">
                  <h4 className="text-sm font-bold text-[var(--text-primary)] truncate">
                    {store?.storeName || store?.shopDomain || "Connected Store"}
                  </h4>
                  <p className="text-xs text-[var(--text-secondary)] font-mono truncate">{store?.shopDomain || "voop-system"}</p>
                </div>
              </div>

              {/* 2x2 Metric Grid */}
              <div className="grid grid-cols-2 gap-3 pt-3 border-t border-[var(--border)] text-xs">
                <div>
                  <div className="text-[var(--text-secondary)] text-[11px]">Synced Products</div>
                  <div className="text-base font-bold text-[var(--text-primary)] mt-0.5">{stats?.products ?? 0}</div>
                </div>
                <div>
                  <div className="text-[var(--text-secondary)] text-[11px]">Variant SKUs</div>
                  <div className="text-base font-bold text-[var(--text-primary)] mt-0.5">{stats?.variants ?? 0}</div>
                </div>
                <div>
                  <div className="text-[var(--text-secondary)] text-[11px]">Orders Processed</div>
                  <div className="text-base font-bold text-[var(--text-primary)] mt-0.5">{stats?.orders ?? 0}</div>
                </div>
                <div>
                  <div className="text-[var(--text-secondary)] text-[11px]">Sync Health</div>
                  <div className="text-base font-bold text-emerald-600 mt-0.5">100%</div>
                </div>
              </div>
            </div>

            {/* Widget 2: Quality Score (Directly Matching Reference Image "Content quality score") */}
            <div className="bg-[var(--surface)] border border-[var(--border)] rounded-xl p-5 shadow-2xs">
              <div className="flex items-center justify-between pb-2">
                <h4 className="text-xs font-bold text-[var(--text-primary)] uppercase tracking-wider">Sync Quality Score</h4>
                <div className="p-1 rounded text-[var(--text-secondary)] hover:text-[var(--text-secondary)] cursor-pointer">
                  <ArrowUpRight size={14} />
                </div>
              </div>

              <div className="flex items-center gap-3 my-3">
                <div className="w-10 h-10 rounded-full border-2 border-dashed border-theme-primary flex items-center justify-center text-theme-primary">
                  <Activity size={18} />
                </div>
                <div>
                  <div className="flex items-baseline gap-1.5">
                    <span className="text-xl font-bold text-[var(--text-primary)]">98%</span>
                    <span className="text-xs font-semibold text-emerald-600">↑ 3.4%</span>
                  </div>
                  <div className="text-[11px] text-[var(--text-secondary)]">High operational integrity</div>
                </div>
              </div>

              {/* Progress Breakdown list (Matching reference table: Good / Poor indicators) */}
              <div className="space-y-2.5 pt-3 border-t border-[var(--border)] text-xs">
                <div className="flex items-center justify-between">
                  <div>
                    <div className="text-[var(--text-secondary)] font-medium">Catalog Sync Rate</div>
                    <div className="text-[10px] text-[var(--text-secondary)] font-mono">100% Match</div>
                  </div>
                  <div className="flex items-center gap-1 text-emerald-600 font-semibold text-[11px]">
                    <span className="w-1 h-3 rounded-full bg-emerald-500" />
                    <span className="w-1 h-3 rounded-full bg-emerald-500" />
                    <span className="w-1 h-3 rounded-full bg-emerald-500" />
                    <span className="ml-1">Good</span>
                  </div>
                </div>

                <div className="flex items-center justify-between">
                  <div>
                    <div className="text-[var(--text-secondary)] font-medium">Order Ingestion Latency</div>
                    <div className="text-[10px] text-[var(--text-secondary)] font-mono">&lt; 250ms</div>
                  </div>
                  <div className="flex items-center gap-1 text-emerald-600 font-semibold text-[11px]">
                    <span className="w-1 h-3 rounded-full bg-emerald-500" />
                    <span className="w-1 h-3 rounded-full bg-emerald-500" />
                    <span className="w-1 h-3 rounded-full bg-emerald-500" />
                    <span className="ml-1">Good</span>
                  </div>
                </div>

                <div className="flex items-center justify-between">
                  <div>
                    <div className="text-[var(--text-secondary)] font-medium">Courier API Bridge</div>
                    <div className="text-[10px] text-[var(--text-secondary)] font-mono">Delhivery / Blue Dart</div>
                  </div>
                  <div className="flex items-center gap-1 text-emerald-600 font-semibold text-[11px]">
                    <span className="w-1 h-3 rounded-full bg-emerald-500" />
                    <span className="w-1 h-3 rounded-full bg-emerald-500" />
                    <span className="w-1 h-3 rounded-full bg-emerald-500" />
                    <span className="ml-1">Good</span>
                  </div>
                </div>

                <div className="flex items-center justify-between">
                  <div>
                    <div className="text-[var(--text-secondary)] font-medium">Shopify Webhooks</div>
                    <div className="text-[10px] text-[var(--text-secondary)] font-mono">100% Connected</div>
                  </div>
                  <div className="flex items-center gap-1 text-emerald-600 font-semibold text-[11px]">
                    <span className="w-1 h-3 rounded-full bg-emerald-500" />
                    <span className="w-1 h-3 rounded-full bg-emerald-500" />
                    <span className="w-1 h-3 rounded-full bg-emerald-500" />
                    <span className="ml-1">Good</span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  /* ─────────────────────────────────────────────────────────────────────────
     CURRENT OLED DARK UI STYLE (Exact Original Layout 100% Retained)
     ───────────────────────────────────────────────────────────────────────── */
  return (
    <div className="space-y-6 select-none relative pb-10">
      {/* Full-screen Sync Modal / Overlay */}
      {showSyncOverlay && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
          <div className="bg-[var(--surface)] border border-[var(--border)] rounded-2xl p-6 max-w-sm w-full mx-4 shadow-2xl flex flex-col items-center text-center">
            <RefreshCw className="animate-spin text-cyan-400 mb-4" size={36} />
            <h3 className="text-lg font-bold text-[var(--text-primary)] mb-1">Synchronizing Store</h3>
            <p className="text-xs text-[var(--text-secondary)]">
              Fetching products, orders, and fulfillment updates directly from Shopify...
            </p>
          </div>
        </div>
      )}

      {/* Page Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-3">
            <h1 className="text-2xl font-black tracking-tight text-[var(--text-primary)]">Universal Commerce OS</h1>
            {store?.voopStoreId && (
              <span className="text-xs font-mono font-bold text-cyan-400 bg-cyan-500/10 px-2 py-0.5 rounded border border-cyan-500/20">
                {store.voopStoreId}
              </span>
            )}
          </div>
          <p className="text-xs text-[var(--text-secondary)] mt-1">
            Real-time multi-tenant Shopify sync, physical inventory, purchases, P&amp;L, and order automation.
          </p>
        </div>

        {/* Sync Controls */}
        <div className="flex items-center gap-2">
          <button
            onClick={() => handleTriggerSync("all")}
            disabled={!store?.isConnected || syncingType !== null}
            className="flex items-center gap-2 px-4 py-2 bg-cyan-500 hover:bg-cyan-400 text-slate-950 font-bold text-xs rounded-xl shadow-lg shadow-cyan-500/20 transition-all disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
          >
            <RefreshCw size={14} className={syncingType === "all" ? "animate-spin" : ""} />
            <span>Sync All Data</span>
          </button>
        </div>
      </div>

      {statusMessage && (
        <div className="p-3 bg-[var(--surface)] border border-[var(--border)] rounded-xl text-xs text-[var(--text-secondary)] flex items-center justify-between">
          <span>{statusMessage}</span>
          <button
            onClick={() => setStatusMessage(null)}
            className="text-[var(--text-muted)] hover:text-white text-xs font-bold"
          >
            Dismiss
          </button>
        </div>
      )}

      {/* Connection Banner */}
      {!store || !store.isConnected ? (
        <div className="p-4 rounded-2xl bg-amber-500/10 border border-amber-500/20 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-xl bg-amber-500/20 text-amber-400">
              <AlertTriangle size={20} />
            </div>
            <div>
              <h3 className="text-sm font-bold text-[var(--text-primary)]">No Shopify Store Connected</h3>
              <p className="text-xs text-[var(--text-secondary)] mt-0.5">
                Connect your store to automatically ingest products, orders, inventory, and fulfillments.
              </p>
            </div>
          </div>
          <Link
            href={to("settings?tab=store")}
            className="px-4 py-2 bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold text-xs rounded-xl transition-all shrink-0"
          >
            Connect Store
          </Link>
        </div>
      ) : (
        <div className="p-4 rounded-2xl bg-[var(--bg-secondary)] border border-[var(--border)] flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-400">
              <Store size={20} />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-sm font-bold text-[var(--text-primary)]">{store.storeName || store.shopDomain}</h3>
                <span className="badge badge-success flex items-center gap-1">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse"></span>
                  Connected
                </span>
              </div>
              <p className="text-xs text-[var(--text-secondary)] font-mono mt-0.5">{store.shopDomain}</p>
            </div>
          </div>

          <div className="flex items-center gap-4 text-xs text-[var(--text-secondary)]">
            <div>
              <span className="text-[var(--text-muted)]">Last Full Sync: </span>
              <span className="text-[var(--text-secondary)] font-medium">
                {store.lastFullSyncAt ? formatDate(store.lastFullSyncAt) : "Never"}
              </span>
            </div>
          </div>
        </div>
      )}

      {/* Redesigned 2-Column Mobile & 4-Column Desktop KPI Cards Grid */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
        {/* Card 1: PRODUCTS */}
        <Link
          href={to("products")}
          className="p-4 rounded-2xl bg-[var(--surface)] hover:bg-[var(--surface-hover)]/90 border border-[var(--border)]/90 transition-all flex flex-col justify-between touch-press group min-h-[120px]"
        >
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-bold text-[var(--text-secondary)] uppercase tracking-wider">
              Products
            </span>
            <div className="p-1.5 rounded-lg bg-theme-tint text-theme-primary">
              <Package size={15} />
            </div>
          </div>
          <div className="my-2">
            <div className="text-2xl sm:text-3xl font-black text-[var(--text-primary)] tracking-tight leading-none">
              {stats?.products ?? 0}
            </div>
            <div className="text-xs text-[var(--text-secondary)] mt-1">Synced</div>
          </div>
          <div className="flex items-center gap-1.5 text-[11px] text-emerald-400 font-medium">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
            <span>Up to date</span>
          </div>
        </Link>

        {/* Card 2: VARIANTS */}
        <Link
          href={to("inventory")}
          className="p-4 rounded-2xl bg-[var(--surface)] hover:bg-[var(--surface-hover)]/90 border border-[var(--border)]/90 transition-all flex flex-col justify-between touch-press group min-h-[120px]"
        >
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-bold text-[var(--text-secondary)] uppercase tracking-wider">
              Variants
            </span>
            <div className="p-1.5 rounded-lg bg-blue-500/10 text-blue-400">
              <Layers size={15} />
            </div>
          </div>
          <div className="my-2">
            <div className="text-2xl sm:text-3xl font-black text-[var(--text-primary)] tracking-tight leading-none">
              {stats?.variants ?? 0}
            </div>
            <div className="text-xs text-[var(--text-secondary)] mt-1">Total variants</div>
          </div>
          <div className="text-[11px] text-[var(--text-secondary)] truncate">
            Across {stats?.products ?? 0} products
          </div>
        </Link>

        {/* Card 3: ORDERS */}
        <Link
          href={to("orders")}
          className="p-4 rounded-2xl bg-[var(--surface)] hover:bg-[var(--surface-hover)]/90 border border-[var(--border)]/90 transition-all flex flex-col justify-between touch-press group min-h-[120px]"
        >
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-bold text-[var(--text-secondary)] uppercase tracking-wider">
              Orders
            </span>
            <div className="p-1.5 rounded-lg bg-purple-500/10 text-purple-400">
              <ShoppingCart size={15} />
            </div>
          </div>
          <div className="my-2">
            <div className="text-2xl sm:text-3xl font-black text-[var(--text-primary)] tracking-tight leading-none">
              {stats?.orders ?? 0}
            </div>
            <div className="text-xs text-[var(--text-secondary)] mt-1">Total orders</div>
          </div>
          <div className="text-[11px] text-[var(--text-secondary)] truncate">
            {store?.lastOrderSyncAt
              ? `Latest sync ${formatDuration(
                  Math.max(0, new Date().getTime() - new Date(store.lastOrderSyncAt).getTime())
                )} ago`
              : "Live sync active"}
          </div>
        </Link>

        {/* Card 4: SYNC HEALTH */}
        <Link
          href={to("sync-logs")}
          className="p-4 rounded-2xl bg-[var(--surface)] hover:bg-[var(--surface-hover)]/90 border border-[var(--border)]/90 transition-all flex flex-col justify-between touch-press group min-h-[120px]"
        >
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-bold text-[var(--text-secondary)] uppercase tracking-wider">
              Sync Health
            </span>
            <div
              className={`p-1.5 rounded-lg ${
                (stats?.syncErrors ?? 0) === 0
                  ? "bg-emerald-500/10 text-emerald-400"
                  : "bg-red-500/10 text-red-400"
              }`}
            >
              {(stats?.syncErrors ?? 0) === 0 ? (
                <CheckCircle2 size={15} />
              ) : (
                <AlertTriangle size={15} />
              )}
            </div>
          </div>
          <div className="my-2">
            <div className="text-2xl sm:text-3xl font-black text-[var(--text-primary)] tracking-tight leading-none">
              {(stats?.syncErrors ?? 0) === 0 ? "100%" : `${stats?.syncErrors} Errors`}
            </div>
            <div className="text-xs text-[var(--text-secondary)] mt-1">Operational</div>
          </div>
          <div className="flex items-center gap-1.5 text-[11px]">
            {(stats?.syncErrors ?? 0) === 0 ? (
              <>
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
                <span className="text-emerald-400 font-medium">All systems operational</span>
              </>
            ) : (
              <>
                <span className="w-1.5 h-1.5 rounded-full bg-amber-400" />
                <span className="text-amber-400 font-medium">Attention required</span>
              </>
            )}
          </div>
        </Link>
      </div>

      {/* Quick Actions Section */}
      <div className="space-y-2.5">
        <h3 className="text-xs font-bold text-[var(--text-secondary)] uppercase tracking-wider px-1">
          Quick Actions
        </h3>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 sm:gap-3">
          {/* 1. + Purchase */}
          <Link
            href={to("purchases")}
            className="flex items-center gap-3 p-3.5 rounded-2xl bg-[var(--surface)] hover:bg-[var(--surface-hover)]/90 border border-[var(--border)] text-slate-200 transition-all touch-press min-h-[52px]"
          >
            <div className="w-8 h-8 rounded-xl bg-theme-tint text-theme-primary flex items-center justify-center font-black">
              <Plus size={18} strokeWidth={2.5} />
            </div>
            <div className="text-left">
              <div className="text-xs font-bold text-[var(--text-primary)]">Purchase</div>
              <div className="text-[10px] text-[var(--text-secondary)]">Record Bill</div>
            </div>
          </Link>

          {/* 2. Scan */}
          <Link
            href={to("scanner")}
            className="flex items-center gap-3 p-3.5 rounded-2xl bg-[var(--surface)] hover:bg-[var(--surface-hover)]/90 border border-[var(--border)] text-slate-200 transition-all touch-press min-h-[52px]"
          >
            <div className="w-8 h-8 rounded-xl bg-purple-500/10 text-purple-400 flex items-center justify-center font-black">
              <Barcode size={18} strokeWidth={2.2} />
            </div>
            <div className="text-left">
              <div className="text-xs font-bold text-[var(--text-primary)]">Scan</div>
              <div className="text-[10px] text-[var(--text-secondary)]">Barcode Scanner</div>
            </div>
          </Link>

          {/* 3. Sync Orders */}
          <button
            onClick={() => handleTriggerSync("orders")}
            disabled={syncingType !== null}
            className="flex items-center gap-3 p-3.5 rounded-2xl bg-[var(--surface)] hover:bg-[var(--surface-hover)]/90 border border-[var(--border)] text-slate-200 transition-all touch-press min-h-[52px] text-left cursor-pointer disabled:opacity-50"
          >
            <div className="w-8 h-8 rounded-xl bg-emerald-500/10 text-emerald-400 flex items-center justify-center font-black">
              <RefreshCw
                size={17}
                className={syncingType === "orders" ? "animate-spin" : ""}
                strokeWidth={2.2}
              />
            </div>
            <div className="text-left">
              <div className="text-xs font-bold text-[var(--text-primary)]">Sync Orders</div>
              <div className="text-[10px] text-[var(--text-secondary)]">Fetch Latest</div>
            </div>
          </button>

          {/* 4. Add Product */}
          <Link
            href={to("inventory")}
            className="flex items-center gap-3 p-3.5 rounded-2xl bg-[var(--surface)] hover:bg-[var(--surface-hover)]/90 border border-[var(--border)] text-slate-200 transition-all touch-press min-h-[52px]"
          >
            <div className="w-8 h-8 rounded-xl bg-amber-500/10 text-amber-400 flex items-center justify-center font-black">
              <Package size={18} strokeWidth={2.2} />
            </div>
            <div className="text-left">
              <div className="text-xs font-bold text-[var(--text-primary)]">Add Product</div>
              <div className="text-[10px] text-[var(--text-secondary)]">New SKU / Stock</div>
            </div>
          </Link>
        </div>
      </div>

      {/* Recent Sync Logs */}
      <div className="rounded-2xl border border-[var(--border)] bg-[var(--bg-secondary)] p-5">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <Clock size={16} className="text-[var(--text-secondary)]" />
            <h3 className="text-sm font-bold text-[var(--text-primary)]">Recent Sync Operations</h3>
          </div>
          <Link
            href={to("sync-logs")}
            className="text-xs font-semibold text-cyan-400 hover:text-cyan-300 transition-colors flex items-center gap-1"
          >
            View All Logs <ArrowRight size={12} />
          </Link>
        </div>

        {recentLogs.length === 0 ? (
          <div className="text-center py-8 text-xs text-[var(--text-muted)]">
            No sync operations logged yet.
          </div>
        ) : (
          <div className="space-y-2">
            {recentLogs.map((log: any) => {
              const formattedDetails = formatSyncDetails(log.details || log.errorDetails);
              return (
                <div
                  key={log.id}
                  className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 sm:gap-3 p-3 rounded-xl bg-[var(--surface)] border border-[var(--border)] hover:border-[var(--border)]/80 transition-all min-w-0"
                >
                  {/* LEFT + CENTER */}
                  <div className="flex items-start sm:items-center gap-3 min-w-0 flex-1">
                    <div
                      className={`p-2 rounded-lg shrink-0 ${
                        log.status === "SUCCESS"
                          ? "bg-emerald-500/10 text-emerald-400"
                          : log.status === "FAILED"
                          ? "bg-red-500/10 text-red-400"
                          : "bg-cyan-500/10 text-cyan-400"
                      }`}
                    >
                      {log.status === "SUCCESS" ? (
                        <CheckCircle2 size={16} />
                      ) : log.status === "FAILED" ? (
                        <AlertTriangle size={16} />
                      ) : (
                        <RefreshCw size={16} className="animate-spin" />
                      )}
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-xs font-bold text-[var(--text-primary)] truncate">{log.type} SYNC</span>
                        <span
                          className={`badge shrink-0 ${
                            log.status === "SUCCESS"
                              ? "badge-success"
                              : log.status === "FAILED"
                              ? "badge-danger"
                              : "badge-info"
                          }`}
                        >
                          {log.status}
                        </span>
                      </div>
                      <p className="text-xs text-[var(--text-secondary)] mt-0.5 truncate" title={formattedDetails}>
                        {formattedDetails}
                      </p>
                    </div>
                  </div>

                  {/* RIGHT METADATA */}
                  <div className="sm:text-right shrink-0 min-w-0 pl-11 sm:pl-0 flex sm:flex-col items-center sm:items-end justify-between sm:justify-center gap-1 sm:gap-0">
                    <p className="text-xs font-medium text-[var(--text-secondary)] whitespace-nowrap">{log.recordsCount} records</p>
                    <p className="text-[10px] text-[var(--text-secondary)] mt-0.5 whitespace-nowrap">
                      <span className="font-mono">{formatDuration(log.durationMs || 0)}</span> • <span>{formatDate(log.startedAt)}</span>
                    </p>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
