"use client";

import React, { createContext, useContext, useEffect, useState, useCallback } from "react";
import { useSession } from "next-auth/react";
import { appFetch } from "@/lib/api";

// ═══════════════════════════════════════════════════════════════════
// PROTECTED GLOBAL THEME SYSTEM — SINGLE SOURCE OF TRUTH (HARD RESET)
// Supported Themes: Exactly TWO modes: "light" | "dark"
// Interface Styles: "modern" | "classic" (Layout only, not colors)
// Brand Accent is locked globally to Primary Blue (#2563EB / #3B82F6).
// ═══════════════════════════════════════════════════════════════════

export type ThemeMode = "light" | "dark";
export type InterfaceStyle = "modern" | "classic";

// Backward-compatibility shims for legacy callers
export type AccentTheme = "blue" | "voop";
export interface AccentThemeOption {
  id: string;
  name: string;
  primary: string;
  secondary: string;
  accent: string;
  accentHover: string;
  accentSoft: string;
  accentBorder: string;
  accentGlow: string;
  accentText: string;
  accentRgb: string;
  description: string;
  light: {
    primary: string;
    hover: string;
    active: string;
    soft: string;
    border: string;
    text: string;
  };
  dark: {
    primary: string;
    hover: string;
    active: string;
    soft: string;
    border: string;
    text: string;
  };
}

export const CURRENT_BRAND_ACCENT: AccentThemeOption = {
  id: "blue",
  name: "VOOP Blue",
  primary: "#2563EB",
  secondary: "#0EA5E9",
  accent: "#2563EB",
  accentHover: "#1D4ED8",
  accentSoft: "#EFF6FF",
  accentBorder: "#BFDBFE",
  accentGlow: "rgba(37, 99, 235, 0.20)",
  accentText: "#2563EB",
  accentRgb: "37, 99, 235",
  description: "Modern SaaS Blue",
  light: {
    primary: "#2563EB",
    hover: "#1D4ED8",
    active: "#1D4ED8",
    soft: "#EFF6FF",
    border: "#BFDBFE",
    text: "#2563EB",
  },
  dark: {
    primary: "#3B82F6",
    hover: "#60A5FA",
    active: "#60A5FA",
    soft: "#172554",
    border: "#1E3A8A",
    text: "#60A5FA",
  },
};

export const ACCENT_THEMES: Record<string, AccentThemeOption> = {
  voop: CURRENT_BRAND_ACCENT,
  blue: CURRENT_BRAND_ACCENT,
  emerald: CURRENT_BRAND_ACCENT,
  purple: CURRENT_BRAND_ACCENT,
  amber: CURRENT_BRAND_ACCENT,
  teal: CURRENT_BRAND_ACCENT,
};

export function normalizeMode(modeOrStyle: string | null | undefined): ThemeMode {
  if (!modeOrStyle) return "dark";
  const m = modeOrStyle.toLowerCase().trim();
  if (m === "light") return "light";
  return "dark";
}

export function normalizeStyle(_styleOrMode?: string | null | undefined): InterfaceStyle {
  return "modern";
}

export function normalizeAccent(_accent?: string | null): string {
  return "blue";
}

interface ThemeContextType {
  theme: ThemeMode;
  mode: ThemeMode;
  themeMode: ThemeMode;
  interfaceStyle: InterfaceStyle;
  setThemeMode: (mode: ThemeMode) => void;
  setInterfaceStyle: (style: InterfaceStyle) => void;
  isThemeSheetOpen: boolean;
  setIsThemeSheetOpen: (open: boolean) => void;
  openThemeSheet: () => void;
  closeThemeSheet: () => void;
  setTheme: (theme: ThemeMode) => void;
  toggleTheme: () => void;
  // Legacy compatibility helpers
  accentTheme: string;
  currentAccent: AccentThemeOption;
  setAccentTheme: (accent: any) => void;
}

const ThemeContext = createContext<ThemeContextType | undefined>(undefined);

