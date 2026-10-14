# PROTECTED GLOBAL DESIGN SYSTEM
> **DO NOT MODIFY DURING FEATURE PATCHES OR BUG FIXES.**
> **ONLY MODIFY DURING AN EXPLICIT GLOBAL UI/THEME CHANGE.**

# VOOP OS — MASTER UI & THEME SPECIFICATION
**Permanent Color + UI Source of Truth for Future Coding Agents & Engineers**

---

## 1. Core Mandate & Architectural Law

VOOP is an existing enterprise multi-tenant SaaS application operating under:
1. **Shopify Embedded Mode** (`admin.shopify.com`)
2. **VOOP Standalone Browser Mode** (Direct Chrome tabs)

Whenever adding a feature, fixing a bug, updating an API, or adjusting data logic:
- **NEVER** introduce raw hex, rgb, rgba, or hsl colors.
- **NEVER** create feature-specific theme files (e.g. `orders-theme.css`, `inventory-theme.css`).
- **NEVER** alter the global sidebar, global header, or base layout styling.
- **NEVER** modify theme tokens or global CSS for a localized problem.
- **ALWAYS** reuse existing components and consume canonical design tokens.

---

## 2. The Three Independent Axes

VOOP controls visual presentation via three strictly decoupled axes:

```text
AXIS 1: THEME MODE (Dark vs. Light)
        Controls background, surface, border, and text contrast.

AXIS 2: ACCENT PALETTE (VOOP, Emerald, Purple, Amber, Teal)
        Controls brand primary color, hover states, active indicators, and focus rings.

AXIS 3: UI STYLE (Current vs. Modern)
        Controls high-contrast OLED density (Current) vs. crisp SaaS layout (Modern).
```

Any combination must render with 100% readability:
- Dark + VOOP + Modern
- Light + Emerald + Current
- Dark + Purple + Modern
- Light + Amber + Modern
- Dark + Teal + Current
- etc.

---

## 3. Canonical Token Family (`--voop-*`)

All application styling references the `--voop-*` custom property family defined in `/design-system/voop-theme.css`:

### Surfaces & Backgrounds
| Token | Light Mode | Dark Mode | Usage |
| :--- | :--- | :--- | :--- |
| `--voop-bg` | `#F7F8FA` | `#090B10` | Main application viewport background |
| `--voop-surface` | `#FFFFFF` | `#11141B` | Primary card, panel, modal, and table background |
| `--voop-surface-secondary` | `#F4F5F7` | `#171B23` | Secondary container, disabled inputs, table headers |
| `--voop-surface-tertiary` | `#ECEEF2` | `#1D222C` | Subtle dividers, embedded metric blocks |
| `--voop-surface-hover` | `#F0F1F4` | `#1D222C` | Hover state for table rows, cards, and list items |
| `--voop-surface-active` | `#E9EBF0` | `#252B36` | Pressed / active state for clickable rows & surfaces |

### Text Hierarchy
| Token | Light Mode | Dark Mode | Usage |
| :--- | :--- | :--- | :--- |
| `--voop-text-primary` | `#111217` | `#F7F8FA` | Headings, primary values, active labels, body text |
| `--voop-text-secondary` | `#5F6472` | `#B5BBC7` | Descriptions, secondary meta, table subheaders |
| `--voop-text-muted` | `#858797` | `#858C9A` | Timestamps, placeholders, inactive hints |
| `--voop-text-disabled` | `#AEB3BE` | `#5F6673` | Disabled button text, inactive navigation items |

### Borders
| Token | Light Mode | Dark Mode | Usage |
| :--- | :--- | :--- | :--- |
| `--voop-border` | `#E1E4EA` | `#292F3A` | Standard card, input, and table cell borders |
| `--voop-border-subtle` | `#ECEEF2` | `#1E232C` | Inset dividers, list item separators |
| `--voop-border-strong` | `#CDD2DB` | `#3A4250` | Input focus, active tab outlines, emphasized borders |

---

## 4. The 5 Accent Palettes

Accent selection modifies **ONLY** the accent token family (`--voop-accent-*`):

1. **VOOP** (`[data-accent="voop"]`):
   - Dark: `--voop-accent: #00B8FF`, hover `#0095D9`, soft `rgba(0, 184, 255, 0.12)`, text `#38C8FF`
   - Light: `--voop-accent: #0086C9`, hover `#006BA3`, soft `#EEF7FC`, text `#0086C9`
2. **Emerald** (`[data-accent="emerald"]`):
   - Dark: `--voop-accent: #00C896`, hover `#00A37A`, soft `rgba(0, 200, 150, 0.12)`, text `#20DEAA`
   - Light: `--voop-accent: #059669`, hover `#047857`, soft `#ECFDF5`, text `#059669`
3. **Purple** (`[data-accent="purple"]`):
   - Dark: `--voop-accent: #7C5CFF`, hover `#6342E6`, soft `rgba(124, 92, 255, 0.12)`, text `#A78BFA`
   - Light: `--voop-accent: #6D28D9`, hover `#5B21B6`, soft `#F5F3FF`, text `#6D28D9`
