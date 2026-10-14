"use client";

import { Suspense } from "react";
import { useSearchParams } from "next/navigation";
import { LogOut, RotateCcw, ShieldCheck } from "lucide-react";

function EmbeddedLogoutContent() {
  const searchParams = useSearchParams();
  const shop = searchParams.get("shop") || "";
  const host = searchParams.get("host") || "";

  const handleResume = () => {
    // Reload the embedded app — Shopify App Bridge will re-issue an ID token
    // and re-authenticate VOOP automatically from the current Shopify session.
    if (typeof window !== "undefined") {
      try {
        sessionStorage.removeItem("voop_embedded_logged_out");
      } catch (_e) {}
      const returnParams = new URLSearchParams();
      if (shop) returnParams.set("shop", shop);
      if (host) returnParams.set("host", host);
      const returnUrl = returnParams.toString() ? `/?${returnParams.toString()}` : "/";
      window.location.href = returnUrl;
    }
  };

  return (
    <div className="min-h-screen bg-slate-950 flex flex-col items-center justify-center p-6 relative overflow-hidden">
      <div className="absolute top-[-20%] left-[-10%] w-[50%] h-[50%] rounded-full bg-cyan-900/10 blur-[120px] pointer-events-none" />
      <div className="absolute bottom-[-20%] right-[-10%] w-[50%] h-[50%] rounded-full bg-slate-800/20 blur-[100px] pointer-events-none" />

      <div className="w-full max-w-sm z-10">
        <div className="flex flex-col items-center mb-8">
          <div className="w-16 h-16 bg-slate-900 border border-slate-800 rounded-2xl flex items-center justify-center mb-5 shadow-lg shadow-black/40">
            <LogOut className="text-slate-400" size={28} />
          </div>
          <h1 className="text-xl font-black text-white tracking-tight text-center">
            Signed out of VOOP
          </h1>
          <p className="text-sm text-slate-400 mt-2 text-center leading-relaxed">
            Your VOOP session has ended.
          </p>
        </div>

        <div className="bg-slate-900/80 backdrop-blur-xl border border-slate-800/80 rounded-2xl p-5 shadow-2xl mb-4">
          <div className="flex items-start gap-3 mb-4 pb-4 border-b border-slate-800/60">
            <div className="w-8 h-8 rounded-lg bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center flex-shrink-0 mt-0.5">
              <ShieldCheck size={16} className="text-emerald-400" />
            </div>
            <div>
              <p className="text-sm font-semibold text-white">Shopify Admin is still active</p>
              <p className="text-xs text-slate-400 mt-0.5">
                Only your VOOP session was ended. Your Shopify store and Admin access are fully intact.
              </p>
            </div>
          </div>
          {shop && (
            <div className="flex items-center justify-between py-1">
              <span className="text-xs text-slate-500 uppercase tracking-wider font-semibold">Shop</span>
              <span className="text-xs text-slate-300 font-mono">{shop}</span>
            </div>
          )}
        </div>

        <button
          onClick={handleResume}
          className="w-full py-3 bg-cyan-500 hover:bg-cyan-400 text-slate-950 font-bold rounded-xl shadow-[0_0_20px_rgba(6,182,212,0.25)] transition-all flex items-center justify-center gap-2 text-sm"
        >
          <RotateCcw size={16} />
          Resume VOOP
        </button>
        <p className="text-center text-xs text-slate-600 mt-4">
          Clicking Resume VOOP re-authenticates using your current Shopify session.
        </p>
      </div>
    </div>
  );
}

export default function EmbeddedLogoutPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen bg-slate-950 flex items-center justify-center">
          <div className="w-6 h-6 border-2 border-cyan-500/30 border-t-cyan-500 rounded-full animate-spin" />
        </div>
      }
    >
      <EmbeddedLogoutContent />
    </Suspense>
  );
}
