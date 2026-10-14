"use client";

import { useState, useEffect, useCallback } from "react";
import { useSearchParams } from "next/navigation";
import { Loader2, Store, CheckCircle2, Clock, Globe, AlertTriangle, Link as LinkIcon, RefreshCw, ShieldCheck } from "lucide-react";
import { formatDate } from "@/lib/utils";
import { appFetch, getShopFromUrl } from "@/lib/api";
import { getAppEnvironment } from "@/lib/runtime-env";
import { Input } from "@/components/ui/Input";

export function StoreTab({ initialRole }: { initialRole?: string }) {
  const searchParams = useSearchParams();
  const shouldSync = searchParams.get("sync") === "true";

  const [loading, setLoading] = useState(true);
  const [storeData, setStoreData] = useState<any>(null);
  const [userRole, setUserRole] = useState<string>(initialRole || "ADMIN");
  const [storeError, setStoreError] = useState("");
  const [isEmbedded, setIsEmbedded] = useState(false);
  const [embeddedShop, setEmbeddedShop] = useState<string | null>(null);
  
  // Wipe and Resync state
  const [showWipeModal, setShowWipeModal] = useState(false);
  const [wiping, setWiping] = useState(false);
  const [wipeProgress, setWipeProgress] = useState("");
  const [wipeError, setWipeError] = useState("");

  // Connect Store state (for standalone web app only)
  const [showConnectModal, setShowConnectModal] = useState(false);
  const [connectDomain, setConnectDomain] = useState("");

  useEffect(() => {
    const env = getAppEnvironment();
    setIsEmbedded(env.isEmbedded);
    setEmbeddedShop(env.shop);
  }, []);

  const fetchStore = useCallback(async () => {
    setLoading(true);
    setStoreError("");
    try {
      // Use the AUTHORITATIVE account-scoped endpoint.
      // In embedded mode, resolves via App Bridge session token / shop context directly.
      // In standalone mode, resolves via NextAuth session.
      const res = await appFetch("/api/account/store");
      const json = await res.json();

      if (!res.ok) {
        if (res.status === 401) {
          setStoreData(null);
        } else {
          setStoreError(json.error || "Failed to load store data");
        }
      } else if (json.store) {
        setStoreData(json.store);
        if (json.role) setUserRole(json.role);

        // Auto-trigger sync if redirecting from a successful OAuth
        if (shouldSync && !wiping && json.store?.isConnected) {
          setShowWipeModal(true);
          handleWipeAndResync(true);
        }
      } else {
        if (json.role) setUserRole(json.role);
        // If inside Shopify Admin and no store record in DB yet, attempt auto token exchange
        if (typeof window !== "undefined" && window.shopify?.idToken) {
          try {
            const sessionToken = await window.shopify.idToken();
            const shop = getShopFromUrl();
            if (sessionToken && shop) {
              const exchangeRes = await appFetch("/api/shopify/auth/exchange", {
                method: "POST",
                body: JSON.stringify({ sessionToken, shop }),
              });
              if (exchangeRes.ok) {
                const secondRes = await appFetch("/api/account/store");
                const secondJson = await secondRes.json();
                if (secondJson.store) {
                  setStoreData(secondJson.store);
                  return;
                }
              }
            }
          } catch (exchangeErr) {
            console.warn("[StoreTab] Auto token exchange attempt:", exchangeErr);
          }
        }
        setStoreData(null);
      }
    } catch (e: any) {
      console.error("Failed to load store data", e);
      setStoreError("Failed to communicate with server.");
    } finally {
      setLoading(false);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [shouldSync]);

  useEffect(() => {
    fetchStore();
  }, [fetchStore]);

  const handleWipeAndResync = async (isInitialSync = false) => {
    setWiping(true);
    setWipeError("");
    setWipeProgress(isInitialSync ? "Preparing initial sync..." : "Initializing secure wipe...");

    try {
      if (!isInitialSync) {
        // Step 1: Wipe (Only if not initial sync)
        setWipeProgress("Wiping store data...");
        const wipeRes = await appFetch("/api/shopify/wipe", { method: "POST" });
        const wipeJson = await wipeRes.json();
        
        if (!wipeRes.ok || !wipeJson.success) {
          throw new Error(wipeJson.error || "Failed to wipe store data");
        }
      }

      // Step 2: Re-sync
      setWipeProgress(isInitialSync ? "Syncing products & orders from Shopify..." : "Connecting to Shopify & Re-syncing...");
      const syncRes = await appFetch("/api/shopify/sync", {
        method: "POST",
        body: JSON.stringify({ type: "all" }),
      });
      const syncJson = await syncRes.json();
      
      if (!syncRes.ok || !syncJson.success) {
        throw new Error(syncJson.error || "Failed to sync store data");
      }

      setWipeProgress("Finalizing...");
      await fetchStore();
      
      // Clean up URL to remove ?sync=true
      if (isInitialSync) {
        window.history.replaceState({}, document.title, window.location.pathname + "?tab=store");
      }
      setShowWipeModal(false);
    } catch (e: any) {
      console.error(e);
      setWipeError(e.message || "An unexpected error occurred.");
    } finally {
      setWiping(false);
      setWipeProgress("");
    }
  };

  // Reconnect handler: breaks out of iframe to the top window
  const handleReconnect = () => {
    const shop = storeData?.shopDomain || embeddedShop || getShopFromUrl();
    if (!shop) return;
    const authUrl = `/api/shopify/auth?shop=${encodeURIComponent(shop)}`;
    if (typeof window !== "undefined") {
      window.open(authUrl, "_top");
    }
  };

  // Standalone web app connect handler
  const handleConnectStore = (e: React.FormEvent) => {
    e.preventDefault();
    if (!connectDomain) return;

    let clean = connectDomain.toLowerCase().trim();
    clean = clean.replace(/^https?:\/\//, "");
    clean = clean.replace(/\/.*$/, "");
    if (!clean.endsWith(".myshopify.com")) {
      clean = `${clean}.myshopify.com`;
    }

    // Top-level navigation
    if (typeof window !== "undefined") {
      window.open(`/api/shopify/auth?shop=${clean}`, "_top");
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64 text-slate-500">
        <Loader2 className="animate-spin" size={24} />
      </div>
    );
  }

  const needsReconnect = storeData && !storeData.isConnected;

  return (
    <div className="space-y-6 max-w-3xl">
      <div className="glass-panel p-6">
        <div className="mb-6 flex items-start justify-between gap-4">
          <div>
            <h2 className="text-xl font-bold text-[var(--text-primary)]">Shopify Store Details</h2>
            <p className="text-sm text-[var(--text-secondary)] mt-1">
              Information about your connected Shopify store.
            </p>
          </div>
          <button
            onClick={fetchStore}
            disabled={loading}
            title="Refresh store connection"
            className="flex items-center gap-1.5 px-3 py-2 rounded-lg bg-[var(--surface-hover)] hover:bg-[var(--surface-active)] text-[var(--text-primary)] border border-[var(--border)] text-xs font-semibold shrink-0 transition-all cursor-pointer"
          >
            <RefreshCw size={13} className={loading ? "animate-spin text-sky-400" : ""} />
            Refresh
          </button>
        </div>

        {storeError && (
          <div className="mb-6 p-4 bg-red-500/10 border border-red-500/20 rounded-xl text-red-400 text-sm">
            {storeError}
          </div>
        )}

        {!storeData ? (
          isEmbedded ? (
            /* Inside Shopify Admin: Automatically show connected state from App Bridge */
            <div className="p-8 text-center bg-[var(--surface)] rounded-xl border border-[var(--border)] flex flex-col items-center">
              <Store className="h-12 w-12 text-emerald-400 mb-4" />
              <h3 className="text-lg font-bold text-[var(--text-primary)] mb-1">
                {embeddedShop || "Shopify Store"}
              </h3>
              <div className="inline-flex items-center gap-2 px-3 py-1 bg-emerald-500/10 border border-emerald-500/20 rounded-full text-emerald-400 text-xs font-medium my-3">
                <CheckCircle2 size={14} /> Connected via Shopify Admin
              </div>
              <p className="text-[var(--text-secondary)] text-xs max-w-md mb-4">
                This store is authenticated through Shopify App Bridge session tokens.
              </p>
              <button
                onClick={fetchStore}
                className="px-4 py-2 bg-[var(--surface-hover)] hover:bg-[var(--surface-active)] text-[var(--text-primary)] text-xs font-semibold rounded-lg border border-[var(--border)] flex items-center gap-2 cursor-pointer"
              >
                <RefreshCw size={13} className={loading ? "animate-spin text-emerald-400" : ""} />
                Verify Connection
              </button>
            </div>
          ) : userRole === "STAFF" ? (
            /* Standalone VOOP Web App for STAFF: Read-only notice, no connect button */
            <div className="p-8 text-center bg-[var(--surface)] rounded-xl border border-[var(--border)] flex flex-col items-center">
              <Store className="h-12 w-12 text-[var(--text-muted)] mb-4" />
              <h3 className="text-lg font-medium text-[var(--text-primary)] mb-1">No Store Connected</h3>
              <p className="text-[var(--text-secondary)] text-sm max-w-md mb-2">
                No Shopify store is currently connected to this VOOP account.
              </p>
              <p className="text-[var(--text-muted)] text-xs max-w-md">
                Please contact your store administrator to connect Shopify.
              </p>
            </div>
          ) : (
            /* Standalone VOOP Web App for ADMIN: Prompt to connect store */
            <div className="p-8 text-center bg-[var(--surface)] rounded-xl border border-[var(--border)] flex flex-col items-center">
              <Store className="h-12 w-12 text-[var(--text-muted)] mb-4" />
              <h3 className="text-lg font-medium text-[var(--text-primary)] mb-1">No Store Connected</h3>
              <p className="text-[var(--text-secondary)] text-sm max-w-md mb-6">
                Your Shopify store isn&apos;t connected to this VOOP account yet. Connect it now to start syncing your data.
              </p>
              <button
                onClick={() => setShowConnectModal(true)}
                className="px-5 py-2.5 bg-[var(--accent)] hover:bg-[var(--accent-hover)] text-white font-bold text-sm rounded-xl transition-colors shadow-lg shadow-blue-500/20 cursor-pointer"
              >
                Connect Shopify Store
              </button>
            </div>
          )
        ) : (
          <div className="space-y-6">
            <div className="p-5 bg-[var(--surface)] rounded-xl border border-[var(--border)] flex items-start sm:items-center justify-between flex-col sm:flex-row gap-4">
              <div className="flex items-center gap-4">
                <div className="w-12 h-12 rounded-lg bg-[#95BF47]/10 flex items-center justify-center border border-[#95BF47]/20 shrink-0">
                  <Store className="text-[#95BF47]" size={24} />
                </div>
                <div>
                  <h3 className="text-lg font-bold text-[var(--text-primary)]">{storeData.storeName || "Shopify Store"}</h3>
                  <div className="flex items-center gap-1.5 text-sm text-[var(--text-secondary)] mt-0.5">
                    <Globe size={14} />
                    <a 
                      href={`https://${storeData.shopDomain}`} 
                      target="_blank" 
                      rel="noopener noreferrer"
                      className="hover:text-[var(--accent)] transition-colors font-mono text-xs"
                    >
                      {storeData.shopDomain}
                    </a>
                  </div>
                </div>
              </div>
              
              <div className="flex flex-col sm:items-end gap-2 self-start sm:self-auto">
                {needsReconnect ? (
                  <div className="flex items-center gap-2 px-3 py-1.5 bg-amber-500/10 border border-amber-500/20 rounded-full text-amber-500 text-sm font-medium">
                    <AlertTriangle size={16} />
                    Needs Reconnect
                  </div>
                ) : (
                  <div className="flex items-center gap-2 px-3 py-1.5 bg-emerald-500/10 border border-emerald-500/20 rounded-full text-emerald-400 text-sm font-medium">
                    <CheckCircle2 size={16} />
                    Connected
                  </div>
                )}
                {needsReconnect && userRole !== "STAFF" && (
                  <button
                    onClick={handleReconnect}
                    className="text-xs font-semibold text-amber-500 hover:text-amber-400 underline underline-offset-2 cursor-pointer"
                  >
                    Reconnect Shopify
                  </button>
                )}
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="p-4 bg-[var(--surface)] rounded-xl border border-[var(--border)] flex flex-col gap-1">
                <span className="text-xs text-[var(--text-muted)] font-semibold uppercase tracking-wider flex items-center gap-1.5">
                  <Store size={14} className="text-cyan-500" /> VOOP Store ID
                </span>
                <div className="flex items-center gap-2 mt-0.5">
                  <span className="text-sm text-cyan-600 dark:text-cyan-400 font-mono font-bold select-all">
                    {storeData.voopStoreId || "Pending"}
                  </span>
                  <span className="text-[10px] px-1.5 py-0.5 rounded bg-cyan-500/10 border border-cyan-500/20 text-cyan-600 dark:text-cyan-400 font-semibold">
                    Permanent
                  </span>
                </div>
              </div>

              <div className="p-4 bg-[var(--surface)] rounded-xl border border-[var(--border)] flex flex-col gap-1">
                <span className="text-xs text-[var(--text-muted)] font-semibold uppercase tracking-wider flex items-center gap-1.5">
                  <ShieldCheck size={14} className="text-emerald-500" /> Tenant ID
                </span>
                <div className="flex items-center gap-2 mt-0.5">
                  <span className="text-sm text-emerald-600 dark:text-emerald-400 font-mono font-bold select-all">
                    {storeData.tenantId || "Pending"}
                  </span>
                  <span className="text-[10px] px-1.5 py-0.5 rounded bg-emerald-500/10 border border-emerald-500/20 text-emerald-600 dark:text-emerald-400 font-semibold">
                    Permanent
                  </span>
                </div>
              </div>

              <div className="p-4 bg-[var(--surface)] rounded-xl border border-[var(--border)] flex flex-col gap-1">
                <span className="text-xs text-[var(--text-muted)] font-semibold uppercase tracking-wider flex items-center gap-1.5">
                  <Clock size={14} /> Last Full Sync
                </span>
                <span className="text-sm text-[var(--text-primary)] font-medium">
                  {storeData.lastFullSyncAt ? formatDate(storeData.lastFullSyncAt) : "Never"}
                </span>
              </div>
              
              <div className="p-4 bg-[var(--surface)] rounded-xl border border-[var(--border)] flex flex-col gap-1">
                <span className="text-xs text-[var(--text-muted)] font-semibold uppercase tracking-wider flex items-center gap-1.5">
                  <Clock size={14} /> Last Products Sync
                </span>
                <span className="text-sm text-[var(--text-primary)] font-medium">
                  {storeData.lastProductSyncAt ? formatDate(storeData.lastProductSyncAt) : "Never"}
                </span>
              </div>

              <div className="p-4 bg-[var(--surface)] rounded-xl border border-[var(--border)] flex flex-col gap-1">
                <span className="text-xs text-[var(--text-muted)] font-semibold uppercase tracking-wider flex items-center gap-1.5">
                  <Clock size={14} /> Last Orders Sync
                </span>
                <span className="text-sm text-[var(--text-primary)] font-medium">
                  {storeData.lastOrderSyncAt ? formatDate(storeData.lastOrderSyncAt) : "Never"}
                </span>
              </div>
              
              <div className="p-4 bg-[var(--surface)] rounded-xl border border-[var(--border)] flex flex-col gap-1">
                <span className="text-xs text-[var(--text-muted)] font-semibold uppercase tracking-wider flex items-center gap-1.5">
                  Currency
                </span>
                <span className="text-sm text-[var(--text-primary)] font-medium">
                  {storeData.currency || "INR"}
                </span>
              </div>
            </div>

            {userRole !== "STAFF" && (
              <div className="mt-8 pt-6 border-t border-[var(--border)]">
                <h4 className="text-sm font-semibold text-[var(--text-primary)] mb-2 flex items-center gap-2">
                  <AlertTriangle size={16} className="text-red-500" />
                  Danger Zone
                </h4>
                <p className="text-sm text-[var(--text-secondary)] mb-4">
                  If you need to completely wipe the local synced data and resync from Shopify from scratch, use this button.
                </p>
                <button
                  onClick={() => setShowWipeModal(true)}
                  className="px-4 py-2 bg-red-500/10 hover:bg-red-500/20 text-red-400 border border-red-500/20 rounded-lg text-sm font-medium transition-colors cursor-pointer"
                >
                  Wipe &amp; Re-Sync Store Data
                </button>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Connect Store Modal (Standalone web app only) */}
      {!isEmbedded && showConnectModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4">
          <form onSubmit={handleConnectStore} className="bg-[var(--surface)] border border-[var(--border)] rounded-2xl p-6 max-w-md w-full shadow-2xl relative">
            <h3 className="text-xl font-bold text-[var(--text-primary)] mb-2 flex items-center gap-2">
              <LinkIcon className="text-[var(--accent)]" size={20} /> Connect Shopify Store
            </h3>
            <p className="text-[var(--text-secondary)] text-sm mb-6">
              Enter your Shopify store address to connect it with VOOP. You will be redirected to Shopify to authorize the connection.
            </p>

            <div className="space-y-2 mb-6">
              <label className="text-xs font-semibold text-[var(--text-secondary)] uppercase tracking-wider">
                Shopify Store Domain
              </label>
              <Input
                required
                placeholder="e.g. your-store.myshopify.com"
                value={connectDomain}
                onChange={(e) => setConnectDomain(e.target.value)}
                leadingIcon={<Globe size={16} />}
                className="font-mono py-3"
              />
            </div>

            <div className="flex gap-3 justify-end">
              <button
                type="button"
                onClick={() => setShowConnectModal(false)}
                className="px-5 py-2.5 rounded-xl text-sm font-medium text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--surface-hover)] transition-colors cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={!connectDomain}
                className="px-5 py-2.5 rounded-xl text-sm font-bold bg-[var(--accent)] hover:bg-[var(--accent-hover)] text-white shadow-lg shadow-blue-500/20 transition-all disabled:opacity-50 cursor-pointer"
              >
                Connect Store
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Wipe Confirmation / Sync Modal */}
      {showWipeModal && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
          <div className="bg-[var(--surface)] border border-[var(--border)] rounded-2xl p-6 max-w-md w-full shadow-2xl relative">
            <h3 className="text-xl font-bold text-[var(--text-primary)] mb-2 flex items-center gap-2">
              {wiping && shouldSync ? (
                <><Store className="text-[var(--accent)]" /> Initial Sync</>
              ) : (
                <><AlertTriangle className="text-red-500" /> Confirm Wipe</>
              )}
            </h3>
            
            {!wiping && (
              <p className="text-[var(--text-secondary)] text-sm mb-6">
                Are you sure you want to completely wipe all synced Shopify products, variants, orders, and fulfillments? This action will immediately fetch fresh data from Shopify.
              </p>
            )}

            {wipeError && (
              <div className="mb-6 p-3 bg-red-500/10 border border-red-500/20 rounded-lg text-red-400 text-sm">
                {wipeError}
              </div>
            )}

            {wiping && (
              <div className="mb-6 p-4 bg-[var(--bg-secondary)] rounded-lg flex items-center gap-3 border border-[var(--border)]">
                <Loader2 className="animate-spin text-[var(--accent)]" size={20} />
                <span className="text-sm text-[var(--text-primary)] font-medium">{wipeProgress}</span>
              </div>
            )}

            {!wiping && (
              <div className="flex gap-3 justify-end">
                <button
                  onClick={() => setShowWipeModal(false)}
                  className="px-4 py-2 rounded-lg text-sm font-medium text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--surface-hover)] transition-colors cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  onClick={() => handleWipeAndResync(false)}
                  className="px-4 py-2 rounded-lg text-sm font-bold bg-red-500 hover:bg-red-400 text-white shadow-lg shadow-red-500/20 transition-all flex items-center gap-2"
                >
                  Wipe &amp; Re-Sync
                </button>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
