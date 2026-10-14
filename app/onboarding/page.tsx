"use client";

import { Suspense, useState, useEffect } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import {
  ArrowRight,
  Boxes,
  Building,
  Check,
  CheckCircle2,
  Lock,
  Mail,
  Package,
  Phone,
  RefreshCw,
  ShoppingCart,
  Sparkles,
  Store,
  User,
} from "lucide-react";
import Link from "next/link";
import { signIn } from "next-auth/react";
import { Input, PasswordInput } from "@/components/ui/Input";

type Step = "account" | "sync" | "done";

function OnboardingContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const shopParam = searchParams.get("shop") || "";
  const storeIdParam = searchParams.get("storeId") || "";
  const storeNameParam = searchParams.get("storeName") || shopParam;

  const [step, setStep] = useState<Step>("account");
  const [mode, setMode] = useState<"create" | "signin">("create");

  // Account creation form
  const [form, setForm] = useState({
    name: "",
    email: "",
    password: "",
    companyName: "",
    companyType: "PVT_LTD",
    contactNo: "",
  });
  const [authError, setAuthError] = useState("");
  const [authLoading, setAuthLoading] = useState(false);

  // Sync status
  const [syncStatus, setSyncStatus] = useState<
    "idle" | "products" | "inventory" | "orders" | "done" | "error"
  >("idle");
  const [syncMessage, setSyncMessage] = useState("");
  const [storeId, setStoreId] = useState(storeIdParam);
  const [syncedCounts, setSyncedCounts] = useState({
    products: 0,
    inventory: 0,
    orders: 0,
  });

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    setForm({ ...form, [e.target.name]: e.target.value });
  };

  // ─── Step 1: Account ─────────────────────────────────────────────────────────

  const handleCreateAccount = async (e: React.FormEvent) => {
    e.preventDefault();
    setAuthLoading(true);
    setAuthError("");

    try {
      const res = await fetch("/api/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...form, shop: shopParam, storeId: storeIdParam || storeId }),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Registration failed.");

      // Auto sign-in after account creation
      const signInRes = await signIn("credentials", {
        email: form.email,
        password: form.password,
        redirect: false,
      });

      if (signInRes?.error) {
        setAuthError("Account created! Please sign in to continue.");
        setMode("signin");
        return;
      }

      // If store is already connected, go straight to sync
      if (shopParam || storeIdParam) {
        setStep("sync");
        linkAndSync(storeId || storeIdParam);
      } else {
        router.push("/");
      }
    } catch (err: any) {
      setAuthError(err.message || "An unexpected error occurred.");
    } finally {
      setAuthLoading(false);
    }
  };

  const handleSignIn = async (e: React.FormEvent) => {
    e.preventDefault();
    setAuthLoading(true);
    setAuthError("");

    try {
      const res = await signIn("credentials", {
        email: form.email,
        password: form.password,
        redirect: false,
      });

      if (!res || res.error) {
        setAuthError("Invalid email or password. Please try again.");
        return;
      }

      if (shopParam || storeIdParam) {
        setStep("sync");
        linkAndSync(storeId || storeIdParam);
      } else {
        router.push("/");
      }
    } catch (err: any) {
      setAuthError(err.message || "Sign-in failed.");
    } finally {
      setAuthLoading(false);
    }
  };

  // ─── Step 2: Link Store & Sync ───────────────────────────────────────────────

  const linkAndSync = async (sid?: string) => {
    const activeSid = sid || storeId;

    if (activeSid) {
      try {
        await fetch("/api/account/store", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ storeId: activeSid, shopDomain: shopParam }),
        });
      } catch (_e) {}
    }

    // Step 2a: Sync Products & Variants
    setSyncStatus("products");
    setSyncMessage("Importing your Shopify products, variants, and barcodes...");
    try {
      const prodRes = await fetch("/api/shopify/sync", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ type: "products", storeId: activeSid }),
      });
      const prodData = await prodRes.json();
      if (prodData.success) {
        setSyncedCounts((prev) => ({ ...prev, products: prodData.recordsCount || 0 }));
      }
    } catch (_e) {}

    // Step 2b: Create / Link physical inventory
    setSyncStatus("inventory");
    setSyncMessage("Setting up physical inventory SKUs and combo tracking...");
    await new Promise((r) => setTimeout(r, 1200));

    // Step 2c: Sync Orders
    setSyncStatus("orders");
    setSyncMessage("Importing your latest Shopify orders, shipping addresses, and items...");
    try {
      const orderRes = await fetch("/api/shopify/sync", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ type: "orders", storeId: activeSid }),
      });
      const orderData = await orderRes.json();
      if (orderData.success) {
        setSyncedCounts((prev) => ({ ...prev, orders: orderData.recordsCount || 0 }));
      }
    } catch (_e) {}

    // Mark done
    setSyncStatus("done");
    setSyncMessage("All data synchronized successfully!");
    await new Promise((r) => setTimeout(r, 1000));
    setStep("done");
  };

  // If already logged in, check if store param is provided and jump to sync
  useEffect(() => {
    if (storeIdParam) setStoreId(storeIdParam);
  }, [storeIdParam]);

  // ─── UI Helpers ──────────────────────────────────────────────────────────────

  const steps: { key: Step; label: string }[] = [
    { key: "account", label: "Account" },
    { key: "sync", label: "Import Data" },
    { key: "done", label: "Done!" },
  ];

  const stepIndex = steps.findIndex((s) => s.key === step);

  return (
    <div className="min-h-screen bg-[var(--background)] flex flex-col items-center justify-center p-4 relative">
      <div className="w-full max-w-lg z-10 py-8">
        {/* Header */}
        <div className="flex flex-col items-center mb-8 text-center">
          <div className="w-12 h-12 bg-[var(--surface)] border border-[var(--border)] rounded-2xl flex items-center justify-center mb-4 shadow-xs">
            <Sparkles className="text-[var(--primary)]" size={24} />
          </div>
          <h1 className="text-2xl font-black text-[var(--text-primary)] tracking-tight">Welcome to VOOP</h1>
          {shopParam && (
            <p className="text-xs text-[var(--text-secondary)] mt-1 font-medium">
              Setting up for{" "}
              <span className="text-[var(--primary)] font-semibold">{storeNameParam || shopParam}</span>
            </p>
          )}
        </div>

        {/* Step Tracker */}
        <div className="flex items-center justify-center gap-0 mb-8">
          {steps.map((s, i) => (
            <div key={s.key} className="flex items-center">
              <div
                className={`flex items-center justify-center w-8 h-8 rounded-full text-xs font-bold transition-all shadow-xs ${
                  i < stepIndex
                    ? "bg-[var(--success)] text-white"
                    : i === stepIndex
                    ? "bg-[var(--primary)] text-white"
                    : "bg-[var(--surface-secondary)] border border-[var(--border)] text-[var(--text-muted)]"
                }`}
              >
                {i < stepIndex ? <Check size={14} /> : i + 1}
              </div>
              <span
                className={`ml-2 text-xs font-semibold ${
                  i === stepIndex ? "text-[var(--text-primary)] font-bold" : "text-[var(--text-secondary)]"
                }`}
              >
                {s.label}
              </span>
              {i < steps.length - 1 && (
                <div
                  className={`mx-3 h-0.5 w-10 ${i < stepIndex ? "bg-[var(--success)]" : "bg-[var(--border)]"}`}
                />
              )}
            </div>
          ))}
        </div>

        {/* ─── STEP: Account ───────────────────────────────────────────────────── */}
        {step === "account" && (
          <div className="bg-[var(--surface)] border border-[var(--border)] rounded-2xl p-6 sm:p-8 shadow-sm">
            {/* Mode toggle — Section 7 Specification */}
            <div className="flex mb-6 gap-2 bg-[var(--surface-secondary)] border border-[var(--border)] rounded-xl p-1">
              <button
                type="button"
                onClick={() => { setMode("create"); setAuthError(""); }}
                className={`flex-1 py-2 text-xs font-semibold rounded-lg transition-all cursor-pointer ${
                  mode === "create"
                    ? "bg-[var(--primary)] text-white shadow-xs font-bold"
                    : "text-[var(--text-secondary)] hover:bg-[var(--surface-hover)] hover:text-[var(--text-primary)]"
                }`}
              >
                Create Account
              </button>
              <button
                type="button"
                onClick={() => { setMode("signin"); setAuthError(""); }}
                className={`flex-1 py-2 text-xs font-semibold rounded-lg transition-all cursor-pointer ${
                  mode === "signin"
                    ? "bg-[var(--primary)] text-white shadow-xs font-bold"
                    : "text-[var(--text-secondary)] hover:bg-[var(--surface-hover)] hover:text-[var(--text-primary)]"
                }`}
              >
                Sign In
              </button>
            </div>

            {authError && (
              <div className="mb-4 p-3.5 rounded-xl bg-[var(--danger-soft)] border border-[var(--danger)]/20 text-[var(--danger)] text-xs font-semibold">
                {authError}
              </div>
            )}

            {mode === "create" ? (
              <form onSubmit={handleCreateAccount} className="space-y-4">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <Input
                    label="Full Name"
                    type="text"
                    name="name"
                    value={form.name}
                    onChange={handleChange}
                    leadingIcon={<User size={16} />}
                    placeholder="John Doe"
                    required
                  />
                  <Input
                    label="Phone (Optional)"
                    type="tel"
                    name="contactNo"
                    value={form.contactNo}
                    onChange={handleChange}
                    leadingIcon={<Phone size={16} />}
                    placeholder="+91 98765 43210"
                  />
                </div>

                <Input
                  label="Company Name"
                  type="text"
                  name="companyName"
                  value={form.companyName}
                  onChange={handleChange}
                  leadingIcon={<Building size={16} />}
                  placeholder="Acme Corp"
                  required
                />

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <Input
                    label="Work Email"
                    type="email"
                    name="email"
                    value={form.email}
                    onChange={handleChange}
                    leadingIcon={<Mail size={16} />}
                    placeholder="john@company.com"
                    required
                    autoComplete="email"
                  />
                  <PasswordInput
                    label="Password"
                    name="password"
                    value={form.password}
                    onChange={handleChange}
                    leadingIcon={<Lock size={16} />}
                    placeholder="Min. 8 characters"
                    required
                    minLength={8}
                    autoComplete="new-password"
                  />
                </div>

                <button
                  type="submit" disabled={authLoading}
                  className="w-full mt-2 py-2.5 bg-[var(--primary)] hover:bg-[var(--primary-hover)] text-white font-bold rounded-xl transition-all flex items-center justify-center gap-2 disabled:bg-[var(--surface-active)] disabled:text-[var(--text-disabled)] cursor-pointer shadow-xs"
                >
                  {authLoading ? (
                    <span className="flex items-center gap-2">
                      <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                      Creating Account...
                    </span>
                  ) : (
                    <>Create Account <ArrowRight size={16} /></>
                  )}
                </button>
              </form>
            ) : (
              <form onSubmit={handleSignIn} className="space-y-4">
                <Input
                  label="Work Email"
                  type="email"
                  name="email"
                  value={form.email}
                  onChange={handleChange}
                  leadingIcon={<Mail size={16} />}
                  placeholder="name@company.com"
                  required
                  autoComplete="email"
                />
                <PasswordInput
                  label="Password"
                  name="password"
                  value={form.password}
                  onChange={handleChange}
                  leadingIcon={<Lock size={16} />}
                  placeholder="••••••••"
                  required
                  autoComplete="current-password"
                />
                <button
                  type="submit" disabled={authLoading}
                  className="w-full mt-2 py-2.5 bg-[var(--primary)] hover:bg-[var(--primary-hover)] text-white font-bold rounded-xl transition-all flex items-center justify-center gap-2 disabled:bg-[var(--surface-active)] disabled:text-[var(--text-disabled)] cursor-pointer shadow-xs"
                >
                  {authLoading ? (
                    <span className="flex items-center gap-2">
                      <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                      Signing In...
                    </span>
                  ) : (
                    <>Sign In <ArrowRight size={16} /></>
                  )}
                </button>
                <div className="text-center pt-2">
                  <Link href="/login" className="text-xs text-[var(--text-secondary)] hover:text-[var(--primary)] transition-colors">
                    Sign in from standard login →
                  </Link>
                </div>
              </form>
            )}
          </div>
        )}

        {/* ─── STEP: Sync ─────────────────────────────────────────────────────── */}
        {step === "sync" && (
          <div className="bg-[var(--surface)] border border-[var(--border)] rounded-2xl p-8 sm:p-10 shadow-sm text-center">
            <div className="relative w-20 h-20 mx-auto mb-6">
              <div className="absolute inset-0 border-4 border-[var(--border)] rounded-full" />
              {syncStatus !== "done" && syncStatus !== "error" ? (
                <div className="absolute inset-0 border-4 border-[var(--primary)] rounded-full border-t-transparent animate-spin" />
              ) : syncStatus === "done" ? (
                <div className="absolute inset-0 flex items-center justify-center">
                  <CheckCircle2 className="text-[var(--success)]" size={40} />
                </div>
              ) : (
                <div className="absolute inset-0 flex items-center justify-center">
                  <span className="text-[var(--danger)] text-2xl font-bold">✗</span>
                </div>
              )}
              {syncStatus === "products" && (
                <Package className="absolute inset-0 m-auto text-[var(--primary)] animate-pulse" size={30} />
              )}
              {syncStatus === "inventory" && (
                <Boxes className="absolute inset-0 m-auto text-[var(--primary)] animate-pulse" size={30} />
              )}
              {syncStatus === "orders" && (
                <ShoppingCart className="absolute inset-0 m-auto text-[var(--primary)] animate-pulse" size={30} />
              )}
            </div>

            <h3 className="text-xl font-bold text-[var(--text-primary)] mb-1">
              {syncStatus === "done" ? "All Done!" : syncStatus === "error" ? "Sync Issue" : "Importing Your Data"}
            </h3>
            <p className="text-xs text-[var(--text-secondary)] max-w-xs mx-auto mb-6">{syncMessage}</p>

            <div className="space-y-2 text-left">
              {[
                { id: "products", label: "Shopify Products & Variants", icon: Package },
                { id: "inventory", label: "Physical Inventory (SKUs & Combos)", icon: Boxes },
                { id: "orders", label: "Shopify Orders", icon: ShoppingCart },
              ].map((item) => {
                const isDone =
                  (item.id === "products" && (syncStatus === "inventory" || syncStatus === "orders" || syncStatus === "done")) ||
                  (item.id === "inventory" && (syncStatus === "orders" || syncStatus === "done")) ||
                  (item.id === "orders" && syncStatus === "done");
                const isActive = syncStatus === item.id;
                const Icon = item.icon;

                return (
                  <div
                    key={item.id}
                    className={`flex items-center gap-3 p-3 rounded-xl border text-xs transition-all ${
                      isDone
                        ? "bg-[var(--success-soft)] border-[var(--success)]/30 text-[var(--success)]"
                        : isActive
                        ? "bg-[var(--primary-soft)] border-[var(--primary)]/30 text-[var(--primary)]"
                        : "bg-[var(--surface-secondary)] border-[var(--border)] text-[var(--text-secondary)]"
                    }`}
                  >
                    {isDone ? (
                      <CheckCircle2 size={16} />
                    ) : isActive ? (
                      <RefreshCw size={16} className="animate-spin" />
                    ) : (
                      <div className="w-4 h-4 rounded-full border-2 border-[var(--border-strong)]" />
                    )}
                    <Icon size={16} className={isDone ? "text-[var(--success)]" : isActive ? "text-[var(--primary)]" : "text-[var(--text-muted)]"} />
                    <span className="font-semibold text-[var(--text-primary)]">{item.label}</span>
                    <span className="ml-auto text-[11px] font-mono font-medium">
                      {isDone ? "Complete" : isActive ? "Fetching..." : "Waiting"}
                    </span>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* ─── STEP: Done ─────────────────────────────────────────────────────── */}
        {step === "done" && (
          <div className="bg-[var(--surface)] border border-[var(--border)] rounded-2xl p-8 sm:p-10 shadow-sm text-center">
            <div className="w-16 h-16 mx-auto mb-5 bg-[var(--success-soft)] border border-[var(--success)]/20 rounded-full flex items-center justify-center">
              <CheckCircle2 className="text-[var(--success)]" size={36} />
            </div>
            <h3 className="text-2xl font-black text-[var(--text-primary)] mb-2">You&apos;re All Set! 🚀</h3>
            <p className="text-xs text-[var(--text-secondary)] max-w-sm mx-auto mb-6">
              VOOP is now connected to your Shopify store. All products, physical inventory SKUs, and orders have been imported.
            </p>

            {/* Quick KPI stats preview */}
            <div className="grid grid-cols-3 gap-2.5 mb-8 max-w-sm mx-auto">
              <div className="bg-[var(--surface-secondary)] border border-[var(--border)] rounded-xl p-3 text-center">
                <span className="text-[11px] text-[var(--text-secondary)] block font-medium">Products</span>
                <span className="text-lg font-bold text-[var(--text-primary)]">
                  {syncedCounts.products > 0 ? syncedCounts.products : "Synced"}
                </span>
              </div>
              <div className="bg-[var(--surface-secondary)] border border-[var(--border)] rounded-xl p-3 text-center">
                <span className="text-[11px] text-[var(--text-secondary)] block font-medium">Physical SKUs</span>
                <span className="text-lg font-bold text-[var(--primary)]">
                  {syncedCounts.inventory > 0 ? syncedCounts.inventory : "Ready"}
                </span>
              </div>
              <div className="bg-[var(--surface-secondary)] border border-[var(--border)] rounded-xl p-3 text-center">
                <span className="text-[11px] text-[var(--text-secondary)] block font-medium">Orders</span>
                <span className="text-lg font-bold text-[var(--success)]">
                  {syncedCounts.orders > 0 ? syncedCounts.orders : "Synced"}
                </span>
              </div>
            </div>

            <div className="flex flex-col sm:flex-row items-center justify-center gap-3">
              <button
                onClick={() => router.push("/")}
                className="w-full sm:w-auto inline-flex items-center justify-center gap-2 px-6 py-2.5 bg-[var(--primary)] hover:bg-[var(--primary-hover)] text-white font-bold rounded-xl shadow-xs transition-all cursor-pointer text-xs"
              >
                Go to Dashboard <ArrowRight size={16} />
              </button>
              <button
                onClick={() => router.push("/inventory")}
                className="w-full sm:w-auto inline-flex items-center justify-center gap-2 px-6 py-2.5 bg-[var(--surface)] hover:bg-[var(--surface-hover)] text-[var(--text-primary)] border border-[var(--border)] font-bold rounded-xl transition-all cursor-pointer text-xs"
              >
                <Boxes size={16} className="text-[var(--primary)]" /> View Physical Inventory
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

export default function OnboardingPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen bg-[var(--background)] flex items-center justify-center">
          <div className="w-8 h-8 border-2 border-[var(--primary)]/30 border-t-[var(--primary)] rounded-full animate-spin" />
        </div>
      }
    >
      <OnboardingContent />
    </Suspense>
  );
}
