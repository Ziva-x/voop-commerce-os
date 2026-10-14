import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { resolveShopifyContext } from "@/lib/shopifyAuth";
import { validateVoopRequest } from "@/lib/auth-voop";

export async function GET(request: NextRequest) {
  const auth = await validateVoopRequest(request);
  if (!auth.isValid) {
    return NextResponse.json({ error: auth.error || "Unauthorized" }, { status: 401 });
  }

  try {
    const { searchParams } = new URL(request.url);
    const updatedSince = searchParams.get("updated_since");
    const financialStatus = searchParams.get("financial_status");
    const fulfillmentStatus = searchParams.get("fulfillment_status");
    const orderNumber = searchParams.get("order_number");
    const limit = Math.min(parseInt(searchParams.get("limit") || "50", 10), 250);
    const page = Math.max(parseInt(searchParams.get("page") || "1", 10), 1);
    const skip = (page - 1) * limit;

    const where: any = { storeId: auth.storeId };
    if (updatedSince) {
      const date = new Date(updatedSince);
      if (!isNaN(date.getTime())) {
        where.updatedAt = { gte: date };
      }
    }
    if (financialStatus) {
      where.financialStatus = { equals: financialStatus.toUpperCase() };
    }
    if (fulfillmentStatus) {
      where.fulfillmentStatus = { equals: fulfillmentStatus.toUpperCase() };
    }
    if (orderNumber) {
      where.orderNumber = { contains: orderNumber.replace("#", "") };
    }

    const [total, orders] = await Promise.all([
      prisma.shopifyOrder.count({ where }),
      prisma.shopifyOrder.findMany({
        where,
        take: limit,
        skip,
        orderBy: { createdAt: "desc" },
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
      }),
    ]);

    // Structured JSON according to Data Contract
    const formattedOrders = orders.map((o) => ({
      orderId: o.shopifyOrderId,
      orderNumber: o.orderNumber,
      name: o.name,
      createdAt: o.createdAt.toISOString(),
      updatedAt: o.updatedAt.toISOString(),
      processedAt: o.processedAt ? o.processedAt.toISOString() : null,
      financialStatus: o.financialStatus,
      fulfillmentStatus: o.fulfillmentStatus,
      currency: o.currency,
      totalPrice: o.totalPrice.toFixed(2),
      subtotalPrice: o.subtotalPrice.toFixed(2),
      discountTotal: o.totalDiscounts.toFixed(2),
      taxTotal: o.totalTax.toFixed(2),
      tags: o.tags ? o.tags.split(",").map((t) => t.trim()) : [],
      note: o.note || "",
      itemsCount: o.items.reduce((acc, it) => acc + it.quantity, 0),
      items: o.items.map((item) => ({
        lineItemId: item.shopifyLineItemId,
        productId: item.shopifyProductId,
        variantId: item.shopifyVariantId, // CRITICAL FOR VOOP BOM
        sku: item.sku || "",
        productTitle: item.productTitle,
        variantTitle: item.variantTitle || "",
        quantity: item.quantity,
        unitPrice: item.unitPrice.toFixed(2),
        discount: item.discountTotal.toFixed(2),
        total: item.totalPrice.toFixed(2),
      })),
      fulfillments: o.fulfillments.map((f) => ({
        fulfillmentId: f.shopifyFulfillmentId,
        status: f.status,
        trackingCompany: f.trackingCompany,
        trackingNumber: f.trackingNumber,
        trackingUrl: f.trackingUrl,
        createdAt: f.createdAt.toISOString(),
      })),
    }));

    return NextResponse.json({
      success: true,
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
      orders: formattedOrders,
    });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
