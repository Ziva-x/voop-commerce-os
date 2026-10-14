import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { authorizeStoreAccess } from "@/lib/auth-helpers";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  try {
    const auth = await authorizeStoreAccess(request, { requiredPermission: "orders.view" });
    if (!auth.authorized || !auth.storeId) {
      return NextResponse.json(
        { error: auth.error || "Unauthorized" },
        { status: auth.status || 401, headers: { "Cache-Control": "no-store" } }
      );
    }
    const storeId = auth.storeId;

    const { searchParams } = new URL(request.url);
    const search = searchParams.get("search") || "";
    const financialStatus = searchParams.get("financial_status") || "";
    const fulfillmentStatus = searchParams.get("fulfillment_status") || "";
    const startDate = searchParams.get("startDate") || "";
    const endDate = searchParams.get("endDate") || "";
    const ids = searchParams.get("ids") || "";
    const exportFormat = searchParams.get("export") || "";
    const isTrash = searchParams.get("trash") === "true";
    const page = Math.max(parseInt(searchParams.get("page") || "1", 10), 1);
    const limit = Math.min(parseInt(searchParams.get("limit") || "50", 10), 500);
    const skip = (page - 1) * limit;

    const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);

    // Auto-purge orders older than 30 days in trash FOR THIS STORE ONLY
    try {
      await prisma.shopifyOrder.deleteMany({
        where: {
          storeId,
          deletedAt: {
            lt: thirtyDaysAgo,
          },
        },
      });
    } catch (purgeErr) {
      // Ignore purge errors
    }

    // MANDATORY STORE ISOLATION FILTER
    const where: any = { storeId };

    if (isTrash) {
      where.deletedAt = {
        not: null,
        gte: thirtyDaysAgo,
      };
    } else {
      where.deletedAt = null;
    }

    if (ids) {
      where.id = { in: ids.split(",").map((s) => s.trim()).filter(Boolean) };
    }

    if (financialStatus && financialStatus !== "ALL") {
      if (financialStatus === "VOIDED" || financialStatus === "CANCELLED") {
        where.OR = [
          { cancelledAt: { not: null } },
          { financialStatus: "VOIDED" },
          { financialStatus: "CANCELLED" },
        ];
      } else {
        where.financialStatus = financialStatus;
        where.cancelledAt = null;
      }
    }

    if (fulfillmentStatus && fulfillmentStatus !== "ALL") {
      if (fulfillmentStatus === "UNFULFILLED") {
        where.fulfillmentStatus = "UNFULFILLED";
        where.cancelledAt = null;
        where.NOT = [
          ...(where.NOT || []),
          { financialStatus: "VOIDED" },
          { financialStatus: "CANCELLED" },
        ];
      } else if (fulfillmentStatus === "CANCELLED" || fulfillmentStatus === "VOIDED") {
        where.OR = [
          { cancelledAt: { not: null } },
          { financialStatus: "VOIDED" },
          { financialStatus: "CANCELLED" },
        ];
      } else if (fulfillmentStatus === "IN_PROGRESS") {
        where.fulfillmentStatus = "IN_PROGRESS";
        where.cancelledAt = null;
      } else if (fulfillmentStatus === "PARTIALLY_FULFILLED") {
        where.fulfillmentStatus = "PARTIALLY_FULFILLED";
        where.cancelledAt = null;
      } else if (fulfillmentStatus === "ON_HOLD") {
        where.fulfillmentStatus = "ON_HOLD";
        where.cancelledAt = null;
      } else {
        where.fulfillmentStatus = fulfillmentStatus;
      }
    }

    if (startDate || endDate) {
      const dateFilter: any = {};
      if (startDate) {
        dateFilter.gte = new Date(startDate);
      }
      if (endDate) {
        const end = new Date(endDate);
        end.setHours(23, 59, 59, 999);
        dateFilter.lte = end;
      }
      where.AND = [
        ...(where.AND || []),
        {
          OR: [
            { shopifyOrderCreatedAt: dateFilter },
            { createdAt: dateFilter },
          ],
        },
      ];
    }

    if (search) {
      where.AND = [
        ...(where.AND || []),
        {
          OR: [
            { shopifyOrderName: { contains: search, mode: "insensitive" } },
            { shopifyOrderNumber: { contains: search.replace("#", ""), mode: "insensitive" } },
            { shopifyOrderId: { contains: search, mode: "insensitive" } },
            { orderNumber: { contains: search.replace("#", ""), mode: "insensitive" } },
            { name: { contains: search, mode: "insensitive" } },
            { customerName: { contains: search, mode: "insensitive" } },
            { email: { contains: search, mode: "insensitive" } },
            { phone: { contains: search, mode: "insensitive" } },
            { tags: { contains: search, mode: "insensitive" } },
            {
              items: {
                some: {
                  OR: [
                    { productTitle: { contains: search } },
                    { variantTitle: { contains: search } },
                    { sku: { contains: search } },
                    { shopifyVariantId: { contains: search } },
                  ],
                },
              },
            },
            {
              fulfillments: {
                some: {
                  trackingNumber: { contains: search },
                },
              },
            },
          ],
        },
      ];
    }

    if (exportFormat === "csv") {
      const allMatchingOrders = await prisma.shopifyOrder.findMany({
        where,
        orderBy: { createdAt: "desc" },
        include: {
          items: true,
          fulfillments: true,
        },
      });

      const csvRows: string[] = [];
      csvRows.push(
        [
          "Order Number",
          "Date",
          "Customer Name",
          "Email",
          "Phone",
          "Currency",
          "Subtotal",
          "Discounts",
          "Total Value",
          "Payment Status",
          "Fulfillment Status",
          "Line Items Count",
          "Line Item SKUs",
          "Line Item Titles",
          "Tracking Numbers",
          "Courier Companies",
          "Tracking URLs",
        ]
          .map((h) => `"${h}"`)
          .join(",")
      );

      for (const o of allMatchingOrders) {
        const skus = o.items.map((i) => i.sku || "N/A").join(" | ");
        const titles = o.items.map((i) => `${i.productTitle} (${i.quantity}x)`).join(" | ");
        const trackingNums = o.fulfillments.map((f) => f.trackingNumber).filter(Boolean).join(" | ");
        const couriers = o.fulfillments.map((f) => f.trackingCompany).filter(Boolean).join(" | ");
        const trackingUrls = o.fulfillments.map((f) => f.trackingUrl).filter(Boolean).join(" | ");
        const displayOrderNumber = o.shopifyOrderName || (o.shopifyOrderNumber ? `#${o.shopifyOrderNumber}` : (o.orderNumber ? `#${o.orderNumber.replace(/^#+/, "")}` : o.name));
        const orderDateIso = (o.shopifyOrderCreatedAt || o.createdAt).toISOString();
        const displayCustomerName = o.customerName || (o.name && !o.name.startsWith("#") ? o.name : "Customer");

        csvRows.push(
          [
            displayOrderNumber,
            orderDateIso,
            displayCustomerName,
            o.email || "",
            o.phone || "",
            o.currency || "INR",
            o.subtotalPrice.toFixed(2),
            o.totalDiscounts.toFixed(2),
            o.totalPrice.toFixed(2),
            o.financialStatus,
            o.fulfillmentStatus,
            o.items.length.toString(),
            skus,
            titles,
            trackingNums,
            couriers,
            trackingUrls,
          ]
            .map((cell) => `"${(cell || "").replace(/"/g, '""')}"`)
            .join(",")
        );
      }

      const csvString = csvRows.join("\r\n");
      return new NextResponse(csvString, {
        headers: {
          "Content-Type": "text/csv; charset=utf-8",
          "Content-Disposition": `attachment; filename="shopify-orders-${new Date().toISOString().slice(0, 10)}.csv"`,
        },
      });
    }

    const [total, orders, trashCount] = await Promise.all([
      prisma.shopifyOrder.count({ where }),
      prisma.shopifyOrder.findMany({
        where,
        take: limit,
        skip,
        orderBy: { createdAt: "desc" },
        include: {
          items: true,
          fulfillments: true,
        },
      }),
      prisma.shopifyOrder.count({
        where: {
          storeId,
          deletedAt: {
            not: null,
            gte: thirtyDaysAgo,
          },
        },
      }),
    ]);

    return NextResponse.json({
      success: true,
      total,
      trashCount,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
      orders,
    });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const auth = await authorizeStoreAccess(request, { requiredPermission: "orders.manage" });
    if (!auth.authorized || !auth.storeId) {
      return NextResponse.json(
        { error: auth.error || "Unauthorized" },
        { status: auth.status || 401, headers: { "Cache-Control": "no-store" } }
      );
    }
    const storeId = auth.storeId;

    const body = await request.json();
    const { id, ids, action = "TRASH" } = body;

    let targetIds: string[] = [];
    if (Array.isArray(ids)) {
      targetIds = ids;
    } else if (id) {
      targetIds = [id];
    }

    if (action === "EMPTY_TRASH") {
      const deleted = await prisma.shopifyOrder.deleteMany({
        where: {
          storeId,
          deletedAt: { not: null },
        },
      });
      return NextResponse.json({ success: true, count: deleted.count, action: "EMPTY_TRASH" });
    }

    if (targetIds.length === 0) {
      return NextResponse.json({ error: "No Order ID provided" }, { status: 400 });
    }

    if (action === "PERMANENT_DELETE") {
      const deleted = await prisma.shopifyOrder.deleteMany({
        where: {
          storeId,
          id: { in: targetIds },
        },
      });
      return NextResponse.json({ success: true, count: deleted.count, action: "PERMANENT_DELETE" });
    }

    if (action === "RESTORE") {
      const updated = await prisma.shopifyOrder.updateMany({
        where: {
          storeId,
          id: { in: targetIds },
        },
        data: {
          deletedAt: null,
        },
      });
      await prisma.shopifyOrderItem.updateMany({
        where: {
          storeId,
          orderId: { in: targetIds },
        },
        data: {
          deletedAt: null,
        },
      });
      return NextResponse.json({ success: true, count: updated.count, action: "RESTORE" });
    }

    // Default: MOVE TO TRASH (30 days retention)
    const updated = await prisma.shopifyOrder.updateMany({
      where: {
        storeId,
        id: { in: targetIds },
      },
      data: {
        deletedAt: new Date(),
      },
    });
    await prisma.shopifyOrderItem.updateMany({
      where: {
        storeId,
        orderId: { in: targetIds },
      },
      data: {
        deletedAt: new Date(),
      },
    });

    return NextResponse.json({ success: true, count: updated.count, action: "TRASH" });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
