"use client";

import { Suspense } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import { User, Shield, Store, Users } from "lucide-react";
import { useSession } from "next-auth/react";
import { ProfileTab } from "@/components/settings/ProfileTab";
import { SecurityTab } from "@/components/settings/SecurityTab";
import { StoreTab } from "@/components/settings/StoreTab";
import StaffTab from "@/components/settings/StaffTab";
import { useStoreRoute } from "@/lib/routes";

function SettingsContent({ defaultTab }: { defaultTab?: string }) {
  const searchParams = useSearchParams();
  const router = useRouter();
  const { to } = useStoreRoute();
  
  const currentTab = searchParams.get("tab") || defaultTab || "profile";

  const { data: session } = useSession();
  const userRole = (session?.user as any)?.role || "STAFF";

  const tabs = [
    { id: "account", label: "Account", icon: User },
    { id: "security", label: "Security", icon: Shield },
    { id: "store", label: "Shopify Store", icon: Store },
  ];

  if (userRole === "ADMIN") {
    tabs.push({ id: "staff", label: "Team & Staff", icon: Users as any });
  }

  const handleTabChange = (tabId: string) => {
    router.push(to(`settings?tab=${tabId}`));
  };

  const isAccountTab = currentTab === "account" || currentTab === "profile";

  return (
    <div className="flex flex-col md:flex-row gap-6">
      {/* Sidebar Navigation */}
      <nav className="w-full md:w-64 shrink-0 space-y-1">
        {tabs.map((tab) => {
          const isActive = tab.id === "account" ? isAccountTab : currentTab === tab.id;
          return (
            <button
              key={tab.id}
              onClick={() => handleTabChange(tab.id)}
              className={`w-full flex items-center gap-3 px-4 py-3 rounded-lg text-sm font-medium transition-colors text-left ${
                isActive
                  ? "bg-[var(--accent-soft)] text-[var(--accent)] border border-[var(--accent)]/30 shadow-xs font-semibold"
                  : "text-[var(--text-secondary)] hover:bg-[var(--surface-hover)] hover:text-[var(--text-primary)] border border-transparent"
              }`}
            >
              <tab.icon size={18} className={isActive ? "text-[var(--accent)]" : "text-[var(--text-muted)]"} />
              {tab.label}
            </button>
          );
        })}
      </nav>

      {/* Main Content Area */}
      <div className="flex-1 min-w-0">
        {isAccountTab && <ProfileTab />}
        {currentTab === "security" && <SecurityTab />}
        {currentTab === "store" && <StoreTab initialRole={userRole} />}
        {currentTab === "staff" && <StaffTab userRole={userRole} />}
      </div>
    </div>
  );
}

export default function SettingsView({ defaultTab }: { defaultTab?: string }) {
  return (
    <Suspense fallback={<div className="p-8 text-slate-400">Loading settings...</div>}>
      <SettingsContent defaultTab={defaultTab} />
    </Suspense>
  );
}
