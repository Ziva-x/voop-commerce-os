"use client";

import React, { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { X } from "lucide-react";
import { cn } from "@/lib/utils";

export interface DrawerProps {
  isOpen: boolean;
  onClose: () => void;
  children: React.ReactNode;
  title?: React.ReactNode;
  subtitle?: React.ReactNode;
  badge?: React.ReactNode;
  headerActions?: React.ReactNode;
  footer?: React.ReactNode;
  width?: string; // e.g. "max-w-xl", "max-w-lg", "max-w-2xl"
  className?: string;
  contentClassName?: string;
  ariaLabel?: string;
  showCloseButton?: boolean;
  closeOnBackdropClick?: boolean;
  closeOnEsc?: boolean;
  // If true, the caller handles the inner header/content/footer completely
  customLayout?: boolean;
}

/**
 * Universal VOOP Right-Side Drawer Component
 * 
 * Guarantees flush-to-top viewport positioning (top: 0, bottom: 0, right: 0, height: 100dvh)
 * using a body-level portal and full-viewport backdrop.
 */
export function Drawer({
  isOpen,
  onClose,
  children,
  title,
  subtitle,
  badge,
  headerActions,
  footer,
  width = "max-w-xl",
  className,
  contentClassName,
  ariaLabel,
  showCloseButton = true,
  closeOnBackdropClick = true,
  closeOnEsc = true,
  customLayout = false,
}: DrawerProps) {
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  // Handle ESC key dismiss
  useEffect(() => {
    if (!isOpen || !closeOnEsc) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isOpen, closeOnEsc, onClose]);

  // Lock body scroll while drawer is open
  useEffect(() => {
    if (!isOpen) return;
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prevOverflow;
    };
  }, [isOpen]);

  if (!isOpen || !mounted || typeof document === "undefined") {
    return null;
  }

  const hasHeader = !customLayout && Boolean(title || subtitle || badge || headerActions || showCloseButton);

  const drawerContent = (
    <div
      className="fixed inset-0 z-50 overflow-hidden select-none"
      style={{
        position: "fixed",
        top: 0,
        right: 0,
        bottom: 0,
        left: 0,
        height: "100dvh",
        width: "100vw",
        margin: 0,
        padding: 0,
      }}
      role="dialog"
      aria-modal="true"
      aria-label={ariaLabel || (typeof title === "string" ? title : "Drawer")}
    >
      {/* ── Viewport-spanning Backdrop ── */}
      <div
        className="fixed inset-0 bg-black/60 dark:bg-black/80 backdrop-blur-sm animate-fade-overlay transition-opacity"
        style={{
          position: "fixed",
          top: 0,
          right: 0,
          bottom: 0,
          left: 0,
          height: "100dvh",
          width: "100vw",
        }}
        onClick={closeOnBackdropClick ? onClose : undefined}
        aria-hidden="true"
      />

      {/* ── Flush Right-Side Drawer Panel ── */}
      <div
        className={cn(
          "fixed top-0 right-0 bottom-0 z-10 flex flex-col w-full bg-[var(--surface)] border-l border-[var(--border)] shadow-2xl animate-slide-in-right",
          "h-[100dvh] max-h-[100dvh] overflow-hidden select-text",
          width,
          className
        )}
        style={{
          position: "fixed",
          top: 0,
          right: 0,
          bottom: 0,
          height: "100dvh",
          maxHeight: "100dvh",
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {customLayout ? (
          children
        ) : (
          <>
            {/* Header: Fixed / Stable */}
            {hasHeader && (
              <div className="shrink-0 border-b border-[var(--border)] bg-[var(--surface)] p-4 sm:p-5 flex items-center justify-between gap-3">
                <div className="min-w-0 flex-1">
                  {badge && <div className="mb-1">{badge}</div>}
                  {title && (
                    typeof title === "string" ? (
                      <h3 className="text-lg font-bold text-[var(--text-primary)] truncate">{title}</h3>
                    ) : (
                      title
                    )
                  )}
                  {subtitle && (
                    typeof subtitle === "string" ? (
                      <p className="text-xs text-[var(--text-secondary)] mt-0.5">{subtitle}</p>
                    ) : (
                      subtitle
                    )
                  )}
                </div>

                <div className="flex items-center gap-2 shrink-0">
                  {headerActions}
                  {showCloseButton && (
                    <button
                      type="button"
                      onClick={onClose}
                      className="p-2 rounded-xl text-[var(--text-muted)] hover:text-[var(--text-primary)] hover:bg-[var(--surface-hover)] transition-colors cursor-pointer"
                      aria-label="Close drawer"
                      title="Close (Esc)"
                    >
                      <X size={18} />
                    </button>
                  )}
                </div>
              </div>
            )}

            {/* Content: Scrollable Body */}
            <div className={cn("flex-1 overflow-y-auto overscroll-contain", contentClassName)}>
              {children}
            </div>

            {/* Footer: Fixed / Stable */}
            {footer && (
              <div className="shrink-0 border-t border-[var(--border)] bg-[var(--surface)] p-4 sm:p-5">
                {footer}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );

  return createPortal(drawerContent, document.body);
}

export default Drawer;
