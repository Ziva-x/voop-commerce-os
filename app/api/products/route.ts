import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { authorizeStoreAccess } from "@/lib/auth-helpers";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  try {
    const auth = await authorizeStoreAccess(request, { requiredPermission: "products.view" });
    if (!auth.authorized || !auth.storeId) {
      return NextResponse.json(
        { error: auth.error || "Unauthorized" },
        { status: auth.status || 401, headers: { "Cache-Control": "no-store" } }
      );
    }

    const { searchParams } = new URL(request.url);
    const search = searchParams.get("search") || "";
    const status = searchParams.get("status") || "";
    const sku = searchParams.get("sku") || "";
    const page = Math.max(parseInt(searchParams.get("page") || "1", 10), 1);
    const limit = Math.min(parseInt(searchParams.get("limit") || "50", 10), 100);
    const skip = (page - 1) * limit;

    const where: any = { storeId: auth.storeId };

    if (status && status !== "ALL") {
      where.status = status;
    }

    if (sku) {
      where.variants = {
        some: {
          sku: { contains: sku },
        },
      };
    }

    if (search) {
      where.OR = [
        { title: { contains: search } },
        { handle: { contains: search } },
        { tags: { contains: search } },
        {
          variants: {
            some: {
              OR: [
                { title: { contains: search } },
                { sku: { contains: search } },
                { shopifyVariantId: { contains: search } },
              ],
            },
          },
        },
      ];
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
            orderBy: { price: "asc" },
          },
        },
      }),
    ]);

    return NextResponse.json({
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
      products,
    });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
