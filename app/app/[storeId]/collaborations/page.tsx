"use client";

import { useEffect, useState } from "react";
import {
  Users,
  Search,
  Plus,
  CheckCircle2,
  XCircle,
  ExternalLink,
  Gift,
  Share2,
  Copy,
  Check,
  Instagram,
  Phone,
  MapPin,
  Car,
} from "lucide-react";
import Link from "next/link";
import { appFetch } from "@/lib/api";
import { SearchInput } from "@/components/ui/Input";

export default function CollaborationsPage() {
  const [collabs, setCollabs] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState("ALL");
  const [search, setSearch] = useState("");
  const [copiedLink, setCopiedLink] = useState(false);

  const loadData = async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({
        status: statusFilter,
        search,
      });
      const res = await appFetch(`/api/collaborations?${params.toString()}`);
      const json = await res.json();
      setCollabs(json.collaborations || []);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, [statusFilter]);

  const handleUpdateStatus = async (id: number, status: string) => {
    try {
      await appFetch("/api/collaborations", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id, status }),
      });
      await loadData();
    } catch (e) {
      console.error(e);
    }
  };

  const handleCopyPublicLink = () => {
    const origin = window.location.origin;
    navigator.clipboard.writeText(`${origin}/apply`);
    setCopiedLink(true);
    setTimeout(() => setCopiedLink(false), 2000);
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-2xl font-bold text-white tracking-tight flex items-center gap-2.5">
            <Users size={24} className="text-pink-400" /> Creator &amp; Influencer Collaborations
          </h2>
          <p className="text-xs text-slate-400 mt-1">
            Manage barter collab requests, influencer gifting orders, and content tracking.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={handleCopyPublicLink}
            className="flex items-center gap-1.5 px-3 py-2 rounded-lg bg-pink-500/15 border border-pink-500/30 text-pink-400 hover:bg-pink-500/25 text-xs font-bold transition-all"
          >
            {copiedLink ? <Check size={14} className="text-emerald-400" /> : <Copy size={14} />}
            <span>{copiedLink ? "Link Copied!" : "Copy Public Apply Link"}</span>
          </button>

          <Link
            href="/form-builder"
            className="flex items-center gap-1.5 px-3.5 py-2 rounded-lg bg-pink-600 hover:bg-pink-500 text-white text-xs font-bold transition-all shadow-md shadow-pink-600/20"
          >
            <Share2 size={14} /> Form Builder
          </Link>
        </div>
      </div>

      {/* Filter Tabs & Search */}
      <div className="flex flex-col sm:flex-row gap-3 items-center justify-between">
        <div className="flex items-center gap-1.5 overflow-x-auto w-full sm:w-auto">
          {["ALL", "New Request", "Approved", "Dispatched", "Content Received", "Rejected"].map((st) => (
            <button
              key={st}
              onClick={() => setStatusFilter(st)}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold whitespace-nowrap transition-all ${
                statusFilter === st
                  ? "bg-pink-500/20 text-pink-300 border border-pink-500/40"
                  : "bg-slate-900 border border-[var(--border)] text-slate-400 hover:text-slate-200"
              }`}
            >
              {st}
            </button>
          ))}
        </div>

        <form
          onSubmit={(e) => { e.preventDefault(); loadData(); }}
          className="w-full sm:w-72"
        >
          <SearchInput
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            onClear={() => setSearch("")}
            placeholder="Search creator name, @handle, city..."
            className="py-1.5 text-xs"
          />
        </form>
      </div>

      {/* Collabs Cards Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {collabs.length === 0 ? (
          <div className="col-span-full p-12 text-center glass-panel border border-[var(--border)] text-slate-500 text-xs">
            No collaboration requests found. Share your public link (<code>/apply</code>) to receive applicant entries!
          </div>
        ) : (
          collabs.map((c) => (
            <div key={c.id} className="glass-panel p-5 border border-[var(--border)] rounded-xl space-y-3 relative hover:border-[var(--border)] transition-all">
              <div className="flex items-start justify-between">
                <div>
                  <h4 className="font-bold text-sm text-white">{c.fullName}</h4>
                  <div className="flex items-center gap-1 text-xs text-pink-400 font-mono mt-0.5">
                    <Instagram size={12} />
                    {c.instagramLink ? (
                      <a href={c.instagramLink} target="_blank" rel="noopener noreferrer" className="hover:underline">
                        {c.instagramId || c.instagramLink}
                      </a>
                    ) : (
                      <span>{c.instagramId || "@unknown"}</span>
                    )}
                  </div>
                </div>

                <span
                  className={`badge ${
                    c.status === "Approved"
                      ? "badge-success"
                      : c.status === "Dispatched"
                      ? "badge-info"
                      : c.status === "Rejected"
                      ? "badge-danger"
                      : "badge-warning"
                  }`}
                >
                  {c.status}
                </span>
              </div>

              <div className="grid grid-cols-2 gap-2 text-[11px] text-slate-400 pt-2 border-t border-[var(--border)]/80">
                <div>
                  <span className="text-slate-500 block">Phone / WhatsApp:</span>
                  <span className="text-slate-200 font-mono">{c.whatsappNumber || "—"}</span>
                </div>
                <div>
                  <span className="text-slate-500 block">City:</span>
                  <span className="text-slate-200">{c.place || "—"}</span>
                </div>
                <div>
                  <span className="text-slate-500 block">Content Type:</span>
                  <span className="text-slate-200">{c.contentType || "Reels"}</span>
                </div>
                <div>
                  <span className="text-slate-500 block">Vehicle:</span>
                  <span className="text-slate-200">{c.vehicleOwned || c.vehicleUsed || "—"}</span>
                </div>
              </div>

              {c.address && (
                <div className="text-[11px] text-slate-400 bg-[var(--bg-secondary)] p-2.5 rounded-lg border border-[var(--border)]">
                  <span className="text-slate-500 block text-[10px] uppercase font-bold">Shipping Address:</span>
                  <p className="text-slate-300 mt-0.5 line-clamp-2">{c.address}</p>
                </div>
              )}

              {/* Action Buttons */}
              <div className="flex items-center justify-between pt-2 border-t border-[var(--border)]/80">
                <span className="text-[10px] text-slate-500 font-mono">
                  {new Date(c.createdAt).toLocaleDateString()}
                </span>

                <div className="flex items-center gap-1.5">
                  {c.status !== "Approved" && (
                    <button
                      onClick={() => handleUpdateStatus(c.id, "Approved")}
                      className="px-2.5 py-1 rounded bg-emerald-500/15 border border-emerald-500/30 text-emerald-400 hover:bg-emerald-500/25 text-[11px] font-bold"
                    >
                      Approve
                    </button>
                  )}
                  {c.status !== "Rejected" && (
                    <button
                      onClick={() => handleUpdateStatus(c.id, "Rejected")}
                      className="px-2 py-1 rounded bg-red-500/15 border border-red-500/30 text-red-400 hover:bg-red-500/25 text-[11px] font-bold"
                    >
                      Reject
                    </button>
                  )}
                </div>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
