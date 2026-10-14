import { NextRequest, NextResponse } from "next/server";
import { authOptions } from "@/lib/auth";
import { resolveAuthorizedStoresForUser, resolveUserIdFromRequest, resolveStoreContext } from "@/lib/auth-helpers";
import { getOrEnsureVoopStoreId, getOrEnsurePublicStoreRef } from "@/lib/id-generator";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

/**
 * GET /api/account/stores
 *
 * Returns all stores the authenticated user has access to.
 *
 * 1. SHOPIFY EMBEDDED CONTEXT:
 *    Resolves store directly from Shopify App Bridge ID token & shop domain.
 *    Returns the single authenticating Shopify store without touching Chrome NextAuth cookies.
 *
 * 2. STANDALONE CHROME CONTEXT:
 *    Multi-tab isolation: uses the per-tab Bearer token (from sessionStorage) as the
 *    primary identity source. This allows Tab 1 (Account A) and Tab 2 (Account B) to
 *    call this endpoint simultaneously and each receive their own store list.
 *
 * Falls back to the shared NextAuth cookie only when no per-tab Bearer token exists.
 * Returns 401 (not a redirect) when neither source is available — StoreContext
 * interprets 401 as "this tab logged out" and navigates only that tab to /login.
 */
export async function GET(request: NextRequest) {
  try {
    const auth = await resolveStoreContext(request);
    if (auth.authMode === "SHOPIFY_EMBEDDED") {
      if (!auth.authorized || !auth.store) {
        return NextResponse.json({ error: auth.error || "Unauthorized" }, { status: auth.status || 401 });
      }
      const store = auth.store;
      return NextResponse.json({
        success: true,
        stores: [
          {
            id: store.id,
            voopStoreId: auth.voopStoreId || store.voopStoreId,
            publicStoreRef: auth.publicStoreRef || store.publicStoreRef,
            storeName: store.storeName || store.shopDomain,
            shopDomain: store.shopDomain,
            currency: store.currency || "INR",
            role: "ADMIN",
            isPrimary: true,
          },
        ],
      });
    }

    // Tab-isolated user resolution: Bearer token first, cookie fallback
    const userId = await resolveUserIdFromRequest(request);
    if (!userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const dbUser = await prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, role: true, storeId: true, username: true },
    });
    if (!dbUser) {
      return NextResponse.json({ error: "User not found" }, { status: 404 });
    }

    const isStaff = (dbUser.role || "").toUpperCase() === "STAFF";
    const stores = await resolveAuthorizedStoresForUser(userId);

    const formattedStores = await Promise.all(
      stores.map(async (store) => {
        const membership = await prisma.storeMembership.findUnique({
          where: { userId_storeId: { userId, storeId: store.id } },
        }).catch(() => null);

        const storeRole = membership?.role || dbUser.role || (isStaff ? "STAFF" : "ADMIN");
        const storePermissions = membership?.permissions || null;

        const voopStoreId =
          store.voopStoreId ||
          (await getOrEnsureVoopStoreId(store.id, store.accountId || undefined));
        const publicStoreRef = store.publicStoreRef || (await getOrEnsurePublicStoreRef(store.id));
        return {
          id: store.id,
          voopStoreId,
          publicStoreRef,
          storeName: store.storeName || store.shopDomain,
          shopDomain: store.shopDomain,
          currency: store.currency || "INR",
          role: storeRole,
          permissions: storePermissions,
          username: dbUser.username || undefined,
          isPrimary: store.id === dbUser.storeId,
        };
      })
    );

    return NextResponse.json({
      success: true,
      stores: formattedStores,
    });
  } catch (error: any) {
    return NextResponse.json({ error: error.message || "Failed to fetch stores" }, { status: 500 });
  }
}

