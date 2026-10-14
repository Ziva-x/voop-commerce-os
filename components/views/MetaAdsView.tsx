"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import {
  Megaphone,
  CheckCircle2,
  AlertCircle,
  Plus,
  Unlink,
  DollarSign,
  TrendingUp,
  Target,
  BarChart3,
  MousePointerClick,
  Eye,
  RefreshCw,
  Sparkles,
  Activity,
  Radio,
  Send,
  ShieldCheck,
  Layers,
  ExternalLink,
  Calendar,
  CalendarDays,
  Clock,
  Sliders,
} from "lucide-react";
import { TableSkeleton, CardGridSkeleton } from "@/components/LoadingSkeleton";
import { appFetch } from "@/lib/api";
import { RouteGuard } from "@/components/auth/RouteGuard";

export default function MetaAdsPage() {
  const [activeSection, setActiveSection] = useState<"marketing" | "pixel">("marketing");
  const [data, setData] = useState<any>(null);
  const [omniData, setOmniData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<"overview" | "campaigns" | "accounts">("overview");
  const [period, setPeriod] = useState("7d");
  const [platformFilter, setPlatformFilter] = useState("ALL");

  // Meta Marketing Connect Modal State
  const [showConnectModal, setShowConnectModal] = useState(false);
  const [connectForm, setConnectForm] = useState({
    adAccountId: "",
    accountName: "MonkeyGarage Meta Ads",
    accessToken: "",
  });
  const [connecting, setConnecting] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // Meta Pixel & CAPI State
  const [pixelData, setPixelData] = useState<any>(null);
  const [pixelLoading, setPixelLoading] = useState(true);
  const [pixelSyncing, setPixelSyncing] = useState(false);
  const [pixelPeriod, setPixelPeriod] = useState("7d");
  const [showPixelModal, setShowPixelModal] = useState(false);
  const [pixelForm, setPixelForm] = useState({
    pixelId: "1205770778160110",
    name: "MonkeyGarage Pixel",
    accessToken: "",
    testEventCode: "",
  });
  const [pixelConnecting, setPixelConnecting] = useState(false);
  const [pixelErrorMsg, setPixelErrorMsg] = useState<string | null>(null);
  const [testSending, setTestSending] = useState(false);
  const [testResult, setTestResult] = useState<any>(null);

  const loadAllAdsData = async () => {
    setLoading(true);
    try {
      const [metaRes, omniRes] = await Promise.all([
        appFetch(`/api/meta-ads?period=${period}`).then((r) => r.json()).catch(() => null),
        appFetch(`/api/ads/accounts?period=${period}&platform=${platformFilter}`).then((r) => r.json()).catch(() => null),
      ]);
      setData(metaRes);
      setOmniData(omniRes);
    } catch (e) {
      console.error("Failed to load ads data:", e);
    } finally {
      setLoading(false);
    }
  };

  const loadPixelData = async () => {
    setPixelLoading(true);
    try {
      const res = await appFetch(`/api/meta-pixel?period=${pixelPeriod}`);
      const json = await res.json();
      setPixelData(json);
      if (json.pixel) {
        setPixelForm((prev) => ({
          ...prev,
          pixelId: json.pixel.pixelId,
          name: json.pixel.name || "MonkeyGarage Pixel",
          testEventCode: json.pixel.testEventCode || "",
        }));
      }
    } catch (e) {
      console.error(e);
    } finally {
      setPixelLoading(false);
    }
  };

  useEffect(() => {
    loadAllAdsData();
  }, [period, platformFilter]);

  useEffect(() => {
    loadPixelData();
  }, [pixelPeriod]);

  const handleSyncPixel = async () => {
    setPixelSyncing(true);
    try {
      const res = await appFetch("/api/meta-pixel", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "SYNC", period: pixelPeriod }),
      });
      const json = await res.json();
      if (json.success) {
        setPixelData(json);
      }
    } catch (e) {
      console.error(e);
    } finally {
      setPixelSyncing(false);
    }
  };

  const handleConnect = async (e: React.FormEvent) => {
    e.preventDefault();
    setConnecting(true);
    setErrorMsg(null);
    try {
      const res = await appFetch("/api/meta-ads", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(connectForm),
      });
      const json = await res.json();
      if (!res.ok) {
        throw new Error(json.error || "Failed to connect Meta account.");
      }
      setShowConnectModal(false);
      await loadAllAdsData();
    } catch (err: any) {
      setErrorMsg(err.message);
    } finally {
      setConnecting(false);
    }
  };

  const handleDisconnect = async () => {
    if (!confirm("Are you sure you want to disconnect your Meta Marketing account?")) return;
    try {
      const res = await appFetch(`/api/meta-ads?accountId=${data?.account?.id}`, {
        method: "DELETE",
      });
      if (res.ok) {
        await loadAllAdsData();
      }
    } catch (e) {
      console.error(e);
    }
  };

  const handleConnectPixel = async (e: React.FormEvent) => {
    e.preventDefault();
    setPixelConnecting(true);
    setPixelErrorMsg(null);
    try {
      const res = await appFetch("/api/meta-pixel", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(pixelForm),
      });
      const json = await res.json();
      if (!res.ok) {
        throw new Error(json.error || "Failed to save Meta Pixel.");
      }
      setShowPixelModal(false);
      await loadPixelData();
    } catch (err: any) {
      setPixelErrorMsg(err.message);
    } finally {
      setPixelConnecting(false);
    }
  };

  const handleDisconnectPixel = async () => {
    if (!confirm("Are you sure you want to disconnect Facebook Pixel & CAPI?")) return;
    try {
      const res = await appFetch(`/api/meta-pixel?pixelId=${pixelData?.pixel?.pixelId}`, {
        method: "DELETE",
      });
      if (res.ok) {
        await loadPixelData();
      }
    } catch (e) {
      console.error(e);
    }
  };

  const handleSendTestEvent = async (eventName: string) => {
    setTestSending(true);
    setTestResult(null);
    try {
      const res = await appFetch("/api/meta-pixel/test", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          eventName,
          value: eventName === "Purchase" ? 1499.0 : 0,
        }),
      });
      const json = await res.json();
      setTestResult(json);
      if (json.success) {
        await loadPixelData();
      }
    } catch (err: any) {
      setTestResult({ success: false, error: err.message });
    } finally {
      setTestSending(false);
    }
  };

  const isConnected = data?.isConnected || (omniData?.accounts && omniData.accounts.length > 0);
  const isPixelConnected = pixelData?.isConnected;

  // Use omnichannel summary when available
  const omniSummary = omniData?.summary || {};
  const omniAccounts = omniData?.accounts || [];
  const metrics = data?.metrics || {};
  const campaigns = data?.campaigns || [];
  const pixelStats = pixelData?.stats || {};
  const dailyBreakdown = pixelData?.dailyBreakdown || [];

  return (
    <RouteGuard requiredPermission="ads.view" moduleName="All Ads & Marketing">
      <div className="space-y-6 min-w-0 select-none animate-in fade-in duration-300">
      {/* Top Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-[var(--border)] pb-4">
        <div>
          <h2 className="text-xl sm:text-2xl font-black text-[var(--text-primary)] tracking-tight flex items-center gap-2">
            <Megaphone className="text-pink-500 shrink-0" size={22} />
            <span>All Ads &amp; Omnichannel ROAS Hub</span>
          </h2>
          <p className="text-xs text-[var(--text-muted)] mt-1">
            Analyze all ad accounts (Meta, Google, Snapchat, Reddit), track blended ROAS, marketing efficiency (MER), and Server-Side Meta Pixel / CAPI events.
          </p>
        </div>

        {/* Section Switcher */}
        <div className="flex items-center gap-1.5 p-1 bg-[var(--bg-secondary)] border border-[var(--border)] rounded-xl self-start sm:self-auto">
          <button
            onClick={() => setActiveSection("marketing")}
            className={`flex items-center gap-2 px-3.5 py-1.5 rounded-lg text-xs font-bold transition-all ${
              activeSection === "marketing"
                ? "bg-gradient-to-r from-blue-600 to-indigo-600 text-white shadow-md shadow-blue-500/20"
                : "text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
            }`}
          >
            <BarChart3 size={13} />
            <span>All Ads &amp; ROAS</span>
          </button>
          <button
            onClick={() => setActiveSection("pixel")}
            className={`flex items-center gap-2 px-3.5 py-1.5 rounded-lg text-xs font-bold transition-all ${
              activeSection === "pixel"
                ? "bg-gradient-to-r from-purple-600 to-pink-600 text-white shadow-md shadow-purple-500/20"
                : "text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
            }`}
          >
            <Radio size={13} />
            <span>Facebook Pixel &amp; CAPI</span>
          </button>
        </div>
      </div>

      {/* ============================================================ */}
      {/* SECTION 1: ALL ADS MARKETING & OMNICHANNEL ROAS              */}
      {/* ============================================================ */}
      {activeSection === "marketing" && (
        <div className="space-y-6">
          {/* Platform & Date Filter Bar */}
          <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3 glass-panel p-3.5">
            {/* Platform Selector Tabs */}
            <div className="flex items-center gap-1.5 overflow-x-auto">
              {[
                { id: "ALL", label: "All Platforms (Blended)" },
                { id: "META", label: `Meta Ads (${omniSummary.metaAccounts || 0})` },
                { id: "GOOGLE", label: `Google Ads (${omniSummary.googleAccounts || 0})` },
                { id: "SNAPCHAT", label: `Snapchat (${omniSummary.snapchatAccounts || 0})` },
                { id: "REDDIT", label: `Reddit (${omniSummary.redditAccounts || 0})` },
              ].map((p) => (
                <button
                  key={p.id}
                  onClick={() => setPlatformFilter(p.id)}
                  className={`px-3 py-1.5 rounded-lg text-xs font-bold whitespace-nowrap transition-all ${
                    platformFilter === p.id
                      ? "bg-indigo-600 text-white shadow-sm"
                      : "bg-[var(--bg-secondary)] text-[var(--text-secondary)] hover:text-[var(--text-primary)] border border-[var(--border)]"
                  }`}
                >
                  {p.label}
                </button>
              ))}
            </div>

            {/* Date Preset & Actions */}
            <div className="flex items-center gap-2 flex-wrap">
              <div className="flex items-center gap-1 p-1 bg-[var(--bg-secondary)] border border-[var(--border)] rounded-xl">
                {[
                  { id: "today", label: "Today" },
                  { id: "yesterday", label: "Yesterday" },
                  { id: "7d", label: "7 Days" },
                  { id: "30d", label: "30 Days" },
                ].map((t) => (
                  <button
                    key={t.id}
                    onClick={() => setPeriod(t.id)}
                    className={`px-2.5 py-1 rounded-lg text-xs font-bold transition-all ${
                      period === t.id
                        ? "bg-indigo-600 text-white shadow-sm"
                        : "text-slate-500 hover:text-[var(--text-primary)]"
                    }`}
                  >
                    {t.label}
                  </button>
                ))}
              </div>

              <button
                onClick={loadAllAdsData}
                disabled={loading}
                className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-[var(--bg-secondary)] border border-[var(--border)] text-[var(--text-secondary)] hover:text-[var(--text-primary)] text-xs font-bold transition-all disabled:opacity-50"
              >
                <RefreshCw size={13} className={loading ? "animate-spin text-indigo-500" : ""} />
                <span>{loading ? "Syncing..." : "Refresh"}</span>
              </button>

              <Link
                href="/settings/ads"
                className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-bold shadow-md shadow-indigo-600/20 transition-all"
              >
                <Sliders size={13} />
                <span>Manage Accounts</span>
              </Link>
            </div>
          </div>

          {/* KPI Metrics Cards */}
          {loading ? (
            <CardGridSkeleton count={6} />
          ) : (
            <div className="grid grid-cols-2 lg:grid-cols-6 gap-3">
              {/* 1. Total Ad Spend */}
              <div className="glass-panel p-4 border border-[var(--border)] space-y-1">
                <span className="text-[10px] font-bold uppercase text-[var(--text-muted)] block">
                  {platformFilter === "ALL" ? "Blended Ad Spend" : `${platformFilter} Spend`}
                </span>
                <p className="text-2xl font-black text-[var(--text-primary)] font-mono">
                  ₹{(omniSummary.totalSpend ?? metrics.spend ?? 0).toLocaleString()}
                </p>
                <span className="text-[10px] text-slate-500">
                  Across {omniSummary.activeAccounts || 1} active accounts
                </span>
              </div>

              {/* 2. Attributed Revenue */}
              <div className="glass-panel p-4 border border-emerald-500/20 bg-emerald-500/5 space-y-1">
                <span className="text-[10px] font-bold uppercase text-emerald-600 dark:text-emerald-400 block">
                  Attributed Revenue
                </span>
                <p className="text-2xl font-black text-emerald-600 dark:text-emerald-400 font-mono">
                  ₹{(omniSummary.totalRevenue ?? metrics.revenue ?? 0).toLocaleString()}
                </p>
                <span className="text-[10px] text-emerald-700 dark:text-emerald-500">
                  Total Store: ₹{(omniSummary.storeRevenue || 0).toLocaleString()}
                </span>
              </div>

              {/* 3. Blended ROAS */}
              <div className="glass-panel p-4 border border-indigo-500/20 bg-indigo-500/5 space-y-1">
                <span className="text-[10px] font-bold uppercase text-indigo-600 dark:text-indigo-400 block">
                  Blended ROAS
                </span>
                <p className="text-2xl font-black text-indigo-600 dark:text-indigo-400 font-mono">
                  {(omniSummary.blendedRoas ?? metrics.roas ?? 0).toFixed(2)}x
                </p>
                <span className="text-[10px] text-indigo-700 dark:text-indigo-400">
                  MER: {(omniSummary.mer || 0).toFixed(2)}x
                </span>
              </div>

              {/* 4. Cost Per Acquisition (CPA) */}
              <div className="glass-panel p-4 border border-amber-500/20 bg-amber-500/5 space-y-1">
                <span className="text-[10px] font-bold uppercase text-amber-600 dark:text-amber-400 block">
                  Avg Cost / Purchase
                </span>
                <p className="text-2xl font-black text-amber-600 dark:text-amber-400 font-mono">
                  ₹{Math.round(omniSummary.blendedCpa ?? metrics.cpp ?? 0).toLocaleString()}
                </p>
                <span className="text-[10px] text-amber-700 dark:text-amber-500">
                  {omniSummary.totalPurchases ?? metrics.purchases ?? 0} Purchases
                </span>
              </div>

              {/* 5. Clicks & CPC */}
              <div className="glass-panel p-4 border border-cyan-500/20 bg-cyan-500/5 space-y-1">
                <span className="text-[10px] font-bold uppercase text-cyan-600 dark:text-cyan-400 block">
                  Link Clicks &amp; CPC
                </span>
                <p className="text-2xl font-black text-cyan-600 dark:text-cyan-400 font-mono">
                  {(omniSummary.totalClicks ?? metrics.clicks ?? 0).toLocaleString()}
                </p>
                <span className="text-[10px] text-cyan-700 dark:text-cyan-500">
                  CPC: ₹{(omniSummary.blendedCpc ?? metrics.cpc ?? 0).toFixed(2)}
                </span>
              </div>

              {/* 6. Impressions & CTR */}
              <div className="glass-panel p-4 border border-purple-500/20 bg-purple-500/5 space-y-1">
                <span className="text-[10px] font-bold uppercase text-purple-600 dark:text-purple-400 block">
                  Impressions &amp; CTR
                </span>
                <p className="text-2xl font-black text-purple-600 dark:text-purple-400 font-mono">
                  {(omniSummary.totalImpressions ?? metrics.impressions ?? 0).toLocaleString()}
                </p>
                <span className="text-[10px] text-purple-700 dark:text-purple-400">
                  CTR: {(omniSummary.blendedCtr ?? metrics.ctr ?? 0).toFixed(2)}%
                </span>
              </div>
            </div>
          )}

          {/* Connected Ad Accounts Status Grid */}
          <div className="glass-panel p-4 sm:p-5 space-y-4 rounded-2xl border border-[var(--border)]">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-sm font-bold text-[var(--text-primary)] flex items-center gap-2">
                  <Activity size={16} className="text-indigo-500" />
                  All Connected Ad Accounts Status ({omniAccounts.length})
                </h3>
                <p className="text-xs text-[var(--text-muted)] mt-0.5">
                  Real-time spend, ROAS, and live status for each marketing account.
                </p>
              </div>
              <Link
                href="/settings/ads"
                className="text-xs font-bold text-indigo-500 hover:text-indigo-400 flex items-center gap-1"
              >
                <span>+ Connect More Accounts</span>
              </Link>
            </div>

            {omniAccounts.length === 0 ? (
              <div className="text-center py-6 text-slate-500 text-xs">
                No ad accounts connected yet. Visit <Link href="/settings/ads" className="text-indigo-500 font-bold underline">All Ads Accounts Integration</Link> to connect Meta, Google, Snapchat, or Reddit ads.
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs border-collapse">
                  <thead>
                    <tr className="bg-[var(--bg-secondary)] text-[var(--text-secondary)] font-bold uppercase text-[10px] tracking-wider border-b border-[var(--border)]">
                      <th className="p-3">Platform</th>
                      <th className="p-3">Account Name</th>
                      <th className="p-3">Account ID</th>
                      <th className="p-3 text-center">Status</th>
                      <th className="p-3 text-right">Spend ({period})</th>
                      <th className="p-3 text-right">Revenue</th>
                      <th className="p-3 text-right">ROAS</th>
                      <th className="p-3 text-right">Purchases</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[var(--border)] font-medium">
                    {omniAccounts.map((acc: any) => (
                      <tr key={acc.id} className="hover:bg-slate-50/80 dark:hover:bg-[var(--surface-hover)]/50">
                        <td className="p-3 font-bold">
                          <span
                            className={`badge ${
                              acc.platform === "META"
                                ? "bg-blue-500/15 text-blue-400 border-blue-500/30"
                                : acc.platform === "GOOGLE"
                                ? "bg-amber-500/15 text-amber-400 border-amber-500/30"
                                : acc.platform === "SNAPCHAT"
                                ? "bg-yellow-500/15 text-yellow-400 border-yellow-500/30"
                                : "bg-orange-500/15 text-orange-400 border-orange-500/30"
                            } text-[9px]`}
                          >
                            {acc.platform}
                          </span>
                        </td>
                        <td className="p-3 font-bold text-[var(--text-primary)]">{acc.accountName}</td>
                        <td className="p-3 font-mono text-cyan-500 text-xs">{acc.accountId}</td>
                        <td className="p-3 text-center">
                          <span className="badge badge-success text-[9px]">{acc.status}</span>
                        </td>
                        <td className="p-3 text-right font-mono font-bold text-[var(--text-primary)]">
                          ₹{acc.spend.toLocaleString()}
                        </td>
                        <td className="p-3 text-right font-mono text-emerald-500">
                          ₹{acc.revenue.toLocaleString()}
                        </td>
                        <td className="p-3 text-right font-mono font-black text-indigo-400">
                          {acc.roas > 0 ? `${acc.roas}x` : "—"}
                        </td>
                        <td className="p-3 text-right font-mono text-[var(--text-secondary)]">
                          {acc.purchases}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          {/* Campaign-Level Insights (If Meta campaigns exist) */}
          {campaigns.length > 0 && (
            <div className="glass-panel p-4 sm:p-5 space-y-4 rounded-2xl border border-[var(--border)]">
              <h3 className="text-sm font-bold text-[var(--text-primary)] flex items-center gap-2">
                <BarChart3 size={16} className="text-blue-500" />
                Live Campaign Breakdown ({campaigns.length})
              </h3>

              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs border-collapse">
                  <thead>
                    <tr className="bg-[var(--bg-secondary)] text-[var(--text-secondary)] font-bold uppercase text-[10px] tracking-wider border-b border-[var(--border)]">
                      <th className="p-3">Campaign Name</th>
                      <th className="p-3 text-center">Status</th>
                      <th className="p-3 text-right">Spend</th>
                      <th className="p-3 text-right">Purchases</th>
                      <th className="p-3 text-right">ROAS</th>
                      <th className="p-3 text-right">CPC</th>
                      <th className="p-3 text-right">CTR</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[var(--border)] font-medium">
                    {campaigns.map((camp: any) => (
                      <tr key={camp.id} className="hover:bg-slate-50/80 dark:hover:bg-[var(--surface-hover)]/50">
                        <td className="p-3 font-semibold text-[var(--text-primary)]">{camp.name}</td>
                        <td className="p-3 text-center">
                          <span className={`badge ${camp.status === "ACTIVE" ? "badge-success" : "badge-neutral"} text-[9px]`}>
                            {camp.status}
                          </span>
                        </td>
                        <td className="p-3 text-right font-mono font-bold text-[var(--text-primary)]">
                          ₹{(camp.spend || 0).toLocaleString()}
                        </td>
                        <td className="p-3 text-right font-mono text-[var(--text-secondary)]">
                          {camp.purchases || 0}
                        </td>
                        <td className="p-3 text-right font-mono font-black text-indigo-400">
                          {camp.roas ? `${camp.roas.toFixed(2)}x` : "—"}
                        </td>
                        <td className="p-3 text-right font-mono text-slate-500">
                          ₹{camp.cpc ? camp.cpc.toFixed(2) : "0.00"}
                        </td>
                        <td className="p-3 text-right font-mono text-slate-500">
                          {camp.ctr ? `${camp.ctr.toFixed(2)}%` : "0.00%"}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      )}

      {/* ============================================================ */}
      {/* SECTION 2: FACEBOOK PIXEL & SERVER-SIDE CAPI                 */}
      {/* ============================================================ */}
      {activeSection === "pixel" && (
        <div className="space-y-6">
          {/* Header & Sync */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 glass-panel p-4">
            <div>
              <div className="flex items-center gap-2">
                <span className="text-sm font-bold text-[var(--text-primary)]">
                  Facebook Pixel &amp; Server-Side Conversions API (CAPI)
                </span>
                <span className={`badge ${isPixelConnected ? "badge-success" : "badge-neutral"}`}>
                  {isPixelConnected ? "✓ Active & Firing" : "Not Configured"}
                </span>
              </div>
              <p className="text-xs text-[var(--text-muted)] mt-0.5">
                Pixel ID: {pixelData?.pixel?.pixelId || "1205770778160110"} • Mode: Server-Side Real-Time Relay
              </p>
            </div>

            <div className="flex items-center gap-2">
              <button
                onClick={handleSyncPixel}
                disabled={pixelSyncing}
                className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-[var(--bg-secondary)] border border-[var(--border)] text-[var(--text-secondary)] hover:text-[var(--text-primary)] text-xs font-bold transition-all disabled:opacity-50"
              >
                <RefreshCw size={13} className={pixelSyncing ? "animate-spin text-pink-500" : ""} />
                <span>{pixelSyncing ? "Syncing..." : "Sync Events"}</span>
              </button>

              <button
                onClick={() => setShowPixelModal(true)}
                className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-pink-600 hover:bg-pink-500 text-white text-xs font-bold shadow-md shadow-pink-600/20 transition-all cursor-pointer"
              >
                <Sliders size={13} />
                <span>Configure Pixel</span>
              </button>
            </div>
          </div>

          {/* Test Event Dispatcher */}
          <div className="glass-panel p-4 sm:p-5 rounded-2xl border border-pink-500/20 bg-pink-500/5 space-y-3">
            <h3 className="text-sm font-bold text-[var(--text-primary)] flex items-center gap-2">
              <Send size={15} className="text-pink-500" />
              Send Live Test CAPI Event to Meta Graph API
            </h3>
            <p className="text-xs text-[var(--text-muted)]">
              Fire test events directly to verify your Meta Pixel test code and server-side tracking integrity.
            </p>

            <div className="flex flex-wrap items-center gap-2 pt-1">
              {["PageView", "ViewContent", "AddToCart", "InitiateCheckout", "Purchase"].map((evt) => (
                <button
                  key={evt}
                  onClick={() => handleSendTestEvent(evt)}
                  disabled={testSending}
                  className="px-3 py-1.5 rounded-lg bg-[var(--surface)] border border-[var(--border)] text-[var(--text-secondary)] hover:text-pink-500 dark:hover:text-pink-400 hover:border-pink-500 text-xs font-bold transition-all disabled:opacity-50"
                >
                  Fire {evt}
                </button>
              ))}
            </div>

            {testResult && (
              <div
                className={`p-3 rounded-xl text-xs font-mono border ${
                  testResult.success
                    ? "bg-emerald-500/10 border-emerald-500/30 text-emerald-400"
                    : "bg-red-500/10 border-red-500/30 text-red-400"
                }`}
              >
                {testResult.success
                  ? `✓ Test Event "${testResult.eventName}" successfully sent! Events Received: ${testResult.eventsReceived}`
                  : `✗ Error: ${testResult.error}`}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Pixel Config Modal */}
      {showPixelModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/75 backdrop-blur-sm animate-in fade-in">
          <div className="glass-panel border border-[var(--border)] rounded-2xl w-full max-w-md p-6 space-y-4 shadow-2xl bg-[var(--surface)] animate-in zoom-in-95">
            <div className="flex items-center justify-between border-b border-[var(--border)] pb-3">
              <h3 className="font-bold text-base text-[var(--text-primary)] flex items-center gap-2">
                <Radio className="text-pink-500" size={18} />
                Configure Meta Pixel &amp; CAPI
              </h3>
              <button
                onClick={() => setShowPixelModal(false)}
                className="p-1 rounded-lg text-slate-400 hover:text-slate-200 hover:bg-[var(--surface-hover)]"
              >
                <Plus className="rotate-45" size={18} />
              </button>
            </div>

            <form onSubmit={handleConnectPixel} className="space-y-3.5 text-xs">
              <div>
                <label className="block text-[var(--text-secondary)] font-bold uppercase text-[10px] mb-1">
                  Facebook Pixel ID
                </label>
                <input
                  type="text"
                  required
                  value={pixelForm.pixelId}
                  onChange={(e) => setPixelForm({ ...pixelForm, pixelId: e.target.value })}
                  className="w-full px-3 py-2 bg-[var(--bg-secondary)] border border-[var(--border)] rounded-xl text-[var(--text-primary)] font-mono focus:border-pink-500 focus:outline-none"
                />
              </div>

              <div>
                <label className="block text-[var(--text-secondary)] font-bold uppercase text-[10px] mb-1">
                  Meta System User Token
                </label>
                <input
                  type="password"
                  required
                  placeholder="Paste Meta access token..."
                  value={pixelForm.accessToken}
                  onChange={(e) => setPixelForm({ ...pixelForm, accessToken: e.target.value })}
                  className="w-full px-3 py-2 bg-[var(--bg-secondary)] border border-[var(--border)] rounded-xl text-[var(--text-primary)] font-mono focus:border-pink-500 focus:outline-none"
                />
              </div>

              <div>
                <label className="block text-[var(--text-secondary)] font-bold uppercase text-[10px] mb-1">
                  Test Event Code (Optional)
                </label>
                <input
                  type="text"
                  placeholder="e.g. TEST12345"
                  value={pixelForm.testEventCode}
                  onChange={(e) => setPixelForm({ ...pixelForm, testEventCode: e.target.value })}
                  className="w-full px-3 py-2 bg-[var(--bg-secondary)] border border-[var(--border)] rounded-xl text-[var(--text-primary)] font-mono focus:border-pink-500 focus:outline-none"
                />
              </div>

              {pixelErrorMsg && (
                <div className="p-3 rounded-xl bg-red-500/10 border border-red-500/30 text-red-400 text-xs">
                  {pixelErrorMsg}
                </div>
              )}

              <div className="flex items-center justify-end gap-2 pt-3 border-t border-[var(--border)]">
                <button
                  type="button"
                  onClick={() => setShowPixelModal(false)}
                  className="px-4 py-2 rounded-xl bg-slate-100 dark:bg-slate-800 text-[var(--text-secondary)] text-xs font-bold hover:bg-[var(--surface-hover)] transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={pixelConnecting}
                  className="px-4 py-2 rounded-xl bg-pink-600 hover:bg-pink-500 text-white text-xs font-bold shadow-md shadow-pink-600/20 transition-all disabled:opacity-50"
                >
                  {pixelConnecting ? "Saving..." : "Save Pixel Config"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
      </div>
    </RouteGuard>
  );
}
