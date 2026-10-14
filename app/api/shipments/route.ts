import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { DelhiveryService } from "@/lib/services/DelhiveryService";
import { CourierService } from "@/lib/services/CourierService";
import { authorizeStoreAccess } from "@/lib/auth-helpers";
import { calculateShipmentDateRangeBounds } from "@/lib/shipment-dates";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  try {
    const auth = await authorizeStoreAccess(request, { requiredPermission: "shipments.view" });
    if (!auth.authorized || !auth.storeId) {
      return NextResponse.json(
        { error: auth.error || "Unauthorized" },
        { status: auth.status || 401, headers: { "Cache-Control": "no-store" } }
      );
    }
    const storeId = auth.storeId;

    const { searchParams } = new URL(request.url);
    const search = searchParams.get("search") || "";
    const status = searchParams.get("status") || "ALL";
    const carrier = searchParams.get("carrier") || "ALL";
    const outwardOnly = searchParams.get("outward") === "true";
    const rtoOnly = searchParams.get("rto") === "true";
    const isTrash = searchParams.get("trash") === "true";
    const awbs = searchParams.get("awbs") || "";
    const exportFormat = searchParams.get("export") || "";
    const page = Math.max(1, parseInt(searchParams.get("page") || "1", 10));
    const limit = Math.min(exportFormat === "csv" ? 5000 : 500, Math.max(1, parseInt(searchParams.get("limit") || "50", 10)));
    const skip = (page - 1) * limit;

    // Date filter parameters — support presets (today, yesterday, last_7_days, custom, all)
    // and explicit date bounds (dateFrom / startDate, dateTo / endDate), scoped to local business timezone.
    const datePreset = searchParams.get("dateRange") || searchParams.get("datePreset") || "";
    const dateFrom = searchParams.get("dateFrom") || searchParams.get("startDate") || "";
    const dateTo = searchParams.get("dateTo") || searchParams.get("endDate") || "";
    const timeZone = searchParams.get("tz") || searchParams.get("timeZone") || "Asia/Kolkata";

    let dateBounds: ReturnType<typeof calculateShipmentDateRangeBounds> = null;
    try {
      dateBounds = calculateShipmentDateRangeBounds({
        preset: datePreset,
        dateFrom,
        dateTo,
        timeZone,
      });
    } catch (dateErr: any) {
      return NextResponse.json(
        { error: dateErr.message || "Invalid date range" },
        { status: 400, headers: { "Cache-Control": "no-store" } }
      );
    }

    const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);

    // Auto-purge shipments older than 30 days in trash (scoped to store)
    try {
      await prisma.shipment.deleteMany({
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

    // Auto-synchronize cancelled orders with shipments before query
    try {
      const cancelledOrders = await prisma.shopifyOrder.findMany({
        where: {
          storeId,
          OR: [
            { cancelledAt: { not: null } },
            { financialStatus: "VOIDED" },
            { financialStatus: "CANCELLED" },
          ],
        },
        select: { orderNumber: true, shopifyOrderId: true },
      });

      if (cancelledOrders.length > 0) {
        const orderNumbers = cancelledOrders.map((o) => o.orderNumber).filter(Boolean) as string[];
        const orderNumbersWithHash = orderNumbers.map((num) => `#${num}`);
        const orderIds = cancelledOrders.map((o) => o.shopifyOrderId).filter(Boolean) as string[];

        await prisma.shipment.updateMany({
          where: {
            storeId,
            OR: [
              { orderNumber: { in: [...orderNumbers, ...orderNumbersWithHash] } },
              { shopifyOrderId: { in: orderIds } },
            ],
            outwardScanned: false,
            normalizedStatus: { notIn: ["DELIVERED", "CANCELLED", "CANCELLED_PRE_DISPATCH"] },
          },
          data: {
            status: "Cancelled",
            normalizedStatus: "CANCELLED_PRE_DISPATCH",
          },
        });
      }
    } catch (cancelSyncErr) {
      // Non-blocking
    }

    const where: any = {
      storeId,
      orderNumber: { not: null },
      NOT: [{ orderNumber: "" }, { orderNumber: "—" }],
    };

    if (awbs) {
      const awbList = awbs.split(",").map((s) => s.trim()).filter(Boolean);
      if (awbList.length > 0) {
        where.awb = { in: awbList };
      }
    }

    if (isTrash) {
      where.deletedAt = {
        not: null,
        gte: thirtyDaysAgo,
      };
    } else {
      where.deletedAt = null;
    }

    if (carrier && carrier !== "ALL") {
      where.carrier = { contains: carrier, mode: "insensitive" };
    }

    if (status && status !== "ALL") {
      const norm = status.toUpperCase().replace(/\s+/g, "_").replace(/-/g, "_");
      if (
        norm === "AWB_GENERATED" ||
        norm === "MANIFESTED" ||
        norm === "READY_FOR_PICKUP" ||
        norm === "PICKUP_SCHEDULED" ||
        norm === "PICKUP_PENDING" ||
        norm === "PICKUP_ASSIGNED" ||
        norm === "PICKUP_RESCHEDULED" ||
        norm === "PICKUP_ATTEMPTED" ||
        norm === "PICKUP_FAILED" ||
        norm === "DISPATCHED" ||
        norm === "CREATED" ||
        norm === "LABEL_CREATED"
      ) {
        where.normalizedStatus = {
          in: [
            "AWB_GENERATED",
            "MANIFESTED",
            "CREATED",
            "LABEL_CREATED",
            "READY_FOR_PICKUP",
            "PICKUP_SCHEDULED",
            "PICKUP_PENDING",
            "PICKUP_ASSIGNED",
            "PICKUP_RESCHEDULED",
            "PICKUP_ATTEMPTED",
            "PICKUP_FAILED",
            "DISPATCHED",
          ],
        };
      } else if (
        norm === "IN_TRANSIT" ||
        norm === "INTRANSIT" ||
        norm === "PICKUP_COMPLETED" ||
        norm === "PICKED_UP"
      ) {
        where.normalizedStatus = { in: ["IN_TRANSIT", "IN-TRANSIT", "PICKUP_COMPLETED", "PICKED_UP"] };
      } else if (norm === "OUT_FOR_DELIVERY" || norm === "OFD") {
        where.normalizedStatus = { in: ["OUT_FOR_DELIVERY", "OUT-FOR-DELIVERY"] };
      } else if (norm === "DELIVERED") {
        where.normalizedStatus = "DELIVERED";
      } else if (norm === "RTO") {
        where.normalizedStatus = "RTO";
      } else if (norm === "RTO_DELIVERED") {
        where.normalizedStatus = "RTO_DELIVERED";
      } else if (norm === "CANCELLED" || norm === "CANCELLED_PRE_DISPATCH" || norm.includes("CANCEL")) {
        where.normalizedStatus = { in: ["CANCELLED", "CANCELLED_PRE_DISPATCH"] };
      } else {
        where.OR = [
          { normalizedStatus: status },
          { status: { contains: status, mode: "insensitive" } },
          { rawStatus: { contains: status, mode: "insensitive" } },
        ];
      }
    }

    if (outwardOnly) {
      where.outwardScanned = true;
    }

    if (rtoOnly) {
      where.rtoInwardScanned = true;
    }

    if (search) {
      const cleanSearch = search.trim();
      const numOnly = cleanSearch.replace("#", "");
      where.AND = [
        ...(where.AND || []),
        {
          OR: [
            { awb: { contains: cleanSearch, mode: "insensitive" } },
            { shopifyOrderName: { contains: cleanSearch, mode: "insensitive" } },
            { shopifyOrderNumber: { contains: numOnly, mode: "insensitive" } },
            { shopifyOrderId: { contains: cleanSearch, mode: "insensitive" } },
            { orderNumber: { contains: cleanSearch, mode: "insensitive" } },
            { orderNumber: { contains: numOnly, mode: "insensitive" } },
            { customerName: { contains: cleanSearch, mode: "insensitive" } },
            { customerPhone: { contains: cleanSearch, mode: "insensitive" } },
            { carrier: { contains: cleanSearch, mode: "insensitive" } },
          ],
        },
      ];
    }

    // Date filter — WHERE orderCreatedAt >= start AND orderCreatedAt <= end
    // Canonical Shopify order date indexed with @@index([storeId, orderCreatedAt]),
    // with fallback to DB createdAt for legacy rows without orderCreatedAt yet.
    let dateFilterCondition: any = null;
    if (dateBounds) {
      dateFilterCondition = {
        OR: [
          {
            orderCreatedAt: {
              gte: dateBounds.start,
              lte: dateBounds.end,
            },
          },
          {
            AND: [
              { orderCreatedAt: null },
              {
                createdAt: {
                  gte: dateBounds.start,
                  lte: dateBounds.end,
                },
              },
            ],
          },
        ],
      };

      where.AND = [
        ...(where.AND || []),
        dateFilterCondition,
      ];
    }


    // CSV Export Handler
    if (exportFormat === "csv") {
      const allMatchingShipments = await prisma.shipment.findMany({
        where,
        // Sort by canonical Shopify order date DESC — newest orders first
        orderBy: [{ orderCreatedAt: "desc" }, { createdAt: "desc" }],
      });

      const csvRows: string[] = [];
      csvRows.push(
        [
          "AWB Number",
          "Order Number",
          "Order Date (Shopify)",
          "Courier Carrier",
          "Status",
          "Normalized Status",
          "Current Location",
          "Outward Scanned",
          "Outward Scanned At",
          "RTO Inward Scanned",
          "Payment Method",
          "Amount",
          "Customer Name",
          "Customer Phone",
          "Tracking URL",
        ]
          .map((h) => `"${h}"`)
          .join(",")
      );

      for (const s of allMatchingShipments) {
        const displayOrderNumber = s.shopifyOrderName || (s.shopifyOrderNumber ? `#${s.shopifyOrderNumber}` : (s.orderNumber ? (s.orderNumber.startsWith("#") ? s.orderNumber : `#${s.orderNumber}`) : ""));
        const courier = CourierService.detectCourier(s.carrier, s.awb);
        const trackingUrl = CourierService.getTrackingUrl(s.awb, s.carrier);
        // Use canonical Shopify order date for CSV
        const orderDateStr = s.orderCreatedAt
          ? s.orderCreatedAt.toLocaleString("en-IN", { timeZone: "Asia/Kolkata" })
          : s.date || "";

        csvRows.push(
          [
            s.awb,
            displayOrderNumber,
            orderDateStr,
            courier.displayName,
            s.status || "Manifested",
            s.normalizedStatus || "MANIFESTED",
            s.statusLocation || "",
            s.outwardScanned ? "YES" : "NO",
            s.outwardScannedAt ? s.outwardScannedAt.toISOString() : "",
            s.rtoInwardScanned ? "YES" : "NO",
            s.payment || "Prepaid",
            (s.amount || 0).toFixed(2),
            s.customerName || "",
            s.customerPhone || "",
            trackingUrl,
          ]
            .map((cell) => `"${(cell || "").replace(/"/g, '""')}"`)
            .join(",")
        );
      }

      const csvString = csvRows.join("\r\n");
      return new NextResponse(csvString, {
        headers: {
          "Content-Type": "text/csv; charset=utf-8",
          "Content-Disposition": `attachment; filename="shipments-export-${new Date().toISOString().slice(0, 10)}.csv"`,
        },
      });
    }

    const summaryWhere: any = {
      storeId,
      deletedAt: null,
      orderNumber: { not: null },
      NOT: [{ orderNumber: "" }, { orderNumber: "—" }],
    };

    if (dateFilterCondition) {
      summaryWhere.AND = [
        ...(summaryWhere.AND || []),
        dateFilterCondition,
      ];
    }

    const [total, shipments, allForSummary, trashCount] = await Promise.all([
      prisma.shipment.count({ where }),
      prisma.shipment.findMany({
        where,
        take: limit,
        skip,
        // PRIMARY SORT: Shopify order.created_at DESC (newest orders first)
        // FALLBACK: DB createdAt DESC for legacy rows without orderCreatedAt yet
        orderBy: [{ orderCreatedAt: "desc" }, { createdAt: "desc" }],
        include: {
          scans: {
            orderBy: { timestamp: "desc" },
          },
        },
      }),
      prisma.shipment.findMany({
        where: summaryWhere,
        select: {
          status: true,
          carrier: true,
          normalizedStatus: true,
          outwardScanned: true,
          rtoInwardScanned: true,
          amount: true,
        },
      }),
      prisma.shipment.count({
        where: {
          storeId,
          deletedAt: {
            not: null,
            gte: thirtyDaysAgo,
          },
          orderNumber: { not: null },
          NOT: [{ orderNumber: "" }, { orderNumber: "—" }],
        },
      }),
    ]);

    // Batch resolve customer details and addresses from Shopify Orders
    const shopifyOrderIdsToLookup = Array.from(
      new Set(shipments.map((s) => s.shopifyOrderId).filter(Boolean) as string[])
    );
    const orderNumbersToLookup = Array.from(
      new Set(
        shipments
          .map((s) => (s.shopifyOrderNumber || s.shopifyOrderName || s.orderNumber || "").replace(/^#+/, "").trim())
          .filter(Boolean)
      )
    );

    const orderMap = new Map<string, any>();
    if (shopifyOrderIdsToLookup.length > 0 || orderNumbersToLookup.length > 0) {
      try {
        const linkedOrders = await prisma.shopifyOrder.findMany({
          where: {
            storeId,
            OR: [
              ...(shopifyOrderIdsToLookup.length > 0 ? [{ shopifyOrderId: { in: shopifyOrderIdsToLookup } }] : []),
              ...(orderNumbersToLookup.length > 0
                ? [
                    { shopifyOrderNumber: { in: orderNumbersToLookup } },
                    { shopifyOrderName: { in: orderNumbersToLookup } },
                    { shopifyOrderName: { in: orderNumbersToLookup.map((n) => `#${n}`) } },
                    { orderNumber: { in: orderNumbersToLookup } },
                    { orderNumber: { in: orderNumbersToLookup.map((n) => `#${n}`) } },
                    { name: { in: orderNumbersToLookup } },
                    { name: { in: orderNumbersToLookup.map((n) => `#${n}`) } },
                  ]
                : []),
            ],
          },
          select: {
            shopifyOrderId: true,
            shopifyOrderNumber: true,
            shopifyOrderName: true,
            orderNumber: true,
            name: true,
            customerName: true,
            phone: true,
            email: true,
            shippingAddress: true,
            shopifyOrderCreatedAt: true,
            processedAt: true,
            createdAt: true,
          },
        });

        for (const o of linkedOrders) {
          if (o.shopifyOrderId) {
            orderMap.set(`id:${o.shopifyOrderId}`, o);
          }
          if (o.shopifyOrderNumber) {
            orderMap.set(`num:${o.shopifyOrderNumber.replace(/^#+/, "")}`, o);
          }
          if (o.shopifyOrderName) {
            orderMap.set(`name:${o.shopifyOrderName}`, o);
            orderMap.set(`name:${o.shopifyOrderName.replace(/^#+/, "")}`, o);
          }
          if (o.orderNumber) {
            orderMap.set(`legacy:${o.orderNumber.replace(/^#+/, "")}`, o);
          }
          if (o.name) {
            orderMap.set(`legacy:${o.name.replace(/^#+/, "")}`, o);
          }
        }
      } catch (orderLookupErr) {
        console.error("Failed to batch lookup Shopify orders:", orderLookupErr);
      }
    }

    // Enrich each shipment with customer name, phone, destination city/state/pin, full address, and NDR info
    const enrichedShipments = shipments.map((s) => {
      const cleanNum = (s.shopifyOrderNumber || s.shopifyOrderName || s.orderNumber || "").replace(/^#+/, "").trim();
      const linkedOrder =
        (s.shopifyOrderId ? orderMap.get(`id:${s.shopifyOrderId}`) : null) ||
        (s.shopifyOrderName ? orderMap.get(`name:${s.shopifyOrderName}`) : null) ||
        (s.shopifyOrderNumber ? orderMap.get(`num:${s.shopifyOrderNumber}`) : null) ||
        orderMap.get(`num:${cleanNum}`) ||
        orderMap.get(`name:${cleanNum}`) ||
        orderMap.get(`legacy:${cleanNum}`);

      const canonicalShopifyOrderName =
        s.shopifyOrderName ||
        linkedOrder?.shopifyOrderName ||
        (s.shopifyOrderNumber ? `#${s.shopifyOrderNumber}` : null) ||
        (linkedOrder?.shopifyOrderNumber ? `#${linkedOrder.shopifyOrderNumber}` : null) ||
        (s.orderNumber ? (s.orderNumber.startsWith("#") ? s.orderNumber : `#${s.orderNumber}`) : "—");

      const canonicalShopifyOrderNumber =
        s.shopifyOrderNumber ||
        linkedOrder?.shopifyOrderNumber ||
        (cleanNum && /^\d+$/.test(cleanNum) ? cleanNum : null);

      let parsedAddress: any = null;
      if (linkedOrder?.shippingAddress) {
        try {
          parsedAddress = JSON.parse(linkedOrder.shippingAddress);
        } catch {
          parsedAddress = null;
        }
      }

      // Also check if rawTrackingPayload has consignee data
      let consignee: any = null;
      if (s.rawTrackingPayload) {
        try {
          const rawObj = JSON.parse(s.rawTrackingPayload);
          consignee = rawObj.Consignee || rawObj.consignee || null;
        } catch {
          consignee = null;
        }
      }

      const customerName =
        s.customerName ||
        linkedOrder?.customerName ||
        (parsedAddress?.name
          ? parsedAddress.name
          : parsedAddress?.firstName
          ? `${parsedAddress.firstName} ${parsedAddress.lastName || ""}`.trim()
          : null) ||
        consignee?.Name ||
        (linkedOrder?.name && !linkedOrder.name.startsWith("#") ? linkedOrder.name : null) ||
        "Customer";

      const customerPhone =
        s.customerPhone ||
        parsedAddress?.phone ||
        linkedOrder?.phone ||
        consignee?.Phone ||
        null;

      const destinationCity =
        parsedAddress?.city ||
        consignee?.City ||
        (s.statusLocation ? s.statusLocation.split("_")[0] : null) ||
        null;

      const destinationState =
        parsedAddress?.province ||
        parsedAddress?.provinceCode ||
        consignee?.State ||
        null;

      const destinationPin =
        parsedAddress?.zip ||
        consignee?.Pin ||
        consignee?.PinCode ||
        null;

      const fullAddress = parsedAddress
        ? [
            parsedAddress.address1,
            parsedAddress.address2,
            parsedAddress.city,
            parsedAddress.province,
            parsedAddress.zip,
          ]
            .filter(Boolean)
            .join(", ")
        : consignee?.Address1
        ? [consignee.Address1, consignee.Address2, consignee.City, consignee.Pin].filter(Boolean).join(", ")
        : null;

      // Calculate delivery attempt count from scans
      const attemptScans = (s.scans || []).filter((sc) => {
        const text = `${sc.status} ${sc.instructions || ""} ${sc.statusType || ""}`.toUpperCase();
        return (
          text.includes("OUT FOR DELIVERY") ||
          text.includes("OFD") ||
          text.includes("ATTEMPT") ||
          text.includes("UNDELIVERED")
        );
      });
      const attemptCount = attemptScans.length;

      // Resolve canonical Shopify order date:
      // 1. Use already-stored orderCreatedAt if present
      // 2. Fall back to ShopifyOrder.shopifyOrderCreatedAt / processedAt (= Shopify order.created_at)
      // 3. Last resort: ShopifyOrder.createdAt (DB insert time for that order)
      const resolvedOrderCreatedAt: Date | null =
        (s as any).orderCreatedAt ||
        linkedOrder?.shopifyOrderCreatedAt ||
        linkedOrder?.processedAt ||
        linkedOrder?.createdAt ||
        null;

      let enrichedNormalizedStatus = s.normalizedStatus || "AWB_GENERATED";
      let enrichedStatus = s.status || "AWB Generated";

      // Pre-pickup states stay under AWB_GENERATED primary tab, while preserving detailed status
      if (
        enrichedNormalizedStatus === "DISPATCHED" ||
        enrichedNormalizedStatus === "MANIFESTED" ||
        enrichedNormalizedStatus === "READY_FOR_PICKUP" ||
        enrichedNormalizedStatus === "PICKUP_SCHEDULED" ||
        enrichedNormalizedStatus === "PICKUP_PENDING" ||
        enrichedNormalizedStatus === "PICKUP_ASSIGNED" ||
        enrichedNormalizedStatus === "PICKUP_RESCHEDULED" ||
        enrichedNormalizedStatus === "PICKUP_ATTEMPTED" ||
        enrichedNormalizedStatus === "PICKUP_FAILED"
      ) {
        enrichedNormalizedStatus = "AWB_GENERATED";
        // Preserve detailed courier status if present; fallback only if empty
        if (!enrichedStatus || enrichedStatus === "AWB Generated") {
          enrichedStatus = s.rawStatus || s.status || "AWB Generated";
        }
      } else if (enrichedNormalizedStatus === "PICKED_UP" || enrichedNormalizedStatus === "PICKUP_COMPLETED") {
        // Confirmed courier pickup belongs under IN_TRANSIT tab
        enrichedNormalizedStatus = "IN_TRANSIT";
        enrichedStatus = s.rawStatus?.toUpperCase().includes("PICK") ? s.rawStatus : "Carrier Picked Up";
      } else if (enrichedNormalizedStatus === "RTO_RECEIVED") {
        enrichedNormalizedStatus = "RTO_DELIVERED";
        enrichedStatus = "RTO Delivered";
      }

      return {
        ...s,
        status: enrichedStatus,
        normalizedStatus: enrichedNormalizedStatus,
        shopifyOrderName: canonicalShopifyOrderName,
        shopifyOrderNumber: canonicalShopifyOrderNumber,
        orderNumber: canonicalShopifyOrderName,
        customerName,
        customerPhone,
        destinationCity,
        destinationState,
        destinationPin,
        fullAddress,
        attemptCount,
        orderCreatedAt: resolvedOrderCreatedAt,
      };
    });

    // Non-blocking backfill: persist orderCreatedAt and canonical order fields for shipments that are missing them.
    // Runs in the background — never slows down the response.
    const backfillUpdates: Array<{
      awb: string;
      orderCreatedAt?: Date;
      shopifyOrderName?: string;
      shopifyOrderNumber?: string;
    }> = [];
    for (const s of enrichedShipments) {
      const raw = shipments.find((r) => r.awb === s.awb) as any;
      if (
        (s.orderCreatedAt && !raw?.orderCreatedAt) ||
        (s.shopifyOrderName && !raw?.shopifyOrderName) ||
        (s.shopifyOrderNumber && !raw?.shopifyOrderNumber)
      ) {
        backfillUpdates.push({
          awb: s.awb,
          orderCreatedAt: s.orderCreatedAt as Date,
          shopifyOrderName: s.shopifyOrderName,
          shopifyOrderNumber: s.shopifyOrderNumber,
        });
      }
    }
    if (backfillUpdates.length > 0) {
      Promise.all(
        backfillUpdates.map((u) =>
          prisma.shipment.updateMany({
            where: { storeId, awb: u.awb },
            data: {
              ...(u.orderCreatedAt ? { orderCreatedAt: u.orderCreatedAt } : {}),
              ...(u.shopifyOrderName ? { shopifyOrderName: u.shopifyOrderName, orderNumber: u.shopifyOrderName } : {}),
              ...(u.shopifyOrderNumber ? { shopifyOrderNumber: u.shopifyOrderNumber } : {}),
            },
          })
        )
      ).catch(() => { /* non-blocking */ });
    }

    const summary = {
      total: allForSummary.length,
      outwardScanned: allForSummary.filter((s) => s.outwardScanned).length,
      rtoInwardScanned: allForSummary.filter((s) => s.rtoInwardScanned).length,
      awbGenerated: allForSummary.filter(
        (s) =>
          s.normalizedStatus === "AWB_GENERATED" ||
          s.normalizedStatus === "MANIFESTED" ||
          s.normalizedStatus === "READY_FOR_PICKUP" ||
          s.normalizedStatus === "PICKUP_SCHEDULED" ||
          s.normalizedStatus === "PICKUP_PENDING" ||
          s.normalizedStatus === "PICKUP_ASSIGNED" ||
          s.normalizedStatus === "PICKUP_RESCHEDULED" ||
          s.normalizedStatus === "PICKUP_ATTEMPTED" ||
          s.normalizedStatus === "PICKUP_FAILED" ||
          s.normalizedStatus === "DISPATCHED" ||
          s.normalizedStatus === "CREATED" ||
          s.normalizedStatus === "LABEL_CREATED"
      ).length,
      inTransit: allForSummary.filter(
        (s) =>
          s.normalizedStatus === "IN_TRANSIT" ||
          s.normalizedStatus === "IN-TRANSIT" ||
          s.normalizedStatus === "PICKUP_COMPLETED" ||
          s.normalizedStatus === "PICKED_UP"
      ).length,
      outForDelivery: allForSummary.filter(
        (s) => s.normalizedStatus === "OUT_FOR_DELIVERY" || s.normalizedStatus === "OUT-FOR-DELIVERY"
      ).length,
      delivered: allForSummary.filter((s) => s.normalizedStatus === "DELIVERED").length,
      cancelled: allForSummary.filter(
        (s) =>
          s.normalizedStatus === "CANCELLED" ||
          s.normalizedStatus === "CANCELLED_PRE_DISPATCH" ||
          s.status?.toLowerCase().includes("cancel")
      ).length,
      rto: allForSummary.filter((s) => s.normalizedStatus === "RTO").length,
      rtoDelivered: allForSummary.filter((s) => s.normalizedStatus === "RTO_DELIVERED").length,
      rtoDiscrepancies: allForSummary.filter(
        (s) => (s.normalizedStatus === "RTO" || s.normalizedStatus === "RTO_DELIVERED") && !s.rtoInwardScanned
      ).length,
      totalValue: allForSummary.reduce((acc, s) => acc + (s.amount || 0), 0),
      rtoValue: allForSummary
        .filter((s) => s.normalizedStatus === "RTO")
        .reduce((acc, s) => acc + (s.amount || 0), 0),
      rtoDeliveredValue: allForSummary
        .filter((s) => s.normalizedStatus === "RTO_DELIVERED")
        .reduce((acc, s) => acc + (s.amount || 0), 0),
      couriers: {
        delhivery: allForSummary.filter((s) => (s.carrier || "").toLowerCase().includes("delhivery")).length,
        bluedart: allForSummary.filter((s) => (s.carrier || "").toLowerCase().includes("blue")).length,
        xpressbees: allForSummary.filter((s) => (s.carrier || "").toLowerCase().includes("xpress")).length,
        ecomExpress: allForSummary.filter((s) => (s.carrier || "").toLowerCase().includes("ecom")).length,
        ekart: allForSummary.filter((s) => (s.carrier || "").toLowerCase().includes("ekart")).length,
        shadowfax: allForSummary.filter((s) => (s.carrier || "").toLowerCase().includes("shadowfax")).length,
      },
    };

    return NextResponse.json({
      success: true,
      summary,
      total,
      trashCount,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
      dateFilter: dateBounds
        ? {
            preset: dateBounds.preset,
            dateFrom: dateBounds.dateFromStr,
            dateTo: dateBounds.dateToStr,
            formattedStart: dateBounds.formattedStart,
            formattedEnd: dateBounds.formattedEnd,
            timeZone: dateBounds.timeZone,
          }
        : null,
      shipments: enrichedShipments,
    });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const auth = await authorizeStoreAccess(request, { requiredPermission: "shipments.manage" });
    if (!auth.authorized || !auth.storeId) {
      return NextResponse.json(
        { error: auth.error || "Unauthorized" },
        { status: auth.status || 401, headers: { "Cache-Control": "no-store" } }
      );
    }
    const storeId = auth.storeId;

    const body = await request.json();

    if (body.action === "SYNC_ALL_DELHIVERY") {
      // 1. Sync from Shopify fulfillments first
      let fulfillmentSyncedCount = 0;

      // 2. Query Delhivery API for active tracking scans
      const allShipments = await prisma.shipment.findMany({
        where: {
          storeId,
          deletedAt: null,
          orderNumber: { not: null },
          NOT: [{ orderNumber: "" }, { orderNumber: "—" }],
        },
        select: { awb: true },
        take: 300,
        orderBy: { createdAt: "desc" },
      });
      const result = await DelhiveryService.syncBatchTracking(storeId, allShipments.map((s) => s.awb));
      return NextResponse.json({ success: true, fulfillmentSynced: fulfillmentSyncedCount, ...result });
    }

    return NextResponse.json({ success: true });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const auth = await authorizeStoreAccess(request, { requiredPermission: "shipments.manage" });
    if (!auth.authorized || !auth.storeId) {
      return NextResponse.json(
        { error: auth.error || "Unauthorized" },
        { status: auth.status || 401, headers: { "Cache-Control": "no-store" } }
      );
    }
    const storeId = auth.storeId;

    const body = await request.json();
    const { awb, awbs, action = "TRASH" } = body;

    let targetAwbs: string[] = [];
    if (Array.isArray(awbs)) {
      targetAwbs = awbs;
    } else if (awb) {
      targetAwbs = [awb];
    }

    if (action === "EMPTY_TRASH") {
      const deleted = await prisma.shipment.deleteMany({
        where: {
          storeId,
          deletedAt: { not: null },
        },
      });
      return NextResponse.json({ success: true, count: deleted.count, action: "EMPTY_TRASH" });
    }

    if (targetAwbs.length === 0) {
      return NextResponse.json({ error: "No AWB provided" }, { status: 400 });
    }

    if (action === "PERMANENT_DELETE") {
      const deleted = await prisma.shipment.deleteMany({
        where: {
          storeId,
          awb: { in: targetAwbs },
        },
      });
      return NextResponse.json({ success: true, count: deleted.count, action: "PERMANENT_DELETE" });
    }

    if (action === "RESTORE") {
      const updated = await prisma.shipment.updateMany({
        where: {
          storeId,
          awb: { in: targetAwbs },
        },
        data: {
          deletedAt: null,
        },
      });
      return NextResponse.json({ success: true, count: updated.count, action: "RESTORE" });
    }

    // Default: MOVE TO TRASH (30 days retention)
    const updated = await prisma.shipment.updateMany({
      where: {
        storeId,
        awb: { in: targetAwbs },
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


// Dual Scanner Endpoint: OUTWARD Scan & RTO INWARD Scan
export async function PUT(request: NextRequest) {
  try {
    const auth = await authorizeStoreAccess(request, { requiredPermission: "shipments.manage" });
    if (!auth.authorized || !auth.storeId) {
      return NextResponse.json(
        { error: auth.error || "Unauthorized" },
        { status: auth.status || 401, headers: { "Cache-Control": "no-store" } }
      );
    }
    const storeId = auth.storeId;

    const body = await request.json();
    const { awb, awbs, mode = "OUTWARD", action } = body;

    let rawList: string[] = [];
    if (Array.isArray(awbs)) {
      rawList = awbs;
    } else if (typeof awbs === "string" && awbs.trim()) {
      rawList = awbs.split(/[\n,\s\r]+/).filter(Boolean);
    } else if (awb) {
      rawList = [awb];
    }

    const cleanList = Array.from(
      new Set(rawList.map((s) => s.trim().replace("#", "")).filter(Boolean))
    );

    if (cleanList.length === 0) {
      return NextResponse.json({ error: "No valid AWB or Barcode provided" }, { status: 400 });
    }


    const results: any[] = [];
    let successfulCount = 0;
    let duplicateCount = 0;

    for (const rawAwb of cleanList) {
      const cleanAwb = rawAwb.split(/\s+/)[0];

      let matchingOrder = await prisma.shopifyOrder.findFirst({
        where: {
          storeId,
          deletedAt: null,
          OR: [
            { orderNumber: cleanAwb },
            { name: cleanAwb },
            { name: `#${cleanAwb}` },
            {
              fulfillments: {
                some: { trackingNumber: { contains: cleanAwb } },
              },
            },
          ],
        },
        include: {
          fulfillments: true,
          items: { where: { deletedAt: null } },
        },
      });

      let shipment = await prisma.shipment.findUnique({
        where: { storeId_awb: { storeId, awb: cleanAwb } },
      });

      if (!shipment) {
        shipment = await prisma.shipment.findFirst({
          where: {
            storeId,
            OR: [
              { awb: cleanAwb },
              { orderNumber: cleanAwb },
              { orderNumber: `#${cleanAwb}` },
              { shopifyOrderNumber: cleanAwb },
              { shopifyOrderName: cleanAwb },
              ...(matchingOrder?.shopifyOrderId ? [{ shopifyOrderId: matchingOrder.shopifyOrderId }] : []),
            ],
          },
        });
      }

      if (!matchingOrder && shipment) {
        matchingOrder = await prisma.shopifyOrder.findFirst({
          where: {
            storeId,
            deletedAt: null,
            OR: [
              ...(shipment.shopifyOrderId ? [{ shopifyOrderId: shipment.shopifyOrderId }] : []),
              ...(shipment.orderNumber ? [{ orderNumber: shipment.orderNumber }, { name: shipment.orderNumber }, { name: `#${shipment.orderNumber}` }] : []),
            ],
          },
          include: {
            fulfillments: true,
            items: { where: { deletedAt: null } },
          },
        });
      }

      const orderItems = matchingOrder?.items || [];

      if (action === "UNSCAN") {
        if (shipment) {
          shipment = await prisma.shipment.update({
            where: { storeId_awb: { storeId, awb: shipment.awb } },
            data: {
              outwardScanned: mode === "OUTWARD" ? false : shipment.outwardScanned,
              outwardScannedAt: mode === "OUTWARD" ? null : shipment.outwardScannedAt,
              rtoInwardScanned: mode === "RTO_INWARD" ? false : shipment.rtoInwardScanned,
              rtoInwardScannedAt: mode === "RTO_INWARD" ? null : shipment.rtoInwardScannedAt,
            },
          });
        }
        if (matchingOrder) {
          await prisma.shopifyOrder.update({
            where: { id: matchingOrder.id },
            data: {
              outwardScanned: mode === "OUTWARD" ? false : matchingOrder.outwardScanned,
              outwardScannedAt: mode === "OUTWARD" ? null : matchingOrder.outwardScannedAt,
              rtoInwardScanned: mode === "RTO_INWARD" ? false : matchingOrder.rtoInwardScanned,
              rtoInwardScannedAt: mode === "RTO_INWARD" ? null : matchingOrder.rtoInwardScannedAt,
            },
          });
        }
        results.push({ awb: cleanAwb, success: true, action: "UNSCANNED" });
        continue;
      }

      if (mode === "RTO_INWARD") {
        const isAlreadyRtoScanned = Boolean(
          shipment?.rtoInwardScanned || matchingOrder?.rtoInwardScanned
        );

        if (isAlreadyRtoScanned) {
          duplicateCount++;
          results.push({
            awb: cleanAwb,
            success: true,
            mode: "RTO_INWARD",
            isDuplicate: true,
            code: "ALREADY_PROCESSED",
            badge: "ALREADY PROCESSED",
            tone: "duplicate",
            message: "⚠️ Duplicate: This RTO has already been processed.",
            orderNumber: matchingOrder?.orderNumber || shipment?.orderNumber,
            customerName: matchingOrder?.name || shipment?.customerName,
            amount: matchingOrder?.totalPrice || shipment?.amount,
            rtoVerificationStatus: shipment?.rtoVerificationStatus || "UNVERIFIED",
            shipment,
          });
          continue;
        }

        const wasOutwardDispatched = Boolean(
          (shipment?.outwardScanned && shipment?.outwardScannedAt) ||
          (matchingOrder?.outwardScanned && matchingOrder?.outwardScannedAt)
        );
        const rtoVerificationStatus = wasOutwardDispatched ? "VERIFIED" : "UNVERIFIED";

        const isPreDispatchCancel = !wasOutwardDispatched && (matchingOrder?.cancelledAt !== null || shipment?.normalizedStatus === "MANIFESTED");
        const newStatus = isPreDispatchCancel ? "Cancelled (Pre-Dispatch Restocked)" : "RTO Delivered";
        const newNormalizedStatus = isPreDispatchCancel ? "CANCELLED_PRE_DISPATCH" : "RTO_DELIVERED";

        let inventoryMoved = false;
        let movedItems: any[] = [];

        await prisma.$transaction(async (tx) => {

          const targetAwb = shipment?.awb || cleanAwb;
          shipment = await tx.shipment.upsert({
            where: { storeId_awb: { storeId, awb: targetAwb } },
            create: {
              storeId,
              awb: targetAwb,
              status: newStatus,
              normalizedStatus: newNormalizedStatus,
              rtoInwardScanned: true,
              rtoInwardScannedAt: new Date(),
              rtoVerificationStatus,
              orderNumber: matchingOrder?.orderNumber || null,
              customerName: matchingOrder?.name || null,
              amount: matchingOrder?.totalPrice || 0.0,
              date: new Date().toISOString().split("T")[0],
            },
            update: {
              status: newStatus,
              normalizedStatus: newNormalizedStatus,
              rtoInwardScanned: true,
              rtoInwardScannedAt: new Date(),
              rtoVerificationStatus,
              orderNumber: matchingOrder?.orderNumber || undefined,
            },
          });

          if (matchingOrder) {
            await tx.shopifyOrder.update({
              where: { id: matchingOrder.id },
              data: {
                rtoInwardScanned: true,
                rtoInwardScannedAt: new Date(),
                deliveryStatus: isPreDispatchCancel ? "CANCELLED_PRE_DISPATCH" : "RTO_DELIVERED",
              },
            });
          }
        });

        successfulCount++;
        const badge = wasOutwardDispatched ? "RTO RETURNED" : "UNVERIFIED RTO";
        const tone = wasOutwardDispatched ? "success" : "unverified_rto";
        const message = wasOutwardDispatched
          ? "✓ Success: Returned package physically received in warehouse"
          : "⚠️ Warning: Returned package has no recorded outward dispatch.";

        results.push({
          awb: cleanAwb,
          success: true,
          mode: "RTO_INWARD",
          isDuplicate: false,
          isPreDispatchCancel,
          rtoVerificationStatus,
          badge,
          tone,
          message,
          inventoryMoved,
          movedItems,
          orderNumber: matchingOrder?.orderNumber || shipment?.orderNumber,
          customerName: matchingOrder?.name || shipment?.customerName,
          amount: matchingOrder?.totalPrice || shipment?.amount,
          shipment,
        });
      } else {
        // mode === "OUTWARD"
        const isAlreadyOutwardScanned = Boolean(
          shipment?.outwardScanned || matchingOrder?.outwardScanned
        );

        if (isAlreadyOutwardScanned) {
          duplicateCount++;
          results.push({
            awb: cleanAwb,
            success: true,
            mode: "OUTWARD",
            isDuplicate: true,
            code: "ALREADY_SCANNED",
            badge: "ALREADY SCANNED",
            tone: "duplicate",
            message: "⚠️ Duplicate: This package has already been scanned outward.",
            orderNumber: matchingOrder?.orderNumber || shipment?.orderNumber,
            customerName: matchingOrder?.name || shipment?.customerName,
            amount: matchingOrder?.totalPrice || shipment?.amount,
            shipment,
          });
          continue;
        }

        let inventoryMoved = false;
        let movedItems: any[] = [];

        await prisma.$transaction(async (tx) => {

          const targetAwb = shipment?.awb || cleanAwb;
          shipment = await tx.shipment.upsert({
            where: { storeId_awb: { storeId, awb: targetAwb } },
            create: {
              storeId,
              awb: targetAwb,
              status: "AWB Generated",
              normalizedStatus: "AWB_GENERATED",
              outwardScanned: true,
              outwardScannedAt: new Date(),
              orderNumber: matchingOrder?.orderNumber || null,
              customerName: matchingOrder?.name || null,
              amount: matchingOrder?.totalPrice || 0.0,
              date: new Date().toISOString().split("T")[0],
            },
            update: {
              outwardScanned: true,
              outwardScannedAt: new Date(),
              orderNumber: matchingOrder?.orderNumber || undefined,
            },
          });

          if (matchingOrder) {
            await tx.shopifyOrder.update({
              where: { id: matchingOrder.id },
              data: {
                outwardScanned: true,
                outwardScannedAt: new Date(),
              },
            });
          }
        });

        successfulCount++;
        results.push({
          awb: cleanAwb,
          success: true,
          mode: "OUTWARD",
          isDuplicate: false,
          badge: "OUTWARD DISPATCHED",
          tone: "success",
          message: "✓ Success: Outward marked & dispatched",
          inventoryMoved,
          movedItems,
          orderNumber: matchingOrder?.orderNumber || shipment?.orderNumber,
          customerName: matchingOrder?.name || shipment?.customerName,
          amount: matchingOrder?.totalPrice || shipment?.amount,
          shipment,
        });
      }
    }

    if (cleanList.length === 1) {
      const single = results[0];
      return NextResponse.json({
        success: true,
        mode,
        shipment: single.shipment || single,
        order: single,
        isDuplicate: single.isDuplicate,
        code: single.code,
        badge: single.badge,
        tone: single.tone,
        rtoVerificationStatus: single.rtoVerificationStatus,
        inventoryMoved: single.inventoryMoved,
        message: single.message || (single.isDuplicate
          ? `⚠️ Duplicate: Already ${mode === "RTO_INWARD" ? "RTO inward" : "outward"} scanned previously`
          : `✓ Success: ${mode === "RTO_INWARD" ? "Returned package physically received in warehouse" : "Outward marked & dispatched"}`),
      });
    }

    return NextResponse.json({
      success: true,
      mode,
      bulk: true,
      total: cleanList.length,
      successfulCount,
      duplicateCount,
      results,
    });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
