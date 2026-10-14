"use client";

import React, { useState, useEffect } from "react";
import {
  Layers,
  Plus,
  RefreshCw,
  Trash2,
  Power,
  CheckCircle2,
  AlertCircle,
  ExternalLink,
  ShieldCheck,
  Zap,
  TrendingUp,
  X,
  Sliders,
  DollarSign,
  Activity,
} from "lucide-react";
import { TableSkeleton, CardGridSkeleton } from "@/components/LoadingSkeleton";
import { appFetch } from "@/lib/api";

interface AdAccount {
  id: string;
  platform: "META" | "GOOGLE" | "SNAPCHAT" | "REDDIT";
  accountId: string;
  accountName: string;
  currency: string;
  status: string;
  spend: number;
  revenue: number;
  roas: number;
  impressions: number;
  clicks: number;
  purchases: number;
  lastSyncedAt: string | null;
}

const PLATFORM_CONFIGS = {
  META: {
    name: "Meta Ads",
    subtitle: "Facebook & Instagram Ads (Multiple Accounts)",
    badgeColor: "bg-blue-500/15 text-blue-400 border-blue-500/30",
    bgGradient: "from-blue-600/10 to-indigo-600/10 border-blue-500/20",
    iconColor: "text-blue-400",
    idPlaceholder: "act_1234567890",
    idLabel: "Ad Account ID (act_...)",
    tokenLabel: "System User Access Token",
    tokenHelp: "Needs 'ads_read' and 'read_insights' permissions from Meta Business Settings.",
  },
  GOOGLE: {
    name: "Google Ads",
    subtitle: "Search, Shopping & Performance Max",
    badgeColor: "bg-amber-500/15 text-amber-400 border-amber-500/30",
    bgGradient: "from-amber-600/10 to-red-600/10 border-amber-500/20",
    iconColor: "text-amber-400",
    idPlaceholder: "123-456-7890",
    idLabel: "Google Customer ID (CID)",
    tokenLabel: "Developer Token / OAuth Refresh Token",
    tokenHelp: "Standard or Test Developer Token from Google Ads API Center.",
  },
  SNAPCHAT: {
    name: "Snapchat Ads",
    subtitle: "Snap Ads, Story Ads & Dynamic Product Ads",
    badgeColor: "bg-yellow-500/15 text-yellow-400 border-yellow-500/30",
    bgGradient: "from-yellow-600/10 to-amber-600/10 border-yellow-500/20",
    iconColor: "text-yellow-400",
    idPlaceholder: "snap_ad_account_id",
    idLabel: "Snapchat Ad Account ID",
    tokenLabel: "OAuth Access Token / Client Secret",
    tokenHelp: "Generated from Snapchat Business Manager Marketing API.",
  },
  REDDIT: {
    name: "Reddit Ads",
    subtitle: "Promoted Posts & Conversation Ads",
    badgeColor: "bg-orange-500/15 text-orange-400 border-orange-500/30",
    bgGradient: "from-orange-600/10 to-red-600/10 border-orange-500/20",
    iconColor: "text-orange-400",
    idPlaceholder: "t2_account_id",
    idLabel: "Reddit Ad Account ID",
    tokenLabel: "Client ID & Secret / Access Token",
    tokenHelp: "Configured from Reddit Ads Dashboard developer settings.",
  },
};

