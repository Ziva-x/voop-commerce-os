import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { authorizeStoreAccess } from "@/lib/auth-helpers";
import { ShipmentSyncService } from "@/lib/services/ShipmentSyncService";

export const dynamic = "force-dynamic";

/**
 * POST /api/sync/fulfillments
 *
 * Synchronizes all Shopify fulfillments and tracking details for the store:
 * 1. Parses rawPayloads and Shopify REST API fulfillments.
 * 2. Ingests all fulfillment records into shopify_fulfillments.
 * 3. Automatically moves fulfilled items to shipments table (Shipments & Couriers).
 */
export async function POST(request: NextRequest) {
  try {
    const auth = await authorizeStoreAccess(request, { requiredPermission: "settings.manage" });
    if (!auth.authorized || !auth.storeId) {
      return NextResponse.json(
        { error: auth.error || "Unauthorized / no store connected" },
        { status: auth.status || 401, headers: { "Cache-Control": "no-store" } }
      );
    }

    const storeId = auth.storeId;
    const body = await request.json().catch(() => ({}));
    const fetchFromShopifyApi = body.fetchFromShopifyApi !== false; // default true

    const result = await ShipmentSyncService.syncAllStoreFulfillments(storeId, {
      fetchFromShopifyApi,
    });

    return NextResponse.json({
      success: true,
      message: `Successfully synchronized ${result.fulfillmentsProcessed} fulfillments and ${result.shipmentsCreatedOrUpdated} shipments.`,
      data: result,
    });
  } catch (error: any) {
    console.error("[SYNC_FULFILLMENTS] Error:", error);
    return NextResponse.json(
      { error: error.message || "Failed to sync fulfillments and shipments" },
      { status: 500 }
    );
  }
}
