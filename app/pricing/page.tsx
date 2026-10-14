"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { CheckCircle2, Sparkles, ArrowRight, Zap } from "lucide-react";

export default function PricingPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(false);

  const handleStartTrial = () => {
    setLoading(true);
    // Redirect to dashboard with auto-sync param
    router.push("/?sync=true");
  };

  return (
    <div className="min-h-screen bg-[var(--bg-primary)] text-white flex flex-col relative overflow-hidden">
      {/* Background gradients */}
      <div className="absolute top-[-20%] right-[-10%] w-[50%] h-[50%] rounded-full bg-emerald-900/10 blur-[120px] pointer-events-none" />
      <div className="absolute bottom-[-20%] left-[-10%] w-[50%] h-[50%] rounded-full bg-cyan-900/20 blur-[120px] pointer-events-none" />

      <main className="flex-1 flex flex-col items-center justify-center p-6 z-10">
        <div className="text-center mb-10 max-w-2xl">
          <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 text-xs font-bold mb-6">
            <Sparkles size={14} />
            Exclusive 2026 Beta Access
          </div>
          <h1 className="text-4xl md:text-5xl font-black tracking-tight mb-4 text-transparent bg-clip-text bg-gradient-to-r from-white to-slate-400">
            Welcome to VOOP OS
          </h1>
          <p className="text-lg text-slate-400">
            You've been selected for our closed beta. Enjoy full access to all omnichannel sync, inventory, and analytics features completely free for this year.
          </p>
        </div>

        <div className="w-full max-w-lg bg-[var(--surface)] backdrop-blur-xl border border-[var(--border)] rounded-3xl p-8 shadow-2xl relative overflow-hidden">
          <div className="absolute top-0 inset-x-0 h-1 bg-gradient-to-r from-cyan-500 via-sky-500 to-emerald-500" />
          
          <div className="flex items-center justify-between mb-8">
            <div>
              <h2 className="text-2xl font-bold">Beta Pioneer Plan</h2>
              <p className="text-slate-400 text-sm mt-1">Unlimited Everything.</p>
            </div>
            <div className="text-right">
              <span className="text-3xl font-black">$0</span>
              <span className="text-slate-500 block text-xs line-through">$299/mo</span>
            </div>
          </div>

          <div className="space-y-4 mb-8">
            {[
              "Unlimited Shopify Store Connections",
              "Real-time Inventory & Catalog Sync",
              "Omnichannel Ad Spend & P&L Analytics",
              "Delhivery AWB Generation & Scanning",
              "Creator Collaboration Forms & Tracking",
            ].map((feature, idx) => (
              <div key={idx} className="flex items-center gap-3">
                <CheckCircle2 size={18} className="text-emerald-400 shrink-0" />
                <span className="text-sm font-medium text-slate-300">{feature}</span>
              </div>
            ))}
          </div>

          <button
            onClick={handleStartTrial}
            disabled={loading}
            className="w-full py-4 bg-gradient-to-r from-cyan-500 to-emerald-500 hover:from-cyan-400 hover:to-emerald-400 text-slate-950 font-black text-lg rounded-xl shadow-[0_0_20px_rgba(6,182,212,0.4)] transition-all flex items-center justify-center gap-2"
          >
            {loading ? (
              <span className="animate-pulse">Preparing your workspace...</span>
            ) : (
              <>
                <Zap size={20} />
                Start Free Trial &amp; Sync Store <ArrowRight size={20} />
              </>
            )}
          </button>
          <p className="text-center text-xs text-slate-500 mt-4">
            No credit card required. Free until December 31, 2026.
          </p>
        </div>
      </main>
    </div>
  );
}