export function applyThemeTokens(modeRaw: ThemeMode, styleRaw: InterfaceStyle = "modern") {
  if (typeof document === "undefined") return;
  const root = document.documentElement;
  const mode = normalizeMode(modeRaw);
  const style = normalizeStyle(styleRaw);
  const isDark = mode === "dark";

  // Authoritative root attributes
  root.dataset.theme = mode;
  root.setAttribute("data-theme", mode);
  root.dataset.mode = mode;
  root.setAttribute("data-mode", mode);
  root.dataset.style = style;
  root.setAttribute("data-style", style);

  // Clean up legacy accent attributes
  delete root.dataset.accent;
  root.removeAttribute("data-accent");

  // Standard class toggles
  if (isDark) {
    root.classList.add("dark");
    root.classList.remove("light");
    root.style.colorScheme = "dark";
  } else {
    root.classList.remove("dark");
    root.classList.add("light");
    root.style.colorScheme = "light";
  }
}

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const { data: session, status } = useSession();
  const [themeMode, setThemeModeState] = useState<ThemeMode>("dark");
  const [interfaceStyle, setInterfaceStyleState] = useState<InterfaceStyle>("modern");
  const [isThemeSheetOpen, setIsThemeSheetOpen] = useState(false);
  const [, setMounted] = useState(false);

  // 1. Initial resolution (localStorage fallback -> sessionStorage tab state -> default)
  useEffect(() => {
    let initialMode: ThemeMode = "dark";
    let initialStyle: InterfaceStyle = "modern";

    try {
      const userId = (session?.user as any)?.id;

      // Check persistent user preference in localStorage
      const storedUserMode = userId ? localStorage.getItem(`voop_user_mode_${userId}`) : null;
      const storedGlobalMode = localStorage.getItem("voop_user_mode");
      const storedUserStyle = userId ? localStorage.getItem(`voop_user_style_${userId}`) : null;
      const storedGlobalStyle = localStorage.getItem("voop_user_style");

      initialMode = normalizeMode(storedUserMode || storedGlobalMode);
      initialStyle = normalizeStyle(storedUserStyle || storedGlobalStyle);

      // Check URL query param override
      if (typeof window !== "undefined") {
        const qTheme = new URLSearchParams(window.location.search).get("theme");
        if (qTheme === "light" || qTheme === "dark") {
          sessionStorage.setItem("voop.tab_mode", qTheme);
        }
      }

      // Check tab override in sessionStorage (isolated per tab)
      const tabMode = sessionStorage.getItem("voop.tab_mode");
      const tabStyle = sessionStorage.getItem("voop.tab_style");

      if (tabMode) {
        initialMode = normalizeMode(tabMode);
      } else {
        sessionStorage.setItem("voop.tab_mode", initialMode);
      }

      if (tabStyle) {
        initialStyle = normalizeStyle(tabStyle);
      } else {
        sessionStorage.setItem("voop.tab_style", initialStyle);
      }
    } catch (_) {}

    applyThemeTokens(initialMode, initialStyle);
    setThemeModeState(initialMode);
    setInterfaceStyleState(initialStyle);
    setMounted(true);
  }, [session?.user]);

  // 2. Fetch authenticated user's remote preference (source of truth per user)
  const fetchUserPreference = useCallback(async () => {
    if (status !== "authenticated") return;
    try {
      const res = await appFetch("/api/user/preferences");
      if (res.ok) {
        const data = await res.json();
        const userId = (session?.user as any)?.id;

        const remoteMode = normalizeMode(data.mode || data.theme || data.themeMode);
        const remoteStyle = normalizeStyle(data.interfaceStyle || data.style);

        try {
          localStorage.setItem("voop_user_mode", remoteMode);
          localStorage.setItem("voop_user_style", remoteStyle);
          if (userId) {
            localStorage.setItem(`voop_user_mode_${userId}`, remoteMode);
            localStorage.setItem(`voop_user_style_${userId}`, remoteStyle);
          }
        } catch (_) {}

        const existingTabMode = sessionStorage.getItem("voop.tab_mode");
        if (!existingTabMode) {
          sessionStorage.setItem("voop.tab_mode", remoteMode);
          sessionStorage.setItem("voop.tab_style", remoteStyle);
          setThemeModeState(remoteMode);
          setInterfaceStyleState(remoteStyle);
          applyThemeTokens(remoteMode, remoteStyle);
        }
      }
    } catch (_e) {
      // Offline fallback
    }
  }, [status, session?.user]);

  useEffect(() => {
    fetchUserPreference();
  }, [fetchUserPreference]);

  // 3. User toggles Theme Mode (Light vs Dark)
  const setThemeMode = useCallback((newModeRaw: ThemeMode) => {
    const newMode = normalizeMode(newModeRaw);

    // Instant UI update in current tab
    setThemeModeState(newMode);
    applyThemeTokens(newMode, interfaceStyle);

    const userId = (session?.user as any)?.id;
    try {
      sessionStorage.setItem("voop.tab_mode", newMode);
      localStorage.setItem("voop_user_mode", newMode);
      if (userId) {
        localStorage.setItem(`voop_user_mode_${userId}`, newMode);
      }
    } catch (_) {}

    // Persist per-user preference in background
    appFetch("/api/user/preferences", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        theme: newMode,
        mode: newMode,
        themeMode: newMode,
        interfaceStyle,
        style: interfaceStyle,
      }),
    }).catch((err) => console.error("Failed to sync mode preference:", err));
  }, [interfaceStyle, session?.user]);

  // 4. User changes Interface Style (Modern vs Classic)
  const setInterfaceStyle = useCallback((newStyleRaw: InterfaceStyle) => {
    const newStyle = normalizeStyle(newStyleRaw);

    setInterfaceStyleState(newStyle);
    applyThemeTokens(themeMode, newStyle);

    const userId = (session?.user as any)?.id;
    try {
      sessionStorage.setItem("voop.tab_style", newStyle);
      localStorage.setItem("voop_user_style", newStyle);
      if (userId) {
        localStorage.setItem(`voop_user_style_${userId}`, newStyle);
      }
    } catch (_) {}

    appFetch("/api/user/preferences", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        theme: themeMode,
        mode: themeMode,
        themeMode,
        interfaceStyle: newStyle,
        style: newStyle,
      }),
    }).catch((err) => console.error("Failed to sync style preference:", err));
  }, [themeMode, session?.user]);

  const openThemeSheet = useCallback(() => setIsThemeSheetOpen(true), []);
  const closeThemeSheet = useCallback(() => setIsThemeSheetOpen(false), []);

  const ctx: ThemeContextType = {
    theme: themeMode,
    mode: themeMode,
    themeMode,
    interfaceStyle,
    setThemeMode,
    setInterfaceStyle,
    isThemeSheetOpen,
    setIsThemeSheetOpen,
    openThemeSheet,
    closeThemeSheet,
    setTheme: (t) => setThemeMode(t === "dark" ? "dark" : "light"),
    toggleTheme: () => setThemeMode(themeMode === "dark" ? "light" : "dark"),
    accentTheme: "blue",
    currentAccent: CURRENT_BRAND_ACCENT,
    setAccentTheme: () => {}, // Safe no-op
  };

  return (
    <ThemeContext.Provider value={ctx}>
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme() {
  const context = useContext(ThemeContext);
  if (!context) {
    throw new Error("useTheme must be used within a ThemeProvider");
  }
  return context;
}

export const useAccentTheme = useTheme;
