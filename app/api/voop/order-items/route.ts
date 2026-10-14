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
    const variantId = searchParams.get("variant_id");
    const sku = searchParams.get("sku");
    const limit = Math.min(parseInt(searchParams.get("limit") || "100", 10), 250);
    const page = Math.max(parseInt(searchParams.get("page") || "1", 10), 1);
    const skip = (page - 1) * limit;

    const where: any = { storeId: auth.storeId };
    if (updatedSince) {
      const date = new Date(updatedSince);
      if (!isNaN(date.getTime())) {
        where.updatedAt = { gte: date };
      }
    }
    if (variantId) {
      where.shopifyVariantId = variantId;
    }
    if (sku) {
      where.sku = { contains: sku };
    }

    const [total, items] = await Promise.all([
      prisma.shopifyOrderItem.count({ where }),
      prisma.shopifyOrderItem.findMany({
        where,
        take: limit,
        skip,
        orderBy: { createdAt: "desc" },
        include: {
          order: {
            select: {
              orderNumber: true,
              financialStatus: true,
              fulfillmentStatus: true,
              createdAt: true,
            },
          },
        },
      }),
    ]);

    const formattedItems = items.map((item) => ({
      lineItemId: item.shopifyLineItemId,
      orderId: item.shopifyOrderId,
      orderNumber: item.order?.orderNumber || "",
      orderDate: item.order?.createdAt ? item.order.createdAt.toISOString() : null,
      financialStatus: item.order?.financialStatus || "PAID",
      fulfillmentStatus: item.order?.fulfillmentStatus || "UNFULFILLED",
      productId: item.shopifyProductId,
      variantId: item.shopifyVariantId, // CRITICAL FOR VOOP BOM
      sku: item.sku || "",
      productTitle: item.productTitle,
      variantTitle: item.variantTitle || "",
      quantity: item.quantity,
      unitPrice: item.unitPrice.toFixed(2),
      discount: item.discountTotal.toFixed(2),
      total: item.totalPrice.toFixed(2),
    }));

    return NextResponse.json({
      success: true,
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
      items: formattedItems,
    });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
