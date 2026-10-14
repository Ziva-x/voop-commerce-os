"use client";

import React, { useState, useRef, useEffect, useId } from "react";
import { ChevronDown, Check } from "lucide-react";
import { cn } from "@/lib/utils";

export interface SelectOption {
  value: string;
  label: string;
}

export interface SelectProps {
  value: string;
  onChange: (value: string) => void;
  options: SelectOption[];
  placeholder?: string;
  className?: string;
  ariaLabel?: string;
  id?: string;
  name?: string;
}

/**
 * VOOP Accessible Theme-Inheriting Custom Select Dropdown
 * Inherits all colors directly from master design tokens (--surface, --border, --dropdown-*, --accent).
 * Full keyboard accessibility: Enter/Space to open, Arrow keys to navigate, Enter to select, Escape to close.
 */
export function Select({
  value,
  onChange,
  options,
  placeholder = "Select...",
  className,
  ariaLabel,
  id,
  name,
}: SelectProps) {
  const [isOpen, setIsOpen] = useState(false);
  const selectedIndex = options.findIndex((opt) => opt.value === value);
  const [highlightedIndex, setHighlightedIndex] = useState(selectedIndex >= 0 ? selectedIndex : 0);

  const containerRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const listboxRef = useRef<HTMLUListElement>(null);

  const reactId = useId();
  const selectId = id || `select-${reactId}`;
  const listboxId = `${selectId}-listbox`;

  const selectedOption = options.find((opt) => opt.value === value);

  // Sync highlighted index when dropdown opens or value changes
  useEffect(() => {
    if (isOpen) {
      const idx = options.findIndex((opt) => opt.value === value);
      setHighlightedIndex(idx >= 0 ? idx : 0);
    }
  }, [isOpen, value, options]);

  // Click outside to close
  useEffect(() => {
    if (!isOpen) return;

    const handleOutsideClick = (e: MouseEvent | TouchEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    };

    document.addEventListener("mousedown", handleOutsideClick);
    document.addEventListener("touchstart", handleOutsideClick);
    return () => {
      document.removeEventListener("mousedown", handleOutsideClick);
      document.removeEventListener("touchstart", handleOutsideClick);
    };
  }, [isOpen]);

  // Scroll highlighted item into view
  useEffect(() => {
    if (isOpen && listboxRef.current) {
      const itemEl = listboxRef.current.children[highlightedIndex] as HTMLElement;
      if (itemEl) {
        itemEl.scrollIntoView({ block: "nearest" });
      }
    }
  }, [isOpen, highlightedIndex]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (!isOpen) {
      if (e.key === "Enter" || e.key === " " || e.key === "ArrowDown" || e.key === "ArrowUp") {
        e.preventDefault();
        setIsOpen(true);
      }
      return;
    }

    switch (e.key) {
      case "ArrowDown":
        e.preventDefault();
        setHighlightedIndex((prev) => (prev < options.length - 1 ? prev + 1 : 0));
        break;
      case "ArrowUp":
        e.preventDefault();
        setHighlightedIndex((prev) => (prev > 0 ? prev - 1 : options.length - 1));
        break;
      case "Enter":
      case " ":
        e.preventDefault();
        if (options[highlightedIndex]) {
          onChange(options[highlightedIndex].value);
          setIsOpen(false);
          buttonRef.current?.focus();
        }
        break;
      case "Escape":
        e.preventDefault();
        setIsOpen(false);
        buttonRef.current?.focus();
        break;
      case "Tab":
        setIsOpen(false);
        break;
      default:
        break;
    }
  };

  const handleSelectOption = (optValue: string) => {
    onChange(optValue);
    setIsOpen(false);
    buttonRef.current?.focus();
  };

  return (
    <div ref={containerRef} className="relative inline-block text-left select-none">
      {/* Hidden input for form integration if name is provided */}
      {name && <input type="hidden" name={name} value={value} />}

      {/* Select Trigger Button */}
      <button
        ref={buttonRef}
        type="button"
        id={selectId}
        role="combobox"
        aria-haspopup="listbox"
        aria-expanded={isOpen}
        aria-controls={listboxId}
        aria-label={ariaLabel || placeholder}
        onClick={() => setIsOpen((prev) => !prev)}
        onKeyDown={handleKeyDown}
        className={cn(
          "inline-flex items-center justify-between gap-2.5 h-9 px-3 py-2 rounded-lg text-xs font-medium transition-all outline-hidden cursor-pointer",
          "bg-[var(--surface)] border border-[var(--border)] text-[var(--text-primary)]",
          "hover:border-[var(--border-strong)]",
          "focus:border-[var(--accent)] focus:ring-1 focus:ring-[var(--accent)]",
          isOpen && "border-[var(--accent)] ring-1 ring-[var(--accent)]",
          className
        )}
      >
        <span className="truncate max-w-[200px] text-left">
          {selectedOption ? selectedOption.label : placeholder}
        </span>
        <ChevronDown
          size={14}
          className={cn(
            "text-[var(--text-muted)] shrink-0 transition-transform duration-150",
            isOpen && "rotate-180 text-[var(--accent)]"
          )}
        />
      </button>

      {/* Floating Accessible Options Dropdown */}
      {isOpen && (
        <ul
          ref={listboxRef}
          id={listboxId}
          role="listbox"
          tabIndex={-1}
          aria-label={ariaLabel || placeholder}
          className={cn(
            "absolute left-0 top-full mt-1.5 z-50 min-w-[220px] max-w-xs max-h-64 overflow-y-auto rounded-lg py-1 shadow-lg border outline-hidden",
            "bg-[var(--dropdown-bg)] border-[var(--dropdown-border)] text-[var(--dropdown-text)]",
            "animate-in fade-in zoom-in-95 duration-100"
          )}
        >
          {options.map((option, idx) => {
            const isSelected = option.value === value;
            const isHighlighted = idx === highlightedIndex;

            return (
              <li
                key={option.value}
                id={`${selectId}-option-${idx}`}
                role="option"
                aria-selected={isSelected}
                onClick={() => handleSelectOption(option.value)}
                onMouseEnter={() => setHighlightedIndex(idx)}
                className={cn(
                  "flex items-center justify-between px-3 py-2 text-xs font-medium cursor-pointer transition-colors",
                  isSelected
                    ? "bg-[var(--accent-soft)] text-[var(--accent)] font-semibold"
                    : isHighlighted
                    ? "bg-[var(--dropdown-hover)] text-[var(--text-primary)]"
                    : "text-[var(--dropdown-text)] hover:bg-[var(--dropdown-hover)] hover:text-[var(--text-primary)]"
                )}
              >
                <span className="truncate">{option.label}</span>
                {isSelected && (
                  <Check size={14} className="text-[var(--accent)] shrink-0 ml-2.5" />
                )}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

export default Select;
