import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { validateVoopRequest } from "@/lib/auth-voop";

export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  const auth = await validateVoopRequest(request);
  if (!auth.isValid) {
    return NextResponse.json({ error: auth.error || "Unauthorized" }, { status: 401 });
  }

  const queryId = decodeURIComponent(params.id).trim();
  const cleanOrderNumber = queryId.replace(/^#/, "");

  try {
    const order = await prisma.shopifyOrder.findFirst({
      where: {
        storeId: auth.storeId,
        OR: [
          { shopifyOrderId: queryId },
          { orderNumber: cleanOrderNumber },
          { name: queryId },
          { name: `#${cleanOrderNumber}` },
        ],
      },
      include: {
        items: {
          select: {
            shopifyLineItemId: true,
            shopifyProductId: true,
            shopifyVariantId: true, // CRITICAL: Variant ID for VOOP BOM
            sku: true,
            productTitle: true,
            variantTitle: true,
            quantity: true,
            unitPrice: true,
            discountTotal: true,
            totalPrice: true,
          },
        },
        fulfillments: {
          select: {
            shopifyFulfillmentId: true,
            status: true,
            trackingCompany: true,
            trackingNumber: true,
            trackingUrl: true,
            createdAt: true,
          },
        },
      },
    });

    if (!order) {
      return NextResponse.json(
        { error: `Order not found for identifier: ${queryId}` },
        { status: 404 }
      );
    }

    // Exact Predictable Data Contract
    return NextResponse.json({
      orderId: order.shopifyOrderId,
      orderNumber: order.orderNumber,
      name: order.name,
      createdAt: order.createdAt.toISOString(),
      updatedAt: order.updatedAt.toISOString(),
      processedAt: order.processedAt ? order.processedAt.toISOString() : null,
      financialStatus: order.financialStatus,
      fulfillmentStatus: order.fulfillmentStatus,
      currency: order.currency,
      totalPrice: order.totalPrice.toFixed(2),
      subtotalPrice: order.subtotalPrice.toFixed(2),
      discountTotal: order.totalDiscounts.toFixed(2),
      taxTotal: order.totalTax.toFixed(2),
      items: order.items.map((item) => ({
        lineItemId: item.shopifyLineItemId,
        productId: item.shopifyProductId,
        variantId: item.shopifyVariantId, // CRITICAL: Variant ID for VOOP BOM
        sku: item.sku || "",
        productTitle: item.productTitle,
        variantTitle: item.variantTitle || "",
        quantity: item.quantity,
        unitPrice: item.unitPrice.toFixed(2),
        discount: item.discountTotal.toFixed(2),
        total: item.totalPrice.toFixed(2),
      })),
      fulfillments: order.fulfillments.map((f) => ({
        fulfillmentId: f.shopifyFulfillmentId,
        status: f.status,
        trackingCompany: f.trackingCompany,
        trackingNumber: f.trackingNumber,
        trackingUrl: f.trackingUrl,
        createdAt: f.createdAt.toISOString(),
      })),
    });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
