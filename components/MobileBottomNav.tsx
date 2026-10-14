"use client";

import React from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Home, ShoppingCart, Boxes, MoreHorizontal } from "lucide-react";
import { cn } from "@/lib/utils";
import { useStoreRoute } from "@/lib/routes";
import { useTheme } from "@/components/ThemeProvider";

interface MobileBottomNavProps {
  onOpenMore: () => void;
  isMoreOpen?: boolean;
}

export function MobileBottomNav({ onOpenMore, isMoreOpen = false }: MobileBottomNavProps) {
  const pathname = usePathname();
  const { storeRef, to } = useStoreRoute();
  const { interfaceStyle } = useTheme();
  const isModern = interfaceStyle === "modern";

  // Hide on public applicant pages or auth pages
  if (
    pathname === "/apply" ||
    pathname?.startsWith("/apply/") ||
    pathname === "/login" ||
    pathname === "/register"
  ) {
    return null;
  }

  // Exactly 4 primary navigation items per specification
  const navItems = [
    { name: "Home", section: "", icon: Home },
    { name: "Orders", section: "orders", icon: ShoppingCart },
    { name: "Inventory", section: "inventory", icon: Boxes },
  ];

  return (
    <nav
      className="md:hidden fixed bottom-0 left-0 right-0 z-40 flex items-center justify-around select-none border-t border-[var(--nav-border)] transition-colors shadow-2xl shadow-black"
      style={{
        background: "var(--nav-bg)",
        backdropFilter: "blur(20px)",
        WebkitBackdropFilter: "blur(20px)",
        paddingBottom: "calc(8px + env(safe-area-inset-bottom, 4px))",
        paddingTop: "8px",
        paddingLeft: "6px",
        paddingRight: "6px",
      }}
      aria-label="Mobile Navigation"
    >
      {/* 1. Home, 2. Orders, 3. Inventory */}
      {navItems.map((item) => {
        const Icon = item.icon;
        const targetHref = to(item.section);
        const isActive =
          (!item.section && (pathname === `/app/${storeRef}` || pathname === "/")) ||
          (Boolean(item.section) &&
            (pathname === `/app/${storeRef}/${item.section}` ||
              pathname?.startsWith(`/app/${storeRef}/${item.section}/`) ||
              pathname === `/${item.section}`));

        return (
          <Link
            key={item.section || "home"}
            href={targetHref}
            className={cn(
              "flex flex-col items-center justify-center gap-1 rounded-2xl transition-all flex-1 py-1 min-h-[50px] touch-press",
              isActive
                ? "text-[var(--nav-active-text)] font-bold"
                : "text-[var(--nav-text-secondary)] hover:text-[var(--nav-text-primary)] active:text-[var(--nav-text-primary)]"
            )}
          >
            <div
              className={cn(
                "flex items-center justify-center w-12 h-7 rounded-xl transition-all",
                isActive ? "bg-[var(--nav-active)] text-[var(--nav-active-text)] shadow-xs" : "bg-transparent text-[var(--nav-text-secondary)]"
              )}
            >
              <Icon size={20} strokeWidth={isActive ? 2.5 : 1.9} />
            </div>
            <span
              className="tracking-tight leading-none text-center"
              style={{ fontSize: "11px" }}
            >
              {item.name}
            </span>
          </Link>
        );
      })}

      {/* 4. More (Opens dedicated Android Bottom Sheet) */}
      <button
        onClick={onOpenMore}
        className={cn(
          "flex flex-col items-center justify-center gap-1 rounded-2xl transition-all flex-1 py-1 min-h-[50px] touch-press cursor-pointer",
          isMoreOpen
            ? "text-[var(--nav-active-text)] font-bold"
            : "text-[var(--nav-text-secondary)] hover:text-[var(--nav-text-primary)] active:text-[var(--nav-text-primary)]"
        )}
        aria-label="More Navigation"
      >
        <div
          className={cn(
            "flex items-center justify-center w-12 h-7 rounded-xl transition-all",
            isMoreOpen ? "bg-[var(--nav-active)] text-[var(--nav-active-text)] shadow-xs" : "bg-transparent text-[var(--nav-text-secondary)]"
          )}
        >
          <MoreHorizontal size={22} strokeWidth={isMoreOpen ? 2.5 : 1.9} />
        </div>
        <span
          className="tracking-tight leading-none text-center"
          style={{ fontSize: "11px" }}
        >
          More
        </span>
      </button>
    </nav>
  );
}
