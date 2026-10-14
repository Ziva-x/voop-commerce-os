import { useCallback } from "react";
import { usePathname } from "next/navigation";
import { useActiveStore } from "@/components/store/StoreContext";
import { preserveShopifyParams } from "@/lib/runtime-env";

/**
 * Canonical Store Route Builder
 * Generates store-scoped URLs throughout the VOOP application.
 *
 * Pattern:
 *   /app/:storeRef
 *   /app/:storeRef/:section
 *   /app/:storeRef/:section/:subsection
 *
 * Examples:
 *   storeRoute("VOOP-H2GDGBVA", "billing") -> "/app/VOOP-H2GDGBVA/billing"
 *   storeRoute("VOOP-H2GDGBVA") -> "/app/VOOP-H2GDGBVA"
 *   storeRoute("VOOP-H2GDGBVA", "settings/company") -> "/app/VOOP-H2GDGBVA/settings/company"
 */
export function storeRoute(storeRef: string | null | undefined, section?: string | null): string {
  if (!storeRef) {
    if (!section || section === "" || section === "/" || section === "dashboard") {
      return "/";
    }
    const cleanSection = section.replace(/^\/+|\/+$/g, "");
    return `/${cleanSection}`;
  }

  const trimmed = storeRef.trim();
  const cleanRef = trimmed.toUpperCase().startsWith("VOOP-")
    ? encodeURIComponent(trimmed.toUpperCase())
    : encodeURIComponent(trimmed);

  if (!section || section === "" || section === "/" || section === "dashboard") {
    return `/app/${cleanRef}`;
  }

  const cleanSection = section.replace(/^\/+|\/+$/g, "");
  return `/app/${cleanRef}/${cleanSection}`;
}

/**
 * Extracts storeRef from a pathname if it begins with /app/:storeRef
 */
export function extractStoreRefFromPathname(pathname: string | null | undefined): string | null {
  if (!pathname) return null;
  const match = pathname.match(/^\/app\/([^\/]+)/i);
  if (!match) return null;
  const raw = decodeURIComponent(match[1]).trim();
  return raw.toUpperCase().startsWith("VOOP-") ? raw.toUpperCase() : raw;
}

/**
 * Extracts current section (and optional subsection) from /app/:storeRef/:section or /:section
 */
export function extractSectionFromPathname(pathname: string | null | undefined): string | null {
  if (!pathname) return null;
  const match = pathname.match(/^\/app\/[^\/]+(?:\/(.+?))?\/?$/i);
  if (match) {
    return match[1] || null;
  }
  const bareMatch = pathname.match(/^\/([^?#]+?)\/?$/);
  if (bareMatch && bareMatch[1] && !bareMatch[1].startsWith("app")) {
    return bareMatch[1];
  }
  return null;
}

/**
 * React hook to generate store-scoped routes in client components.
 */
export function useStoreRoute() {
  const { activeStore } = useActiveStore();
  const pathname = usePathname();

  const urlStoreRef = extractStoreRefFromPathname(pathname);
  const effectiveStoreRef =
    urlStoreRef || activeStore?.publicStoreRef || activeStore?.voopStoreId || activeStore?.id || "";

  const to = useCallback(
    (section?: string) => {
      const base = storeRoute(effectiveStoreRef, section);
      return preserveShopifyParams(base);
    },
    [effectiveStoreRef]
  );

  return {
    storeRef: effectiveStoreRef,
    urlStoreRef,
    to,
  };
}

