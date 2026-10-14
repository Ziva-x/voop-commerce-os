"use client";

import React from "react";
import { useSession } from "next-auth/react";
import { useRouter } from "next/navigation";
import { ShieldAlert, Lock, ArrowLeft } from "lucide-react";
import { hasPermission } from "@/lib/permissions";
import { isEmbeddedContext } from "@/lib/api";
import { useActiveStore } from "@/components/store/StoreContext";

interface RouteGuardProps {
  requiredPermission: string;
  moduleName?: string;
  children: React.ReactNode;
}

export function RouteGuard({ requiredPermission, moduleName = "this section", children }: RouteGuardProps) {
  const { data: session, status } = useSession();
  const { activeStore, isLoading: isStoreLoading } = useActiveStore();
  const router = useRouter();

  // In Shopify embedded mode, verify that the store is loaded and not logged out
  if (typeof window !== "undefined" && isEmbeddedContext()) {
    if (sessionStorage.getItem("voop_embedded_logged_out") === "true" || (!isStoreLoading && !activeStore)) {
      return (
        <div className="flex flex-col items-center justify-center min-h-[350px] p-6 text-slate-400">
          <div className="w-8 h-8 border-2 border-cyan-500 border-t-transparent rounded-full animate-spin mb-3" />
          <p className="text-xs font-medium text-slate-400">Redirecting...</p>
        </div>
      );
    }
    return <>{children}</>;
  }

  const tabRole = typeof window !== "undefined" ? sessionStorage.getItem("voop_tab_role") : null;
  const tabPerms = typeof window !== "undefined" ? sessionStorage.getItem("voop_tab_permissions") : null;

  const effectiveUser = activeStore?.role
    ? {
        role: activeStore.role,
        permissions: activeStore.permissions,
      }
    : tabRole
      ? {
          role: tabRole,
          permissions: tabPerms,
        }
      : (session?.user as any);

  if (effectiveUser && hasPermission(effectiveUser, requiredPermission)) {
    return <>{children}</>;
  }

  if (status === "loading") {
    return (
      <div className="flex flex-col items-center justify-center min-h-[350px] p-6 text-slate-400">
        <div className="w-8 h-8 border-2 border-cyan-500 border-t-transparent rounded-full animate-spin mb-3" />
        <p className="text-xs font-medium text-slate-400">Verifying security permissions...</p>
      </div>
    );
  }

  const isAllowed = hasPermission(effectiveUser, requiredPermission);

  if (!isAllowed) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] px-4 py-12 text-center max-w-lg mx-auto">
        {/* Glowing Lock Badge */}
        <div className="w-16 h-16 rounded-2xl bg-amber-500/10 border border-amber-500/30 flex items-center justify-center text-amber-400 mb-6 shadow-lg shadow-amber-500/10">
          <Lock size={32} />
        </div>

        <h2 className="text-xl sm:text-2xl font-black text-white tracking-tight">
          Access Restricted
        </h2>

        <p className="text-sm text-slate-400 mt-2 leading-relaxed">
          Your account does not have permission to view or manage{" "}
          <span className="text-slate-200 font-semibold">{moduleName}</span>.
        </p>

        <div className="mt-4 px-3.5 py-1.5 rounded-lg bg-slate-900/80 border border-slate-800 text-[11px] font-mono text-amber-400/90 flex items-center gap-2">
          <ShieldAlert size={14} />
          <span>Required permission: {requiredPermission}</span>
        </div>

        <p className="text-xs text-slate-500 mt-4 max-w-sm">
          Please contact your VOOP Store Administrator if you require access to this workflow.
        </p>

        <button
          onClick={() => router.push("/")}
          className="mt-6 inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 active:bg-slate-900 text-white font-semibold text-xs transition-all shadow-md touch-press"
        >
          <ArrowLeft size={16} />
          <span>Return to Dashboard</span>
        </button>
      </div>
    );
  }

  return <>{children}</>;
}