export default function AllAdsIntegrationPage() {
  const [accounts, setAccounts] = useState<AdAccount[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [modalOpen, setBulkModalOpen] = useState(false);
  const [selectedPlatform, setSelectedPlatform] = useState<"META" | "GOOGLE" | "SNAPCHAT" | "REDDIT">("META");

  // Form State
  const [form, setForm] = useState({
    accountName: "",
    accountId: "",
    accessToken: "",
    clientId: "",
    clientSecret: "",
    developerToken: "",
    organizationId: "",
    pixelId: "",
    currency: "INR",
  });
  const [submitting, setSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState("");
  const [successMsg, setSuccessMsg] = useState("");

  const fetchAccounts = async () => {
    try {
      setRefreshing(true);
      const res = await appFetch("/api/ads/accounts");
      const data = await res.json();
      if (data.success) {
        setAccounts(data.accounts || []);
      }
    } catch (err) {
      console.error("Failed to load ad accounts:", err);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    fetchAccounts();
  }, []);

  const handleOpenAddModal = (platform?: "META" | "GOOGLE" | "SNAPCHAT" | "REDDIT") => {
    if (platform) setSelectedPlatform(platform);
    setForm({
      accountName: "",
      accountId: "",
      accessToken: "",
      clientId: "",
      clientSecret: "",
      developerToken: "",
      organizationId: "",
      pixelId: "",
      currency: "INR",
    });
    setErrorMsg("");
    setSuccessMsg("");
    setBulkModalOpen(true);
  };

  const handleSaveAccount = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    setErrorMsg("");
    setSuccessMsg("");

    try {
      const res = await appFetch("/api/ads/accounts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          platform: selectedPlatform,
          accountName: form.accountName,
          accountId: form.accountId,
          accessToken: form.accessToken,
          clientId: form.clientId,
          clientSecret: form.clientSecret,
          developerToken: form.developerToken,
          organizationId: form.organizationId,
          pixelId: form.pixelId,
          currency: form.currency,
        }),
      });

      const json = await res.json();
      if (json.success) {
        setSuccessMsg(`Successfully connected ${selectedPlatform} account!`);
        setTimeout(() => {
          setBulkModalOpen(false);
          fetchAccounts();
        }, 700);
      } else {
        setErrorMsg(json.error || "Failed to connect account.");
      }
    } catch (err: any) {
      setErrorMsg(err.message || "Network error occurred.");
    } finally {
      setSubmitting(false);
    }
  };

  const handleToggleStatus = async (id: string, currentStatus: string) => {
    const nextStatus = currentStatus === "ACTIVE" ? "PAUSED" : "ACTIVE";
    try {
      await appFetch("/api/ads/accounts", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id, status: nextStatus }),
      });
      fetchAccounts();
    } catch (err) {
      console.error("Failed to toggle status:", err);
    }
  };

  const handleDisconnect = async (id: string, name: string) => {
    if (!confirm(`Are you sure you want to disconnect "${name}"?`)) return;
    try {
      await fetch(`/api/ads/accounts?id=${id}`, { method: "DELETE" });
      fetchAccounts();
    } catch (err) {
      console.error("Failed to delete account:", err);
    }
  };

  return (
    <div className="space-y-6 select-none animate-in fade-in duration-300">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2.5">
            <div className="p-2.5 rounded-xl bg-gradient-to-br from-indigo-500/20 to-purple-600/20 border border-indigo-500/30 text-indigo-400">
              <Layers size={22} />
            </div>
            <div>
              <h2 className="text-xl sm:text-2xl font-black text-[var(--text-primary)] tracking-tight flex items-center gap-2">
                All Ads Accounts Integration Hub
                <span className="badge badge-purple text-[10px]">Omnichannel</span>
              </h2>
              <p className="text-xs text-[var(--text-muted)] mt-0.5">
                Connect and manage multiple Meta Ad Accounts, Google Ads, Snapchat Ads, and Reddit Ads to track blended ROAS and live ad performance.
              </p>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={fetchAccounts}
            disabled={refreshing}
            className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-[var(--bg-secondary)] border border-[var(--border)] text-[var(--text-secondary)] hover:text-[var(--text-primary)] text-xs font-bold transition-all disabled:opacity-50"
          >
            <RefreshCw size={13} className={refreshing ? "animate-spin text-indigo-500" : ""} />
            <span>{refreshing ? "Syncing..." : "Sync All"}</span>
          </button>

          <button
            onClick={() => handleOpenAddModal()}
            className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-bold shadow-md shadow-indigo-600/20 transition-all cursor-pointer"
          >
            <Plus size={14} />
            <span>Connect Ad Account</span>
          </button>
        </div>
      </div>

      {/* Provider Quick Cards Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3.5">
        {(Object.keys(PLATFORM_CONFIGS) as Array<keyof typeof PLATFORM_CONFIGS>).map((key) => {
          const cfg = PLATFORM_CONFIGS[key];
          const count = accounts.filter((a) => a.platform === key).length;
          const activeCount = accounts.filter((a) => a.platform === key && a.status === "ACTIVE").length;

          return (
            <div
              key={key}
              className={`glass-panel p-4 rounded-2xl border bg-gradient-to-br ${cfg.bgGradient} flex flex-col justify-between space-y-3`}
            >
              <div className="flex items-start justify-between">
                <div>
                  <span className={`badge ${cfg.badgeColor} text-[10px] font-bold`}>
                    {cfg.name}
                  </span>
                  <p className="text-xs text-[var(--text-muted)] mt-1 font-medium">
                    {cfg.subtitle}
                  </p>
                </div>
                <div className={`p-2 rounded-xl bg-white/5 border border-white/10 ${cfg.iconColor}`}>
                  <Activity size={18} />
                </div>
              </div>

              <div className="flex items-center justify-between pt-2 border-t border-slate-200/40 dark:border-[var(--border)]/40">
                <span className="text-xs font-bold text-[var(--text-secondary)] font-mono">
                  {count > 0 ? `${activeCount} of ${count} Active` : "Not Connected"}
                </span>
                <button
                  onClick={() => handleOpenAddModal(key)}
                  className="text-xs font-bold text-indigo-500 hover:text-indigo-400 flex items-center gap-1 cursor-pointer"
                >
                  <Plus size={12} />
                  <span>{count > 0 ? "Add Another" : "Connect"}</span>
                </button>
              </div>
            </div>
          );
        })}
      </div>

      {/* Connected Accounts Table */}
      <div className="glass-panel overflow-hidden border border-[var(--border)] rounded-2xl shadow-xl space-y-3 p-4 sm:p-5">
        <div className="flex items-center justify-between pb-2 border-b border-[var(--border)]">
          <div>
            <h3 className="text-sm sm:text-base font-bold text-[var(--text-primary)] flex items-center gap-2">
              <ShieldCheck size={18} className="text-emerald-500" />
              Connected Ad Accounts &amp; Live Status ({accounts.length})
            </h3>
            <p className="text-xs text-[var(--text-muted)] mt-0.5">
              Live token connectivity, active campaigns, and sync status for each connected marketing channel.
            </p>
          </div>
        </div>

        {loading ? (
          <TableSkeleton rows={4} cols={7} />
        ) : accounts.length === 0 ? (
          <div className="text-center py-10 space-y-3">
            <div className="w-12 h-12 rounded-2xl bg-indigo-500/10 text-indigo-400 flex items-center justify-center mx-auto">
              <Layers size={24} />
            </div>
            <div>
              <p className="text-sm font-bold text-[var(--text-primary)]">No Ad Accounts Connected</p>
              <p className="text-xs text-slate-500 max-w-sm mx-auto mt-1">
                Connect your Meta, Google, Snapchat, or Reddit Ad accounts to automatically calculate blended ROAS and ad performance.
              </p>
            </div>
            <button
              onClick={() => handleOpenAddModal()}
              className="px-4 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-bold shadow-md shadow-indigo-600/20 cursor-pointer"
            >
              Connect First Ad Account
            </button>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs border-collapse">
              <thead>
                <tr className="bg-slate-100/80 dark:bg-[var(--surface)] text-[var(--text-secondary)] font-bold uppercase text-[10px] tracking-wider border-b border-[var(--border)]">
                  <th className="p-3.5">Platform</th>
                  <th className="p-3.5">Account Name &amp; Label</th>
                  <th className="p-3.5">Account ID</th>
                  <th className="p-3.5 text-center">Status</th>
                  <th className="p-3.5 text-right">Spend (Period)</th>
                  <th className="p-3.5 text-right">ROAS</th>
                  <th className="p-3.5 text-right">Last Synced</th>
                  <th className="p-3.5 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--border)] font-medium">
                {accounts.map((acc) => {
                  const cfg = PLATFORM_CONFIGS[acc.platform] || PLATFORM_CONFIGS.META;
                  return (
                    <tr key={acc.id} className="hover:bg-slate-50/80 dark:hover:bg-slate-900/50 transition-colors">
                      {/* Platform */}
                      <td className="p-3.5">
                        <span className={`badge ${cfg.badgeColor} text-[10px] font-bold`}>
                          {cfg.name}
                        </span>
                      </td>

                      {/* Name */}
                      <td className="p-3.5 font-bold text-[var(--text-primary)]">
                        {acc.accountName}
                      </td>

                      {/* ID */}
                      <td className="p-3.5 font-mono text-cyan-500 dark:text-cyan-400 text-xs">
                        {acc.accountId}
                      </td>

                      {/* Status */}
                      <td className="p-3.5 text-center">
                        <span
                          className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold ${
                            acc.status === "ACTIVE"
                              ? "bg-emerald-500/15 text-emerald-400 border border-emerald-500/30"
                              : "bg-slate-500/15 text-slate-400 border border-slate-500/30"
                          }`}
                        >
                          <span className={`w-1.5 h-1.5 rounded-full ${acc.status === "ACTIVE" ? "bg-emerald-400 animate-pulse" : "bg-slate-400"}`} />
                          {acc.status}
                        </span>
                      </td>

                      {/* Spend */}
                      <td className="p-3.5 text-right font-mono font-bold text-[var(--text-primary)]">
                        ₹{acc.spend.toLocaleString()}
                      </td>

                      {/* ROAS */}
                      <td className="p-3.5 text-right font-mono font-black text-indigo-400">
                        {acc.roas > 0 ? `${acc.roas}x` : "—"}
                      </td>

                      {/* Last Synced */}
                      <td className="p-3.5 text-right text-slate-500 font-mono text-[11px]">
                        {acc.lastSyncedAt ? new Date(acc.lastSyncedAt).toLocaleDateString() : "Never"}
                      </td>

                      {/* Actions */}
                      <td className="p-3.5 text-right">
                        <div className="flex items-center justify-end gap-1.5">
                          <button
                            onClick={() => handleToggleStatus(acc.id, acc.status)}
                            className="p-1.5 rounded-lg bg-slate-100 dark:bg-slate-800 text-[var(--text-secondary)] hover:text-[var(--text-primary)] transition-colors"
                            title={acc.status === "ACTIVE" ? "Pause Account Sync" : "Resume Account Sync"}
                          >
                            <Power size={13} className={acc.status === "ACTIVE" ? "text-emerald-400" : "text-slate-500"} />
                          </button>
                          <button
                            onClick={() => handleDisconnect(acc.id, acc.accountName)}
                            className="p-1.5 rounded-lg bg-red-500/10 text-red-400 hover:bg-red-500/20 transition-colors"
                            title="Disconnect Account"
                          >
                            <Trash2 size={13} />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Connect Account Modal */}
      {modalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/75 backdrop-blur-sm animate-in fade-in">
          <div className="glass-panel border border-[var(--border)] rounded-2xl w-full max-w-lg p-6 space-y-4 shadow-2xl bg-[var(--surface)] animate-in zoom-in-95">
            <div className="flex items-center justify-between border-b border-[var(--border)] pb-3">
              <div className="flex items-center gap-2">
                <Layers className="text-indigo-500" size={20} />
                <h3 className="font-bold text-base text-[var(--text-primary)]">
                  Connect Ad Platform Account
                </h3>
              </div>
              <button
                onClick={() => setBulkModalOpen(false)}
                className="p-1 rounded-lg text-slate-400 hover:text-slate-200 hover:bg-[var(--surface-hover)] transition-colors"
              >
                <X size={18} />
              </button>
            </div>

            {/* Platform Selector Tabs */}
            <div className="grid grid-cols-4 gap-1.5 p-1 bg-[var(--bg-secondary)] rounded-xl">
              {(Object.keys(PLATFORM_CONFIGS) as Array<keyof typeof PLATFORM_CONFIGS>).map((key) => (
                <button
                  key={key}
                  type="button"
                  onClick={() => setSelectedPlatform(key)}
                  className={`py-1.5 rounded-lg text-xs font-bold transition-all ${
                    selectedPlatform === key
                      ? "bg-indigo-600 text-white shadow-sm"
                      : "text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
                  }`}
                >
                  {PLATFORM_CONFIGS[key].name.split(" ")[0]}
                </button>
              ))}
            </div>

            <form onSubmit={handleSaveAccount} className="space-y-3.5 text-xs">
              {/* Account Label */}
              <div>
                <label className="block text-[var(--text-secondary)] font-bold uppercase text-[10px] mb-1">
                  Account Nickname / Brand Label
                </label>
                <input
                  type="text"
                  required
                  placeholder={`e.g. ${PLATFORM_CONFIGS[selectedPlatform].name} - Brand 1`}
                  value={form.accountName}
                  onChange={(e) => setForm({ ...form, accountName: e.target.value })}
                  className="w-full px-3 py-2 bg-[var(--bg-secondary)] border border-[var(--border)] rounded-xl text-[var(--text-primary)] font-medium focus:border-[var(--accent)] focus:outline-none"
                />
              </div>

              {/* Account ID */}
              <div>
                <label className="block text-[var(--text-secondary)] font-bold uppercase text-[10px] mb-1">
                  {PLATFORM_CONFIGS[selectedPlatform].idLabel}
                </label>
                <input
                  type="text"
                  required
                  placeholder={PLATFORM_CONFIGS[selectedPlatform].idPlaceholder}
                  value={form.accountId}
                  onChange={(e) => setForm({ ...form, accountId: e.target.value })}
                  className="w-full px-3 py-2 bg-[var(--bg-secondary)] border border-[var(--border)] rounded-xl text-[var(--text-primary)] font-mono focus:border-[var(--accent)] focus:outline-none"
                />
              </div>

              {/* Token / Access Credentials */}
              <div>
                <label className="block text-[var(--text-secondary)] font-bold uppercase text-[10px] mb-1">
                  {PLATFORM_CONFIGS[selectedPlatform].tokenLabel}
                </label>
                <input
                  type="password"
                  required
                  placeholder="Paste OAuth token or API key..."
                  value={form.accessToken}
                  onChange={(e) => setForm({ ...form, accessToken: e.target.value })}
                  className="w-full px-3 py-2 bg-[var(--bg-secondary)] border border-[var(--border)] rounded-xl text-[var(--text-primary)] font-mono focus:border-[var(--accent)] focus:outline-none"
                />
                <p className="text-[10px] text-slate-500 mt-1">
                  {PLATFORM_CONFIGS[selectedPlatform].tokenHelp}
                </p>
              </div>

              {/* Platform Specific Fields */}
              {selectedPlatform === "GOOGLE" && (
                <div>
                  <label className="block text-[var(--text-secondary)] font-bold uppercase text-[10px] mb-1">
                    Google Ads Developer Token (Optional)
                  </label>
                  <input
                    type="text"
                    placeholder="e.g. abc123xyz"
                    value={form.developerToken}
                    onChange={(e) => setForm({ ...form, developerToken: e.target.value })}
                    className="w-full px-3 py-2 bg-[var(--bg-secondary)] border border-[var(--border)] rounded-xl text-[var(--text-primary)] font-mono focus:border-[var(--accent)] focus:outline-none"
                  />
                </div>
              )}

              {selectedPlatform === "SNAPCHAT" && (
                <div>
                  <label className="block text-[var(--text-secondary)] font-bold uppercase text-[10px] mb-1">
                    Organization ID (Optional)
                  </label>
                  <input
                    type="text"
                    placeholder="e.g. snap_org_123"
                    value={form.organizationId}
                    onChange={(e) => setForm({ ...form, organizationId: e.target.value })}
                    className="w-full px-3 py-2 bg-[var(--bg-secondary)] border border-[var(--border)] rounded-xl text-[var(--text-primary)] font-mono focus:border-[var(--accent)] focus:outline-none"
                  />
                </div>
              )}

              {selectedPlatform === "META" && (
                <div>
                  <label className="block text-[var(--text-secondary)] font-bold uppercase text-[10px] mb-1">
                    Linked Meta Pixel ID (Optional)
                  </label>
                  <input
                    type="text"
                    placeholder="e.g. 123456789012345"
                    value={form.pixelId}
                    onChange={(e) => setForm({ ...form, pixelId: e.target.value })}
                    className="w-full px-3 py-2 bg-[var(--bg-secondary)] border border-[var(--border)] rounded-xl text-[var(--text-primary)] font-mono focus:border-[var(--accent)] focus:outline-none"
                  />
                </div>
              )}

              {/* Status Messages */}
              {errorMsg && (
                <div className="p-3 rounded-xl bg-red-500/10 border border-red-500/30 text-red-400 text-xs flex items-center gap-2">
                  <AlertCircle size={15} />
                  <span>{errorMsg}</span>
                </div>
              )}

              {successMsg && (
                <div className="p-3 rounded-xl bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 text-xs flex items-center gap-2">
                  <CheckCircle2 size={15} />
                  <span>{successMsg}</span>
                </div>
              )}

              <div className="flex items-center justify-end gap-2 pt-2 border-t border-[var(--border)]">
                <button
                  type="button"
                  onClick={() => setBulkModalOpen(false)}
                  className="px-4 py-2 rounded-xl bg-slate-100 dark:bg-slate-800 text-[var(--text-secondary)] text-xs font-bold hover:bg-[var(--surface-hover)] transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={submitting}
                  className="px-4 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-bold shadow-md shadow-indigo-600/20 transition-all disabled:opacity-50 cursor-pointer"
                >
                  {submitting ? "Verifying & Connecting..." : "Save & Connect"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
