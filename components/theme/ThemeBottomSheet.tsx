"use client";

import React from "react";
import { BottomSheet } from "@/components/ui/BottomSheet";
import { useTheme } from "@/components/ThemeProvider";
import { Check, Moon, Sun, Sparkles } from "lucide-react";
import { cn } from "@/lib/utils";

// ═══════════════════════════════════════════════════════════════════
// PROTECTED GLOBAL THEME MODAL
// Controls Theme Mode (Light Mode vs Dark Mode).
// Interface Style is permanently locked to Modern Style across the entire application.
// ═══════════════════════════════════════════════════════════════════

interface ThemeBottomSheetProps {
  isOpen: boolean;
  onClose: () => void;
}

export function ThemeBottomSheet({ isOpen, onClose }: ThemeBottomSheetProps) {
  const {
    themeMode,
    setThemeMode,
  } = useTheme();

  const isDark = themeMode === "dark";

  return (
    <BottomSheet
      isOpen={isOpen}
      onClose={onClose}
      title="Appearance & Theme"
      subtitle="Select your display mode"
    >
      <div className="space-y-6">
        {/* ─── THEME MODE (Light Mode vs Dark Mode) ──────────────── */}
        <div className="space-y-2.5">
          <div className="flex items-center justify-between">
            <label className="text-[11px] font-bold uppercase tracking-wider text-[var(--text-secondary)]">
              Theme Mode
            </label>
            <span className="text-[11px] font-mono text-[var(--text-muted)]">
              Active: <span className="font-bold capitalize text-[var(--text-primary)]">{themeMode}</span>
            </span>
          </div>

          <div className="grid grid-cols-2 gap-3">
            {/* Light Mode */}
            <button
              type="button"
              onClick={() => setThemeMode("light")}
              className={cn(
                "p-3.5 rounded-2xl text-left transition-all relative border flex flex-col justify-between min-h-[82px] touch-press cursor-pointer",
                !isDark
                  ? "bg-[var(--accent-soft)] border-[var(--accent)] shadow-xs"
                  : "bg-[var(--surface)] border-[var(--border)] hover:bg-[var(--surface-hover)] text-[var(--text-primary)]"
              )}
            >
              <div className="flex items-center justify-between w-full">
                <div className="flex items-center gap-2.5">
                  <div className={cn(
                    "w-8 h-8 rounded-xl flex items-center justify-center border shadow-xs transition-colors",
                    !isDark
                      ? "bg-[var(--accent)] text-white border-[var(--accent)]"
                      : "bg-[var(--bg-secondary)] border-[var(--border)] text-[var(--text-secondary)]"
                  )}>
                    <Sun size={16} />
                  </div>
                  <div>
                    <span className="text-sm font-bold block text-[var(--text-primary)]">Light Mode</span>
                    <span className="text-[11px] text-[var(--text-secondary)]">Clean SaaS Neutral</span>
                  </div>
                </div>
                {!isDark && (
                  <div className="w-5 h-5 rounded-full flex items-center justify-center bg-[var(--accent)] text-white font-black shadow-xs shrink-0">
                    <Check size={12} strokeWidth={3} />
                  </div>
                )}
              </div>
            </button>

            {/* Dark Mode */}
            <button
              type="button"
              onClick={() => setThemeMode("dark")}
              className={cn(
                "p-3.5 rounded-2xl text-left transition-all relative border flex flex-col justify-between min-h-[82px] touch-press cursor-pointer",
                isDark
                  ? "bg-[var(--accent-soft)] border-[var(--accent)] shadow-xs"
                  : "bg-[var(--surface)] border-[var(--border)] hover:bg-[var(--surface-hover)] text-[var(--text-primary)]"
              )}
            >
              <div className="flex items-center justify-between w-full">
                <div className="flex items-center gap-2.5">
                  <div className={cn(
                    "w-8 h-8 rounded-xl flex items-center justify-center border shadow-xs transition-colors",
                    isDark
                      ? "bg-[var(--accent)] text-white border-[var(--accent)]"
                      : "bg-[var(--bg-secondary)] border-[var(--border)] text-[var(--text-secondary)]"
                  )}>
                    <Moon size={16} />
                  </div>
                  <div>
                    <span className="text-sm font-bold block text-[var(--text-primary)]">Dark Mode</span>
                    <span className="text-[11px] text-[var(--text-secondary)]">Deep Midnight Contrast</span>
                  </div>
                </div>
                {isDark && (
                  <div className="w-5 h-5 rounded-full flex items-center justify-center bg-[var(--accent)] text-white font-black shadow-xs shrink-0">
                    <Check size={12} strokeWidth={3} />
                  </div>
                )}
              </div>
            </button>
          </div>
        </div>

        {/* ─── Global Consistency Note ───────── */}
        <div className="p-3.5 rounded-xl border border-[var(--border)] bg-[var(--bg-secondary)] text-xs flex items-start gap-2.5 text-[var(--text-secondary)]">
          <Sparkles size={16} className="text-[var(--accent)] shrink-0 mt-0.5" />
          <span>
            Theme choices take effect instantly across all pages and persist to your account.
          </span>
        </div>
      </div>
    </BottomSheet>
  );
}
