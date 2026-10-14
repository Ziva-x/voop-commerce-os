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
    const status = searchParams.get("status");
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
    if (status) {
      where.status = status.toUpperCase();
    }

    const [total, products] = await Promise.all([
      prisma.shopifyProduct.count({ where }),
      prisma.shopifyProduct.findMany({
        where,
        take: limit,
        skip,
        orderBy: { updatedAt: "desc" },
        include: {
          variants: {
            select: {
              shopifyVariantId: true,
              title: true,
              sku: true,
              barcode: true,
              price: true,
              compareAtPrice: true,
              inventoryItemId: true,
              inventoryQuantity: true,
              imageUrl: true,
              updatedAt: true,
            },
          },
        },
      }),
    ]);

    const formattedProducts = products.map((p) => ({
      productId: p.shopifyProductId,
      title: p.title,
      handle: p.handle,
      productType: p.productType,
      vendor: p.vendor,
      status: p.status,
      tags: p.tags ? p.tags.split(",").map((t) => t.trim()) : [],
      imageUrl: p.imageUrl,
      createdAt: p.createdAt.toISOString(),
      updatedAt: p.updatedAt.toISOString(),
      variants: p.variants.map((v) => ({
        variantId: v.shopifyVariantId, // CRITICAL: Shopify Variant ID for VOOP BOM
        title: v.title,
        sku: v.sku || "",
        barcode: v.barcode,
        price: v.price.toFixed(2),
        compareAtPrice: v.compareAtPrice ? v.compareAtPrice.toFixed(2) : null,
        inventoryItemId: v.inventoryItemId,
        inventoryQuantity: v.inventoryQuantity ?? 0,
        imageUrl: v.imageUrl,
        updatedAt: v.updatedAt.toISOString(),
      })),
    }));

    return NextResponse.json({
      success: true,
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
      products: formattedProducts,
    });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
