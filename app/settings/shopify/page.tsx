"use client";

import { useEffect, useState } from "react";
import {
  CheckCircle2,
  RefreshCw,
  Package,
  ShoppingCart,
  Layers,
  Clock,
  ExternalLink,
  ShieldCheck,
  AlertTriangle,
} from "lucide-react";
import { formatDate } from "@/lib/utils";
import { appFetch, getShopFromUrl } from "@/lib/api";

export default function ShopifySettingsPage() {
  const [storeData, setStoreData] = useState<any>(null);
  const [stats, setStats] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [message, setMessage] = useState<{ text: string; type: "success" | "error" | "info" } | null>(null);

  const fetchStats = async () => {
    try {
      const res = await appFetch("/api/stats");
      const json = await res.json();
      setStoreData(json.store);
      setStats(json.stats);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    // Self-healing: if the account has a null storeId due to the historical bug,
    // the link-account endpoint will silently repair it, then we load stats.
    const init = async () => {
      try {
        await appFetch("/api/shopify/link-account");
      } catch (_e) {
        // Non-fatal — proceed to load stats regardless
      }
      await fetchStats();
    };
    init();
  }, []);

  const handleSyncNow = async () => {
    setSyncing(true);
    setMessage(null);
    try {
      const res = await appFetch("/api/shopify/sync", {
        method: "POST",
        body: JSON.stringify({ type: "all" }),
      });
      const json = await res.json();
      if (json.success) {
        setMessage({
          text: `Sync completed successfully! ${json.recordsCount || 0} items synchronized from ${json.shop || storeData?.shopDomain || "Shopify"}.`,
          type: "success",
        });
        await fetchStats();
      } else {
        if (json.needsAuth) {
          const shop = getShopFromUrl() || storeData?.shopDomain || "";
          setMessage({
            text: shop
              ? `Authentication required for ${shop}. Click below to authorize permissions.`
              : "Authentication required. Click below to authorize Shopify permissions.",
            type: "error",
          });
        } else {
          setMessage({ text: json.error || "Sync failed.", type: "error" });
        }
      }
    } catch (e: any) {
      setMessage({ text: e.message, type: "error" });
    } finally {
      setSyncing(false);
    }
  };

  const currentShop = storeData?.shopDomain || getShopFromUrl() || "Shopify Store";

  return (
    <div className="space-y-6 max-w-3xl">
      {/* Title */}
      <div>
        <h2 className="text-2xl font-bold text-[var(--text-primary)] tracking-tight flex items-center gap-2">
          Shopify Connection
        </h2>
        <p className="text-xs text-[var(--text-muted)] mt-1">
          Connected to your active Shopify merchant store via secure server-side tokens.
        </p>
      </div>

      {/* Status Feedback Message */}
      {message && (
        <div
          className={`p-3.5 rounded-lg text-xs font-medium flex items-center justify-between ${
            message.type === "success"
              ? "bg-emerald-500/10 border border-emerald-500/30 text-emerald-400"
              : "bg-red-500/10 border border-red-500/30 text-red-400"
          }`}
        >
          <span>{message.text}</span>
          <button onClick={() => setMessage(null)} className="text-[var(--text-muted)] hover:text-[var(--text-primary)]">✕</button>
        </div>
      )}

      {/* Main Shopify Connected Card */}
      <div className="glass-panel p-8 space-y-6 border border-[var(--border)] bg-[var(--surface)]">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-6">
          <div className="space-y-2">
            {/* Status Badge */}
            <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-emerald-500/15 border border-emerald-500/30 text-emerald-400 text-xs font-bold">
              <CheckCircle2 size={14} className="text-emerald-400" />
              <span>Shopify Connected</span>
            </div>

            {/* Store Name & Domain */}
            <div>
              <h3 className="text-2xl font-black text-[var(--text-primary)] tracking-tight">
                {storeData?.storeName || currentShop}
              </h3>
              <p className="text-sm text-sky-500 dark:text-sky-400 font-mono mt-0.5 select-all">
                {currentShop}
              </p>
            </div>
          </div>

          {/* Sync Now & Re-Auth Buttons */}
          <div className="flex flex-col sm:flex-row gap-2">
            <button
              onClick={handleSyncNow}
              disabled={syncing}
              className="px-6 py-3 rounded-xl bg-gradient-to-r from-emerald-500 to-teal-500 hover:from-emerald-400 hover:to-teal-400 text-slate-950 font-bold text-sm shadow-lg shadow-emerald-500/20 transition-all flex items-center justify-center gap-2"
            >
              <RefreshCw size={16} className={syncing ? "animate-spin" : ""} />
              <span>{syncing ? "Syncing Store..." : "Sync Now"}</span>
            </button>
          </div>
        </div>

        {/* Live Synchronized Stats */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 pt-4 border-t border-[var(--border)]">
          <div className="p-4 rounded-xl bg-[var(--bg-secondary)] border border-[var(--border)] space-y-1">
            <span className="text-[11px] font-semibold uppercase tracking-wider text-[var(--text-muted)] flex items-center gap-1.5">
              <Package size={13} className="text-indigo-500 dark:text-indigo-400" /> Products
            </span>
            <p className="text-2xl font-black text-[var(--text-primary)]">{stats?.products ?? 0}</p>
            <p className="text-[10px] text-[var(--text-muted)]">Live store catalog</p>
          </div>

          <div className="p-4 rounded-xl bg-[var(--bg-secondary)] border border-[var(--border)] space-y-1">
            <span className="text-[11px] font-semibold uppercase tracking-wider text-[var(--text-muted)] flex items-center gap-1.5">
              <Layers size={13} className="text-sky-500 dark:text-sky-400" /> Variants &amp; SKUs
            </span>
            <p className="text-2xl font-black text-sky-500 dark:text-sky-400">{stats?.variants ?? 0}</p>
            <p className="text-[10px] text-[var(--text-muted)]">Shopify Variant IDs for Inventory</p>
          </div>

          <div className="p-4 rounded-xl bg-[var(--bg-secondary)] border border-[var(--border)] space-y-1">
            <span className="text-[11px] font-semibold uppercase tracking-wider text-[var(--text-muted)] flex items-center gap-1.5">
              <ShoppingCart size={13} className="text-emerald-500 dark:text-emerald-400" /> Orders
            </span>
            <p className="text-2xl font-black text-emerald-500 dark:text-emerald-400">{stats?.orders ?? 0}</p>
            <p className="text-[10px] text-[var(--text-muted)]">Line items &amp; fulfillment</p>
          </div>
        </div>

        {/* Sync Info Footer */}
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between text-xs text-[var(--text-muted)] pt-2 gap-2">
          <span className="flex items-center gap-1.5">
            <Clock size={13} /> Last Synchronized:{" "}
            <strong className="text-[var(--text-secondary)]">
              {storeData?.lastProductSyncAt ? formatDate(storeData.lastProductSyncAt) : "Never"}
            </strong>
          </span>
          <span className="flex items-center gap-1.5 text-emerald-500 dark:text-emerald-400 font-semibold">
            <ShieldCheck size={14} /> Server-Side Token Active
          </span>
        </div>
      </div>
    </div>
  );
}
