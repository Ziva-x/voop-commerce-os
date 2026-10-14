"use client";

import { Suspense, useState } from "react";
import { signIn } from "next-auth/react";
import { useRouter, useSearchParams } from "next/navigation";
import { ArrowRight, Lock, Mail, Store } from "lucide-react";
import Link from "next/link";
import { Input, PasswordInput } from "@/components/ui/Input";

// Map NextAuth error codes to human-readable messages
const AUTH_ERRORS: Record<string, string> = {
  CredentialsSignin: "Invalid email or password.",
  "No account found with that email address.": "No account found with that email address.",
  "Incorrect password. Please try again.": "Incorrect password. Please try again.",
  "Database did not respond within 8s. Please try again.": "Server is busy. Please wait a moment and try again.",
};

function friendlyError(code: string): string {
  if (!code || code === "undefined" || code === "null") {
    return "Sign-in failed. Please check your credentials and try again.";
  }
  return AUTH_ERRORS[code] ?? code ?? "Sign-in failed. Please try again.";
}

// Inner component — uses useSearchParams so it MUST be wrapped in Suspense (Next.js 14)
function LoginForm() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const router = useRouter();
  const searchParams = useSearchParams();

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError("");

    const rawCallback = searchParams.get("callbackUrl") || "/";
    const cleanCallbackUrl = (rawCallback.startsWith("/login") || rawCallback.includes("error=")) ? "/" : rawCallback;

    try {
      const res = await signIn("credentials", {
        email: email.trim(),
        password,
        callbackUrl: cleanCallbackUrl,
        redirect: false,
      });

      if (!res) {
        setError("No response from server. Check your connection and try again.");
        return;
      }

      if (res.error && res.error !== "undefined") {
        setError(friendlyError(res.error));
        return;
      }

      if (res.ok) {
        try {
          sessionStorage.clear();
        } catch (_e) {}

        const tabId = typeof crypto !== "undefined" && crypto.randomUUID ? crypto.randomUUID() : "tab_" + Math.random().toString(36).substring(2, 9);
        try {
          sessionStorage.setItem("voop.tabId", tabId);
          sessionStorage.setItem("voop_tab_id", tabId);
        } catch (_e) {}

        try {
          const tokenRes = await fetch("/api/auth/token");
          if (tokenRes.ok) {
            const tokenJson = await tokenRes.json();
            if (tokenJson.token) {
              sessionStorage.setItem("voop.token", tokenJson.token);
              sessionStorage.setItem("voop_session_token", tokenJson.token);
            }
          }
        } catch (_tokenErr) {}

        try {
          const { appFetch } = await import("@/lib/api");
          const prefRes = await appFetch("/api/user/preferences");
          if (prefRes.ok) {
            const prefJson = await prefRes.json();
            if (prefJson.interfaceStyle) {
              sessionStorage.setItem("voop_interface_style", prefJson.interfaceStyle);
              localStorage.setItem("voop_interface_style_active", prefJson.interfaceStyle);
            }
            if (prefJson.accentTheme) {
              sessionStorage.setItem("voop_accent_theme", prefJson.accentTheme);
              localStorage.setItem("voop_accent_theme", prefJson.accentTheme);
            }
          }
        } catch (_prefErr) {}

        try {
          const { appFetch } = await import("@/lib/api");
          const storeRes = await appFetch("/api/account/store");
          if (storeRes.ok) {
            const storeJson = await storeRes.json();
            if (storeJson.store?.id) {
              sessionStorage.setItem("voop.activeStoreId", storeJson.store.id);
              sessionStorage.setItem("voop_active_store_id", storeJson.store.id);
            }
            if (storeJson.publicStoreRef) {
              sessionStorage.setItem("voop.publicStoreRef", storeJson.publicStoreRef);
              sessionStorage.setItem("voop_active_public_store_ref", storeJson.publicStoreRef);
            }
            if (storeJson.voopStoreId) {
              sessionStorage.setItem("voop.voopStoreId", storeJson.voopStoreId);
              sessionStorage.setItem("voop_active_voop_store_id", storeJson.voopStoreId);
            }

            const publicRef = storeJson.publicStoreRef || storeJson.voopStoreId;
            if (publicRef) {
              router.push(`/app/${publicRef}`);
              router.refresh();
              return;
            }
          }
        } catch (_storeErr) {}

        router.push(cleanCallbackUrl);
        router.refresh();
        return;
      }

      setError("Unexpected response. Please try again.");
    } catch (err: any) {
      console.error("[Login] Unexpected error:", err);
      setError(err?.message || "An unexpected error occurred. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="bg-[var(--surface)] border border-[var(--border)] rounded-2xl p-6 sm:p-8 shadow-sm">
      <form onSubmit={handleLogin} className="space-y-4">
        {error && (
          <div className="p-3.5 rounded-xl bg-[var(--danger-soft)] border border-[var(--danger)]/20 text-[var(--danger)] text-xs font-semibold">
            {error}
          </div>
        )}

        <div>
          <Input
            id="email"
            label="Email or Username"
            type="text"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            leadingIcon={<Mail size={16} />}
            placeholder="name@company.com or @username"
            required
            autoComplete="username"
          />
        </div>

        <div>
          <div className="flex items-center justify-between mb-1.5">
            <label htmlFor="password" className="text-xs font-semibold text-[var(--text-primary)] select-none">Password</label>
            <Link href="#" className="text-xs font-medium text-[var(--primary)] hover:text-[var(--primary-hover)]">
              Forgot Password?
            </Link>
          </div>
          <PasswordInput
            id="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            leadingIcon={<Lock size={16} />}
            placeholder="••••••••"
            required
            autoComplete="current-password"
          />
        </div>

        <button
          id="sign-in-btn"
          type="submit"
          disabled={loading}
          className="w-full mt-3 py-2.5 bg-[var(--primary)] hover:bg-[var(--primary-hover)] text-white font-bold rounded-xl shadow-sm transition-all flex items-center justify-center gap-2 disabled:bg-[var(--surface-active)] disabled:text-[var(--text-disabled)] disabled:cursor-not-allowed cursor-pointer"
        >
          {loading ? (
            <span className="flex items-center gap-2">
              <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
              Signing In...
            </span>
          ) : (
            <>
              Sign In <ArrowRight size={16} />
            </>
          )}
        </button>
      </form>
    </div>
  );
}

