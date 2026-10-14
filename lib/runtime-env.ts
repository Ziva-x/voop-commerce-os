/**
 * VOOP Centralized Runtime Environment & Embedded Detection Helper
 *
 * Explicitly distinguishes between:
 * 1. STANDALONE MODE: Directly visited in browser (https://voop-webapp.fly.dev)
 * 2. SHOPIFY EMBEDDED MODE: Rendered inside Shopify Admin iframe
 *
 * DO NOT hardcode shop domains.
 * DO NOT assume app is always embedded or always standalone.
 */

export type RuntimeMode = "embedded" | "standalone";

export interface AppEnvironment {
  mode: RuntimeMode;
  shop: string | null;
  host: string | null;
  isEmbedded: boolean;
}

/**
 * Normalizes and cleans a Shopify shop domain string
 */
export function cleanShopifyDomain(domain?: string | null): string | null {
  if (!domain) return null;
  const cleaned = domain
    .trim()
    .toLowerCase()
    .replace(/^https?:\/\//, "")
    .replace(/\/.*$/, "");
  if (!cleaned || !cleaned.includes(".")) return null;
  return cleaned;
}

/**
 * Safely decodes Shopify shop domain from base64 host string
 */
export function decodeShopFromHost(host?: string | null): string | null {
  if (!host) return null;
  try {
    const decoded = atob(host).split("/")[0];
    if (decoded && decoded.includes(".")) {
      return cleanShopifyDomain(decoded);
    }
  } catch (_e) {}
  return null;
}

/**
 * Resolves the current runtime environment.
 * Single source of truth for runtime detection across all pages and components.
 */
export function getAppEnvironment(): AppEnvironment {
  if (typeof window === "undefined") {
    // Server-Side Rendering (SSR) context: Safe standalone default
    return {
      mode: "standalone",
      shop: null,
      host: null,
      isEmbedded: false,
    };
  }

  // 1. Check official Shopify App Bridge v4 global environment
  const shopifyGlobal = (window as any).shopify;
  if (shopifyGlobal?.environment?.embedded === true) {
    const bridgeShop = cleanShopifyDomain(shopifyGlobal?.config?.shop);
    const bridgeHost = shopifyGlobal?.config?.host || null;
    const urlParams = new URLSearchParams(window.location.search);
    const urlShop = cleanShopifyDomain(urlParams.get("shop"));
    const resolvedShop = urlShop || bridgeShop || decodeShopFromHost(bridgeHost || urlParams.get("host"));
    const resolvedHost = bridgeHost || urlParams.get("host") || null;

    if (resolvedShop) {
      try {
        const prevShop = cleanShopifyDomain(sessionStorage.getItem("voop_embedded_shop"));
        if (prevShop && prevShop !== resolvedShop) {
          // Shop changed! Clear any stale store identifiers from previous store
          sessionStorage.removeItem("voop.voopStoreId");
          sessionStorage.removeItem("voop.activeStoreId");
          sessionStorage.removeItem("voop.publicStoreRef");
          sessionStorage.removeItem("voop_active_store_id");
          sessionStorage.removeItem("voop_active_voop_store_id");
          sessionStorage.removeItem("voop_active_public_store_ref");
        }
        sessionStorage.setItem("voop_is_embedded", "true");
        sessionStorage.setItem("voop_embedded_shop", resolvedShop);
        if (resolvedHost) sessionStorage.setItem("voop_embedded_host", resolvedHost);
      } catch (_e) {}
    }

    return {
      mode: "embedded",
      shop: resolvedShop,
      host: resolvedHost,
      isEmbedded: true,
    };
  }

  // 2. Strict Iframe Check
  // An embedded Shopify Admin app is ALWAYS inside an iframe.
  // If window.top === window.self, the app was opened directly in a browser tab (STANDALONE).
  let isInsideIframe = false;
  try {
    isInsideIframe = window.top !== window.self;
  } catch (_e) {
    // Cross-origin access restriction on window.top proves the window is nested
    // inside an iframe from another origin (e.g. admin.shopify.com)
    isInsideIframe = true;
  }

  if (!isInsideIframe) {
    // STANDALONE MODE: Not inside an iframe
    return {
      mode: "standalone",
      shop: null,
      host: null,
      isEmbedded: false,
    };
  }

  // 3. Inside an iframe: inspect query parameters and tab-scoped sessionStorage
  const params = new URLSearchParams(window.location.search);
  const queryShop = cleanShopifyDomain(params.get("shop"));
  const queryHost = params.get("host");
  const queryEmbedded = params.get("embedded") === "1";

  let storageShop: string | null = null;
  let storageHost: string | null = null;

  try {
    storageShop = cleanShopifyDomain(sessionStorage.getItem("voop_embedded_shop"));
    storageHost = sessionStorage.getItem("voop_embedded_host");
  } catch (_e) {}

  const host = queryHost || storageHost || null;

  // URL parameter is ALWAYS authoritative over stored session
  let shop = queryShop || storageShop || decodeShopFromHost(host);

  if (queryShop && storageShop && queryShop !== storageShop) {
    // URL specified a different shop than previously stored in this session: purge old store keys!
    try {
      sessionStorage.removeItem("voop.voopStoreId");
      sessionStorage.removeItem("voop.activeStoreId");
      sessionStorage.removeItem("voop.publicStoreRef");
      sessionStorage.removeItem("voop_active_store_id");
      sessionStorage.removeItem("voop_active_voop_store_id");
      sessionStorage.removeItem("voop_active_public_store_ref");
    } catch (_e) {}
    shop = queryShop;
  }

  // Inside ANY iframe, the runtime is ALWAYS embedded!
  try {
    sessionStorage.setItem("voop_is_embedded", "true");
    if (shop) sessionStorage.setItem("voop_embedded_shop", shop);
    if (host) sessionStorage.setItem("voop_embedded_host", host);
  } catch (_e) {}

  return {
    mode: "embedded",
    shop: shop || null,
    host: host || null,
    isEmbedded: true,
  };
}

/**
 * Convenience helper: true if running embedded inside Shopify Admin
 */
export function isEmbeddedMode(): boolean {
  return getAppEnvironment().isEmbedded;
}

/**
 * Convenience helper: get current Shopify shop domain or null
 */
export function getEmbeddedShop(): string | null {
  return getAppEnvironment().shop;
}

/**
 * Convenience helper: get current Shopify host or null
 */
export function getEmbeddedHost(): string | null {
  return getAppEnvironment().host;
}

/**
 * Preserves Shopify context parameters during in-app navigation and redirects.
 * In embedded mode, appends ?shop=...&host=...&embedded=1.
 * In standalone mode, leaves URL intact.
 */
export function preserveShopifyParams(url: string): string {
  if (typeof window === "undefined") return url;
  const env = getAppEnvironment();
  if (!env.isEmbedded) return url;

  try {
    const baseOrigin = "https://voop.internal";
    const parsed = new URL(url, baseOrigin);

    if (env.shop && !parsed.searchParams.has("shop")) {
      parsed.searchParams.set("shop", env.shop);
    }
    if (env.host && !parsed.searchParams.has("host")) {
      parsed.searchParams.set("host", env.host);
    }
    if (!parsed.searchParams.has("embedded")) {
      parsed.searchParams.set("embedded", "1");
    }

    if (url.startsWith("/")) {
      return parsed.pathname + parsed.search + parsed.hash;
    }
    return parsed.toString();
  } catch (_e) {
    return url;
  }
}

/**
 * Clears stored embedded context from sessionStorage
 */
export function clearShopifyContext(): void {
  if (typeof window === "undefined") return;
  try {
    sessionStorage.removeItem("voop_is_embedded");
    sessionStorage.removeItem("voop_embedded_shop");
    sessionStorage.removeItem("voop_embedded_host");
  } catch (_e) {}
}
