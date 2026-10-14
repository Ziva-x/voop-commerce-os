"use client";

import { useState, useEffect } from "react";
import { Loader2, CheckCircle2, AtSign, Store, AlertTriangle, Trash2, X } from "lucide-react";
import { signOut } from "next-auth/react";
import { Input } from "@/components/ui/Input";

export function ProfileTab() {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState("");
  const [storeData, setStoreData] = useState<any>(null);
  const [voopStoreId, setVoopStoreId] = useState<string | null>(null);
  const [tenantId, setTenantId] = useState<string | null>(null);

  const [formData, setFormData] = useState({
    username: "",
    name: "",
    email: "",
    contactNo: "",
    businessName: "",
    address: "",
    city: "",
    state: "",
    pincode: "",
    country: "",
  });

  // Danger Zone — Permanent Account Deletion State
  const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false);
  const [deleteConfirmText, setDeleteConfirmText] = useState("");
  const [isDeleting, setIsDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState("");

  const handlePermanentAccountDeletion = async () => {
    if (deleteConfirmText.trim() !== "DELETE") return;
    setIsDeleting(true);
    setDeleteError("");

    try {
      const { appFetch } = await import("@/lib/api");
      const res = await appFetch("/api/account/delete", {
        method: "POST",
        body: JSON.stringify({ confirmation: "DELETE" }),
      });

      const json = await res.json();
      if (!res.ok) {
        throw new Error(json.error || "Failed to delete account");
      }

      // Clear tab-isolated sessionStorage ONLY. Never clear localStorage globally.
      if (typeof window !== "undefined") {
        sessionStorage.removeItem("voop_active_store_id");
        sessionStorage.removeItem("voop.activeStoreId");
        sessionStorage.removeItem("voop_active_voop_store_id");
        sessionStorage.removeItem("voop.voopStoreId");
        sessionStorage.removeItem("voop_active_public_store_ref");
        sessionStorage.removeItem("voop.publicStoreRef");
        sessionStorage.removeItem("voop.token");
        sessionStorage.removeItem("voop_session_token");
        sessionStorage.removeItem("voop.shopDomain");
        sessionStorage.removeItem("voop_active_shop_domain");
        sessionStorage.removeItem("voop.tabId");
        sessionStorage.removeItem("voop_tab_id");
      }

      try {
        await signOut({ redirect: false });
      } catch (_e) {}

      window.location.href = "/login?deleted=true";
    } catch (err: any) {
      setDeleteError(err.message || "Failed to permanently delete account.");
      setIsDeleting(false);
    }
  };

  useEffect(() => {
    async function fetchProfile() {
      try {
        const res = await fetch("/api/profile");
        const json = await res.json();
        if (json.success) {
          const p = json.profile;
          setFormData({
            username: p.username || "",
            name: p.name || "",
            email: p.email || "",
            contactNo: p.contactNo || "",
            businessName: p.businessName || "",
            address: p.address || "",
            city: p.city || "",
            state: p.state || "",
            pincode: p.pincode || "",
            country: p.country || "",
          });
          if (p.store) {
            setStoreData(p.store);
          }
          const vId = json.voopStoreId || p.voopStoreId || p.store?.voopStoreId;
          if (vId) {
            setVoopStoreId(vId);
          }
          const tId = json.tenantId || p.tenantId || p.store?.tenantId;
          if (tId) {
            setTenantId(tId);
          }
        }
      } catch (e) {
        console.error("Failed to load profile", e);
      } finally {
        setLoading(false);
      }
    }
    fetchProfile();
  }, []);

  const calculateCompletion = () => {
    const fields = [
      formData.username,
      formData.name,
      formData.email,
      formData.contactNo,
      formData.businessName,
      formData.address,
      formData.city,
      formData.state,
      formData.pincode,
      formData.country,
    ];
    const filled = fields.filter((val) => val && val.trim().length > 0).length;
    return Math.round((filled / fields.length) * 100);
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setSuccess(false);
    setError("");

    try {
      const res = await fetch("/api/profile", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(formData),
      });
      const json = await res.json();

      if (!res.ok) {
        throw new Error(json.error || "Failed to update profile");
      }

      setSuccess(true);
      if (json.profile?.username) {
        setFormData((prev) => ({ ...prev, username: json.profile.username }));
      }
      setTimeout(() => setSuccess(false), 3000);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64 text-slate-500">
        <Loader2 className="animate-spin" size={24} />
      </div>
    );
  }

  const completion = calculateCompletion();

  return (
    <div className="space-y-6">
      <div className="glass-panel p-6">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h2 className="text-xl font-bold text-[var(--text-primary)] flex items-center gap-2">
              Profile Information
              {formData.username && (
                <span className="text-xs px-2.5 py-0.5 rounded-full bg-cyan-500/10 border border-cyan-500/30 text-cyan-500 dark:text-cyan-400 font-mono font-bold">
                  @{formData.username}
                </span>
              )}
            </h2>
            <p className="text-sm text-[var(--text-secondary)] mt-1">
              Your unique VOOP account identity and business details.
            </p>
          </div>
          <div className="flex flex-col items-end">
            <span className="text-sm font-medium text-[var(--text-secondary)] mb-1">
              Profile Completion: {completion}%
            </span>
            <div className="w-32 h-2 bg-slate-800 rounded-full overflow-hidden">
              <div
                className="h-full bg-cyan-500 transition-all duration-500"
                style={{ width: `${completion}%` }}
              />
            </div>
            {completion === 100 && (
              <span className="text-[10px] text-emerald-500 dark:text-emerald-400 mt-1 flex items-center gap-1">
                <CheckCircle2 size={10} /> Profile complete
              </span>
            )}
          </div>
        </div>

        {error && (
          <div className="mb-6 p-3 bg-red-500/10 border border-red-500/20 rounded-lg text-red-400 text-sm">
            {error}
          </div>
        )}
        {success && (
          <div className="mb-6 p-3 bg-emerald-500/10 border border-emerald-500/20 rounded-lg text-emerald-400 text-sm flex items-center gap-2">
            <CheckCircle2 size={16} />
            Profile updated successfully
          </div>
        )}

        <form onSubmit={handleSave} className="space-y-5">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
            {/* Username */}
            <div className="space-y-2">
              <label className="text-xs font-semibold text-[var(--text-secondary)] uppercase tracking-wider flex items-center gap-1">
                VOOP Username <span className="text-cyan-500 dark:text-cyan-400 font-normal">(Unique Identity)</span>
              </label>
              <Input
                type="text"
                value={formData.username}
                onChange={(e) => setFormData({ ...formData, username: e.target.value.replace(/^@/, "") })}
                placeholder="username"
                required
                leadingIcon={<span className="text-[var(--text-muted)] font-mono text-sm font-bold">@</span>}
                className="font-mono"
              />
            </div>

            {/* Full Name */}
            <div className="space-y-2">
              <label className="text-xs font-semibold text-[var(--text-secondary)] uppercase tracking-wider">
                Full Name <span className="text-red-400">*</span>
              </label>
              <input
                type="text"
                value={formData.name}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                required
                className="w-full bg-[var(--surface)] border border-[var(--border)] rounded-lg px-4 py-2 text-sm text-[var(--text-primary)] focus:outline-none focus:border-[var(--accent)]/50 transition-colors"
              />
            </div>

            {/* Email */}
            <div className="space-y-2">
              <label className="text-xs font-semibold text-[var(--text-secondary)] uppercase tracking-wider">
                Email Address
              </label>
              <input
                type="email"
                value={formData.email}
                onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                className="w-full bg-[var(--surface)] border border-[var(--border)] rounded-lg px-4 py-2 text-sm text-[var(--text-primary)] focus:outline-none focus:border-[var(--accent)]/50 transition-colors"
              />
            </div>

            {/* Phone Number */}
            <div className="space-y-2">
              <label className="text-xs font-semibold text-[var(--text-secondary)] uppercase tracking-wider">
                Phone Number
              </label>
              <input
                type="tel"
                value={formData.contactNo}
                onChange={(e) => setFormData({ ...formData, contactNo: e.target.value })}
                className="w-full bg-[var(--surface)] border border-[var(--border)] rounded-lg px-4 py-2 text-sm text-[var(--text-primary)] focus:outline-none focus:border-[var(--accent)]/50 transition-colors"
                placeholder="+91..."
              />
            </div>
            
            {/* Business Name */}
            <div className="space-y-2 md:col-span-2">
              <label className="text-xs font-semibold text-[var(--text-secondary)] uppercase tracking-wider">
                Business Name
              </label>
              <input
                type="text"
                value={formData.businessName}
                onChange={(e) => setFormData({ ...formData, businessName: e.target.value })}
                className="w-full bg-[var(--surface)] border border-[var(--border)] rounded-lg px-4 py-2 text-sm text-[var(--text-primary)] focus:outline-none focus:border-[var(--accent)]/50 transition-colors"
              />
            </div>
          </div>

          {/* VOOP Store ID (Read-Only) */}
          {voopStoreId && (
            <div className="p-4 rounded-xl bg-[var(--surface)] border border-[var(--border)] flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-lg bg-cyan-500/10 border border-cyan-500/20 flex items-center justify-center text-cyan-400 font-black text-xs font-mono">
                  ID
                </div>
                <div>
                  <label className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider block">
                    VOOP Store ID
                  </label>
                  <div className="flex items-center gap-2 mt-0.5">
                    <span className="font-mono text-base font-bold text-cyan-400 tracking-wide select-all">
                      {voopStoreId}
                    </span>
                    <span className="text-[10px] px-2 py-0.5 rounded-full bg-cyan-500/10 border border-cyan-500/20 text-cyan-400 font-semibold">
                      Permanent
                    </span>
                  </div>
                  <p className="text-xs text-slate-400 mt-1">
                    Unique ID for your VOOP account &amp; connected Shopify store
                  </p>
                </div>
              </div>
            </div>
          )}

          {/* Tenant ID (Read-Only) */}
          {tenantId && (
            <div className="p-4 rounded-xl bg-[var(--surface)] border border-[var(--border)] flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-lg bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center text-emerald-400 font-black text-xs font-mono">
                  TID
                </div>
                <div>
                  <label className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider block">
                    Tenant ID
                  </label>
                  <div className="flex items-center gap-2 mt-0.5">
                    <span className="font-mono text-base font-bold text-emerald-400 tracking-wide select-all">
                      {tenantId}
                    </span>
                    <span className="text-[10px] px-2 py-0.5 rounded-full bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 font-semibold">
                      Permanent
                    </span>
                  </div>
                  <p className="text-xs text-slate-400 mt-1">
                    Isolated tenant boundary identifier for multi-tenant data partitioning
                  </p>
                </div>
              </div>
            </div>
          )}

          {/* Connected Store Info Card */}
          {storeData && (
            <div className="p-4 rounded-xl bg-[var(--surface)] border border-[var(--border)] flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-lg bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center text-emerald-400">
                  <Store size={20} />
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-bold text-[var(--text-primary)]">{storeData.storeName || storeData.shopDomain}</span>
                    <span className="text-[10px] px-2 py-0.5 rounded-full bg-emerald-500/15 border border-emerald-500/30 text-emerald-500 dark:text-emerald-400 font-semibold">
                      Connected Store
                    </span>
                  </div>
                  <p className="text-xs text-[var(--text-muted)] font-mono mt-0.5">{storeData.shopDomain}</p>
                </div>
              </div>
            </div>
          )}

          <div className="border-t border-[var(--border)] pt-5 mt-5">
            <h3 className="text-sm font-semibold text-[var(--text-primary)] mb-4">Business Address</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
              <div className="space-y-2 md:col-span-2">
                <label className="text-xs font-semibold text-[var(--text-secondary)] uppercase tracking-wider">
                  Address Line
                </label>
                <input
                  type="text"
                  value={formData.address}
                  onChange={(e) => setFormData({ ...formData, address: e.target.value })}
                  className="w-full bg-[var(--surface)] border border-[var(--border)] rounded-lg px-4 py-2 text-sm text-[var(--text-primary)] focus:outline-none focus:border-[var(--accent)]/50 transition-colors"
                />
              </div>

              <div className="space-y-2">
                <label className="text-xs font-semibold text-[var(--text-secondary)] uppercase tracking-wider">
                  City
                </label>
                <input
                  type="text"
                  value={formData.city}
                  onChange={(e) => setFormData({ ...formData, city: e.target.value })}
                  className="w-full bg-[var(--surface)] border border-[var(--border)] rounded-lg px-4 py-2 text-sm text-[var(--text-primary)] focus:outline-none focus:border-[var(--accent)]/50 transition-colors"
                />
              </div>

              <div className="space-y-2">
                <label className="text-xs font-semibold text-[var(--text-secondary)] uppercase tracking-wider">
                  State / Province
                </label>
                <input
                  type="text"
                  value={formData.state}
                  onChange={(e) => setFormData({ ...formData, state: e.target.value })}
                  className="w-full bg-[var(--surface)] border border-[var(--border)] rounded-lg px-4 py-2 text-sm text-[var(--text-primary)] focus:outline-none focus:border-[var(--accent)]/50 transition-colors"
                />
              </div>

              <div className="space-y-2">
                <label className="text-xs font-semibold text-[var(--text-secondary)] uppercase tracking-wider">
                  Pincode / ZIP
                </label>
                <input
                  type="text"
                  value={formData.pincode}
                  onChange={(e) => setFormData({ ...formData, pincode: e.target.value })}
                  className="w-full bg-[var(--surface)] border border-[var(--border)] rounded-lg px-4 py-2 text-sm text-[var(--text-primary)] focus:outline-none focus:border-[var(--accent)]/50 transition-colors"
                />
              </div>

              <div className="space-y-2">
                <label className="text-xs font-semibold text-[var(--text-secondary)] uppercase tracking-wider">
                  Country
                </label>
                <input
                  type="text"
                  value={formData.country}
                  onChange={(e) => setFormData({ ...formData, country: e.target.value })}
                  className="w-full bg-[var(--surface)] border border-[var(--border)] rounded-lg px-4 py-2 text-sm text-[var(--text-primary)] focus:outline-none focus:border-[var(--accent)]/50 transition-colors"
                />
              </div>
            </div>
          </div>

          <div className="pt-4 flex justify-end">
            <button
              type="submit"
              disabled={saving}
              className="px-6 py-2.5 rounded-lg bg-cyan-500 hover:bg-cyan-400 text-slate-950 font-bold text-sm shadow-lg shadow-cyan-500/20 transition-all flex items-center gap-2 disabled:opacity-50"
            >
              {saving ? (
                <>
                  <Loader2 size={16} className="animate-spin" />
                  Saving...
                </>
              ) : (
                "Save Changes"
              )}
            </button>
          </div>
        </form>
      </div>

      {/* Danger Zone — Permanent Account Deletion */}
      <div className="glass-panel p-6 border border-red-500/30 bg-red-950/10 rounded-xl space-y-4">
        <div className="flex items-center gap-2 text-red-400 font-bold uppercase tracking-wider text-xs">
          <AlertTriangle size={16} />
          Danger Zone
        </div>
        <div>
          <h3 className="text-lg font-bold text-white">Permanently Delete Account</h3>
          <p className="text-sm text-slate-400 mt-1 max-w-xl">
            This permanently deletes your VOOP account and its associated VOOP data. This action cannot be undone.
          </p>
        </div>
        <div className="pt-2">
          <button
            type="button"
            onClick={() => {
              setDeleteConfirmText("");
              setDeleteError("");
              setIsDeleteModalOpen(true);
            }}
            className="px-4 py-2.5 rounded-lg bg-red-600/90 hover:bg-red-600 text-white font-bold text-sm shadow-lg shadow-red-600/20 transition-all flex items-center gap-2"
          >
            <Trash2 size={16} />
            Delete VOOP Account
          </button>
        </div>
      </div>

      {/* Confirmation Modal */}
      {isDeleteModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="bg-[var(--surface)] border border-red-500/30 rounded-2xl max-w-md w-full p-6 space-y-5 shadow-2xl relative">
            <button
              onClick={() => setIsDeleteModalOpen(false)}
              className="absolute top-4 right-4 text-slate-400 hover:text-white transition-colors"
            >
              <X size={20} />
            </button>

            <div className="flex items-center gap-3 text-red-400">
              <div className="p-3 bg-red-500/10 rounded-xl border border-red-500/20">
                <AlertTriangle size={24} />
              </div>
              <div>
                <h3 className="text-lg font-bold text-white">Delete Account</h3>
                <p className="text-xs text-red-400">Step 1 of 2: Irreversible Action</p>
              </div>
            </div>

            <div className="p-3.5 bg-red-500/10 border border-red-500/20 rounded-lg text-sm text-red-300">
              <p className="font-semibold text-white mb-1">Warning:</p>
              This permanently deletes your VOOP account and its associated VOOP data. This action cannot be undone.
            </div>

            {deleteError && (
              <div className="p-3 bg-red-500/20 border border-red-500/40 rounded-lg text-xs text-red-400">
                {deleteError}
              </div>
            )}

            <div className="space-y-2">
              <label className="text-xs font-semibold text-slate-300">
                To confirm permanent deletion, type <span className="text-red-400 font-mono font-bold">DELETE</span> below:
              </label>
              <input
                type="text"
                value={deleteConfirmText}
                onChange={(e) => setDeleteConfirmText(e.target.value)}
                placeholder="DELETE"
                autoFocus
                className="w-full bg-[var(--bg-primary)] border border-[var(--border)] focus:border-red-500 rounded-lg px-4 py-2.5 text-sm text-white font-mono placeholder:text-slate-600 focus:outline-none transition-colors"
              />
            </div>

            <div className="flex gap-3 pt-2">
              <button
                type="button"
                onClick={() => setIsDeleteModalOpen(false)}
                disabled={isDeleting}
                className="flex-1 px-4 py-2.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 font-medium text-sm transition-colors"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handlePermanentAccountDeletion}
                disabled={deleteConfirmText !== "DELETE" || isDeleting}
                className="flex-1 px-4 py-2.5 rounded-lg bg-red-600 hover:bg-red-500 text-white font-bold text-sm shadow-lg shadow-red-600/20 transition-all flex items-center justify-center gap-2 disabled:opacity-40 disabled:cursor-not-allowed"
              >
                {isDeleting ? (
                  <>
                    <Loader2 size={16} className="animate-spin" />
                    Deleting...
                  </>
                ) : (
                  "Delete Account"
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
