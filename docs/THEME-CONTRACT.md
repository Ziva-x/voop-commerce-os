# VOOP OS — MASTER UI & THEME SYSTEM CONTRACT

## 1. Single Source of Truth

The VOOP application has **ONE centralized design system** controlling the entire application.
No individual feature, route, or component is permitted to create its own independent design system, color palette, or theme override files.

All UI components and pages must consume semantic CSS design tokens:

```css
/* CORRECT */
background: var(--color-surface);
color: var(--color-text-primary);
border-color: var(--color-border);
accent-color: var(--theme-primary);

/* PROHIBITED */
background: #5B5CE2;
color: #171827;
background: rgb(91, 92, 226);
```

---

## 2. Locked Existing UI Designs

The application has **TWO approved, locked UI designs**:
1. **Light Mode** (Modern Clean SaaS Interface: background `#F7F7FC`, surface `#FFFFFF`, dark text `#171827`, subtle borders `#E2E2EC`, dark sidebar).
2. **Dark Mode** (Current OLED Midnight Interface: background `#0D0E14`, surface `#151720`, high-contrast text `#F5F5FA`, dark borders `#292C38`, dark sidebar).

### Rules of Engagement:
- **Do not redesign** either interface.
- **Do not modernize** or alter the established layouts, headers, sidebars, typography, cards, or tables.
- **Do not merge** them into an inconsistent hybrid.
- When new features are introduced, they must fit cleanly into the existing approved UI using semantic tokens.

---

## 3. Exactly 5 Theme Colors

The application supports **EXACTLY FIVE** selectable brand/accent themes.
*No sixth theme may be introduced without explicit architectural authorization.*

### Theme 1 — INDIGO
- **Light**:
  ```css
  --theme-primary: #5B5CE2;
  --theme-primary-hover: #4B4CC7;
  --theme-primary-active: #3F40AD;
  --theme-primary-subtle: #EEEEFF;
  ```
- **Dark**:
  ```css
  --theme-primary: #7C7FF2;
  --theme-primary-hover: #9294FF;
  --theme-primary-active: #A5A7FF;
  --theme-primary-subtle: #242542;
  ```

### Theme 2 — BLUE
- **Light**:
  ```css
  --theme-primary: #2563EB;
  --theme-primary-hover: #1D4ED8;
  --theme-primary-active: #1E40AF;
  --theme-primary-subtle: #EFF6FF;
  ```
- **Dark**:
  ```css
  --theme-primary: #60A5FA;
  --theme-primary-hover: #93C5FD;
  --theme-primary-active: #BFDBFE;
  --theme-primary-subtle: #172A46;
  ```

### Theme 3 — EMERALD
- **Light**:
  ```css
  --theme-primary: #059669;
  --theme-primary-hover: #047857;
  --theme-primary-active: #065F46;
  --theme-primary-subtle: #ECFDF5;
  ```
- **Dark**:
  ```css
  --theme-primary: #34D399;
  --theme-primary-hover: #6EE7B7;
  --theme-primary-active: #A7F3D0;
  --theme-primary-subtle: #12352A;
  ```

### Theme 4 — VIOLET
- **Light**:
  ```css
  --theme-primary: #7C3AED;
  --theme-primary-hover: #6D28D9;
  --theme-primary-active: #5B21B6;
  --theme-primary-subtle: #F5F3FF;
  ```
- **Dark**:
  ```css
  --theme-primary: #A78BFA;
  --theme-primary-hover: #C4B5FD;
  --theme-primary-active: #DDD6FE;
  --theme-primary-subtle: #292044;
  ```

### Theme 5 — CYAN
- **Light**:
  ```css
  --theme-primary: #0891B2;
  --theme-primary-hover: #0E7490;
  --theme-primary-active: #155E75;
  --theme-primary-subtle: #ECFEFF;
  ```
- **Dark**:
  ```css
  --theme-primary: #22D3EE;
  --theme-primary-hover: #67E8F9;
  --theme-primary-active: #A5F3FC;
  --theme-primary-subtle: #12343B;
  ```

---

