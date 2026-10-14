/**
 * Central Permission System for VOOP
 *
 * Defines granular permission keys, module groups, and resolver helpers.
 * ADMIN has full access to their authorized store(s).
 * STAFF has access restricted strictly to granted permissions.
 */

export const PERMISSION_KEYS = {
  // Orders
  ORDERS_VIEW: "orders.view",
  ORDERS_MANAGE: "orders.manage",

  // Products & Variants
  PRODUCTS_VIEW: "products.view",
  PRODUCTS_MANAGE: "products.manage",

  // Physical Inventory
  INVENTORY_VIEW: "inventory.view",
  INVENTORY_MANAGE: "inventory.manage",

  // Purchases (Bills)
  PURCHASES_VIEW: "purchases.view",
  PURCHASES_MANAGE: "purchases.manage",

  // Tax on Sales
  TAX_VIEW: "tax.view",
  TAX_MANAGE: "tax.manage",

  // P&L Statement
  PNL_VIEW: "pnl.view",

  // Shipments & Logistics
  SHIPMENTS_VIEW: "shipments.view",
  SHIPMENTS_MANAGE: "shipments.manage",

  // Courier APIs & Integrations
  COURIER_API_VIEW: "courier_api.view",
  COURIER_API_MANAGE: "courier_api.manage",

  // Company Profile & Invoice Master
  COMPANY_INVOICE_VIEW: "company_invoice.view",
  COMPANY_INVOICE_MANAGE: "company_invoice.manage",

  // Ads & Marketing
  ADS_VIEW: "ads.view",
  ADS_MANAGE: "ads.manage",

  // Settings
  SETTINGS_VIEW: "settings.view",
  SETTINGS_MANAGE: "settings.manage",

  // Staff Management (Admin only by default)
  STAFF_VIEW: "staff.view",
  STAFF_MANAGE: "staff.manage",

  // Dashboard
  DASHBOARD_VIEW: "dashboard.view",
} as const;

export type PermissionKey = typeof PERMISSION_KEYS[keyof typeof PERMISSION_KEYS];

export interface PermissionModuleGroup {
  moduleId: string;
  moduleName: string;
  permissions: {
    key: PermissionKey;
    label: string;
    description: string;
  }[];
}

export const PERMISSION_MODULE_GROUPS: PermissionModuleGroup[] = [
  {
    moduleId: "orders",
    moduleName: "Orders & Line Items",
    permissions: [
      { key: PERMISSION_KEYS.ORDERS_VIEW, label: "View Orders", description: "View Shopify and manual orders" },
      { key: PERMISSION_KEYS.ORDERS_MANAGE, label: "Manage Orders", description: "Create, edit, cancel orders and print invoices" },
    ],
  },
  {
    moduleId: "products",
    moduleName: "Products & Variants",
    permissions: [
      { key: PERMISSION_KEYS.PRODUCTS_VIEW, label: "View Products", description: "View products and SKU mappings" },
      { key: PERMISSION_KEYS.PRODUCTS_MANAGE, label: "Manage Products", description: "Edit products and update mappings" },
    ],
  },
  {
    moduleId: "inventory",
    moduleName: "Physical Inventory",
    permissions: [
      { key: PERMISSION_KEYS.INVENTORY_VIEW, label: "View Inventory", description: "View warehouse stock levels" },
      { key: PERMISSION_KEYS.INVENTORY_MANAGE, label: "Manage Inventory", description: "Adjust counts, perform GRN, manage combos" },
    ],
  },
  {
    moduleId: "purchases",
    moduleName: "Purchases & Inward Bills",
    permissions: [
      { key: PERMISSION_KEYS.PURCHASES_VIEW, label: "View Purchases", description: "View vendor purchase bills" },
      { key: PERMISSION_KEYS.PURCHASES_MANAGE, label: "Manage Purchases", description: "Record new purchase bills and GRN" },
    ],
  },
  {
    moduleId: "logistics",
    moduleName: "Logistics & Shipments",
    permissions: [
      { key: PERMISSION_KEYS.SHIPMENTS_VIEW, label: "View Shipments", description: "View shipments and tracking scans" },
      { key: PERMISSION_KEYS.SHIPMENTS_MANAGE, label: "Manage Shipments & Scanner", description: "Barcode outward/RTO dispatch scanning" },
    ],
  },
  {
    moduleId: "finance",
    moduleName: "Finance, Tax & P&L",
    permissions: [
      { key: PERMISSION_KEYS.TAX_VIEW, label: "View Tax on Sales", description: "View GST breakdown and liability" },
      { key: PERMISSION_KEYS.PNL_VIEW, label: "View P&L Statement", description: "View financial profit & loss calculations" },
    ],
  },
  {
    moduleId: "settings_couriers",
    moduleName: "Company, Invoices & Couriers",
    permissions: [
      { key: PERMISSION_KEYS.COMPANY_INVOICE_VIEW, label: "View Company Profile", description: "View seller info and invoice settings" },
      { key: PERMISSION_KEYS.COURIER_API_VIEW, label: "View Courier APIs", description: "View connected shipping courier integrations" },
      { key: PERMISSION_KEYS.SETTINGS_VIEW, label: "View Settings", description: "Access store settings" },
    ],
  },
  {
    moduleId: "marketing",
    moduleName: "Marketing & Ads",
    permissions: [
      { key: PERMISSION_KEYS.ADS_VIEW, label: "View Ads & ROAS", description: "View Meta/Google ad spend and ROAS" },
      { key: PERMISSION_KEYS.ADS_MANAGE, label: "Manage Ads", description: "Configure ad platform connections" },
    ],
  },
];

