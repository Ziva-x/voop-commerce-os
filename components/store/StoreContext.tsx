"use client";

import React, { createContext, useContext, useEffect, useState, useCallback } from "react";
import { appFetch } from "@/lib/api";
import { getAppEnvironment } from "@/lib/runtime-env";
import { useSession } from "next-auth/react";

export interface AccessibleStore {
  id: string;
  voopStoreId: string;
  publicStoreRef?: string;
  storeName: string;
  shopDomain: string;
  currency: string;
  role: string;
  permissions?: string | string[] | null;
  username?: string;
  isPrimary?: boolean;
}

interface StoreContextValue {
  activeStore: AccessibleStore | null;
  availableStores: AccessibleStore[];
  isLoading: boolean;
  error: string | null;
  switchStore: (store: AccessibleStore) => void;
  refreshStores: () => Promise<void>;
}

const StoreContext = createContext<StoreContextValue>({
  activeStore: null,
  availableStores: [],
  isLoading: true,
  error: null,
  switchStore: () => {},
  refreshStores: async () => {},
});

export function StoreProvider({ children }: { children: React.ReactNode }) {
  const { data: session, status: authStatus } = useSession();
  const [availableStores, setAvailableStores] = useState<AccessibleStore[]>([]);
  const [activeStore, setActiveStore] = useState<AccessibleStore | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  const refreshStores = useCallback(async () => {
    let isInsideIframe = false;
    try {
      isInsideIframe = typeof window !== "undefined" && window.top !== window.self;
    } catch (_e) {
      isInsideIframe = true;
    }

    const env = getAppEnvironment();
    const isEmbedded = isInsideIframe || env.isEmbedded;

    // ─────────────────────────────────────────────────────────────────────────
    // DOMAIN A: SHOPIFY EMBEDDED CONTEXT
    // Completely decoupled from Chrome NextAuth session and Chrome login/logout.
    // Authenticates solely via Shopify Admin App Bridge & shop domain.
    // ─────────────────────────────────────────────────────────────────────────
    if (isEmbedded) {
      if (typeof window !== "undefined" && sessionStorage.getItem("voop_embedded_logged_out") === "true") {
        setActiveStore(null);
        setAvailableStores([]);
        setIsLoading(false);
        if (window.location.pathname !== "/embedded-logout") {
          const params = new URLSearchParams(window.location.search);
          const shop = params.get("shop") || "";
          const host = params.get("host") || "";
          const qs = new URLSearchParams();
          if (shop) qs.set("shop", shop);
          if (host) qs.set("host", host);
          window.location.href = `/embedded-logout${qs.toString() ? `?${qs.toString()}` : ""}`;
        }
        return;
      }

      try {
        setIsLoading(true);
        setError(null);

        const res = await appFetch("/api/account/store");
        if (!res.ok) {
          const errData = await res.json().catch(() => ({}));
          throw new Error(errData?.error || `Failed to load Shopify store (${res.status})`);
        }

        const data = await res.json();
        if (data.requiresOnboarding || !data.store) {
          setActiveStore(null);
          setAvailableStores([]);
          setError(data.error || "Store requires onboarding");
          if (
            typeof window !== "undefined" &&
            window.location.pathname !== "/onboarding" &&
            window.location.pathname !== "/embedded-logout"
          ) {
            const params = new URLSearchParams(window.location.search);
            const shop = params.get("shop") || data.shopDomain || "";
            const host = params.get("host") || "";
            const qs = new URLSearchParams();
            if (shop) qs.set("shop", shop);
            if (host) qs.set("host", host);
            if (data.storeId) qs.set("storeId", data.storeId);
            window.location.href = `/onboarding${qs.toString() ? `?${qs.toString()}` : ""}`;
          }
          return;
        }

        if (data.store) {
          const embeddedStore: AccessibleStore = {
            id: data.store.id,
            voopStoreId: data.voopStoreId || data.store.voopStoreId,
            publicStoreRef: data.publicStoreRef || data.store.publicStoreRef,
            storeName: data.store.storeName || data.store.shopDomain,
            shopDomain: data.store.shopDomain,
            currency: data.store.currency || "INR",
            role: data.role || "ADMIN",
            username: data.username || data.store?.username,
            isPrimary: true,
          };
          setActiveStore(embeddedStore);
          setAvailableStores([embeddedStore]);
          setError(null);
        } else {
          setActiveStore(null);
          setError(data.error || "No Shopify store connected");
        }
      } catch (err: any) {
        console.error("[StoreContext:Embedded] Error:", err);
        setError(err?.message || "Failed to initialize embedded store context");
      } finally {
        setIsLoading(false);
      }
      return;
    }

    // ─────────────────────────────────────────────────────────────────────────
    // DOMAIN B: DIRECT CHROME VOOP CONTEXT
    // Uses NextAuth session + Tab-Scoped sessionStorage Bearer token.
    // An iframe MUST NEVER execute Domain B!
    // ─────────────────────────────────────────────────────────────────────────
    if (isInsideIframe) {
      setIsLoading(false);
      return;
    }

    if (authStatus !== "authenticated") {
      setIsLoading(false);
      return;
    }

    try {
      setIsLoading(true);
      setError(null);

      // Multi-tab isolation: ensure tab has its own locked-in Bearer token in sessionStorage
      if (typeof window !== "undefined" && !sessionStorage.getItem("voop.token")) {
        try {
          const tokenRes = await fetch("/api/auth/token");
          if (tokenRes.ok) {
            const tokenData = await tokenRes.json();
            if (tokenData?.token) {
              sessionStorage.setItem("voop.token", tokenData.token);
              sessionStorage.setItem("voop_session_token", tokenData.token);
            }
            if (tokenData?.user?.id) {
              sessionStorage.setItem("voop_tab_user_id", tokenData.user.id);
            }
            if (tokenData?.user?.username) {
              sessionStorage.setItem("voop_tab_username", tokenData.user.username);
            }
            if (tokenData?.user?.name) {
              sessionStorage.setItem("voop_tab_name", tokenData.user.name);
            }
          }
        } catch (_tErr) {}
      }

      const res = await appFetch("/api/account/stores");
      if (res.status === 401) {
        // This tab's sessionStorage token is missing or expired (logged out).
        // Navigate to login — other tabs with their own tokens are NOT affected.
        if (typeof window !== "undefined") {
          window.location.href = "/login";
        }
        return;
      }
      if (!res.ok) {
        throw new Error("Failed to load authorized stores");
      }

      const data = await res.json();
      const stores: AccessibleStore[] = data.stores || [];
      setAvailableStores(stores);

      if (stores.length === 0) {
        setActiveStore(null);
        setIsLoading(false);
        return;
      }

      // 1. Check URL path /app/[storeId]/... or query parameters (Source of truth)
      let urlIdentifier: string | null = null;
      if (typeof window !== "undefined") {
        const match = window.location.pathname.match(/^\/app\/([a-zA-Z0-9_-]+)/i);
        if (match) {
          const raw = decodeURIComponent(match[1]).trim();
          urlIdentifier = raw.toUpperCase().startsWith("VOOP-") ? raw.toUpperCase() : raw;
        } else {
          const params = new URLSearchParams(window.location.search);
          const qId = params.get("storeRef") || params.get("publicStoreRef") || params.get("voopStoreId") || params.get("storeId");
          if (qId) {
            const raw = qId.trim();
            urlIdentifier = raw.toUpperCase().startsWith("VOOP-") ? raw.toUpperCase() : raw;
          }
        }
      }

      // 2. Check tab-isolated sessionStorage
      const savedStoreId = typeof window !== "undefined" ? sessionStorage.getItem("voop_active_store_id") : null;
      const savedVoopId = typeof window !== "undefined" ? sessionStorage.getItem("voop_active_voop_store_id") : null;
      const savedPublicRef = typeof window !== "undefined" ? sessionStorage.getItem("voop_active_public_store_ref") : null;

      let matched: AccessibleStore | undefined;

      // Priority 0: Shopify Embedded Context (Shopify Admin iframe is authoritative)
      const embeddedShop = env.isEmbedded ? env.shop : null;
      if (embeddedShop) {
        const cleanShop = embeddedShop.trim().toLowerCase().replace(/^https?:\/\//, "").replace(/\/.*$/, "");
        const embeddedStore = stores.find((s) => {
          const sDomain = (s.shopDomain || "").trim().toLowerCase().replace(/^https?:\/\//, "").replace(/\/.*$/, "");
          return sDomain === cleanShop;
        });

        if (!embeddedStore) {
          setActiveStore(null);
          setError(
            `Forbidden: Your authenticated VOOP account does not have access to Shopify store "${cleanShop}". Please log in with the authorized account.`
          );
          setIsLoading(false);
          return;
        }

        matched = embeddedStore;

        // Auto-align URL if URL had an old or mismatched store reference
        if (urlIdentifier && urlIdentifier !== matched.publicStoreRef && urlIdentifier !== matched.voopStoreId && urlIdentifier !== matched.id) {
          if (typeof window !== "undefined" && matched.publicStoreRef) {
            const currentPath = window.location.pathname;
            const alignedPath = currentPath.replace(/^\/app\/[^\/]+/, `/app/${matched.publicStoreRef}`);
            window.history.replaceState(null, "", `${alignedPath}${window.location.search}`);
          }
        }
      }

      // Priority A: Target specified in current URL route (Strict Security Check for standalone)
      if (!matched && urlIdentifier) {
        matched = stores.find(
          (s) =>
            (s.publicStoreRef && (s.publicStoreRef === urlIdentifier || s.publicStoreRef.toLowerCase() === urlIdentifier!.toLowerCase())) ||
            (s.voopStoreId && s.voopStoreId.toUpperCase() === urlIdentifier!.toUpperCase()) ||
            s.id === urlIdentifier ||
            (s.shopDomain && s.shopDomain.toLowerCase() === urlIdentifier!.toLowerCase())
        );

        // Security: If URL explicitly requested a store that the user does not own, DENY access with 403
        if (!matched) {
          setActiveStore(null);
          setError(
            `Forbidden: Your authenticated VOOP account does not own or have permission to access store "${urlIdentifier}".`
          );
          setIsLoading(false);
          return;
        }
      }

      // Priority B: Saved tab-isolated sessionStorage (Only for bare routes)
      if (!matched && (savedStoreId || savedVoopId || savedPublicRef)) {
        matched = stores.find(
          (s) =>
            (savedPublicRef && s.publicStoreRef === savedPublicRef) ||
            s.id === savedStoreId ||
            (savedVoopId && s.voopStoreId?.toUpperCase() === savedVoopId.toUpperCase())
        );
      }

      // Priority C: Primary or first authorized store
      if (!matched) {
        matched = stores.find((s) => s.isPrimary) || stores[0];
      }

      if (matched) {
        setActiveStore(matched);
        setError(null);
        if (typeof window !== "undefined") {
          // Only write voop.* namespaced keys — un-namespaced keys (activeStoreId etc.)
          // were removed because they could be read by legacy code across tabs.
          sessionStorage.setItem("voop_active_store_id", matched.id);
          sessionStorage.setItem("voop.activeStoreId", matched.id);
          sessionStorage.setItem("voop.shopDomain", matched.shopDomain);
          sessionStorage.setItem("voop_active_shop_domain", matched.shopDomain);
          if (matched.voopStoreId) {
            sessionStorage.setItem("voop.voopStoreId", matched.voopStoreId);
            sessionStorage.setItem("voop_active_voop_store_id", matched.voopStoreId);
          }
          if (matched.publicStoreRef) {
            sessionStorage.setItem("voop.publicStoreRef", matched.publicStoreRef);
            sessionStorage.setItem("voop_active_public_store_ref", matched.publicStoreRef);
          }
          if (matched.role) {
            sessionStorage.setItem("voop_tab_role", matched.role);
          }
          if (matched.permissions) {
            sessionStorage.setItem(
              "voop_tab_permissions",
              typeof matched.permissions === "string" ? matched.permissions : JSON.stringify(matched.permissions)
            );
          }
        }
      }
    } catch (err: any) {
      console.error("[StoreContext] Error:", err);
      setError(err?.message || "Failed to initialize store context");
    } finally {
      setIsLoading(false);
    }
  }, [authStatus]);

  useEffect(() => {
    refreshStores();
  }, [refreshStores]);

  const switchStore = useCallback((store: AccessibleStore) => {
    if (getAppEnvironment().isEmbedded) {
      // In embedded Shopify mode, the store identity is fixed to the authenticating Shopify shop
      return;
    }
    setActiveStore(store);
    setError(null);
    if (typeof window !== "undefined") {
      sessionStorage.setItem("voop_active_store_id", store.id);
      sessionStorage.setItem("voop.activeStoreId", store.id);
      sessionStorage.setItem("voop.shopDomain", store.shopDomain);
      sessionStorage.setItem("voop_active_shop_domain", store.shopDomain);
      if (store.voopStoreId) {
        sessionStorage.setItem("voop.voopStoreId", store.voopStoreId);
        sessionStorage.setItem("voop_active_voop_store_id", store.voopStoreId);
      }
      if (store.publicStoreRef) {
        sessionStorage.setItem("voop.publicStoreRef", store.publicStoreRef);
        sessionStorage.setItem("voop_active_public_store_ref", store.publicStoreRef);
      }
      if (store.role) {
        sessionStorage.setItem("voop_tab_role", store.role);
      }
      if (store.permissions) {
        sessionStorage.setItem(
          "voop_tab_permissions",
          typeof store.permissions === "string" ? store.permissions : JSON.stringify(store.permissions)
        );
      }
      // Broadcast tab-internal change event
      window.dispatchEvent(new CustomEvent("voop:store_changed", { detail: store }));
    }
  }, []);

  return (
    <StoreContext.Provider
      value={{
        activeStore,
        availableStores,
        isLoading,
        error,
        switchStore,
        refreshStores,
      }}
    >
      {children}
    </StoreContext.Provider>
  );
}

export function useActiveStore() {
  return useContext(StoreContext);
}
