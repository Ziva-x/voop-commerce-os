import { NextRequest, NextResponse } from "next/server";
import { authorizeStoreAccess } from "@/lib/auth-helpers";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

// ─── GET /api/billing/[id] ─────────────────────────────────────────────────
export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const auth = await authorizeStoreAccess(request, { requiredPermission: "orders.view" });
    if (!auth.authorized || !auth.storeId) {
      return NextResponse.json(
        { error: auth.error || "Unauthorized" },
        {
          status: auth.status || 401,
          headers: {
            "Cache-Control": "no-store, no-cache, must-revalidate",
            Pragma: "no-cache",
          },
        }
      );
    }

    const storeId = auth.storeId;
    const order = await prisma.offlineOrder.findFirst({
      where: { id: params.id, storeId, deletedAt: null },
      include: { items: true },
    });

    if (!order) {
      return NextResponse.json(
        { error: "Order not found" },
        {
          status: 404,
          headers: {
            "Cache-Control": "no-store, no-cache, must-revalidate",
            Pragma: "no-cache",
          },
        }
      );
    }

    return NextResponse.json(
      { success: true, order },
      {
        headers: {
          "Cache-Control": "no-store, no-cache, must-revalidate",
          Pragma: "no-cache",
          Vary: "x-voop-store-id, x-store-id, Authorization",
        },
      }
    );
  } catch (error: any) {
    console.error("[Billing GET/:id Error]", error);
    return NextResponse.json(
      { error: error.message },
      {
        status: 500,
        headers: { "Cache-Control": "no-store" },
      }
    );
  }
}

// ─── PUT /api/billing/[id] ─────────────────────────────────────────────────
export async function PUT(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const auth = await authorizeStoreAccess(request, { requiredPermission: "orders.manage" });
    if (!auth.authorized || !auth.storeId) {
      return NextResponse.json(
        { error: auth.error || "Unauthorized" },
        {
          status: auth.status || 401,
          headers: {
            "Cache-Control": "no-store, no-cache, must-revalidate",
            Pragma: "no-cache",
          },
        }
      );
    }

    const storeId = auth.storeId;
    const existing = await prisma.offlineOrder.findFirst({
      where: { id: params.id, storeId, deletedAt: null },
    });

    if (!existing) {
      return NextResponse.json(
        { error: "Order not found" },
        {
          status: 404,
          headers: {
            "Cache-Control": "no-store, no-cache, must-revalidate",
            Pragma: "no-cache",
          },
        }
      );
    }

    const body = await request.json();
    const {
      paymentStatus,
      paymentMode,
      advanceAmount,
      notes,
      trackingNumber,
      courier,
      delhiveryRefNo,
      shippingCharge,
      status,
    } = body;

    const updateData: any = {};
    if (paymentStatus !== undefined) updateData.paymentStatus = paymentStatus;
    if (paymentMode !== undefined) updateData.paymentMode = paymentMode;
    if (notes !== undefined) updateData.notes = notes;
    if (trackingNumber !== undefined) updateData.trackingNumber = trackingNumber;
    if (courier !== undefined) updateData.courier = courier;
    if (delhiveryRefNo !== undefined) updateData.delhiveryRefNo = delhiveryRefNo;
    if (shippingCharge !== undefined) updateData.shippingCharge = parseFloat(shippingCharge) || 0;
    if (status !== undefined) updateData.status = status;

    // Recalculate pending amount if payment info changes
    if (paymentStatus === "PARTIAL" && advanceAmount !== undefined) {
      updateData.advanceAmount = parseFloat(advanceAmount) || 0;
      updateData.pendingAmount = Math.max(0, existing.totalAmount - updateData.advanceAmount);
    } else if (paymentStatus === "PAID") {
      updateData.advanceAmount = existing.totalAmount;
      updateData.pendingAmount = 0;
    }

    const updated = await prisma.offlineOrder.update({
      where: { id: params.id },
      data: updateData,
      include: { items: true },
    });

    // Sync shipment if tracking changes
    if (trackingNumber) {
      await prisma.shipment.upsert({
        where: { storeId_awb: { storeId, awb: trackingNumber } },
        create: {
          storeId,
          awb: trackingNumber,
          orderNumber: existing.orderNumber,
          carrier: courier || "Other",
          status: "Manifested",
          normalizedStatus: "MANIFESTED",
          customerName: existing.customerName || null,
          payment: existing.paymentMode === "COD" ? "COD" : "Prepaid",
          amount: existing.totalAmount,
        },
        update: {
          carrier: courier || undefined,
        },
      });
    }

    return NextResponse.json(
      { success: true, order: updated },
      {
        headers: {
          "Cache-Control": "no-store, no-cache, must-revalidate",
          Pragma: "no-cache",
          Vary: "x-voop-store-id, x-store-id, Authorization",
        },
      }
    );
  } catch (error: any) {
    console.error("[Billing PUT/:id Error]", error);
    return NextResponse.json(
      { error: error.message },
      {
        status: 500,
        headers: { "Cache-Control": "no-store" },
      }
    );
  }
}

// ─── DELETE /api/billing/[id] ──────────────────────────────────────────────
export async function DELETE(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const auth = await authorizeStoreAccess(request, { requiredPermission: "orders.manage" });
    if (!auth.authorized || !auth.storeId) {
      return NextResponse.json(
        { error: auth.error || "Unauthorized" },
        {
          status: auth.status || 401,
          headers: {
            "Cache-Control": "no-store, no-cache, must-revalidate",
            Pragma: "no-cache",
          },
        }
      );
    }

    const storeId = auth.storeId;
    const existing = await prisma.offlineOrder.findFirst({
      where: { id: params.id, storeId, deletedAt: null },
    });

    if (!existing) {
      return NextResponse.json(
        { error: "Order not found" },
        {
          status: 404,
          headers: {
            "Cache-Control": "no-store, no-cache, must-revalidate",
            Pragma: "no-cache",
          },
        }
      );
    }

    // Soft delete
    await prisma.offlineOrder.update({
      where: { id: params.id },
      data: { deletedAt: new Date() },
    });

    return NextResponse.json(
      { success: true, message: "Order deleted." },
      {
        headers: {
          "Cache-Control": "no-store, no-cache, must-revalidate",
          Pragma: "no-cache",
          Vary: "x-voop-store-id, x-store-id, Authorization",
        },
      }
    );
  } catch (error: any) {
    console.error("[Billing DELETE/:id Error]", error);
    return NextResponse.json(
      { error: error.message },
      {
        status: 500,
        headers: { "Cache-Control": "no-store" },
      }
    );
  }
}