4. **Amber** (`[data-accent="amber"]`):
   - Dark: `--voop-accent: #FF9D00`, hover `#D98500`, soft `rgba(255, 157, 0, 0.12)`, text `#FBBF24`
   - Light: `--voop-accent: #D97706`, hover `#B45309`, soft `#FFFBEB`, text `#D97706`
5. **Teal** (`[data-accent="teal"]`):
   - Dark: `--voop-accent: #00C2D9`, hover `#00A4B8`, soft `rgba(0, 194, 217, 0.12)`, text `#2DD4BF`
   - Light: `--voop-accent: #0D9488`, hover `#0F766E`, soft `#F0FDFA`, text `#0D9488`

---

## 5. Semantic & Status Indicators

The meaning of business statuses must remain consistent across all 20+ modules:

```text
PAID, DELIVERED, IN_STOCK, FULFILLED    → --voop-status-success (#16A34A / #22C55E)
PENDING, COD, AWAITING, DISPATCHED     → --voop-status-warning (#D97706 / #FBBF24)
FAILED, CANCELLED, RTO, DAMAGED         → --voop-status-danger  (#DC2626 / #F87171)
IN_TRANSIT, PROCESSING, CONNECTED       → --voop-status-info    (#2563EB / #60A5FA)
DRAFT, ARCHIVED, INACTIVE               → --voop-status-neutral (--voop-text-secondary)
```

---

## 6. Shared Component Standards

### Buttons
All buttons use canonical classes:
- `.btn-primary`: Active accent background, white text, 600 weight.
- `.btn-secondary`: Surface background, `--voop-border`, primary text.
- `.btn-outline`: Transparent background, `--voop-accent` border and text.
- `.btn-ghost`: Transparent background, hover surface background.
- `.btn-danger`: `--voop-danger` background, white text.
- `.btn-icon`: Surface background, centered icon, subtle border.

### Inputs & Selects
- Inputs consume `--voop-input-bg` and `--voop-input-border`.
- Focus ring: `outline: none; box-shadow: 0 0 0 1px var(--voop-input-focus)`.
- Placeholders: `--voop-input-placeholder` (always visible in both light and dark).

### Tables
- Header: `--voop-table-header-bg` with uppercase 600-weight `--voop-table-header-text`.
- Rows: `--voop-table-row` with border-bottom `--voop-table-border`.
- Row hover: `--voop-table-row-hover`.
- Cells: `--voop-text-primary` font size `--voop-font-sm`.

### Locked Dark Sidebar
- The sidebar identity is global: `--voop-sidebar-bg: #0B0E13`.
- Active item: `--voop-sidebar-active-bg: #252A34` with icon color `var(--voop-accent)`.
- Features must NEVER recolor the sidebar.

### Locked Header
- Background: `var(--voop-header-bg)` (`#FFFFFF` in light, `#11141B` in dark).
- Border: `var(--voop-header-border)`.
- Text: `var(--voop-header-text)`.

---

## 7. Spacing, Radius & Shadows Scale

### Spacing Scale
```css
--voop-space-1:  4px;
--voop-space-2:  8px;
--voop-space-3:  12px;
--voop-space-4:  16px;
--voop-space-5:  20px;
--voop-space-6:  24px;
--voop-space-8:  32px;
--voop-space-10: 40px;
```

### Radius Scale
```css
--voop-radius-sm:   6px;
--voop-radius-md:   8px;
--voop-radius-lg:   12px;
--voop-radius-xl:   16px;
--voop-radius-full: 9999px;
```

### Shadows Scale
```css
--voop-shadow-none: none;
--voop-shadow-sm:   0 1px 2px rgb(0 0 0 / 0.05);
--voop-shadow-md:   0 4px 12px rgb(0 0 0 / 0.08);
--voop-shadow-lg:   0 10px 30px rgb(0 0 0 / 0.12);
```

---

## 8. Multi-Tab Isolation Law

Theme state is resolved via the cascade:
```text
MASTER DEFAULT (VOOP + Light + Modern)
      ↓
USER PREFERENCE (database / localStorage)
      ↓
CURRENT TAB OVERRIDE (sessionStorage)
      ↓
ACTIVE THEME (documentElement dataset & CSS custom properties)
```

- Each tab stores active state in `sessionStorage` (`voop.tab_theme`, `voop.tab_mode`, `voop.tab_style`).
- Changing Tab 1 **MUST NEVER** alter Tab 2.
- Zero cross-tab broadcast channels or global window storage listeners for active theme.

---

## 9. Future Coding Agent Instructions

When given a coding prompt:
1. **Read this file first**.
2. Identify existing components (`.btn-*`, `.card-surface`, `.voop-table`, `input`).
3. Use `--voop-*` tokens for any new CSS properties.
4. If a feature needs a button, use `<button className="btn-primary">`.
5. If a feature needs a card, use `<div className="card-surface p-4">`.
6. If a feature needs a table, use `<table className="voop-table">`.
7. **Never** write `#hex`, `rgb()`, or `hsl()` in feature `.tsx` files.
8. Test in both **Light** and **Dark** modes before completing your work.
