# VOOP OS — ARCHITECTURE CONTRACT & ISOLATION MODEL

> **AUTHORITATIVE ARCHITECTURE CONTRACT**
> This document defines the permanent, non-negotiable architectural rules for VOOP OS.
> Every engineer, AI assistant, and future feature implementation MUST adhere strictly to these principles.
> Never rebuild, replace, or bypass this architecture.

---

## 1. Physical Architecture: One Shared Database

The application utilizes **ONE SHARED DATABASE** (PostgreSQL via Prisma ORM).
There are **NOT** separate databases or dynamically created schemas per store or tenant.

```text
                    ONE SHARED DATABASE
                             │
            ┌────────────────┼────────────────┐
            │                │                │
         TENANT A         TENANT B         TENANT C
            │                │                │
         STORE A          STORE B          STORE C
            │                │                │
       ┌────┼────┐      ┌────┼────┐           │
       │    │    │      │    │    │           │
     Admin Staff Staff Admin Staff          Admin
       │    │    │      │    │                │
       └────┴────┘      └────┴────┘           │
            │                │                │
         Permissions      Permissions      Permissions
            │                │                │
         DATA A           DATA B           DATA C
```

- Physical tables (`shopify_orders`, `shopify_products`, `shipments`, `stock_items`, `purchase_bills`, `inventory_ledgers`, `sync_logs`, etc.) are physically shared.
- Business data is logically partitioned and isolated by `storeId` and `tenantId`.
- **CRITICAL RULE**: `ONE DATABASE ≠ SHARED BUSINESS DATA`. Queries must ALWAYS filter strictly by `storeId`.

---

## 2. Identity & Isolation Boundaries

The fundamental identity model consists of 5 distinct concepts:

| Entity | Field Name | Architectural Scope & Boundary |
| :--- | :--- | :--- |
| **Tenant** | `tenantId` | Permanent organization/company boundary (e.g. `TENANT-7F4K9X2M`). |
| **Store** | `storeId` / `voopStoreId` | Individual Shopify store and business data partition (e.g. `VOOP-8K2N5P9X`). |
| **Employee / User** | `userId` | Individual human identity (`User.id` in `users` table). |
| **Role** | `role` | Role classification: `ADMIN` or `STAFF`. |
| **Permissions** | `permissions` | Granular customizable JSON capability array (e.g. `["orders.view", "inventory.view"]`). |

### Rules of Separation:
1. **DO NOT** treat `employee_id` / `userId` as `tenantId`.
2. **DO NOT** treat `employee_id` / `userId` as `storeId`.
3. **DO NOT** treat `role` as `permissions`.
4. **DO NOT** merge these concepts.

---

## 3. Strict Employee Isolation & Staff Permissions

1. **Store/Tenant Membership**:
   - Employees belong strictly to their own tenant/store via `StoreMembership` (`userId`, `storeId`, `role`, `permissions`).
   - An employee from Tenant A can **NEVER** access, view, or mutate data in Tenant B.
   - There is no shared employee pool across unrelated tenants.
2. **Customizable Staff Permissions**:
   - Authorization is **never** `role === "staff"` alone.
   - Permissions are customizable per employee per store (`StoreMembership.permissions`).
   - If Staff A002 is granted `orders.view` and `orders.update`, but not `orders.delete`, backend authorization MUST reject `orders.delete` with `403 Forbidden`. Frontend hiding of buttons is never sufficient.
3. **Staff Shared Data**:
   - Staff and Admin of the same store access the **SAME** underlying store data where permissions permit. Do not create duplicate datasets for staff vs admin.

---

## 4. Multi-Tab & Multi-Store Browser State Architecture

The application supports concurrent operation across multiple browser tabs and multiple stores.

### The Multi-Tab Isolation Guarantees:
- **TAB 1**: Tenant A / Store A / Employee A001
- **TAB 2**: Tenant B / Store B / Employee B001
- **TAB 3**: Tenant C / Store C / Employee C001

1. **Tab-Scoped Authoritative Context**:
   - Active store selection is tab-scoped, maintained via the URL route (`/app/:storeRef/...`) and tab-isolated `sessionStorage`.
   - **`localStorage` MUST NEVER be used as the authoritative active-store context.** `localStorage` is origin-wide and will leak across tabs.
