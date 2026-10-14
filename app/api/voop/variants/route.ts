import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { validateVoopRequest } from "@/lib/auth-voop";

export async function GET(request: NextRequest) {
  const auth = await validateVoopRequest(request);
  if (!auth.isValid) {
    return NextResponse.json({ error: auth.error || "Unauthorized" }, { status: 401 });
  }

  try {
    const { searchParams } = new URL(request.url);
    const updatedSince = searchParams.get("updated_since");
    const sku = searchParams.get("sku");
    const variantId = searchParams.get("variant_id");
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
    if (sku) {
      where.sku = { contains: sku };
    }
    if (variantId) {
      where.shopifyVariantId = variantId;
    }

    const [total, variants] = await Promise.all([
      prisma.shopifyVariant.count({ where }),
      prisma.shopifyVariant.findMany({
        where,
        take: limit,
        skip,
        orderBy: { updatedAt: "desc" },
        include: {
          product: {
            select: {
              title: true,
              handle: true,
              status: true,
            },
          },
        },
      }),
    ]);

    const formattedVariants = variants.map((v) => ({
      variantId: v.shopifyVariantId, // CRITICAL: Variant ID for BOM
      productId: v.shopifyProductId,
      productTitle: v.product?.title || "",
      variantTitle: v.title,
      sku: v.sku || "",
      barcode: v.barcode,
      price: v.price.toFixed(2),
      compareAtPrice: v.compareAtPrice ? v.compareAtPrice.toFixed(2) : null,
      inventoryItemId: v.inventoryItemId,
      inventoryQuantity: v.inventoryQuantity ?? 0,
      imageUrl: v.imageUrl,
      createdAt: v.createdAt.toISOString(),
      updatedAt: v.updatedAt.toISOString(),
    }));

    return NextResponse.json({
      success: true,
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
      variants: formattedVariants,
    });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
