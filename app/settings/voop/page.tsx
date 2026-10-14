"use client";

import { useEffect, useState } from "react";
import {
  KeyRound,
  ShieldCheck,
  RefreshCw,
  Plus,
  Trash2,
  Copy,
  Check,
  ExternalLink,
  Code,
  Layers,
  Sparkles,
} from "lucide-react";
import { formatDate } from "@/lib/utils";
import { appFetch } from "@/lib/api";

export default function VoopSettingsPage() {
  const [keys, setKeys] = useState<any[]>([]);
  const [defaultKey, setDefaultKey] = useState("");
  const [loading, setLoading] = useState(true);

  // New Key Modal / Result
  const [newKeyName, setNewKeyName] = useState("");
  const [createdKey, setCreatedKey] = useState<string | null>(null);
  const [copiedKey, setCopiedKey] = useState(false);
  const [generating, setGenerating] = useState(false);

  // Test Simulator
  const [testEndpoint, setTestEndpoint] = useState("/api/voop/sync-status");
  const [testApiKey, setTestApiKey] = useState("");
  const [testOutput, setTestOutput] = useState<any | null>(null);
  const [testing, setTesting] = useState(false);

  const fetchKeys = async () => {
    setLoading(true);
    try {
      const res = await appFetch("/api/keys");
      const json = await res.json();
      setKeys(json.keys || []);
      setDefaultKey(json.defaultKey || "");
      if (!testApiKey && json.defaultKey) {
        setTestApiKey(json.defaultKey);
      }
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchKeys();
  }, []);

  const handleGenerateKey = async (e: React.FormEvent) => {
    e.preventDefault();
    setGenerating(true);
    try {
      const res = await appFetch("/api/keys", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: newKeyName || "VOOP Application Key" }),
      });
      const json = await res.json();
      if (json.success) {
        setCreatedKey(json.apiKey);
        setNewKeyName("");
        await fetchKeys();
      }
    } catch (e) {
      console.error(e);
    } finally {
      setGenerating(false);
    }
  };

  const handleDeleteKey = async (id: string) => {
    if (!confirm("Revoke this API Key? Applications using this token will lose access.")) return;
    try {
      await fetch(`/api/keys?id=${id}`, { method: "DELETE" });
      await fetchKeys();
    } catch (e) {
      console.error(e);
    }
  };

  const handleRunTest = async () => {
    setTesting(true);
    setTestOutput(null);
    try {
      const res = await fetch(testEndpoint, {
        headers: {
          Authorization: `Bearer ${testApiKey}`,
        },
      });
      const json = await res.json();
      setTestOutput({ status: res.status, ok: res.ok, data: json });
    } catch (e: any) {
      setTestOutput({ status: 500, ok: false, error: e.message });
    } finally {
      setTesting(false);
    }
  };

  const baseUrl = typeof window !== "undefined" ? window.location.origin : "http://localhost:3005";

  return (
    <div className="space-y-6 max-w-4xl">
      {/* Title */}
      <div>
        <h2 className="text-2xl font-bold text-white tracking-tight flex items-center gap-2">
          <KeyRound className="text-emerald-400" size={24} /> VOOP Connection &amp; API Keys
        </h2>
        <p className="text-xs text-slate-400 mt-1">
          Configure secure Bearer API tokens so the main VOOP application can pull synchronized products, variant IDs, and orders.
        </p>
      </div>

      {/* Overview & Security Banner */}
      <div className="glass-panel p-5 border-l-4 border-l-emerald-500 flex items-start gap-3.5">
        <ShieldCheck size={20} className="text-emerald-400 shrink-0 mt-0.5" />
        <div className="text-xs space-y-1">
          <h3 className="font-bold text-white">Secure Data Bridge Authentication</h3>
          <p className="text-slate-300 leading-relaxed">
            All requests from VOOP to this application must provide <code className="bg-slate-900 px-1.5 py-0.5 rounded text-emerald-300 font-mono">Authorization: Bearer &lt;API_KEY&gt;</code>. Secrets are hashed using SHA-256 before storage.
          </p>
        </div>
      </div>

      {/* Generated Key Alert Modal */}
      {createdKey && (
        <div className="p-4 rounded-xl bg-emerald-950/60 border border-emerald-500/40 space-y-3">
          <div className="flex items-center justify-between">
            <h4 className="text-xs font-bold text-emerald-400 flex items-center gap-2">
              <Sparkles size={14} /> New VOOP API Key Created
            </h4>
            <span className="text-[10px] text-slate-400">Copy now — won't be shown again</span>
          </div>
          <div className="flex items-center gap-2">
            <input
              type="text"
              readOnly
              value={createdKey}
              className="w-full bg-slate-900 border border-emerald-500/40 rounded-lg px-3 py-2 text-xs text-emerald-300 font-mono select-all font-bold"
            />
            <button
              onClick={() => {
                navigator.clipboard.writeText(createdKey);
                setCopiedKey(true);
                setTimeout(() => setCopiedKey(false), 2000);
              }}
              className="px-3 py-2 rounded-lg bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-bold text-xs flex items-center gap-1 shrink-0"
            >
              {copiedKey ? <Check size={13} /> : <Copy size={13} />}
              {copiedKey ? "Copied!" : "Copy Key"}
            </button>
          </div>
          <div className="flex justify-end">
            <button
              onClick={() => setCreatedKey(null)}
              className="text-[11px] text-slate-400 hover:text-white"
            >
              Dismiss
            </button>
          </div>
        </div>
      )}

      {/* API Key Management */}
      <div className="glass-panel p-6 space-y-5">
        <div className="flex items-center justify-between border-b border-[var(--border)] pb-3">
          <div>
            <h3 className="text-base font-bold text-white">Active VOOP API Keys</h3>
            <p className="text-xs text-slate-400 mt-0.5">Tokens authorized to query the VOOP Data Bridge.</p>
          </div>

          <form onSubmit={handleGenerateKey} className="flex items-center gap-2">
            <input
              type="text"
              placeholder="Key Name (e.g. Production VOOP App)"
              value={newKeyName}
              onChange={(e) => setNewKeyName(e.target.value)}
              className="bg-slate-900 border border-[var(--border)] rounded-lg px-3 py-1.5 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-emerald-500 w-52"
            />
            <button
              type="submit"
              disabled={generating}
              className="px-3 py-1.5 rounded-lg bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-bold text-xs flex items-center gap-1 shrink-0"
            >
              <Plus size={13} />
              <span>Generate Key</span>
            </button>
          </form>
        </div>

        {/* Default Environment Key Info */}
        {defaultKey && (
          <div className="p-3 rounded-lg bg-[var(--surface)] border border-[var(--border)] flex items-center justify-between text-xs">
            <div>
              <span className="font-semibold text-white">Default Environment Key:</span>
              <p className="text-slate-400 font-mono text-[11px] mt-0.5 select-all">{defaultKey}</p>
            </div>
            <button
              onClick={() => {
                navigator.clipboard.writeText(defaultKey);
                alert("Copied default key!");
              }}
              className="p-1.5 rounded bg-slate-800 hover:bg-slate-700 text-slate-300"
              title="Copy Key"
            >
              <Copy size={13} />
            </button>
          </div>
        )}

        {/* Keys Table */}
        <div className="border border-[var(--border)] rounded-lg overflow-hidden">
          <table className="w-full text-left text-xs border-collapse">
            <thead>
              <tr className="bg-[var(--surface)] border-b border-[var(--border)] text-slate-400">
                <th className="py-2.5 px-3">Name</th>
                <th className="py-2.5 px-3">Key Prefix</th>
                <th className="py-2.5 px-3">Last Used</th>
                <th className="py-2.5 px-3">Created</th>
                <th className="py-2.5 px-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/60">
              {keys.length === 0 ? (
                <tr>
                  <td colSpan={5} className="py-6 text-center text-slate-400 italic">
                    No custom keys created yet. The default environment key is active.
                  </td>
                </tr>
              ) : (
                keys.map((k) => (
                  <tr key={k.id} className="table-row-hover">
                    <td className="py-2.5 px-3 font-semibold text-white">{k.name}</td>
                    <td className="py-2.5 px-3 font-mono text-emerald-400">{k.keyPrefix}...</td>
                    <td className="py-2.5 px-3 text-slate-400">{k.lastUsedAt ? formatDate(k.lastUsedAt) : "Never"}</td>
                    <td className="py-2.5 px-3 text-slate-400">{formatDate(k.createdAt)}</td>
                    <td className="py-2.5 px-3 text-right">
                      <button
                        onClick={() => handleDeleteKey(k.id)}
                        className="p-1 text-red-400 hover:text-red-300 hover:bg-red-950/40 rounded"
                        title="Revoke Key"
                      >
                        <Trash2 size={13} />
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Interactive VOOP API Simulator */}
      <div className="glass-panel p-6 space-y-4">
        <div className="border-b border-[var(--border)] pb-3">
          <h3 className="text-base font-bold text-white flex items-center gap-2">
            <Code size={18} className="text-sky-400" />
            Test VOOP Connection &amp; Live API Simulator
          </h3>
          <p className="text-xs text-slate-400 mt-0.5">
            Test and verify the exact JSON payloads that VOOP will receive.
          </p>
        </div>

        <div className="space-y-3 text-xs">
          <div className="grid grid-cols-1 sm:grid-cols-12 gap-3">
            <div className="sm:col-span-4">
              <label className="text-slate-400 block mb-1 font-semibold">Test Endpoint</label>
              <select
                value={testEndpoint}
                onChange={(e) => setTestEndpoint(e.target.value)}
                className="w-full bg-slate-900 border border-[var(--border)] rounded-lg px-3 py-2 text-xs text-white focus:outline-none focus:border-[var(--accent)] font-mono"
              >
                <option value="/api/voop/sync-status">GET /api/voop/sync-status</option>
                <option value="/api/voop/orders?limit=5">GET /api/voop/orders?limit=5</option>
                <option value="/api/voop/products?limit=5">GET /api/voop/products?limit=5</option>
                <option value="/api/voop/variants?limit=5">GET /api/voop/variants?limit=5</option>
                <option value="/api/voop/order-items?limit=5">GET /api/voop/order-items?limit=5</option>
                <option value="/api/voop/orders/10542">GET /api/voop/orders/10542 (Sample Test)</option>
              </select>
            </div>

            <div className="sm:col-span-5">
              <label className="text-slate-400 block mb-1 font-semibold">Bearer API Key</label>
              <input
                type="text"
                placeholder="voop_live_..."
                value={testApiKey}
                onChange={(e) => setTestApiKey(e.target.value)}
                className="w-full bg-slate-900 border border-[var(--border)] rounded-lg px-3 py-2 text-xs text-white focus:outline-none focus:border-[var(--accent)] font-mono"
              />
            </div>

            <div className="sm:col-span-3 flex items-end">
              <button
                onClick={handleRunTest}
                disabled={testing}
                className="w-full bg-sky-500 hover:bg-sky-400 text-slate-950 font-bold text-xs py-2 rounded-lg transition-all flex items-center justify-center gap-1.5"
              >
                <RefreshCw size={13} className={testing ? "animate-spin" : ""} />
                <span>Run API Call</span>
              </button>
            </div>
          </div>

          {/* Test Response Window */}
          {testOutput && (
            <div className="space-y-1.5 pt-2">
              <div className="flex items-center justify-between">
                <span className="font-bold text-slate-300">
                  HTTP Status: <span className={testOutput.ok ? "text-emerald-400" : "text-red-400"}>{testOutput.status}</span>
                </span>
                <span className="text-[10px] text-slate-400 font-mono">{testEndpoint}</span>
              </div>
              <pre className="p-4 rounded-lg bg-slate-950 border border-[var(--border)] font-mono text-[11px] text-emerald-400 max-h-60 overflow-y-auto">
                {JSON.stringify(testOutput.data || testOutput, null, 2)}
              </pre>
            </div>
          )}
        </div>
      </div>

      {/* Complete VOOP Integration Contract Reference */}
      <div className="glass-panel p-6 space-y-4">
        <h3 className="text-base font-bold text-white flex items-center gap-2">
          <Layers size={18} className="text-purple-400" />
          VOOP Integration Endpoints Reference
        </h3>

        <div className="space-y-3 text-xs">
          <div className="p-3 rounded-lg bg-[var(--surface)] border border-[var(--border)] space-y-1">
            <div className="flex items-center gap-2">
              <span className="badge badge-info">GET</span>
              <code className="text-sky-300 font-mono font-bold">{baseUrl}/api/voop/orders/:id</code>
            </div>
            <p className="text-slate-400 text-[11px]">
              Returns full order payload with line items containing exact <strong className="text-emerald-400">variantId</strong> &amp; <strong className="text-sky-400">sku</strong> for BOM deduction.
            </p>
          </div>

          <div className="p-3 rounded-lg bg-[var(--surface)] border border-[var(--border)] space-y-1">
            <div className="flex items-center gap-2">
              <span className="badge badge-info">GET</span>
              <code className="text-sky-300 font-mono font-bold">{baseUrl}/api/voop/orders?updated_since=2026-08-29T00:00:00Z</code>
            </div>
            <p className="text-slate-400 text-[11px]">
              Incremental order polling for VOOP synchronization workers.
            </p>
          </div>

          <div className="p-3 rounded-lg bg-[var(--surface)] border border-[var(--border)] space-y-1">
            <div className="flex items-center gap-2">
              <span className="badge badge-info">GET</span>
              <code className="text-sky-300 font-mono font-bold">{baseUrl}/api/voop/variants</code>
            </div>
            <p className="text-slate-400 text-[11px]">
              Lists all Shopify variants mapped with their permanent <strong className="text-emerald-400">shopifyVariantId</strong>.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
