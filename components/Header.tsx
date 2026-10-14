"use client";

import { useEffect, useState, useRef } from "react";
import { useRouter, usePathname } from "next/navigation";
import { Store, Palette, Bell, ChevronDown, Check } from "lucide-react";
import { formatDate } from "@/lib/utils";
import { useTheme } from "@/components/ThemeProvider";
import { AccountMenu } from "./AccountMenu";
import { NotificationBottomSheet } from "@/components/navigation/NotificationBottomSheet";
import { ThemeBottomSheet } from "@/components/theme/ThemeBottomSheet";
import { appFetch, isEmbeddedContext } from "@/lib/api";
import { useSession } from "next-auth/react";
import { useActiveStore } from "@/components/store/StoreContext";
import { cn } from "@/lib/utils";
import { storeRoute, extractSectionFromPathname } from "@/lib/routes";

interface HeaderProps {
  onOpenMobileMenu?: () => void;
}

export function Header({ onOpenMobileMenu }: HeaderProps) {
  const router = useRouter();
  const pathname = usePathname();
  const { data: session } = useSession();
  const { isThemeSheetOpen, openThemeSheet, closeThemeSheet } = useTheme();
  const { activeStore, availableStores, switchStore } = useActiveStore();
  const [storeData, setStoreData] = useState<any>(null);
  const [isNotificationOpen, setIsNotificationOpen] = useState(false);
  const [isStoreDropdownOpen, setIsStoreDropdownOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  // Close dropdown on outside click
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsStoreDropdownOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const fetchStatus = async () => {
    try {
      const res = await appFetch("/api/account/store");
      if (res.ok) {
        const json = await res.json();
        setStoreData(json.store);
      }
    } catch (e) {
      console.error(e);
    }
  };

  useEffect(() => {
    fetchStatus();
    const interval = setInterval(fetchStatus, 30000);
    return () => clearInterval(interval);
  }, [activeStore?.id]);

  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  const isEmbedded =
    mounted &&
    typeof window !== "undefined" &&
    (window.top !== window.self || isEmbeddedContext());
  const currentStore = activeStore || storeData;
  const username = mounted ? (currentStore?.username || (session?.user as any)?.username || null) : null;

  return (
    <>
      <header className="sticky top-0 z-30 select-none transition-colors backdrop-blur-md border-b border-[var(--border)] bg-[var(--surface)]/95 text-[var(--text-primary)]">
        {/* ─── 1. MOBILE / ANDROID COMPACT TOP BAR (<768px) ─── */}
        <div className="md:hidden">
          <div className="h-14 px-4 flex items-center justify-between">
            {/* Left: VOOP Logo / Brand */}
            <div className="flex items-center gap-2.5">
              <div
                className="w-8 h-8 rounded-xl flex items-center justify-center font-black text-white text-sm shadow-xs"
                style={{
                  background: "linear-gradient(135deg, var(--accent) 0%, var(--accent-supporting) 100%)",
                }}
              >
                V
              </div>
              <div className="flex items-baseline gap-1.5">
                <span className="text-base font-black tracking-wider text-[var(--text-primary)]">VOOP</span>
                {mounted && username && (
                  <span className="text-[10px] font-mono font-medium text-[var(--text-secondary)]">
                    @{username}
                  </span>
                )}
              </div>
            </div>

            {/* Right: Notifications 🔔 + Theme 🎨 */}
            <div className="flex items-center gap-1.5">
              <button
                onClick={() => setIsNotificationOpen(true)}
                className="p-2.5 rounded-xl transition-all min-w-[44px] min-h-[44px] flex items-center justify-center touch-press text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--surface-hover)] cursor-pointer"
                title="Notifications"
                aria-label="Notifications"
              >
                <div className="relative">
                  <Bell size={19} />
                  <span className="absolute -top-1 -right-1 w-2 h-2 rounded-full bg-[var(--accent)]" />
                </div>
              </button>

              <button
                onClick={openThemeSheet}
                className="p-2.5 rounded-xl transition-all min-w-[44px] min-h-[44px] flex items-center justify-center touch-press text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--surface-hover)] cursor-pointer"
                title="Personalize Theme"
                aria-label="Personalize Theme"
              >
                <div className="relative flex items-center justify-center">
                  <Palette size={19} className="text-[var(--accent)]" />
                </div>
              </button>
            </div>
          </div>

          {/* Compact Store Selector / Chip below mobile header */}
          {mounted && currentStore && (
            <div className="px-4 py-1.5 border-t border-[var(--border)] flex items-center justify-between text-[11px] bg-[var(--bg-secondary)] text-[var(--text-secondary)]">
              <div className="flex items-center gap-2 min-w-0">
                <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse shrink-0" />
                <span className="font-mono truncate max-w-[190px] font-medium text-[var(--text-primary)]">
                  {currentStore.shopDomain || currentStore.storeName || "Connected Store"}
                </span>
                {availableStores.length > 1 && !isEmbedded && (
                  <span className="text-[10px] px-1.5 py-0.5 rounded font-mono border border-[var(--border)] bg-[var(--surface)] text-[var(--text-secondary)]">
                    {availableStores.length} stores
                  </span>
                )}
              </div>
              {currentStore.voopStoreId && (
                <span className="font-mono text-[10px] font-bold px-1.5 py-0.5 rounded shrink-0 border border-[var(--accent)]/30 bg-[var(--accent-soft)] text-[var(--accent)]">
                  {currentStore.voopStoreId}
                </span>
              )}
            </div>
          )}
        </div>

        {/* ─── 2. DESKTOP HEADER (≥768px) ─── */}
        <div className="hidden md:flex h-14 px-6 items-center justify-between">
          {/* Left: Brand + Account @username + Tab-Isolated Store Selector */}
          <div className="flex items-center gap-4 min-w-0">
            <div className="flex items-center gap-2 min-w-0">
              <span className="text-xs font-black tracking-wider shrink-0 text-[var(--text-primary)]">VOOP</span>
              {mounted && username && (
                <span
                  className="text-[11px] font-mono font-semibold shrink-0 px-2 py-0.5 rounded-lg border border-[var(--border)] bg-[var(--bg-secondary)] text-[var(--text-secondary)]"
                >
                  @{username}
                </span>
              )}
              <span className="shrink-0 text-[var(--text-muted)]">/</span>

              {/* Tab Store Selector */}
              {availableStores.length > 1 && !isEmbedded ? (
                <div className="relative" ref={dropdownRef}>
                  <button
                    onClick={() => setIsStoreDropdownOpen(!isStoreDropdownOpen)}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-medium transition-all cursor-pointer shadow-xs bg-[var(--bg-secondary)] hover:bg-[var(--surface-hover)] border border-[var(--border)] text-[var(--text-primary)]"
                    title="Switch active store for this tab"
                  >
                    <Store size={13} className="text-emerald-500 shrink-0" />
                    <span className="font-mono text-[11px] truncate max-w-[190px]">
                      {currentStore?.shopDomain || "Select Store"}
                    </span>
                    <ChevronDown size={12} className="shrink-0 ml-0.5 text-[var(--text-muted)]" />
                  </button>

                  {isStoreDropdownOpen && (
                    <div className="absolute left-0 mt-1.5 w-64 rounded-2xl shadow-xl p-1.5 z-50 animate-in fade-in zoom-in-95 duration-100 border border-[var(--border)] bg-[var(--surface)] text-[var(--text-primary)]">
                      <div className="px-2.5 py-1.5 text-[10px] font-bold uppercase tracking-wider mb-1 flex justify-between items-center border-b border-[var(--border)] text-[var(--text-muted)]">
                        <span>Tab Store Context</span>
                        <span className="text-[9px] text-[var(--accent)] lowercase font-mono">isolated</span>
                      </div>
                      <div className="space-y-0.5 max-h-60 overflow-y-auto">
                        {availableStores.map((s) => {
                          const isSelected =
                            s.id === currentStore?.id ||
                            (s.voopStoreId && s.voopStoreId === currentStore?.voopStoreId);
                          return (
                            <button
                              key={s.id}
                              onClick={() => {
                                switchStore(s);
                                setIsStoreDropdownOpen(false);
                                const section = extractSectionFromPathname(pathname);
                                router.push(storeRoute(s.publicStoreRef || s.voopStoreId || s.id, section));
                              }}
                              className={cn(
                                "w-full text-left px-2.5 py-2 rounded-xl text-xs flex items-center justify-between transition-colors cursor-pointer",
                                isSelected
                                  ? "bg-[var(--accent-soft)] text-[var(--accent)] font-bold"
                                  : "text-[var(--text-secondary)] hover:bg-[var(--surface-hover)] hover:text-[var(--text-primary)]"
                              )}
                            >
                              <div className="min-w-0 pr-2">
                                <p className="truncate text-xs font-semibold">{s.storeName || s.shopDomain}</p>
                                <p className="font-mono text-[10px] text-[var(--text-muted)]">{s.voopStoreId}</p>
                              </div>
                              {isSelected && <Check size={14} className="text-emerald-500 shrink-0" />}
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  )}
                </div>
              ) : (
                <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-xl border border-[var(--border)] bg-[var(--bg-secondary)] text-xs font-medium min-w-0 text-[var(--text-secondary)]">
                  <Store size={12} className="text-emerald-500 shrink-0" />
                  <span suppressHydrationWarning className="font-mono text-[11px] truncate max-w-[220px] text-[var(--text-primary)]">
                    {currentStore?.shopDomain || "No store connected"}
                  </span>
                </div>
              )}

              {mounted && currentStore?.voopStoreId && (
                <span className="inline-flex text-[11px] font-mono font-bold px-2 py-0.5 rounded-lg border shrink-0 border-[var(--accent)]/30 bg-[var(--accent-soft)] text-[var(--accent)]">
                  {currentStore.voopStoreId}
                </span>
              )}
            </div>

            {/* Live Status Indicator */}
            <div className="flex items-center gap-1.5 text-[11px] font-semibold px-2.5 py-0.5 rounded-full border border-emerald-500/20 bg-[var(--success-soft)] text-[var(--success)] shrink-0">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
              <span>Live Store</span>
            </div>
          </div>

          {/* Right: Theme Selector + Last Synced + AccountMenu */}
          <div className="flex items-center gap-3 shrink-0">
            {/* Theme Selector Button */}
            <button
              onClick={openThemeSheet}
              className="px-3 py-1.5 rounded-xl border border-[var(--border)] bg-[var(--bg-secondary)] hover:bg-[var(--surface-hover)] text-[var(--text-secondary)] hover:text-[var(--text-primary)] transition-all flex items-center gap-2 text-xs font-semibold cursor-pointer touch-press shadow-xs"
              title="Appearance & Theme"
            >
              <span className="w-2.5 h-2.5 rounded-full shrink-0 bg-[var(--accent)]" />
              <Palette size={14} className="text-[var(--text-muted)]" />
              <span className="text-[11px]">Theme</span>
            </button>

            {/* Notification Button */}
            <button
              onClick={() => setIsNotificationOpen(true)}
              className="p-2 rounded-xl border border-[var(--border)] bg-[var(--bg-secondary)] hover:bg-[var(--surface-hover)] text-[var(--text-secondary)] hover:text-[var(--text-primary)] transition-all cursor-pointer touch-press shadow-xs"
              title="Notifications"
            >
              <Bell size={14} />
            </button>

            <div className="flex items-center gap-1.5 text-[11px] text-[var(--text-muted)]">
              <span>Synced:</span>
              <span suppressHydrationWarning className="font-medium font-mono text-[10px] text-[var(--text-secondary)] font-semibold">
                {currentStore?.lastProductSyncAt ? formatDate(currentStore.lastProductSyncAt) : "Just now"}
              </span>
            </div>

            <div className="w-px h-6 mx-1 bg-[var(--border)]"></div>
            <AccountMenu />
          </div>
        </div>
      </header>

      {/* Global Theme & Notification Bottom Sheets */}
      <ThemeBottomSheet isOpen={isThemeSheetOpen} onClose={closeThemeSheet} />
      <NotificationBottomSheet
        isOpen={isNotificationOpen}
        onClose={() => setIsNotificationOpen(false)}
      />
    </>
  );
}
