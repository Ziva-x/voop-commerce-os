"use client";

import React, { useEffect, useRef } from "react";
import { X } from "lucide-react";
import { cn } from "@/lib/utils";

interface BottomSheetProps {
  isOpen: boolean;
  onClose: () => void;
  title?: string;
  subtitle?: string;
  children: React.ReactNode;
  maxHeight?: string;
}

export function BottomSheet({
  isOpen,
  onClose,
  title,
  subtitle,
  children,
  maxHeight = "85vh",
}: BottomSheetProps) {
  const sheetRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!isOpen) return;

    // Handle ESC key to dismiss
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", handleKeyDown);

    // Prevent body background scroll while sheet is open
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    return () => {
      window.removeEventListener("keydown", handleKeyDown);
      document.body.style.overflow = prevOverflow;
    };
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex flex-col justify-end select-none">
      {/* Dimmed backdrop with blur */}
      <div
        className="fixed inset-0 bg-black/70 backdrop-blur-xs animate-fade-overlay transition-opacity"
        onClick={onClose}
        aria-hidden="true"
      />

      {/* Slide-up sheet container */}
      <div
        ref={sheetRef}
        className={cn(
          "relative z-10 w-full max-w-lg mx-auto border-t rounded-t-[28px] shadow-2xl flex flex-col overflow-hidden animate-bottom-sheet transition-colors",
          "bg-[var(--surface)] border-[var(--border)] text-[var(--text-primary)]"
        )}
        style={{ maxHeight }}
        role="dialog"
        aria-modal="true"
      >
        {/* Drag handle indicator */}
        <div className="w-full pt-3 pb-1.5 flex justify-center cursor-pointer" onClick={onClose}>
          <div className="w-12 h-1.5 rounded-full bg-[var(--border-strong)] hover:bg-[var(--text-muted)] transition-colors" />
        </div>

        {/* Header */}
        {(title || subtitle) && (
          <div className="px-5 py-3 border-b border-[var(--border)] flex items-center justify-between shrink-0">
            <div>
              {title && <h2 className="text-base font-bold tracking-tight text-[var(--text-primary)]">{title}</h2>}
              {subtitle && <p className="text-xs mt-0.5 text-[var(--text-secondary)]">{subtitle}</p>}
            </div>
            <button
              onClick={onClose}
              className="p-2 rounded-full transition-colors min-w-[40px] min-h-[40px] flex items-center justify-center touch-press cursor-pointer text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--surface-hover)]"
              title="Close"
            >
              <X size={18} />
            </button>
          </div>
        )}

        {/* Scrollable content area */}
        <div
          className="flex-1 overflow-y-auto overflow-x-hidden p-5 space-y-4"
          style={{ paddingBottom: "calc(24px + env(safe-area-inset-bottom, 12px))" }}
        >
          {children}
        </div>
      </div>
    </div>
  );
}
