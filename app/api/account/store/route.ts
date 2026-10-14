import { NextRequest, NextResponse } from "next/server";
import { resolveCurrentTenant } from "@/lib/auth-helpers";

export const dynamic = "force-dynamic";

/**
 * GET /api/account/store
 *
 * Universal Store Resolver for both Embedded Shopify and External Web.
 * Routes directly through the authoritative resolveCurrentTenant() function.
 * Returns the permanent VOOP Store ID, connected Shopify store, and user identity.
 */
export async function GET(request: NextRequest) {
  const tenant = await resolveCurrentTenant(request);

  const noCacheHeaders = {
    "Cache-Control": "no-store, no-cache, must-revalidate, proxy-revalidate",
    Pragma: "no-cache",
    Expires: "0",
  };

  if (!tenant.authorized || !tenant.shopifyStoreId || !tenant.store || tenant.requiresOnboarding) {
    return NextResponse.json(
      {
        store: null,
        requiresOnboarding: true,
        storeId: tenant.shopifyStoreId || tenant.store?.id || null,
        shopDomain: tenant.shopDomain || tenant.store?.shopDomain || null,
        voopStoreId: tenant.voopStoreId || tenant.store?.voopStoreId || null,
        tenantId: tenant.tenantId || tenant.store?.tenantId || null,
        publicStoreRef: tenant.publicStoreRef || tenant.store?.publicStoreRef || null,
        accountId: null,
        username: null,
        role: null,
        isEmbedded: tenant.isEmbedded,
        error: tenant.error || "Store requires onboarding",
      },
      { headers: noCacheHeaders }
    );
  }

  const store = tenant.store;

  return NextResponse.json(
    {
      store: {
        id: store.id,
        voopStoreId: tenant.voopStoreId || store.voopStoreId,
        tenantId: tenant.tenantId || store.tenantId,
        publicStoreRef: tenant.publicStoreRef || store.publicStoreRef,
        shopDomain: store.shopDomain,
        storeName: store.storeName || store.shopDomain,
        email: store.email,
        currency: store.currency || "INR",
        isConnected: store.isConnected ?? true,
        lastProductSyncAt: store.lastProductSyncAt,
        lastOrderSyncAt: store.lastOrderSyncAt,
        lastFullSyncAt: store.lastFullSyncAt,
        createdAt: store.createdAt,
      },
      voopStoreId: tenant.voopStoreId || store.voopStoreId,
      tenantId: tenant.tenantId || store.tenantId,
      publicStoreRef: tenant.publicStoreRef || store.publicStoreRef,
      accountId: tenant.accountId,
      username: tenant.user?.username,
      role: tenant.role || "ADMIN",
      isEmbedded: tenant.isEmbedded,
    },
    { headers: noCacheHeaders }
  );
}
