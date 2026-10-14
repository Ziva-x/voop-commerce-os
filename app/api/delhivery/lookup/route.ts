import { NextRequest, NextResponse } from "next/server";
import { resolveStoreId } from "@/lib/auth-helpers";
import { prisma } from "@/lib/prisma";
import { DelhiveryService } from "@/lib/services/DelhiveryService";

export const dynamic = "force-dynamic";

/**
 * GET /api/delhivery/lookup?awb=<AWB>
 *
 * Fetches order details from Delhivery for a given AWB/tracking number.
 * Returns:
 *  - referenceNo  : Shopify/Offline order number (from Delhivery ReferenceNo)
 *  - customerName : Customer name from Delhivery or our DB
 *  - customerPhone: Phone if available in our Shipment record
 *  - amount       : COD / Order amount from Delhivery
 *  - payment      : Prepaid | COD
 *  - status       : Normalized delivery status
 *  - carrier      : Always "Delhivery"
 *  - linkedShopifyOrder: Shopify order details if we find a match in our DB
 *  - linkedOfflineOrder: Offline billing order details if matched
 *
 * Used by the Billing form to auto-populate order details when an AWB is entered.
 */
export async function GET(request: NextRequest) {
  try {
    const storeId = await resolveStoreId(request);
    if (!storeId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const { searchParams } = new URL(request.url);
    const awb = searchParams.get("awb")?.trim().replace("#", "");

    if (!awb) {
      return NextResponse.json(
        { error: "AWB (waybill) is required. Pass ?awb=<tracking_number>" },
        { status: 400 }
      );
    }

    // ── Step 1: Fetch live tracking from Delhivery (uses 15-min cache) ──────
    const tracking = await DelhiveryService.fetchTracking(storeId, awb, false);

    if (!tracking) {
      return NextResponse.json(
        {
          found: false,
          awb,
          error: `No shipment data found for AWB ${awb}. Verify the tracking number and try again.`,
        },
        { status: 404 }
      );
    }

    // ── Step 2: Try to match referenceNo to a Shopify order in our DB ────────
    let linkedShopifyOrder = null;
    const refNo = tracking.orderNumber;

    if (refNo) {
      const cleanRef = refNo.replace(/^#+/, "");
      linkedShopifyOrder = await prisma.shopifyOrder.findFirst({
        where: {
          storeId,
          OR: [
            { orderNumber: cleanRef },
            { orderNumber: `#${cleanRef}` },
            { name: cleanRef },
            { name: `#${cleanRef}` },
          ],
        },
        select: {
          id: true,
          orderNumber: true,
          name: true,
          email: true,
          phone: true,
          totalPrice: true,
          financialStatus: true,
          fulfillmentStatus: true,
          deliveryStatus: true,
          shippingAddress: true,
          createdAt: true,
          items: {
            select: {
              productTitle: true,
              variantTitle: true,
              sku: true,
              quantity: true,
              unitPrice: true,
            },
          },
        },
      });
    }

    // ── Step 3: Try to match to an OfflineOrder in our DB (if model exists) ──
    let linkedOfflineOrder = null;
    try {
      if (refNo) {
        linkedOfflineOrder = await (prisma as any).offlineOrder?.findFirst({
          where: {
            storeId,
            OR: [
              { orderNumber: refNo },
              { trackingNumber: awb },
            ],
          },
          select: {
            id: true,
            orderNumber: true,
            channel: true,
            customerName: true,
            customerPhone: true,
            totalAmount: true,
            paymentMode: true,
            status: true,
          },
        });
      }
    } catch {
      // OfflineOrder model may not exist yet — safe to ignore
    }

    // ── Step 4: Also fetch current Shipment row from our DB ──────────────────
    const shipmentRow = await prisma.shipment.findUnique({
      where: { storeId_awb: { storeId, awb } },
      select: {
        awb: true,
        orderNumber: true,
        customerName: true,
        customerPhone: true,
        carrier: true,
        status: true,
        normalizedStatus: true,
        payment: true,
        amount: true,
        shippingCharge: true,
        pickupDate: true,
        deliveryDate: true,
        etdDate: true,
        outwardScanned: true,
        outwardScannedAt: true,
        rtoInwardScanned: true,
        createdAt: true,
        lastSyncedAt: true,
      },
    });

    // ── Build response ────────────────────────────────────────────────────────
    return NextResponse.json({
      found: true,
      awb,
      carrier: "Delhivery",

      // Order reference
      referenceNo: tracking.orderNumber || shipmentRow?.orderNumber || null,

      // Customer info (from Delhivery live data or our DB)
      customerName: tracking.customerName || shipmentRow?.customerName || null,
      customerPhone: shipmentRow?.customerPhone || null,

      // Financial
      amount: tracking.amount ?? shipmentRow?.amount ?? 0,
      payment: tracking.payment || shipmentRow?.payment || "Prepaid",
      shippingCharge: shipmentRow?.shippingCharge ?? 0,

      // Delivery status
      normalizedStatus: tracking.normalizedStatus,
      rawStatus: tracking.rawStatus,
      statusLocation: tracking.statusLocation,
      statusTimestamp: tracking.statusTimestamp,

      // Dates
      pickupDate: tracking.pickupDate || shipmentRow?.pickupDate,
      etdDate: tracking.etdDate || shipmentRow?.etdDate,
      deliveryDate: tracking.deliveryDate || shipmentRow?.deliveryDate,

      // Outward scan info
      outwardScanned: shipmentRow?.outwardScanned ?? false,
      outwardScannedAt: shipmentRow?.outwardScannedAt ?? null,
      rtoInwardScanned: shipmentRow?.rtoInwardScanned ?? false,

      // Last synced
      lastSyncedAt: tracking.lastSyncedAt,

      // Linked records in our DB
      linkedShopifyOrder,
      linkedOfflineOrder,
    });
  } catch (error: any) {
    console.error("[Delhivery Lookup Error]", error);
    return NextResponse.json(
      { error: error.message || "Failed to lookup Delhivery order" },
      { status: 500 }
    );
  }
}
