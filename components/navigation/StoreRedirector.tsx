"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useActiveStore } from "@/components/store/StoreContext";
import { storeRoute } from "@/lib/routes";
import { CardGridSkeleton } from "@/components/LoadingSkeleton";

interface StoreRedirectorProps {
  section?: string;
}

/**
 * Universal Bare Route Redirector
 * Automatically forwards legacy/bare routes (e.g. /billing, /orders, /inventory)
 * to the canonical store-scoped route (/app/:storeRef/:section).
 */
export function StoreRedirector({ section = "" }: StoreRedirectorProps) {
  const router = useRouter();
  const { activeStore, isLoading, availableStores } = useActiveStore();
  const [redirecting, setRedirecting] = useState(false);

  useEffect(() => {
    // 1. Fast path: check tab sessionStorage immediately
    if (typeof window !== "undefined") {
      const savedPublicRef =
        sessionStorage.getItem("voop.publicStoreRef") ||
        sessionStorage.getItem("voop_active_public_store_ref");
      const savedVoopId =
        sessionStorage.getItem("voop.voopStoreId") ||
        sessionStorage.getItem("voop_active_voop_store_id");
      const savedStoreId =
        sessionStorage.getItem("voop.activeStoreId") ||
        sessionStorage.getItem("voop_active_store_id");
      const storeRef = savedPublicRef || savedVoopId || savedStoreId;
      if (storeRef) {
        setRedirecting(true);
        const search = window.location.search || "";
        router.replace(`${storeRoute(storeRef, section)}${search}`);
        return;
      }
    }

    // 2. Context path: if activeStore is loaded in StoreContext
    if (activeStore) {
      setRedirecting(true);
      const storeRef = activeStore.publicStoreRef || activeStore.voopStoreId || activeStore.id;
      const search = typeof window !== "undefined" ? window.location.search : "";
      router.replace(`${storeRoute(storeRef, section)}${search}`);
      return;
    }

    // 3. If stores loaded but no activeStore, pick first or primary
    if (!isLoading && availableStores.length > 0) {
      const primary = availableStores.find((s) => s.isPrimary) || availableStores[0];
      setRedirecting(true);
      const storeRef = primary.publicStoreRef || primary.voopStoreId || primary.id;
      const search = typeof window !== "undefined" ? window.location.search : "";
      router.replace(`${storeRoute(storeRef, section)}${search}`);
      return;
    }

    // 4. Fallback: fetch user's account store if not in context
    if (!isLoading && availableStores.length === 0) {
      const resolveAndRedirect = async () => {
        try {
          const { appFetch } = await import("@/lib/api");
          const res = await appFetch("/api/account/store");
          if (res.ok) {
            const data = await res.json();
            const storeRef = data.publicStoreRef || data.voopStoreId || data.store?.id;
            if (storeRef) {
              setRedirecting(true);
              const search = typeof window !== "undefined" ? window.location.search : "";
              router.replace(`${storeRoute(storeRef, section)}${search}`);
              return;
            }
          }
        } catch (_err) {}
      };
      resolveAndRedirect();
    }
  }, [activeStore, availableStores, isLoading, router, section]);

  return (
    <div className="p-6">
      <CardGridSkeleton count={4} />
    </div>
  );
}
