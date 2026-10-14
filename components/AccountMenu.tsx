"use client";

import { useState, useRef, useEffect } from "react";
import { useSession } from "next-auth/react";
import { User, Settings, LogOut, Shield, Store } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useActiveStore } from "@/components/store/StoreContext";
import { isEmbeddedContext } from "@/lib/api";

export function AccountMenu() {
  const { data: session } = useSession();
  const { activeStore } = useActiveStore();
  const [isOpen, setIsOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  const router = useRouter();

  // Close menu when clicking outside
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  const isEmbedded = typeof window !== "undefined" && isEmbeddedContext();

  if (!mounted) {
    return (
      <div className="w-8 h-8 rounded-xl bg-[var(--primary-soft)] border border-[var(--primary)]/30 flex items-center justify-center text-[var(--primary)] font-bold text-xs shadow-xs">
        <User size={14} />
      </div>
    );
  }

  if (!isEmbedded && !session?.user) return null;
  if (isEmbedded && !activeStore) return null;

  const tabName = typeof window !== "undefined" ? sessionStorage.getItem("voop_tab_name") : null;
  const tabUsername = typeof window !== "undefined" ? sessionStorage.getItem("voop_tab_username") : null;
  const displayName = isEmbedded
    ? (activeStore?.storeName || activeStore?.shopDomain || "Shopify Store")
    : (tabName || session?.user?.name || "User");
  const displayEmail = isEmbedded
    ? (activeStore?.shopDomain || "")
    : (session?.user?.email || "");
  const usernameHandle = isEmbedded ? null : (tabUsername || (session?.user as any)?.username);

  const getInitials = (name: string) => {
    if (!name) return "VO";
    return name
      .split(" ")
      .map((n) => n[0])
      .join("")
      .toUpperCase()
      .substring(0, 2);
  };

  const handleLogout = async () => {
    if (isEmbedded) {
      const confirmed = window.confirm(
        "Sign out of VOOP? Your Shopify Admin session will remain active."
      );
      if (!confirmed) return;

      try {
        const voopKeys = Object.keys(sessionStorage).filter(
          (k) => (k.startsWith("voop") && k !== "voop_embedded_logged_out") || k.startsWith("activeStore") || k.startsWith("activeShop")
        );
        voopKeys.forEach((k) => sessionStorage.removeItem(k));
        sessionStorage.setItem("voop_embedded_logged_out", "true");
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

  return (
    <div className="relative" ref={menuRef}>
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="flex items-center gap-2 p-1.5 rounded-xl hover:bg-[var(--surface-hover)] transition-colors focus:outline-none cursor-pointer"
        title="Account Menu"
      >
        <div className="w-8 h-8 rounded-xl bg-[var(--primary-soft)] border border-[var(--primary)]/30 flex items-center justify-center text-[var(--primary)] font-bold text-xs shadow-xs">
          {getInitials(displayName)}
        </div>
        <span className="hidden md:block text-xs font-bold text-[var(--text-primary)] truncate max-w-[110px]">
          {displayName.split(" ")[0]}
        </span>
      </button>

      {isOpen && (
        <div className="absolute right-0 mt-2 w-60 bg-[var(--surface)] border border-[var(--border)] rounded-2xl shadow-xl overflow-hidden z-50 animate-in fade-in zoom-in-95 duration-100">
          <div className="p-3.5 border-b border-[var(--border)] bg-[var(--surface-secondary)]">
            <p className="text-xs font-bold text-[var(--text-primary)] truncate flex items-center justify-between">
              <span>{displayName}</span>
              {usernameHandle && (
                <span className="text-[10px] text-[var(--primary)] font-mono font-medium">
                  @{usernameHandle}
                </span>
              )}
            </p>
            {displayEmail && <p className="text-[11px] text-[var(--text-secondary)] truncate mt-0.5">{displayEmail}</p>}
            {(activeStore?.voopStoreId || (!isEmbedded && (session?.user as any)?.voopStoreId)) && (
              <div className="mt-2 pt-2 border-t border-[var(--border)] flex items-center justify-between">
                <span className="text-[10px] text-[var(--text-muted)] uppercase tracking-wider font-semibold">Store ID</span>
                <span className="text-[11px] text-[var(--primary)] font-mono font-bold">
                  {activeStore?.voopStoreId || (session?.user as any)?.voopStoreId}
                </span>
              </div>
            )}
            {activeStore?.shopDomain && (
              <div className="mt-1 flex items-center justify-between">
                <span className="text-[10px] text-[var(--text-muted)] uppercase tracking-wider font-semibold">Shop</span>
                <span className="text-[11px] text-[var(--text-secondary)] font-mono truncate max-w-[130px]">
                  {activeStore.shopDomain}
                </span>
              </div>
            )}
          </div>

          <div className="p-1.5 space-y-0.5">
            <button
              onClick={() => {
                setIsOpen(false);
                router.push("/settings?tab=profile");
              }}
              className="w-full flex items-center gap-2.5 px-3 py-2 text-xs font-medium text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--surface-hover)] rounded-xl transition-colors text-left cursor-pointer"
            >
              <User size={15} className="text-[var(--text-muted)]" />
              <span>Profile</span>
            </button>
            <button
              onClick={() => {
                setIsOpen(false);
                router.push("/settings?tab=security");
              }}
              className="w-full flex items-center gap-2.5 px-3 py-2 text-xs font-medium text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--surface-hover)] rounded-xl transition-colors text-left cursor-pointer"
            >
              <Shield size={15} className="text-[var(--text-muted)]" />
              <span>Security</span>
            </button>
            <button
              onClick={() => {
                setIsOpen(false);
                router.push("/settings?tab=store");
              }}
              className="w-full flex items-center gap-2.5 px-3 py-2 text-xs font-medium text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--surface-hover)] rounded-xl transition-colors text-left cursor-pointer"
            >
              <Store size={15} className="text-[var(--text-muted)]" />
              <span>Shopify Store</span>
            </button>
          </div>

          <div className="p-1.5 border-t border-[var(--border)]">
            <button
              onClick={handleLogout}
              className="w-full flex items-center gap-2.5 px-3 py-2 text-xs font-semibold text-[var(--danger)] hover:bg-[var(--danger-soft)] rounded-xl transition-colors text-left cursor-pointer"
            >
              <LogOut size={15} />
              <span>Log out</span>
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