/**
 * Maps legacy string tokens (e.g. "ORDERS", "INVENTORY") to new permission keys
 */
const LEGACY_TOKEN_MAP: Record<string, PermissionKey[]> = {
  DASHBOARD: [PERMISSION_KEYS.DASHBOARD_VIEW],
  ORDERS: [PERMISSION_KEYS.ORDERS_VIEW, PERMISSION_KEYS.ORDERS_MANAGE],
  PRODUCTS: [PERMISSION_KEYS.PRODUCTS_VIEW, PERMISSION_KEYS.PRODUCTS_MANAGE],
  INVENTORY: [PERMISSION_KEYS.INVENTORY_VIEW, PERMISSION_KEYS.INVENTORY_MANAGE],
  LOGISTICS: [PERMISSION_KEYS.SHIPMENTS_VIEW, PERMISSION_KEYS.SHIPMENTS_MANAGE, PERMISSION_KEYS.COURIER_API_VIEW],
  FINANCE: [PERMISSION_KEYS.TAX_VIEW, PERMISSION_KEYS.PNL_VIEW, PERMISSION_KEYS.PURCHASES_VIEW],
  MARKETING: [PERMISSION_KEYS.ADS_VIEW, PERMISSION_KEYS.ADS_MANAGE],
};

/**
 * Normalizes a user's permissions array into standard permission keys
 */
export function normalizeUserPermissions(rawPermissions: string | string[] | null | undefined): string[] {
  if (!rawPermissions) return [];

  let parsed: string[] = [];
  if (Array.isArray(rawPermissions)) {
    parsed = rawPermissions;
  } else if (typeof rawPermissions === "string") {
    try {
      const json = JSON.parse(rawPermissions);
      if (Array.isArray(json)) {
        parsed = json;
      } else {
        parsed = [rawPermissions];
      }
    } catch {
      parsed = rawPermissions.split(",").map((p) => p.trim()).filter(Boolean);
    }
  }

  const result = new Set<string>();
  for (const item of parsed) {
    if (!item) continue;
    const cleanItem = String(item).trim();
    result.add(cleanItem);

    // Expand legacy tokens if present
    const uppercase = cleanItem.toUpperCase();
    if (LEGACY_TOKEN_MAP[uppercase]) {
      for (const mapped of LEGACY_TOKEN_MAP[uppercase]) {
        result.add(mapped);
      }
    }

    // Expand wildcard e.g. "orders.*" -> "orders.view", "orders.manage"
    if (cleanItem.endsWith(".*")) {
      const prefix = cleanItem.replace(".*", "");
      for (const val of Object.values(PERMISSION_KEYS)) {
        if (val.startsWith(`${prefix}.`)) {
          result.add(val);
        }
      }
    }
  }

  return Array.from(result);
}

/**
 * Central Permission Resolver
 *
 * @param user User object or session user with `role` and `permissions`
 * @param requiredPermission The specific permission required (e.g. "inventory.view")
 */
export function hasPermission(
  user: { role?: string; permissions?: string | string[] | null } | null | undefined,
  requiredPermission: string
): boolean {
  if (!user) return false;

  const role = (user.role || "").toUpperCase();

  // ADMIN role has unrestricted access to all modules in their store
  if (role === "ADMIN") {
    return true;
  }

  // If user is not STAFF, deny access
  if (role !== "STAFF") {
    return false;
  }

  // Dashboard is always viewable for any active staff member
  if (requiredPermission === PERMISSION_KEYS.DASHBOARD_VIEW || requiredPermission === "dashboard") {
    return true;
  }

  const grantedPermissions = normalizeUserPermissions(user.permissions);

  // Exact match
  if (grantedPermissions.includes(requiredPermission)) {
    return true;
  }

  // Check prefix / module wildcard match
  const [module] = requiredPermission.split(".");
  if (
    grantedPermissions.includes(`${module}.*`) ||
    grantedPermissions.includes(module) ||
    grantedPermissions.includes(module.toUpperCase()) ||
    grantedPermissions.includes(module.toLowerCase())
  ) {
    return true;
  }

  return false;
}

