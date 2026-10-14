import { NextRequest, NextResponse } from "next/server";
import { requireStoreAccess } from "@/lib/auth-helpers";
import { prisma } from "@/lib/prisma";

export async function POST(request: NextRequest) {
  try {
    const auth = await requireStoreAccess(request, { requiredPermission: "settings.manage" });
    if (!auth.authorized || !auth.storeId) {
      return NextResponse.json(
        { success: false, error: auth.error || "Unauthorized / Store context missing" },
        { status: auth.status || 401 }
      );
    }

    if (auth.role !== "ADMIN") {
      return NextResponse.json(
        { success: false, error: "Forbidden: Only store ADMIN accounts are authorized to wipe store data." },
        { status: 403 }
      );
    }

    const storeId = auth.storeId;
    const store = await prisma.shopifyStore.findUnique({ where: { id: storeId } });

    console.log(`Initiating secure wipe for store ${storeId} (${store?.shopDomain})...`);

    // 2. Comprehensive transaction safe wipe scoped entirely to this tenant (storeId)
    await prisma.$transaction([
      // Logistics & Shipments
      prisma.shipmentScan.deleteMany({ where: { storeId } }),
      prisma.shipment.deleteMany({ where: { storeId } }),

      // Physical Inventory, BOM & Ledgers
      prisma.inventoryLedger.deleteMany({ where: { storeId } }),
      prisma.comboComponent.deleteMany({ where: { storeId } }),
      prisma.stockItem.deleteMany({ where: { storeId } }),

      // Orders, Items & Fulfillments
      prisma.shopifyOrderItem.deleteMany({ where: { storeId } }),
      prisma.shopifyFulfillment.deleteMany({ where: { storeId } }),
      prisma.shopifyOrder.deleteMany({ where: { storeId } }),

      // Products & Variants
      prisma.shopifyVariant.deleteMany({ where: { storeId } }),
      prisma.shopifyProduct.deleteMany({ where: { storeId } }),

      // Background Sync Logs & Jobs
      prisma.syncLog.deleteMany({ where: { storeId } }),
      prisma.syncJob.deleteMany({ where: { storeId } }),
    ]);

    // Reset store sync timestamps so the dashboard accurately shows un-synced state
    await prisma.shopifyStore.update({
      where: { id: storeId },
      data: {
        lastProductSyncAt: null,
        lastOrderSyncAt: null,
        lastFullSyncAt: null,
      },
    });

    console.log(`Successfully wiped all data for store ${storeId}.`);

    return NextResponse.json({
      success: true,
      message: "Store data wiped successfully.",
      shop: store?.shopDomain,
    });

  } catch (error: any) {
    console.error("Shopify Wipe Route Error:", error);
    return NextResponse.json(
      {
        success: false,
        error: error.message || "Failed to wipe store data",
        needsAuth: error.message?.includes("authentication required") || error.message?.includes("401"),
      },
      { status: error.message?.includes("401") || error.message?.includes("authentication required") ? 401 : 500 }
    );
  }
}
