import { NextRequest, NextResponse } from "next/server";
import { authorizeStoreAccess } from "@/lib/auth-helpers";
import { prisma } from "@/lib/prisma";
import { getAppBaseUrl } from "@/lib/url-helper";

export const dynamic = "force-dynamic";

/**
 * POST /api/shopify/sync
 *
 * Legacy sync trigger — now delegates to the new background batch system
 * (/api/sync/start) instead of running inline. Returns jobId immediately.
 *
 * Kept for backwards compatibility with existing UI buttons and cron jobs.
 */
export async function POST(request: NextRequest) {
  try {
    const auth = await authorizeStoreAccess(request, { requiredPermission: "settings.manage" });
    if (!auth.authorized || !auth.storeId) {
      return NextResponse.json(
        { success: false, error: auth.error || "Unauthorized / Store context missing" },
        {
          status: auth.status || 401,
          headers: { "Cache-Control": "no-store" },
        }
      );
    }

    const store = await prisma.shopifyStore.findUnique({ where: { id: auth.storeId } });
    if (!store || !store.isConnected) {
      return NextResponse.json(
        { success: false, error: "Store not found or disconnected" },
        {
          status: 404,
          headers: { "Cache-Control": "no-store" },
        }
      );
    }

    const body = await request.json().catch(() => ({}));
    const type = body.type || "all"; // "products" | "orders" | "all"

    // Delegate to the background job system with full tab context forwarding
    const baseUrl = getAppBaseUrl(request);
    const forwardHeaders: Record<string, string> = {
      "Content-Type": "application/json",
      "Cache-Control": "no-cache",
    };

    const cookie = request.headers.get("cookie");
    if (cookie) forwardHeaders["cookie"] = cookie;

    const authHeader = request.headers.get("authorization");
    if (authHeader) forwardHeaders["authorization"] = authHeader;

    const voopHeader = request.headers.get("x-voop-store-id") || auth.voopStoreId;
    if (voopHeader) forwardHeaders["x-voop-store-id"] = voopHeader;

    if (auth.storeId) forwardHeaders["x-store-id"] = auth.storeId;

    const startRes = await fetch(
      `${baseUrl}/api/sync/start?storeRef=${encodeURIComponent(auth.storeId)}`,
      {
        method: "POST",
        headers: forwardHeaders,
        body: JSON.stringify({ type }),
      }
    );

    const startJson = await startRes.json();

    if (!startRes.ok && !startJson.duplicate) {
      return NextResponse.json(
        { success: false, error: startJson.error || "Failed to start sync job" },
        {
          status: startRes.status,
          headers: { "Cache-Control": "no-store" },
        }
      );
    }

    return NextResponse.json(
      {
        success: true,
        shop: store.shopDomain,
        jobId: startJson.jobId,
        status: startJson.status,
        type: startJson.type,
        duplicate: startJson.duplicate ?? false,
        message: startJson.duplicate
          ? startJson.message
          : `${type} sync started in background`,
      },
      {
        headers: {
          "Cache-Control": "no-store, no-cache, must-revalidate",
          Pragma: "no-cache",
          Vary: "x-voop-store-id, x-store-id, Authorization",
        },
      }
    );
  } catch (error: any) {
    console.error("[ShopifySync Legacy] Error:", error);
    return NextResponse.json(
      {
        success: false,
        error: error.message || "Failed to sync with Shopify",
        needsAuth: error.message?.includes("authentication required") || error.message?.includes("401"),
      },
      {
        status: error.message?.includes("401") || error.message?.includes("authentication required") ? 401 : 500,
        headers: { "Cache-Control": "no-store" },
      }
    );
  }
}
