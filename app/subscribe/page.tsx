"use client";

import { Suspense, useState, useEffect } from "react";
import { useSearchParams } from "next/navigation";
import {
  ArrowRight,
  CheckCircle2,
  Clock,
  Crown,
  ExternalLink,
  Package,
  RefreshCw,
  Shield,
  ShoppingCart,
  Sparkles,
  TrendingUp,
  Zap,
} from "lucide-react";

import { appFetch } from "@/lib/api";

const FEATURES = [
  { icon: ShoppingCart, label: "Shopify Order Sync", desc: "Real-time order import & status updates" },
  { icon: Package, label: "Inventory Management", desc: "VOOP-linked stock tracking & alerts" },
  { icon: TrendingUp, label: "P&L Dashboard", desc: "Live profit & loss with cost analytics" },
  { icon: Zap, label: "Manual Billing", desc: "Walk-in, WhatsApp & phone order billing" },
  { icon: Shield, label: "GST Invoicing", desc: "Compliant tax invoices, auto-calculated" },
  { icon: Sparkles, label: "Creator Collabs", desc: "Manage influencer & affiliate programs" },
];

function SubscribeContent() {
  const searchParams = useSearchParams();
  const shop = searchParams.get("shop") || "";
  const storeId = searchParams.get("storeId") || "";
  const declined = searchParams.get("declined") === "true";

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [checking, setChecking] = useState(true);
  const [subStatus, setSubStatus] = useState<any>(null);

  // Check if subscription is already active
  useEffect(() => {
    const checkSub = async () => {
      setChecking(true);
      try {
        const params = new URLSearchParams();
        if (shop) params.set("shop", shop);
        if (storeId) params.set("storeId", storeId);
        const res = await fetch(`/api/shopify/subscription?${params}`);
        if (res.ok) {
          const data = await res.json();
          setSubStatus(data);
          // If already active, redirect to dashboard
          if (data.isActive && !declined) {
            window.location.href = "/";
            return;
          }
        }
      } catch {
        // Ignore — show the subscribe page regardless
      } finally {
        setChecking(false);
      }
    };
    checkSub();
  }, [shop, storeId, declined]);

  const handleSubscribe = async () => {
    setLoading(true);
    setError("");
    try {
      const res = await appFetch("/api/shopify/subscription", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          shop,
          storeId,
          returnUrl: window.location.origin,
        }),
      });

      const data = await res.json();

      if (!res.ok || !data.confirmationUrl) {
        throw new Error(data.error || "Failed to create subscription. Please try again.");
      }

      // Redirect to Shopify's billing confirmation page
      window.location.href = data.confirmationUrl;
    } catch (err: any) {
      setError(err.message);
      setLoading(false);
    }
  };

  if (checking) {
    return (
      <div className="min-h-screen bg-slate-950 flex items-center justify-center">
        <div className="flex flex-col items-center gap-4">
          <div className="w-10 h-10 border-2 border-cyan-500/30 border-t-cyan-500 rounded-full animate-spin" />
          <p className="text-slate-400 text-sm">Checking subscription status...</p>
        </div>
      </div>
    );
  }

  // If already has a pending confirmation URL, show it
  const pendingUrl = subStatus?.confirmationUrl;

  return (
    <div className="min-h-screen bg-slate-950 flex flex-col items-center justify-center p-4 relative overflow-hidden">
      {/* Background glows */}
      <div className="absolute top-0 left-[-20%] w-[60%] h-[60%] rounded-full bg-cyan-900/15 blur-[150px] pointer-events-none" />
      <div className="absolute bottom-0 right-[-20%] w-[60%] h-[60%] rounded-full bg-purple-900/15 blur-[150px] pointer-events-none" />

      <div className="w-full max-w-4xl z-10 py-12">
        {/* Header */}
        <div className="text-center mb-12">
          <div className="inline-flex items-center gap-2 bg-amber-500/10 border border-amber-500/20 rounded-full px-4 py-1.5 text-amber-400 text-xs font-bold mb-6">
            <Crown size={14} />
            {declined ? "Subscription Declined" : "Start Your Free Trial"}
          </div>
          <h1 className="text-4xl md:text-5xl font-black text-white tracking-tight mb-4">
            {declined ? "Let's try again" : "60 Days Free."}
            <br />
            <span className="bg-gradient-to-r from-cyan-400 to-emerald-400 bg-clip-text text-transparent">
              {declined ? "No commitment." : "Then ₹999/month."}
            </span>
          </h1>
          <p className="text-slate-400 text-lg max-w-xl mx-auto">
            {declined
              ? "You can activate your free trial anytime. No charge until your 60-day trial ends."
              : "Get full access to VOOP Universal OS — sync, billing, P&L, and more. Cancel anytime."}
          </p>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 items-start">
          {/* Features List */}
          <div className="space-y-3">
            <h3 className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-4">Everything included</h3>
            {FEATURES.map(({ icon: Icon, label, desc }) => (
              <div
                key={label}
                className="flex items-start gap-3 p-3 rounded-xl bg-[var(--bg-secondary)] border border-[var(--border)] hover:border-[var(--border)] transition-colors"
              >
                <div className="w-8 h-8 rounded-lg bg-cyan-500/10 flex items-center justify-center flex-shrink-0 mt-0.5">
                  <Icon size={16} className="text-cyan-400" />
                </div>
                <div>
                  <div className="font-semibold text-sm text-slate-200">{label}</div>
                  <div className="text-xs text-slate-500">{desc}</div>
                </div>
                <CheckCircle2 size={16} className="text-emerald-400 ml-auto flex-shrink-0 mt-1" />
              </div>
            ))}
          </div>

          {/* Pricing Card */}
          <div className="sticky top-8">
            <div className="bg-gradient-to-b from-slate-900 to-slate-900/80 border border-[var(--border)]/60 rounded-2xl p-8 shadow-2xl shadow-black/40">
              {/* Trial badge */}
              <div className="flex items-center gap-2 bg-emerald-500/10 border border-emerald-500/20 rounded-full px-3 py-1 w-fit mb-6">
                <Clock size={12} className="text-emerald-400" />
                <span className="text-emerald-400 text-xs font-bold">60-Day Free Trial</span>
              </div>

              <div className="mb-6">
                <div className="text-5xl font-black text-white mb-1">
                  $29
                  <span className="text-xl font-medium text-slate-400">.99/mo</span>
                </div>
                <div className="text-sm text-slate-400">Billed in USD via Shopify Payments</div>
                <div className="text-xs text-slate-500 mt-1">
                  ≈ ₹2,500/month • No hidden fees • Cancel anytime
                </div>
              </div>

              {/* Trial timeline */}
              <div className="mb-6 p-4 rounded-xl bg-[var(--bg-secondary)] border border-[var(--border)]">
                <div className="flex items-center gap-3 text-sm">
                  <div className="flex flex-col items-center gap-1">
                    <div className="w-2 h-2 rounded-full bg-emerald-400" />
                    <div className="w-px h-8 bg-slate-700" />
                    <div className="w-2 h-2 rounded-full bg-cyan-400" />
                  </div>
                  <div className="space-y-3 flex-1">
                    <div>
                      <div className="text-slate-300 font-semibold text-xs">Today</div>
                      <div className="text-slate-500 text-xs">Start free trial — no charge</div>
                    </div>
                    <div>
                      <div className="text-slate-300 font-semibold text-xs">Day 60</div>
                      <div className="text-slate-500 text-xs">First billing cycle begins ($29.99/mo)</div>
                    </div>
                  </div>
                </div>
              </div>

              {error && (
                <div className="mb-4 p-3 rounded-lg bg-red-500/10 border border-red-500/20 text-red-400 text-sm">
                  {error}
                </div>
              )}

              {pendingUrl ? (
                <div className="space-y-3">
                  <div className="p-3 rounded-lg bg-amber-500/10 border border-amber-500/20 text-amber-400 text-sm">
                    You have a pending subscription approval. Click below to complete it.
                  </div>
                  <a
                    href={pendingUrl}
                    className="w-full flex items-center justify-center gap-2 py-3.5 bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold rounded-xl transition-all shadow-[0_0_20px_rgba(245,158,11,0.3)]"
                  >
                    Complete Subscription <ExternalLink size={16} />
                  </a>
                </div>
              ) : (
                <button
                  onClick={handleSubscribe}
                  disabled={loading}
                  className="w-full flex items-center justify-center gap-2 py-3.5 bg-cyan-500 hover:bg-cyan-400 disabled:bg-cyan-500/50 text-slate-950 font-bold rounded-xl transition-all shadow-[0_0_20px_rgba(6,182,212,0.3)] disabled:cursor-not-allowed"
                >
                  {loading ? (
                    <>
                      <RefreshCw size={18} className="animate-spin" />
                      Redirecting to Shopify...
                    </>
                  ) : (
                    <>
                      Start 60-Day Free Trial <ArrowRight size={18} />
                    </>
                  )}
                </button>
              )}

              <div className="mt-4 text-center text-xs text-slate-500">
                By subscribing, you agree to the{" "}
                <a href="#" className="text-cyan-400 hover:underline">Terms of Service</a>.
                You can cancel anytime from Shopify Admin → Apps.
              </div>
            </div>

            {/* Trust indicators */}
            <div className="grid grid-cols-3 gap-3 mt-4">
              {[
                { icon: Shield, label: "Secure via Shopify" },
                { icon: RefreshCw, label: "Cancel Anytime" },
                { icon: Clock, label: "60-Day Trial" },
              ].map(({ icon: Icon, label }) => (
                <div key={label} className="flex flex-col items-center gap-1.5 p-3 rounded-xl bg-[var(--bg-secondary)] border border-[var(--border)]">
                  <Icon size={16} className="text-slate-400" />
                  <span className="text-[10px] text-slate-500 text-center font-medium">{label}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export default function SubscribePage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen bg-slate-950 flex items-center justify-center">
          <div className="w-8 h-8 border-2 border-cyan-500/30 border-t-cyan-500 rounded-full animate-spin" />
        </div>
      }
    >
      <SubscribeContent />
    </Suspense>
  );
}
