"use client";

import { useState, useEffect, useRef, useMemo } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useSession } from "next-auth/react";
import {
  LayoutDashboard,
  BarChart3,
  ShoppingCart,
  Package,
  Boxes,
  Receipt,
  TrendingUp,
  Barcode,
  Truck,
  Megaphone,
  Users,
  Share2,
  History,
  X,
  Percent,
  Layers,
  Building2,
  FilePlus,
  ChevronDown,
  ChevronRight,
  Settings as SettingsIcon,
  Lock,
  Search,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { hasPermission } from "@/lib/permissions";
import { useStoreRoute } from "@/lib/routes";
import { useActiveStore } from "@/components/store/StoreContext";

interface NavItem {
  name: string;
  section: string;
  icon: any;
  permission?: string;
}

const realtimeNav: NavItem[] = [
  { name: "Dashboard", section: "", icon: LayoutDashboard, permission: "dashboard.view" },
  { name: "Analytics", section: "analytics", icon: BarChart3, permission: "dashboard.view" },
  { name: "P&L Statement", section: "pnl", icon: TrendingUp, permission: "pnl.view" },
  { name: "Orders & Line Items", section: "orders", icon: ShoppingCart, permission: "orders.view" },
];

const taxBillingNav: NavItem[] = [
  { name: "Manual Billing", section: "billing", icon: FilePlus, permission: "orders.view" },
  { name: "Purchases (All Bills)", section: "purchases", icon: Receipt, permission: "purchases.view" },
  { name: "Tax on Sales", section: "tax", icon: Percent, permission: "tax.view" },
];

const logisticsNav: NavItem[] = [
  { name: "Scan Here (IN/OUT)", section: "scanner", icon: Barcode, permission: "shipments.manage" },
  { name: "All Shipments", section: "shipments", icon: Truck, permission: "shipments.view" },
  { name: "Products & Variants", section: "products", icon: Package, permission: "products.view" },
  { name: "Physical Inventory", section: "inventory", icon: Boxes, permission: "inventory.view" },
];

const marketingNav: NavItem[] = [
  { name: "All Ads & ROAS", section: "ads", icon: Megaphone, permission: "ads.view" },
  { name: "Collaborations", section: "collaborations", icon: Users, permission: "ads.view" },
  { name: "Collab Form Builder", section: "form-builder", icon: Share2, permission: "ads.view" },
];

const integrationsNav: NavItem[] = [
  { name: "Company & Invoice", section: "settings/company", icon: Building2, permission: "company_invoice.view" },
  { name: "All Ads Accounts", section: "settings/ads", icon: Layers, permission: "ads.view" },
  { name: "All Courier APIs", section: "settings/couriers", icon: Truck, permission: "courier_api.view" },
  { name: "Settings", section: "settings", icon: SettingsIcon, permission: "settings.view" },
];

const systemNav: NavItem[] = [
  { name: "Sync Logs", section: "sync-logs", icon: History, permission: "settings.view" },
];

interface SidebarProps {
  mobileOpen?: boolean;
  onMobileClose?: () => void;
}

export function Sidebar({ mobileOpen, onMobileClose }: SidebarProps) {
  const pathname = usePathname();
  const { to } = useStoreRoute();
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
  const [collapsedSections, setCollapsedSections] = useState<Record<string, boolean>>({});
  const [lockedNotice, setLockedNotice] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const searchInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        searchInputRef.current?.focus();
      } else if (e.key === "Escape" && document.activeElement === searchInputRef.current) {
        setSearchQuery("");
        searchInputRef.current?.blur();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, []);

  const allNavItems = useMemo(() => [
    ...realtimeNav.map((i) => ({ ...i, group: "REALTIME DATA" })),
    ...taxBillingNav.map((i) => ({ ...i, group: "TAX & BILLING" })),
    ...logisticsNav.map((i) => ({ ...i, group: "LOGISTICS & COURIER" })),
    ...marketingNav.map((i) => ({ ...i, group: "MARKETING & CREATORS" })),
    ...integrationsNav.map((i) => ({ ...i, group: "INTEGRATIONS" })),
    ...systemNav.map((i) => ({ ...i, group: "SYSTEM" })),
  ], []);

  const filteredNavItems = useMemo(() => {
    if (!searchQuery.trim()) return null;
    const q = searchQuery.toLowerCase().trim();
    return allNavItems.filter((item) =>
      item.name.toLowerCase().includes(q) || item.group.toLowerCase().includes(q)
    );
  }, [searchQuery, allNavItems]);

  const handleLockedClick = (itemName: string) => {
    setLockedNotice(`You don't have permission to access this section (${itemName}). Contact your administrator to request access.`);
    setTimeout(() => {
      setLockedNotice((prev) => (prev?.includes(itemName) ? null : prev));
    }, 5000);
  };

  const toggleSection = (section: string) => {
    setCollapsedSections((prev) => ({
      ...prev,
      [section]: !prev[section],
    }));
  };

  if (pathname === "/apply" || pathname?.startsWith("/apply/")) {
    return null;
  }

  const handleNavClick = () => {
    if (onMobileClose) {
      onMobileClose();
    }
  };

  const renderItem = (item: NavItem) => {
    const Icon = item.icon;
    const isAllowed = !mounted ? true : (!item.permission || hasPermission(user, item.permission));
    const targetHref = to(item.section);

    if (!isAllowed) {
      return (
        <button
          key={item.name}
          type="button"
          onClick={() => handleLockedClick(item.name)}
          title={`Click to view access details for ${item.name}`}
          className="w-full flex items-center justify-between px-3 py-2.5 sm:py-2 rounded-lg text-xs opacity-50 cursor-pointer text-[var(--nav-text-secondary)] hover:bg-[var(--nav-hover)] transition-all min-h-[40px] sm:min-h-0 select-none group"
        >
          <div className="flex items-center gap-2.5 truncate">
            <Icon size={16} className="shrink-0 text-[var(--nav-icon)]" />
            <span className="truncate">{item.name}</span>
          </div>
          <Lock size={12} className="shrink-0 text-[var(--nav-icon)] group-hover:text-[var(--nav-text-primary)] transition-colors" />
        </button>
      );
    }

    const currentPath = pathname || "";
    const cleanSection = item.section.replace(/^\//, "");
    let isActive = false;

    if (cleanSection === "") {
      isActive = currentPath === "/" || currentPath.match(/^\/app\/[^/]+$/) !== null;
    } else {
      isActive = currentPath.endsWith("/" + cleanSection) ||
        currentPath.includes("/" + cleanSection + "/") ||
        currentPath === "/" + cleanSection;
    }

    return (
      <Link
        key={item.section || "dashboard"}
        href={targetHref}
        onClick={handleNavClick}
        className={cn(
          "flex items-center gap-2.5 px-3 py-2.5 sm:py-2 rounded-lg text-xs transition-all min-h-[40px] sm:min-h-0 select-none group",
          isActive
            ? "bg-[var(--nav-active)] text-[var(--nav-active-text)] font-semibold shadow-xs"
            : "text-[var(--nav-text-secondary)] hover:text-[var(--nav-text-primary)] hover:bg-[var(--nav-hover)] font-medium"
        )}
      >
        <Icon
          size={16}
          className={cn(
            "shrink-0 transition-colors",
            isActive ? "text-[var(--nav-active-icon)]" : "text-[var(--nav-icon)] group-hover:text-[var(--nav-text-primary)]"
          )}
        />
        <span className="truncate">{item.name}</span>
      </Link>
    );
  };

  const navContent = (
    <div className="flex flex-col h-full select-none bg-[var(--nav-bg)] text-[var(--nav-text-primary)]">
      {/* Brand Header */}
      <div className="p-4 sm:p-5 flex items-center justify-between shrink-0 border-b border-[var(--nav-border)]">
        <div className="flex items-center gap-3">
          <div
            className="w-8 h-8 rounded-xl flex items-center justify-center font-black text-sm text-white shadow-xs"
            style={{
              background: "linear-gradient(135deg, var(--accent) 0%, var(--accent-supporting) 100%)",
            }}
          >
            V
          </div>
          <div>
            <h1 className="font-black text-sm tracking-wider text-[var(--nav-text-primary)]">VOOP</h1>
            <p className="text-[11px] font-medium text-[var(--nav-text-secondary)]">Universal Commerce OS</p>
          </div>
        </div>

        {/* Mobile Close Button */}
        {onMobileClose && (
          <button
            onClick={onMobileClose}
            className="p-1 rounded-lg hover:bg-[var(--nav-hover)] text-[var(--nav-icon)] hover:text-[var(--nav-text-primary)] cursor-pointer"
          >
            <X size={18} />
          </button>
        )}
      </div>

      {/* Global Menu Search Bar */}
      <div className="px-3 pt-3 pb-1 shrink-0">
        <div className="input-wrapper relative flex items-center w-full">
          <div className="input-leading-icon pointer-events-none select-none">
            <Search size={14} className="text-[var(--nav-icon)]" />
          </div>
          <input
            ref={searchInputRef}
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search menu..."
            className="input-base input-with-leading-icon w-full py-1.5 rounded-lg text-xs outline-none transition-all font-medium bg-[var(--nav-search-bg)] border border-[var(--nav-search-border)] text-[var(--nav-search-text)] placeholder:text-[var(--nav-search-placeholder)] focus:border-[var(--accent)]"
            style={{
              paddingInlineStart: "38px",
              paddingInlineEnd: searchQuery ? "32px" : "48px",
            }}
          />
          {searchQuery ? (
            <button
              type="button"
              onClick={() => {
                setSearchQuery("");
                searchInputRef.current?.focus();
              }}
              className="input-trailing-icon p-0.5 rounded-md text-[var(--nav-text-secondary)] hover:text-[var(--nav-text-primary)] hover:bg-[var(--nav-hover)] transition-colors cursor-pointer"
              title="Clear search"
            >
              <X size={12} />
            </button>
          ) : (
            <kbd className="input-trailing-shortcut px-1.5 py-0.5 rounded text-[10px] font-mono bg-[var(--nav-hover)] border border-[var(--nav-border)] text-[var(--nav-text-muted)] pointer-events-none select-none">
              ⌘K
            </kbd>
          )}
        </div>
      </div>

      {/* Navigation Links */}
      <nav className="flex-1 min-h-0 px-3 py-4 space-y-5 overflow-y-auto overscroll-contain sidebar-scrollbar">
        {filteredNavItems !== null ? (
          <div className="space-y-1.5">
            <div className="flex items-center justify-between px-2 mb-2">
              <span className="text-[10px] font-bold uppercase tracking-wider text-[var(--nav-text-muted)]">
                Search Results ({filteredNavItems.length})
              </span>
              <button
                type="button"
                onClick={() => setSearchQuery("")}
                className="text-[10px] font-bold text-[var(--accent)] hover:underline cursor-pointer"
              >
                Clear
              </button>
            </div>
            {filteredNavItems.length === 0 ? (
              <div className="p-4 text-center text-xs text-[var(--nav-text-secondary)] bg-[var(--nav-search-bg)] rounded-xl border border-[var(--nav-border)]">
                No menu items match &ldquo;{searchQuery}&rdquo;
              </div>
            ) : (
              filteredNavItems.map((item) => (
                <div key={item.section || "dashboard"} className="relative group">
                  {renderItem(item)}
                  <span className="absolute right-2.5 top-1/2 -translate-y-1/2 px-1.5 py-0.5 rounded text-[9px] font-mono font-bold uppercase bg-[var(--nav-hover)] border border-[var(--nav-border)] text-[var(--nav-text-muted)] pointer-events-none">
                    {item.group}
                  </span>
                </div>
              ))
            )}
          </div>
        ) : (
          <>
            {/* REALTIME DATA */}
            <div>
              <button
                onClick={() => toggleSection("realtime")}
                className="w-full flex items-center justify-between px-3 mb-1.5 group outline-hidden cursor-pointer"
              >
                <p className="text-[10px] font-bold uppercase tracking-widest text-[var(--nav-text-muted)] group-hover:text-[var(--nav-text-primary)] transition-colors">
                  REALTIME DATA
                </p>
                {collapsedSections["realtime"] ? (
                  <ChevronRight size={14} className="text-[var(--nav-text-muted)]" />
                ) : (
                  <ChevronDown size={14} className="text-[var(--nav-text-muted)]" />
                )}
              </button>
              {!collapsedSections["realtime"] && (
                <div className="space-y-0.5">
                  {realtimeNav.map((item) => renderItem(item))}
                </div>
              )}
            </div>

            {/* TAX & BILLING */}
            <div>
              <button
                onClick={() => toggleSection("taxBilling")}
                className="w-full flex items-center justify-between px-3 mb-1.5 group outline-hidden cursor-pointer"
              >
                <p className="text-[10px] font-bold uppercase tracking-widest text-[var(--nav-text-muted)] group-hover:text-[var(--nav-text-primary)] transition-colors">
                  TAX &amp; BILLING
                </p>
                {collapsedSections["taxBilling"] ? (
                  <ChevronRight size={14} className="text-[var(--nav-text-muted)]" />
                ) : (
                  <ChevronDown size={14} className="text-[var(--nav-text-muted)]" />
                )}
              </button>
              {!collapsedSections["taxBilling"] && (
                <div className="space-y-0.5">
                  {taxBillingNav.map((item) => renderItem(item))}
                </div>
              )}
            </div>

            {/* LOGISTICS & COURIER */}
            <div>
              <button
                onClick={() => toggleSection("logistics")}
                className="w-full flex items-center justify-between px-3 mb-1.5 group outline-hidden cursor-pointer"
              >
                <p className="text-[10px] font-bold uppercase tracking-widest text-[var(--nav-text-muted)] group-hover:text-[var(--nav-text-primary)] transition-colors">
                  LOGISTICS &amp; COURIER
                </p>
                {collapsedSections["logistics"] ? (
                  <ChevronRight size={14} className="text-[var(--nav-text-muted)]" />
                ) : (
                  <ChevronDown size={14} className="text-[var(--nav-text-muted)]" />
                )}
              </button>
              {!collapsedSections["logistics"] && (
                <div className="space-y-0.5">
                  {logisticsNav.map((item) => renderItem(item))}
                </div>
              )}
            </div>

            {/* MARKETING & CREATORS */}
            <div>
              <button
                onClick={() => toggleSection("marketing")}
                className="w-full flex items-center justify-between px-3 mb-1.5 group outline-hidden cursor-pointer"
              >
                <p className="text-[10px] font-bold uppercase tracking-widest text-[var(--nav-text-muted)] group-hover:text-[var(--nav-text-primary)] transition-colors">
                  MARKETING &amp; CREATORS
                </p>
                {collapsedSections["marketing"] ? (
                  <ChevronRight size={14} className="text-[var(--nav-text-muted)]" />
                ) : (
                  <ChevronDown size={14} className="text-[var(--nav-text-muted)]" />
                )}
              </button>
              {!collapsedSections["marketing"] && (
                <div className="space-y-0.5">
                  {marketingNav.map((item) => renderItem(item))}
                </div>
              )}
            </div>

            {/* INTEGRATIONS */}
            <div>
              <button
                onClick={() => toggleSection("integrations")}
                className="w-full flex items-center justify-between px-3 mb-1.5 group outline-hidden cursor-pointer"
              >
                <p className="text-[10px] font-bold uppercase tracking-widest text-[var(--nav-text-muted)] group-hover:text-[var(--nav-text-primary)] transition-colors">
                  INTEGRATIONS
                </p>
                {collapsedSections["integrations"] ? (
                  <ChevronRight size={14} className="text-[var(--nav-text-muted)]" />
                ) : (
                  <ChevronDown size={14} className="text-[var(--nav-text-muted)]" />
                )}
              </button>
              {!collapsedSections["integrations"] && (
                <div className="space-y-0.5">
                  {integrationsNav.map((item) => renderItem(item))}
                </div>
              )}
            </div>

            {/* SYSTEM */}
            <div>
              <button
                onClick={() => toggleSection("system")}
                className="w-full flex items-center justify-between px-3 mb-1.5 group outline-hidden cursor-pointer"
              >
                <p className="text-[10px] font-bold uppercase tracking-widest text-[var(--nav-text-muted)] group-hover:text-[var(--nav-text-primary)] transition-colors">
                  SYSTEM
                </p>
                {collapsedSections["system"] ? (
                  <ChevronRight size={14} className="text-[var(--nav-text-muted)]" />
                ) : (
                  <ChevronDown size={14} className="text-[var(--nav-text-muted)]" />
                )}
              </button>
              {!collapsedSections["system"] && (
                <div className="space-y-0.5">
                  {systemNav.map((item) => renderItem(item))}
                </div>
              )}
            </div>
          </>
        )}
      </nav>

      {/* Locked Section Notice Banner */}
      {lockedNotice && (
        <div className="mx-3 mb-2 p-2.5 rounded-lg bg-amber-500/10 border border-amber-500/30 text-amber-600 dark:text-amber-400 text-xs flex items-start gap-2 animate-in fade-in shrink-0">
          <Lock size={14} className="shrink-0 mt-0.5 text-amber-600 dark:text-amber-400" />
          <div className="flex-1 text-[11px] leading-snug">
            {lockedNotice}
          </div>
          <button
            type="button"
            onClick={() => setLockedNotice(null)}
            className="text-amber-600 dark:text-amber-400 hover:opacity-80 p-0.5 shrink-0 cursor-pointer"
          >
            <X size={12} />
          </button>
        </div>
      )}

      {/* Footer Info */}
      <div className="p-3 text-[10px] flex items-center justify-between shrink-0 border-t border-[var(--nav-border)] bg-[var(--nav-bg)] text-[var(--nav-text-secondary)]">
        <span className="flex items-center gap-1 font-medium">
          <span className="w-1.5 h-1.5 rounded-full bg-emerald-500"></span>
          Shopify Live
        </span>
        <span className="font-mono text-[var(--nav-text-muted)]">VOOP OS v3.0</span>
      </div>
    </div>
  );

  return (
    <>
      {/* Desktop Fixed Sidebar */}
      <aside className="hidden md:flex flex-col shrink-0 h-screen w-64 bg-[var(--nav-bg)] border-r border-[var(--nav-border)] transition-all">
        {navContent}
      </aside>

      {/* Mobile Drawer Backdrop & Drawer */}
      {mobileOpen && (
        <div className="md:hidden fixed inset-0 z-50 flex">
          {/* Backdrop */}
          <div
            onClick={onMobileClose}
            className="fixed inset-0 bg-black/80 backdrop-blur-xs animate-fade-in transition-opacity"
          />

          {/* Drawer Body */}
          <aside className="relative z-10 w-72 max-w-[85vw] shadow-2xl flex flex-col h-full bg-[var(--nav-bg)] border-r border-[var(--nav-border)] animate-slide-in transition-colors">
            {navContent}
          </aside>
        </div>
      )}
    </>
  );
}
