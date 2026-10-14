"use client";

import { useEffect, useState } from "react";
import {
  Truck,
  ShieldCheck,
  CheckCircle2,
  RefreshCw,
  ExternalLink,
  Lock,
  Settings,
  X,
  Check,
  Eye,
  EyeOff,
  PowerOff,
} from "lucide-react";
import { appFetch } from "@/lib/api";
import { RouteGuard } from "@/components/auth/RouteGuard";

interface CourierField {
  key: string;
  label: string;
  type: "text" | "password" | "select";
  required: boolean;
  placeholder?: string;
  isSecret?: boolean;
  helpText?: string;
  options?: Array<{ label: string; value: string }>;
}

interface CourierIntegration {
  courier: string;
  name: string;
  description: string;
  fields: CourierField[];
  isConnected: boolean;
  status: "CONNECTED" | "NOT_CONNECTED" | "FAILED" | "DISCONNECTED";
  environment: string;
  lastTestedAt: string | null;
  lastSuccessfulSyncAt: string | null;
  lastError: string | null;
  credentials: Record<string, any>;
}

// Brand metadata for each courier
const COURIER_META: Record<
  string,
  {
    name: string;
    accentColor: string;
    websiteUrl: string;
  }
> = {
  DELHIVERY: {
    name: "Delhivery",
    accentColor: "text-red-500",
    websiteUrl: "https://www.delhivery.com",
  },
  BLUEDART: {
    name: "Blue Dart",
    accentColor: "text-blue-500",
    websiteUrl: "https://www.bluedart.com",
  },
  XPRESSBEES: {
    name: "XpressBees",
    accentColor: "text-amber-500",
    websiteUrl: "https://www.xpressbees.com",
  },
  ECOM_EXPRESS: {
    name: "Ecom Express",
    accentColor: "text-purple-500",
    websiteUrl: "https://www.ecomexpress.in",
  },
  EKART: {
    name: "Ekart Logistics",
    accentColor: "text-yellow-500",
    websiteUrl: "https://ekartlogistics.com",
  },
  SHADOWFAX: {
    name: "Shadowfax",
    accentColor: "text-emerald-500",
    websiteUrl: "https://www.shadowfax.in",
  },
};

