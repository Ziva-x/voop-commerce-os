"use client";

import React, { forwardRef, useState } from "react";
import { Eye, EyeOff, Lock, Search, X } from "lucide-react";
import { cn } from "@/lib/utils";

export interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  leadingIcon?: React.ReactNode;
  trailingIcon?: React.ReactNode;
  trailingShortcut?: string;
  error?: string;
  label?: string;
  wrapperClassName?: string;
  interactiveLeadingIcon?: boolean;
}

/**
 * Standard VOOP Global Input Component
 * Automatically reserves guaranteed horizontal clearance for leading and trailing icons,
 * preventing any overlap between icons, text, placeholders, and keyboard shortcut badges.
 */
export const Input = forwardRef<HTMLInputElement, InputProps>(
  (
    {
      className,
      leadingIcon,
      trailingIcon,
      trailingShortcut,
      error,
      label,
      wrapperClassName,
      interactiveLeadingIcon = false,
      id,
      disabled,
      style,
      ...props
    },
    ref
  ) => {
    const inputId = id || (label ? label.toLowerCase().replace(/[^a-z0-9_-]/g, "-") : undefined);

    const hasLeading = Boolean(leadingIcon);
    const hasTrailing = Boolean(trailingIcon);
    const hasShortcut = Boolean(trailingShortcut);

    return (
      <div className={cn("w-full space-y-1.5", wrapperClassName)}>
        {label && (
          <label
            htmlFor={inputId}
            className="block text-xs font-semibold text-[var(--text-primary)] select-none"
          >
            {label}
          </label>
        )}
        <div className="input-wrapper relative flex items-center w-full">
          {hasLeading && (
            <div
              className={cn(
                "input-leading-icon absolute top-1/2 -translate-y-1/2 flex items-center justify-center text-[var(--text-muted)] z-10 transition-colors",
                interactiveLeadingIcon ? "pointer-events-auto cursor-pointer" : "pointer-events-none select-none"
              )}
              style={{
                insetInlineStart: "13px",
                width: "16px",
                height: "16px",
              }}
            >
              {leadingIcon}
            </div>
          )}

          <input
            ref={ref}
            id={inputId}
            disabled={disabled}
            className={cn(
              "input-base w-full rounded-xl text-sm transition-all outline-none font-medium",
              "bg-[var(--surface)] border border-[var(--border)] text-[var(--text-primary)]",
              "placeholder:text-[var(--text-muted)] dark:placeholder:text-[var(--text-muted)]",
              "focus:border-[var(--accent)] focus:ring-1 focus:ring-[var(--accent)]",
              "disabled:bg-[var(--surface-active)] disabled:text-[var(--text-disabled)] disabled:cursor-not-allowed",
              error && "border-[var(--error)] focus:border-[var(--error)] focus:ring-[var(--error)]",
              hasLeading && "input-with-leading-icon",
              hasTrailing && "input-with-trailing-icon",
              hasShortcut && "input-with-trailing-shortcut",
              "py-2.5",
              className
            )}
            style={{
              paddingInlineStart: hasLeading ? "40px" : "14px",
              paddingInlineEnd: hasShortcut ? "56px" : hasTrailing ? "40px" : "14px",
              ...style,
            }}
            {...props}
          />

          {hasTrailing && (
            <div
              className="input-trailing-icon absolute top-1/2 -translate-y-1/2 flex items-center justify-center text-[var(--text-muted)] z-10"
              style={{
                insetInlineEnd: "12px",
              }}
            >
              {trailingIcon}
            </div>
          )}

          {hasShortcut && (
            <kbd
              className="input-trailing-shortcut absolute top-1/2 -translate-y-1/2 px-1.5 py-0.5 rounded text-[10px] font-mono bg-[var(--surface-hover)] border border-[var(--border)] text-[var(--text-muted)] pointer-events-none select-none z-10"
              style={{
                insetInlineEnd: "10px",
              }}
            >
              {trailingShortcut}
            </kbd>
          )}
        </div>

        {error && (
          <p className="text-xs text-[var(--error)] font-medium mt-1">{error}</p>
        )}
      </div>
    );
  }
);
Input.displayName = "Input";

export interface PasswordInputProps extends Omit<InputProps, "type" | "trailingIcon"> {
  showToggle?: boolean;
}

/**
 * Standard VOOP Password Input Component
 * Automatically pairs leading Lock icon with trailing show/hide Eye toggle,
 * ensuring password bullets and text never collide with either control.
 */
export const PasswordInput = forwardRef<HTMLInputElement, PasswordInputProps>(
  ({ leadingIcon = <Lock size={16} />, showToggle = true, ...props }, ref) => {
    const [showPassword, setShowPassword] = useState(false);

    return (
      <Input
        ref={ref}
        type={showPassword ? "text" : "password"}
        leadingIcon={leadingIcon}
        trailingIcon={
          showToggle ? (
            <button
              type="button"
              onClick={() => setShowPassword(!showPassword)}
              className="text-[var(--text-muted)] hover:text-[var(--text-primary)] transition-colors p-1 rounded-md cursor-pointer pointer-events-auto"
              title={showPassword ? "Hide password" : "Show password"}
              tabIndex={-1}
            >
              {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
            </button>
          ) : undefined
        }
        autoComplete="current-password"
        {...props}
      />
    );
  }
);
PasswordInput.displayName = "PasswordInput";

export interface SearchInputProps extends Omit<InputProps, "type"> {
  onClear?: () => void;
}

/**
 * Standard VOOP Search Input Component
 * Provides clean leading Search icon, optional trailing shortcut (⌘K),
 * and automatic trailing clear button with zero text collision.
 */
export const SearchInput = forwardRef<HTMLInputElement, SearchInputProps>(
  (
    {
      leadingIcon = <Search size={16} />,
      trailingShortcut,
      onClear,
      value,
      onChange,
      ...props
    },
    ref
  ) => {
    const hasValue = Boolean(value && String(value).length > 0);

    return (
      <Input
        ref={ref}
        type="search"
        value={value}
        onChange={onChange}
        leadingIcon={leadingIcon}
        trailingShortcut={!hasValue && trailingShortcut ? trailingShortcut : undefined}
        trailingIcon={
          hasValue && onClear ? (
            <button
              type="button"
              onClick={onClear}
              className="text-[var(--text-muted)] hover:text-[var(--text-primary)] transition-colors p-1 rounded-md cursor-pointer pointer-events-auto"
              title="Clear search"
              tabIndex={-1}
            >
              <X size={14} />
            </button>
          ) : undefined
        }
        {...props}
      />
    );
  }
);
SearchInput.displayName = "SearchInput";
