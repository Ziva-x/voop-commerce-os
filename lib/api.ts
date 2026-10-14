import { getAppEnvironment, type AppEnvironment } from "@/lib/runtime-env";

declare global {
  interface Window {
    shopify?: {
      idToken?: () => Promise<string>;
      config?: {
        shop?: string;
        host?: string;
        apiKey?: string;
      };
      environment?: {
        embedded?: boolean;
        mobile?: boolean;
      };
    };
  }
}

export function getHostFromUrl(): string | null {
  return getAppEnvironment().host;
}

export function getShopFromUrl(): string | null {
  return getAppEnvironment().shop;
}

export function isEmbeddedContext(): boolean {
  return getAppEnvironment().isEmbedded;
}

export async function appFetch(input: string | URL | Request, init?: RequestInit): Promise<Response> {
  const headers = new Headers(init?.headers || {});
  let isInsideIframe = false;
  try {
    isInsideIframe = typeof window !== "undefined" && window.top !== window.self;
  } catch (_e) {
    isInsideIframe = true;
  }
  const env = getAppEnvironment();
  const isEmbedded = isInsideIframe || env.isEmbedded;
  let targetStoreRef: string | null = null;

  // 1. SHOPIFY EMBEDDED CONTEXT: Authenticate exclusively via Shopify App Bridge & shop domain
  if (isEmbedded) {
    headers.set("x-voop-auth-mode", "SHOPIFY_EMBEDDED");
    headers.set("x-shopify-embedded", "1");

    if (typeof window !== "undefined" && window.shopify?.idToken) {
      try {
        const sessionToken = await window.shopify.idToken();
        if (sessionToken) {
          headers.set("Authorization", `Bearer ${sessionToken}`);
          headers.set("x-shopify-id-token", sessionToken);
        }
      } catch (e) {
        console.warn("Could not retrieve Shopify session token:", e);
      }
    }

    if (env.shop) {
      headers.set("x-shopify-shop-domain", env.shop);
    }
    if (env.host) {
      headers.set("x-shopify-host", env.host);
    }

    // Explicitly purge any standalone store headers to prevent ambient pollution
    headers.delete("x-voop-store-id");
    headers.delete("x-store-id");
    headers.delete("x-public-store-ref");
    headers.delete("x-voop-session-token");
    headers.delete("x-voop-tab-id");
  } else {
    // 2. DIRECT CHROME VOOP STANDALONE CONTEXT: Tab-isolated token & tab identifiers
    headers.set("x-voop-auth-mode", "VOOP_STANDALONE");

    if (typeof window !== "undefined") {
      let tabId = sessionStorage.getItem("voop.tabId") || sessionStorage.getItem("voop_tab_id");
      if (!tabId) {
        tabId = typeof crypto !== "undefined" && crypto.randomUUID ? crypto.randomUUID() : "tab_" + Math.random().toString(36).substring(2, 9);
        try {
          sessionStorage.setItem("voop.tabId", tabId);
          sessionStorage.setItem("voop_tab_id", tabId);
        } catch (_e) {}
      }
      headers.set("x-voop-tab-id", tabId);

      const tabSessionToken = sessionStorage.getItem("voop.token") || sessionStorage.getItem("voop_session_token");
      if (tabSessionToken) {
        headers.set("Authorization", `Bearer ${tabSessionToken}`);
        headers.set("x-voop-session-token", tabSessionToken);
      }

      // Check URL path /app/[storeRef]/...
      const storeMatch = window.location.pathname.match(/^\/app\/([a-zA-Z0-9_-]+)/i);
      let urlStoreRef: string | null = null;
      if (storeMatch) {
        const raw = decodeURIComponent(storeMatch[1]).trim();
        urlStoreRef = raw.toUpperCase().startsWith("VOOP-") ? raw.toUpperCase() : raw;
      }

      // Read tab-isolated store context from URL (priority) or sessionStorage
      const tabPublicStoreRef = (urlStoreRef && !urlStoreRef.startsWith("VOOP-"))
        ? urlStoreRef
        : (sessionStorage.getItem("voop.publicStoreRef") || sessionStorage.getItem("voop_active_public_store_ref"));
      const tabVoopStoreId = (urlStoreRef && urlStoreRef.startsWith("VOOP-"))
        ? urlStoreRef
        : (sessionStorage.getItem("voop.voopStoreId") || sessionStorage.getItem("voop_active_voop_store_id"));
      const tabStoreId = sessionStorage.getItem("voop.activeStoreId") || sessionStorage.getItem("voop_active_store_id");
      targetStoreRef = urlStoreRef || tabPublicStoreRef || tabVoopStoreId || tabStoreId;

      if (tabPublicStoreRef && !headers.has("x-public-store-ref")) {
        headers.set("x-public-store-ref", tabPublicStoreRef);
      }
      if (tabVoopStoreId && !headers.has("x-voop-store-id")) {
        headers.set("x-voop-store-id", tabVoopStoreId);
      }
      if (tabStoreId && !headers.has("x-store-id")) {
        headers.set("x-store-id", tabStoreId);
      }
    }
  }

  // 3. Ensure JSON content-type if body is JSON string
  if (init?.body && typeof init.body === "string" && !headers.has("Content-Type")) {
    headers.set("Content-Type", "application/json");
  }

  // 4. Append storeRef & shop query parameters to URL for browser cache isolation
  let url = typeof input === "string" ? input : input.toString();
  if (isEmbedded) {
    const shop = getShopFromUrl();
    if (shop && !url.includes("shop=") && url.startsWith("/api/")) {
      const separator = url.includes("?") ? "&" : "?";
      url = `${url}${separator}shop=${encodeURIComponent(shop)}`;
    }
  } else if (targetStoreRef && !url.includes("storeRef=") && url.startsWith("/api/")) {
    const separator = url.includes("?") ? "&" : "?";
    url = `${url}${separator}storeRef=${encodeURIComponent(targetStoreRef)}`;
  }

  // Prevent browser from serving stale cross-tab cached GET responses
  if (!headers.has("Cache-Control")) {
    headers.set("Cache-Control", "no-cache");
  }

  const response = await fetch(url, {
    ...init,
    headers,
  });

  return response;
}