export function CouriersView() {
  const [integrations, setIntegrations] = useState<CourierIntegration[]>([]);
  const [voopStoreId, setVoopStoreId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [activeModalCourier, setActiveModalCourier] = useState<CourierIntegration | null>(null);
  const [formCredentials, setFormCredentials] = useState<Record<string, any>>({});
  const [formEnvironment, setFormEnvironment] = useState<string>("PRODUCTION");
  const [showSecrets, setShowSecrets] = useState<Record<string, boolean>>({});
  const [saving, setSaving] = useState(false);
  const [testingCourier, setTestingCourier] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<{
    text: string;
    type: "success" | "error" | "info";
  } | null>(null);

  const loadData = async () => {
    try {
      const res = await appFetch("/api/couriers");
      const json = await res.json();
      if (json.success) {
        setIntegrations(json.integrations || []);
        setVoopStoreId(json.voopStoreId || null);
      } else {
        setFeedback({ text: json.error || "Failed to load courier APIs", type: "error" });
      }
    } catch (err: any) {
      setFeedback({ text: err.message || "Failed to load courier APIs", type: "error" });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  const handleOpenModal = (item: CourierIntegration) => {
    setActiveModalCourier(item);
    setFormCredentials({ ...item.credentials });
    setFormEnvironment(item.environment || "PRODUCTION");
    setShowSecrets({});
    setFeedback(null);
  };

  const handleCloseModal = () => {
    setActiveModalCourier(null);
    setFormCredentials({});
  };

  const handleFieldChange = (key: string, value: any) => {
    setFormCredentials((prev) => ({
      ...prev,
      [key]: value,
    }));
  };

  const toggleSecretVisibility = (key: string) => {
    setShowSecrets((prev) => ({
      ...prev,
      [key]: !prev[key],
    }));
  };

  // Test connection directly from courier card or modal
  const handleTestConnection = async (courierKey: string, credentialsOverride?: Record<string, any>) => {
    setTestingCourier(courierKey);
    setFeedback(null);
    try {
      const res = await appFetch("/api/couriers/test", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          courier: courierKey,
          credentials: credentialsOverride || formCredentials,
          environment: formEnvironment,
        }),
      });
      const json = await res.json();
      if (json.success) {
        setFeedback({
          text: `✓ ${json.message || "Connection successful!"}`,
          type: "success",
        });
        await loadData();
      } else {
        setFeedback({
          text: `✕ Connection failed: ${json.message || "Invalid credentials"}`,
          type: "error",
        });
      }
    } catch (err: any) {
      setFeedback({ text: `Test error: ${err.message}`, type: "error" });
    } finally {
      setTestingCourier(null);
    }
  };

  const handleSaveModal = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!activeModalCourier) return;

    setSaving(true);
    setFeedback(null);
    try {
      const res = await appFetch("/api/couriers", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          courier: activeModalCourier.courier,
          credentials: formCredentials,
          environment: formEnvironment,
        }),
      });
      const json = await res.json();
      if (json.success) {
        setFeedback({
          text: `✓ ${activeModalCourier.name} configuration saved securely (AES-256 encrypted).`,
          type: "success",
        });
        handleCloseModal();
        await loadData();
      } else {
        setFeedback({ text: json.error || "Failed to save configuration.", type: "error" });
      }
    } catch (err: any) {
      setFeedback({ text: err.message, type: "error" });
    } finally {
      setSaving(false);
    }
  };

  const handleDisconnect = async (courierKey: string, courierName: string) => {
    if (!confirm(`Are you sure you want to disconnect ${courierName}? Tracking updates from this partner will pause.`)) {
      return;
    }

    try {
      const res = await appFetch(`/api/couriers?courier=${encodeURIComponent(courierKey)}`, {
        method: "DELETE",
      });
      const json = await res.json();
      if (json.success) {
        setFeedback({ text: `${courierName} disconnected successfully.`, type: "info" });
        await loadData();
      } else {
        setFeedback({ text: json.error || "Failed to disconnect.", type: "error" });
      }
    } catch (err: any) {
      setFeedback({ text: err.message, type: "error" });
    }
  };

  const connectedCount = integrations.filter((i) => i.isConnected).length;

  return (
    <RouteGuard requiredPermission="courier_api.view" moduleName="All Courier APIs">
      <div className="space-y-6 max-w-6xl pb-16">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <h2 className="text-2xl font-bold text-[var(--text-primary)] tracking-tight flex items-center gap-2.5">
              <Truck className="text-[var(--accent)]" size={26} /> All Courier APIs
            </h2>
            <p className="text-xs text-[var(--text-secondary)] mt-1 max-w-2xl">
              Connect courier partner APIs to automatically fetch shipment tracking, AWB status, delivery events and courier data into VOOP.
            </p>
          </div>

          {/* Permanent VOOP Store ID Tenant Tag */}
          <div className="flex items-center gap-2.5 bg-[var(--surface)] border border-[var(--border)] px-3.5 py-2 rounded-xl text-xs shadow-xs">
            <ShieldCheck size={16} className="text-[var(--accent)] shrink-0" />
            <div className="flex flex-col">
              <span className="text-[10px] text-[var(--text-muted)] uppercase font-mono tracking-wider font-semibold">Tenant Isolation</span>
              <span className="font-mono font-bold text-[var(--text-primary)]">{voopStoreId || "VOOP Store"}</span>
            </div>
            <span className="ml-2 px-2 py-0.5 rounded text-[10px] font-bold font-mono bg-[var(--accent-soft)] text-[var(--accent)] border border-[var(--accent-border)]">
              {connectedCount} of 6 Connected
            </span>
          </div>
        </div>

        {/* Global Feedback Banner */}
        {feedback && (
          <div
            className={`p-3.5 rounded-xl text-xs font-medium flex items-center justify-between shadow-sm transition-all animate-in fade-in slide-in-from-top-2 ${
              feedback.type === "success"
                ? "bg-[var(--success-soft)] border border-[var(--success)]/40 text-[var(--success)]"
                : feedback.type === "error"
                ? "bg-[var(--error-soft)] border border-[var(--error)]/40 text-[var(--error)]"
                : "bg-[var(--accent-soft)] border border-[var(--accent)]/40 text-[var(--accent)]"
            }`}
          >
            <span className="flex items-center gap-2">{feedback.text}</span>
            <button
              onClick={() => setFeedback(null)}
              className="text-[var(--text-muted)] hover:text-[var(--text-primary)] p-1 rounded-md transition-colors"
            >
              <X size={14} />
            </button>
          </div>
        )}

        {/* Security Guarantee Notice */}
        <div className="p-3.5 bg-[var(--surface)] border border-[var(--border)] rounded-xl flex items-center justify-between text-xs text-[var(--text-secondary)] shadow-xs">
          <div className="flex items-center gap-2.5">
            <Lock size={15} className="text-[var(--success)] shrink-0" />
            <span>
              API tokens and secrets are strictly bound to your permanent <strong className="text-[var(--text-primary)] font-semibold">VOOP Store ID</strong>, encrypted at rest with <strong className="text-[var(--text-primary)] font-semibold">AES-256-GCM</strong>, and never transmitted in plaintext.
            </span>
          </div>
          <span className="hidden md:inline-flex text-[10px] uppercase tracking-wider font-mono font-bold text-[var(--success)] bg-[var(--success-soft)] px-2.5 py-0.5 rounded border border-[var(--success)]/30">
            AES-256 Secure
          </span>
        </div>

        {/* Courier Grid */}
        {loading ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
            {[1, 2, 3, 4, 5, 6].map((idx) => (
              <div
                key={idx}
                className="h-64 bg-[var(--bg-secondary)] border border-[var(--border)] rounded-2xl animate-pulse"
              />
            ))}
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
            {integrations.map((item) => {
              const meta = COURIER_META[item.courier] || {
                accentColor: "text-[var(--accent)]",
                websiteUrl: "#",
              };

              const isThisTesting = testingCourier === item.courier;

              return (
                <div
                  key={item.courier}
                  className="relative group bg-[var(--surface)] border border-[var(--border)] rounded-2xl p-5 flex flex-col justify-between transition-all duration-200 hover:border-[var(--border-strong)] shadow-xs hover:shadow-md"
                >
                  <div>
                    {/* Card Header: Name + Status */}
                    <div className="flex items-start justify-between gap-2 mb-3">
                      <div className="flex items-center gap-2.5">
                        <div className="p-2.5 rounded-xl bg-[var(--bg-secondary)] border border-[var(--border)] flex items-center justify-center shrink-0">
                          <Truck size={20} className={meta.accentColor} />
                        </div>
                        <div>
                          <h3 className="text-base font-bold text-[var(--text-primary)] leading-tight">
                            {item.name}
                          </h3>
                          <a
                            href={meta.websiteUrl}
                            target="_blank"
                            rel="noreferrer"
                            className="text-[11px] text-[var(--text-secondary)] hover:text-[var(--accent)] font-medium inline-flex items-center gap-1 mt-0.5 transition-colors"
                          >
                            Official Portal <ExternalLink size={10} />
                          </a>
                        </div>
                      </div>

                      {/* Connection Status Badge */}
                      <div>
                        {item.isConnected ? (
                          <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-bold bg-[var(--success-soft)] text-[var(--success)] border border-[var(--success)]/30 shadow-2xs">
                            <CheckCircle2 size={12} /> Connected
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-semibold bg-[var(--bg-secondary)] text-[var(--text-secondary)] border border-[var(--border)]">
                            Not Connected
                          </span>
                        )}
                      </div>
                    </div>

                    {/* Description */}
                    <p className="text-xs text-[var(--text-secondary)] leading-relaxed line-clamp-2 min-h-[36px] mt-3">
                      {item.description}
                    </p>

                    {/* Configuration / Metadata Panel */}
                    <div className="mt-4 p-3 rounded-xl bg-[var(--bg-secondary)] border border-[var(--border)] text-xs font-mono space-y-2">
                      <div className="flex items-center justify-between">
                        <span className="text-[10px] text-[var(--text-muted)] uppercase font-mono tracking-wider font-semibold">Environment</span>
                        <span className="px-2 py-0.5 rounded text-[10px] font-bold font-mono bg-[var(--accent-soft)] text-[var(--accent)] border border-[var(--accent-border)]">
                          {item.environment || "PRODUCTION"}
                        </span>
                      </div>

                      <div className="flex items-center justify-between">
                        <span className="text-[10px] text-[var(--text-muted)] uppercase font-mono tracking-wider font-semibold">Credential</span>
                        <span>
                          {item.isConnected ? (
                            <span className="text-[var(--success)] font-semibold flex items-center gap-1.5">
                              <Lock size={12} /> Active & Encrypted
                            </span>
                          ) : (
                            <span className="text-[var(--text-muted)] font-medium">None</span>
                          )}
                        </span>
                      </div>

                      {item.lastTestedAt && (
                        <div className="flex items-center justify-between text-[10px]">
                          <span className="text-[var(--text-muted)] uppercase font-mono tracking-wider font-semibold">Last Verified</span>
                          <span className="text-[var(--text-secondary)] font-mono">{new Date(item.lastTestedAt).toLocaleDateString()}</span>
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Card Actions Footer */}
                  <div className="mt-5 pt-3.5 border-t border-[var(--border)] flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2">
                      {item.isConnected ? (
                        <>
                          <button
                            onClick={() => handleOpenModal(item)}
                            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[var(--surface-hover)] hover:bg-[var(--accent)] text-[var(--text-primary)] hover:text-white border border-[var(--border)] text-xs font-semibold transition-all cursor-pointer shadow-2xs"
                          >
                            <Settings size={13} />
                            <span>Edit Config</span>
                          </button>

                          <button
                            onClick={() => handleTestConnection(item.courier)}
                            disabled={isThisTesting}
                            className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-[var(--accent-soft)] hover:bg-[var(--accent)] text-[var(--accent)] hover:text-white border border-[var(--accent-border)] text-xs font-semibold transition-all cursor-pointer disabled:opacity-50 shadow-2xs"
                            title="Run live API connection test"
                          >
                            <RefreshCw size={12} className={isThisTesting ? "animate-spin" : ""} />
                            <span>{isThisTesting ? "Testing..." : "Test"}</span>
                          </button>
                        </>
                      ) : (
                        <button
                          onClick={() => handleOpenModal(item)}
                          className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg bg-[var(--accent)] hover:bg-[var(--accent-hover)] text-white text-xs font-semibold transition-all cursor-pointer shadow-xs"
                        >
                          <Settings size={13} />
                          <span>Configure</span>
                        </button>
                      )}
                    </div>

                    {item.isConnected && (
                      <button
                        onClick={() => handleDisconnect(item.courier, item.name)}
                        className="text-[var(--text-muted)] hover:text-[var(--error)] p-1.5 rounded-lg hover:bg-[var(--error-soft)] transition-all cursor-pointer"
                        title="Disconnect integration"
                      >
                        <PowerOff size={14} />
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {/* Configuration Modal */}
        {activeModalCourier && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs animate-in fade-in duration-150">
            <div className="w-full max-w-xl bg-[var(--modal-bg)] border border-[var(--modal-border)] rounded-2xl shadow-2xl overflow-hidden animate-in zoom-in-95 duration-200">
              {/* Modal Header */}
              <div className="px-6 py-4 border-b border-[var(--modal-border)] flex items-center justify-between bg-[var(--bg-secondary)]">
                <div className="flex items-center gap-2.5">
                  <div className="p-2 rounded-lg bg-[var(--surface)] border border-[var(--border)]">
                    <Truck size={18} className="text-[var(--accent)]" />
                  </div>
                  <div>
                    <h3 className="text-base font-bold text-[var(--modal-text)]">
                      Configure {activeModalCourier.name}
                    </h3>
                    <p className="text-xs text-[var(--text-secondary)]">
                      Enter your courier partner API credentials
                    </p>
                  </div>
                </div>

                <button
                  onClick={handleCloseModal}
                  className="text-[var(--text-muted)] hover:text-[var(--text-primary)] p-1.5 rounded-lg hover:bg-[var(--surface-hover)] transition-all"
                >
                  <X size={18} />
                </button>
              </div>

              {/* Modal Form */}
              <form onSubmit={handleSaveModal}>
                <div className="p-6 space-y-4 max-h-[70vh] overflow-y-auto">
                  {/* Environment Selector */}
                  <div>
                    <label className="text-xs font-semibold text-[var(--text-primary)] block mb-1.5">
                      API Environment
                    </label>
                    <select
                      value={formEnvironment}
                      onChange={(e) => setFormEnvironment(e.target.value)}
                      className="w-full px-3 py-2 bg-[var(--input-bg)] border border-[var(--input-border)] rounded-lg text-xs text-[var(--input-text)] focus:outline-none focus:border-[var(--accent)] focus:ring-1 focus:ring-[var(--accent)] transition-all cursor-pointer"
                    >
                      <option value="PRODUCTION">Production (Live Tracking)</option>
                      <option value="TEST">Sandbox / Staging (Testing)</option>
                    </select>
                  </div>

                  {/* Dynamic Fields for this Courier */}
                  {activeModalCourier.fields
                    .filter((f) => f.key !== "environment")
                    .map((field) => {
                      const isSecret = field.isSecret;
                      const isRevealed = showSecrets[field.key] || false;
                      const val = formCredentials[field.key] || "";

                      return (
                        <div key={field.key} className="space-y-1">
                          <div className="flex items-center justify-between">
                            <label className="text-xs font-semibold text-[var(--text-primary)]">
                              {field.label} {field.required && <span className="text-[var(--error)]">*</span>}
                            </label>
                            {isSecret && (
                              <button
                                type="button"
                                onClick={() => toggleSecretVisibility(field.key)}
                                className="text-[11px] text-[var(--text-secondary)] hover:text-[var(--text-primary)] inline-flex items-center gap-1 cursor-pointer font-medium"
                              >
                                {isRevealed ? <EyeOff size={12} /> : <Eye size={12} />}
                                <span>{isRevealed ? "Hide" : "Show"}</span>
                              </button>
                            )}
                          </div>

                          {field.type === "select" ? (
                            <select
                              value={val}
                              onChange={(e) => handleFieldChange(field.key, e.target.value)}
                              className="w-full px-3 py-2 bg-[var(--input-bg)] border border-[var(--input-border)] rounded-lg text-xs text-[var(--input-text)] focus:outline-none focus:border-[var(--accent)] focus:ring-1 focus:ring-[var(--accent)] transition-all cursor-pointer"
                            >
                              {(field.options || []).map((opt) => (
                                <option key={opt.value} value={opt.value}>
                                  {opt.label}
                                </option>
                              ))}
                            </select>
                          ) : (
                            <div className="relative">
                              <input
                                type={isSecret && !isRevealed ? "password" : "text"}
                                value={val}
                                placeholder={field.placeholder || ""}
                                onChange={(e) => handleFieldChange(field.key, e.target.value)}
                                className="w-full px-3 py-2 bg-[var(--input-bg)] border border-[var(--input-border)] rounded-lg text-xs text-[var(--input-text)] font-mono placeholder-[var(--input-placeholder)] focus:outline-none focus:border-[var(--accent)] focus:ring-1 focus:ring-[var(--accent)] transition-all"
                              />
                              {isSecret && (
                                <div className="absolute right-3 top-2.5 text-[var(--text-muted)] pointer-events-none">
                                  <Lock size={13} />
                                </div>
                              )}
                            </div>
                          )}

                          {field.helpText && (
                            <p className="text-[11px] text-[var(--text-muted)] leading-tight mt-1">
                              {field.helpText}
                            </p>
                          )}
                        </div>
                      );
                    })}
                </div>

                {/* Modal Footer */}
                <div className="px-6 py-4 border-t border-[var(--modal-border)] bg-[var(--bg-secondary)] flex items-center justify-between gap-3">
                  <button
                    type="button"
                    onClick={() => handleTestConnection(activeModalCourier.courier, formCredentials)}
                    disabled={testingCourier === activeModalCourier.courier || saving}
                    className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg bg-[var(--surface)] hover:bg-[var(--surface-hover)] text-[var(--text-primary)] border border-[var(--border)] text-xs font-semibold transition-all cursor-pointer disabled:opacity-50"
                  >
                    <RefreshCw
                      size={13}
                      className={testingCourier === activeModalCourier.courier ? "animate-spin" : ""}
                    />
                    <span>
                      {testingCourier === activeModalCourier.courier ? "Verifying..." : "Test Connection"}
                    </span>
                  </button>

                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={handleCloseModal}
                      className="px-3.5 py-2 rounded-lg text-xs font-semibold text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--surface-hover)] transition-all cursor-pointer"
                    >
                      Cancel
                    </button>
                    <button
                      type="submit"
                      disabled={saving}
                      className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-[var(--accent)] hover:bg-[var(--accent-hover)] text-white text-xs font-bold transition-all shadow-xs cursor-pointer disabled:opacity-50"
                    >
                      <Check size={14} />
                      <span>{saving ? "Encrypting & Saving..." : "Save Configuration"}</span>
                    </button>
                  </div>
                </div>
              </form>
            </div>
          </div>
        )}
      </div>
    </RouteGuard>
  );
}

export default CouriersView;