2. **Immutable User Record on Requests**:
   - **NEVER** update `User.storeId` on incoming HTTP requests or store switching.
   - `User.storeId` in PostgreSQL represents the user's initial or home store. Overwriting `User.storeId` when Store B is opened corrupts Tab 1.
3. **Direct Chrome Login Isolation**:
   - Each browser tab sends its tab session token (`Authorization: Bearer <token>` or `x-voop-session-token`).
   - Ambient browser cookies (`__Secure-next-auth.session-token`) are NEVER allowed to overwrite a tab's explicit token.
   - Frontend UI elements (such as `Header.tsx`) derive the current user identity from the tab's store context (`currentStore.username`), not from ambient shared cookies.
4. **Store Switching**:
   - Switching a store in Tab 2 navigates Tab 2 to `/app/:newStoreRef/...` and updates Tab 2's `sessionStorage`.
   - Tab 1's URL, `sessionStorage`, and rendered data remain completely unmodified.

---

## 5. Dual Runtime Modes

### A. Shopify Embedded Mode (Shopify Admin iframe)
- Authenticated strictly via Shopify App Bridge Session Tokens (JWT) and verified `shop` domain.
- Ignores all ambient Chrome cookies and standalone headers.
- Embedded requests resolving without a valid Shopify context must fail closed (401 / 403), never falling back to Chrome cookies or another tenant.

### B. VOOP Standalone Mode (Direct Browser SaaS)
- Authenticated via per-tab Bearer token in `sessionStorage`, route URL parameters, and secure credentials.
- An iframe request is permanently barred from executing standalone fallback logic.

---

## 6. Store-Scoped Business Modules

The following application modules are strictly store-scoped:
- **Dashboard**
- **Analytics**
- **Physical Inventory & Variants**
- **Products & Tax Configs**
- **Purchases & All Bills**
- **Tax on Sales**
- **P&L Statement & Expenses**
- **Manual Billing**
- **Orders & Order Lines**
- **Fulfillments & Shipping Labels**
- **Shipments, Couriers & RTO Reconciliation**
- **Barcode Scanner (Inward / Outward)**
- **Meta Ads & Ad Platform Metrics**
- **Creator Collaborations & Collab Form Builder**
- **Company & Invoice Settings**
- **Courier API Integrations**
- **Sync Logs & Background Sync Jobs**

Every query against these modules MUST include `where: { storeId }` or `where: { storeId, tenantId }`.

---

## 7. Protected Core Files

The following files constitute the **PROTECTED CORE** of the application:

1. **`lib/tenant-ids.ts`**: Permanent identifier generation (`voopStoreId`, `tenantId`, `publicStoreRef`).
2. **`lib/auth-helpers.ts`**: Universal tenant resolution, store authorization, and employee permissions.
3. **`lib/shopifyAuth.ts`**: Shopify App Bridge session token verification and token exchange.
4. **`lib/permissions.ts`**: Granular permission validation (`hasPermission`).
5. **`lib/api.ts`**: Client-side fetcher injecting tab-isolated headers and URL cache busters.
6. **`components/store/StoreContext.tsx`**: Client-side store context provider.
7. **`components/navigation/StoreRedirector.tsx`**: Canonical store route redirector.
8. **`prisma/schema.prisma`**: Multi-tenant database schema definition.

### Protected Core Modification Rule:
Before modifying any protected core file, you MUST document:
1. Why the change is necessary.
2. Which protected component is affected.
3. What could break.
4. How tenant and multi-tab isolation will remain protected.
5. What regression tests will be added.

---

## 8. Feature Development Safety Checklist

Before completing any new feature:
1. [ ] Identify `tenantId`, `storeId`, `userId`, and required permissions.
2. [ ] Validate authorization via `authorizeStoreAccess(request, { requiredPermission })`.
3. [ ] Filter all database queries strictly by `where: { storeId }`.
4. [ ] Include store identifier in cache keys and API routes (`?storeRef=...`).
5. [ ] Verify that opening or switching stores in one tab does NOT mutate other tabs.
6. [ ] Verify that the feature functions identically in both Standalone and Shopify Embedded modes.
7. [ ] Run automated regression test suite: `node scripts/test-multi-tenant-architecture.js`.