## 4. Common Neutral & Functional Tokens

Only the approved theme/accent values change between themes. Neutral and status colors remain consistent:

| Semantic Token | Light Mode (`:root`) | Dark Mode (`[data-mode="dark"]`) |
| :--- | :--- | :--- |
| `--color-background` | `#F7F7FC` | `#0D0E14` |
| `--color-surface` | `#FFFFFF` | `#151720` |
| `--color-surface-hover` | `#F5F5FA` | `#1C1E28` |
| `--color-surface-active` | `#EEEEF6` | `#222531` |
| `--color-text-primary` | `#171827` | `#F5F5FA` |
| `--color-text-secondary` | `#555767` | `#B5B6C2` |
| `--color-text-muted` | `#858797` | `#858797` |
| `--color-text-disabled` | `#B5B6C2` | `#555767` |
| `--color-border` | `#E2E2EC` | `#292C38` |
| `--color-border-strong` | `#D2D2DE` | `#383B48` |
| `--color-success` | `#16A34A` | `#4ADE80` |
| `--color-success-subtle` | `#EAF8EF` | `#12301F` |
| `--color-warning` | `#D97706` | `#FBBF24` |
| `--color-warning-subtle` | `#FFF4E5` | `#332A0F` |
| `--color-error` | `#DC2626` | `#F87171` |
| `--color-error-subtle` | `#FDECEC` | `#351719` |
| `--color-info` | `#2563EB` | `#60A5FA` |
| `--color-info-subtle` | `#EEF4FF` | `#16263F` |

---

## 5. Tab-Level & User Theme Isolation

Themes follow a strict 4-level precedence cascade:

```text
MASTER DEFAULT (indigo + light)
      ↓
USER PREFERENCE (database / localStorage)
      ↓
CURRENT TAB OVERRIDE (sessionStorage)
      ↓
ACTIVE THEME (documentElement dataset & CSS custom properties)
```

### Tab Isolation Rules:
1. Active theme and mode for the current tab live strictly in `sessionStorage` (`voop.tab_theme`, `voop.tab_mode`).
2. Tab 1 setting `indigo + dark` **MUST NEVER** mutate Tab 2's `cyan + light` state.
3. No `storage` window event or `BroadcastChannel` may be registered to sync active themes across existing open tabs.
4. Persistent user preference in `localStorage` / `/api/user/preferences` acts solely as the initial seed for brand-new tabs that have no existing tab override.

---

## 6. Centralized Scales

### Spacing Scale
```css
--space-1: 4px;
--space-2: 8px;
--space-3: 12px;
--space-4: 16px;
--space-5: 20px;
--space-6: 24px;
--space-8: 32px;
--space-10: 40px;
```

### Radius Scale
```css
--radius-sm: 6px;
--radius-md: 8px;
--radius-lg: 12px;
--radius-xl: 16px;
```

### Shadows Scale
```css
--shadow-sm: 0 1px 2px rgb(0 0 0 / 0.05);
--shadow-md: 0 4px 12px rgb(0 0 0 / 0.08);
--shadow-lg: 0 10px 30px rgb(0 0 0 / 0.12);
```

### Analytics & Chart Tokens
```css
--chart-primary: var(--theme-primary);
--chart-secondary: var(--theme-primary-hover);
--chart-success: var(--color-success);
--chart-warning: var(--color-warning);
--chart-error: var(--color-error);
--chart-neutral: var(--color-text-muted);
```

---

## 7. Dual Runtime Compatibility

Whether running in:
- **Shopify Embedded Mode** (inside Shopify Admin iframe), or
- **VOOP Standalone Mode** (direct browser Chrome tab),

both runtimes consume the identical Master UI & Theme System.
No separate visual identity or theme override may be created for embedded mode.

---

## 8. Multi-Tenant Architecture & Data Protection

Theme customization is strictly a client presentation layer:
- It **NEVER** alters tenant isolation or store scoping.
- It **NEVER** bypasses authorization or staff permission checks.
- A user from Tenant A cannot see or alter Tenant B's preferences.
- Staff members cannot access features without required permissions regardless of theme.