export default function LoginPage() {
  return (
    <div className="min-h-screen bg-[var(--background)] flex flex-col items-center justify-center p-4 relative">
      <div className="w-full max-w-md z-10">
        <div className="flex flex-col items-center mb-8 text-center">
          <div className="w-12 h-12 bg-[var(--surface)] border border-[var(--border)] rounded-2xl flex items-center justify-center mb-4 shadow-xs">
            <Store className="text-[var(--primary)]" size={24} />
          </div>
          <h1 className="text-2xl font-black text-[var(--text-primary)] tracking-tight">VOOP Universal OS</h1>
          <p className="text-xs text-[var(--text-secondary)] mt-1 font-medium">Sign in to your merchant dashboard</p>
        </div>

        <Suspense
          fallback={
            <div className="bg-[var(--surface)] border border-[var(--border)] rounded-2xl p-6 flex items-center justify-center h-48">
              <div className="w-6 h-6 border-2 border-[var(--primary)]/30 border-t-[var(--primary)] rounded-full animate-spin" />
            </div>
          }
        >
          <LoginForm />
        </Suspense>

        <div className="mt-6 text-center text-xs text-[var(--text-secondary)]">
          New to VOOP?{" "}
          <Link href="/register" className="font-semibold text-[var(--primary)] hover:text-[var(--primary-hover)] transition-colors">
            Create an account
          </Link>
        </div>
      </div>
    </div>
  );
}
