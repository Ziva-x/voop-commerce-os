"use client";

import React, { useState, useEffect } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useSession } from "next-auth/react";
import { BottomSheet } from "@/components/ui/BottomSheet";
import {
  LayoutDashboard,
  BarChart3,
  TrendingUp,
  ShoppingCart,
  FilePlus,
  Receipt,
  Percent,
  Barcode,
  Truck,
  Package,
  Boxes,
  Megaphone,
  Users,
  Share2,
  Building2,
  Layers,
  Settings,
  History,
  LogOut,
  ChevronRight,
  Lock,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { hasPermission } from "@/lib/permissions";
import { useStoreRoute } from "@/lib/routes";
import { useActiveStore } from "@/components/store/StoreContext";

interface MoreBottomSheetProps {
  isOpen: boolean;
  onClose: () => void;
}

interface MoreNavItem {
  name: string;
  section: string;
  icon: any;
  permission?: string;
}

export function MoreBottomSheet({ isOpen, onClose }: MoreBottomSheetProps) {
  const pathname = usePathname();
  const { storeRef, to } = useStoreRoute();
  const { activeStore } = useActiveStore();
  const { data: session } = useSession();

  const [mounted, setMounted] = useState(false);
  const [tabUser, setTabUser] = useState<{ role?: string; permissions?: any } | null>(null);

  useEffect(() => {
    setMounted(true);
    try {
      const role = sessionStorage.getItem("voop_tab_role");
      const perms = sessionStorage.getItem("voop_tab_permissions");
      if (role) {
        setTabUser({ role, permissions: perms });
      }
    } catch (_) {}
  }, []);

  const user = activeStore?.role
    ? {
        role: activeStore.role,
        permissions: activeStore.permissions,
      }
    : tabUser
      ? tabUser
      : (session?.user as any);

  const handleLinkClick = () => {
    onClose();
  };

  const handleLogout = async () => {
    onClose();
    const isEmbedded =
      typeof window !== "undefined" &&
      (window.top !== window.self || Boolean((window as any).shopify));

    if (isEmbedded) {
      const confirmed = window.confirm(
        "Sign out of VOOP? Your Shopify Admin session will remain active."
      );
      if (!confirmed) return;

      try {
        const voopKeys = Object.keys(sessionStorage).filter(
          (k) => k.startsWith("voop") || k.startsWith("voop_") || k.startsWith("activeStore") || k.startsWith("activeShop")
        );
        voopKeys.forEach((k) => sessionStorage.removeItem(k));
      } catch (_e) {}

      const params = new URLSearchParams(window.location.search);
      const shop = params.get("shop") || (window as any).shopify?.config?.shop || "";
      const host = params.get("host") || (window as any).shopify?.config?.host || "";
      const qs = new URLSearchParams();
      if (shop) qs.set("shop", shop);
      if (host) qs.set("host", host);
      window.location.href = `/embedded-logout${qs.toString() ? `?${qs.toString()}` : ""}`;
      return;
    }

    const confirmed = window.confirm("Sign out of VOOP on this tab?");
    if (!confirmed) return;

    try {
      const voopKeys = Object.keys(sessionStorage).filter(
        (k) => k.startsWith("voop") || k.startsWith("voop_") || k.startsWith("activeStore") || k.startsWith("activeShop")
      );
      voopKeys.forEach((k) => sessionStorage.removeItem(k));
    } catch (_e) {}

    window.location.href = "/login";
  };

  // Canonical 6 navigation groups matching desktop Sidebar.tsx
  const navSections: { title: string; items: MoreNavItem[] }[] = [
    {
      title: "REALTIME DATA",
      items: [
        { name: "Dashboard", section: "", icon: LayoutDashboard, permission: "dashboard.view" },
        { name: "Analytics", section: "analytics", icon: BarChart3, permission: "dashboard.view" },
        { name: "P&L Statement", section: "pnl", icon: TrendingUp, permission: "pnl.view" },
        { name: "Orders & Line Items", section: "orders", icon: ShoppingCart, permission: "orders.view" },
      ],
    },
    {
      title: "TAX & BILLING",
      items: [
        { name: "Manual Billing", section: "billing", icon: FilePlus, permission: "orders.view" },
        { name: "Purchases (All Bills)", section: "purchases", icon: Receipt, permission: "purchases.view" },
        { name: "Tax on Sales", section: "tax", icon: Percent, permission: "tax.view" },
      ],
    },
    {
      title: "LOGISTICS & COURIER",
      items: [
        { name: "Scan Here (IN/OUT)", section: "scanner", icon: Barcode, permission: "shipments.manage" },
        { name: "All Shipments", section: "shipments", icon: Truck, permission: "shipments.view" },
        { name: "Products & Variants", section: "products", icon: Package, permission: "products.view" },
        { name: "Physical Inventory", section: "inventory", icon: Boxes, permission: "inventory.view" },
      ],
    },
    {
      title: "MARKETING & CREATORS",
      items: [
        { name: "All Ads & ROAS", section: "ads", icon: Megaphone, permission: "ads.view" },
        { name: "Collaborations", section: "collaborations", icon: Users, permission: "ads.view" },
        { name: "Collab Form Builder", section: "form-builder", icon: Share2, permission: "ads.view" },
      ],
    },
    {
      title: "INTEGRATIONS",
      items: [
        { name: "Company & Invoice", section: "settings/company", icon: Building2, permission: "company_invoice.view" },
        { name: "All Ads Accounts", section: "settings/ads", icon: Layers, permission: "ads.view" },
        { name: "All Courier APIs", section: "settings/couriers", icon: Truck, permission: "courier_api.view" },
        { name: "Settings", section: "settings", icon: Settings, permission: "settings.view" },
      ],
    },
    {
      title: "SYSTEM",
      items: [
        { name: "Sync Logs", section: "sync-logs", icon: History, permission: "settings.view" },
      ],
    },
  ];

  const initials = user?.name
    ? user.name
        .split(" ")
        .map((n: string) => n[0])
        .join("")
        .toUpperCase()
        .slice(0, 2)
    : "VO";

  return (
    <BottomSheet
      isOpen={isOpen}
      onClose={onClose}
      title="All Modules & Navigation"
      subtitle="Quick access to all VOOP SaaS workflows"
      maxHeight="88vh"
    >
      <div className="space-y-5">
        {navSections.map((section, sIdx) => (
          <div key={sIdx} className="space-y-2">
            <h4 className="text-[11px] font-bold text-[var(--text-muted)] uppercase tracking-wider px-1">
              {section.title}
            </h4>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5">
              {section.items.map((item) => {
                const Icon = item.icon;
                const isAllowed = !mounted ? true : (!item.permission || hasPermission(user, item.permission));

                if (!isAllowed) {
                  return (
                    <div
                      key={item.name}
                      title="Admin permission required"
                      className="flex items-center justify-between p-3 rounded-xl min-h-[48px] opacity-40 cursor-not-allowed select-none bg-[var(--bg-secondary)] text-[var(--text-muted)] border border-[var(--border)]/40"
                    >
                      <div className="flex items-center gap-3">
                        <div className="w-8 h-8 rounded-lg flex items-center justify-center bg-[var(--surface)] text-[var(--text-muted)] border border-[var(--border)]">
                          <Icon size={18} strokeWidth={1.8} />
                        </div>
                        <span className="text-sm text-[var(--text-secondary)]">{item.name}</span>
                      </div>
                      <div className="flex items-center gap-1 text-xs text-[var(--text-muted)] font-mono">
                        <Lock size={14} className="text-[var(--text-muted)]" />
                        <span className="text-[10px]">Locked</span>
                      </div>
                    </div>
                  );
                }

                const targetHref = to(item.section);
                const currentPath = pathname || "";
                const cleanSection = item.section.replace(/^\//, "");
                let isActive = false;

                if (cleanSection === "") {
                  isActive = currentPath === "/" || currentPath.match(/^\/app\/[^/]+$/) !== null;
                } else {
                  isActive =
                    currentPath === targetHref ||
                    currentPath === `/app/${storeRef}/${cleanSection}` ||
                    currentPath.startsWith(`/app/${storeRef}/${cleanSection}/`) ||
                    currentPath === `/${cleanSection}` ||
                    currentPath.startsWith(`/${cleanSection}/`);
                }

                return (
                  <Link
                    key={item.name}
                    href={targetHref}
                    onClick={handleLinkClick}
                    className={cn(
                      "flex items-center justify-between p-3 rounded-xl transition-all min-h-[48px] touch-press",
                      isActive
                        ? "bg-[var(--accent-soft)] text-[var(--accent)] border border-[var(--accent)]/30 shadow-xs font-semibold"
                        : "bg-[var(--bg-secondary)] hover:bg-[var(--surface-hover)] text-[var(--text-primary)] border border-[var(--border)]"
                    )}
                  >
                    <div className="flex items-center gap-3">
                      <div
                        className={cn(
                          "w-8 h-8 rounded-lg flex items-center justify-center transition-colors",
                          isActive
                            ? "bg-[var(--accent)] text-white"
                            : "bg-[var(--surface)] text-[var(--text-secondary)] border border-[var(--border)]"
                        )}
                      >
                        <Icon size={18} strokeWidth={isActive ? 2.2 : 1.8} />
                      </div>
                      <span className="text-sm font-medium">{item.name}</span>
                    </div>
                    <ChevronRight size={15} className="text-[var(--text-muted)]" />
                  </Link>
                );
              })}
            </div>
          </div>
        ))}

        {/* User Account & Logout Card */}
        {user && (
          <div className="pt-2 border-t border-[var(--border)]/80">
            <div className="p-3.5 rounded-2xl bg-[var(--surface)] border border-[var(--border)] flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-[var(--accent-soft)] border border-[var(--accent)]/30 flex items-center justify-center text-[var(--accent)] font-black text-sm">
                  {initials}
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-bold text-[var(--text-primary)]">{user.name}</span>
                    <span className="text-[10px] font-mono px-1.5 py-0.2 rounded bg-[var(--bg-secondary)] text-[var(--text-secondary)] border border-[var(--border)]">
                      {user.role || "ADMIN"}
                    </span>
                  </div>
                  <p className="text-xs text-[var(--text-muted)] font-mono">@{user.username || user.email}</p>
                </div>
              </div>

              <button
                onClick={handleLogout}
                className="p-2.5 rounded-xl text-rose-400 hover:text-rose-300 hover:bg-rose-500/10 border border-rose-500/20 transition-all flex items-center gap-1.5 text-xs font-semibold touch-press min-h-[44px]"
                title="Sign Out"
              >
                <LogOut size={16} />
                <span className="hidden sm:inline">Sign Out</span>
              </button>
            </div>
          </div>
        )}
      </div>
    </BottomSheet>
  );
}
