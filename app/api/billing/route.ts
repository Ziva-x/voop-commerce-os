import { NextRequest, NextResponse } from "next/server";
import { authorizeStoreAccess } from "@/lib/auth-helpers";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

// ─── Helper: generate next BILL order number ───────────────────────────────
async function generateOrderNumber(): Promise<string> {
  const year = new Date().getFullYear();
  const prefix = `BILL-${year}-`;

  // Find highest existing number for this year
  const last = await prisma.offlineOrder.findFirst({
    where: { orderNumber: { startsWith: prefix } },
    orderBy: { orderNumber: "desc" },
    select: { orderNumber: true },
  });

  let seq = 1;
  if (last?.orderNumber) {
    const parts = last.orderNumber.split("-");
    seq = parseInt(parts[parts.length - 1] || "0", 10) + 1;
  }

  return `${prefix}${String(seq).padStart(4, "0")}`;
}

// ─── GET /api/billing ─────────────────────────────────────────────────────
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
    const page = Math.max(1, parseInt(searchParams.get("page") || "1"));
    const limit = Math.min(parseInt(searchParams.get("limit") || "20"), 100);
    const skip = (page - 1) * limit;
    const channel = searchParams.get("channel");
    const status = searchParams.get("status");
    const from = searchParams.get("from");
    const to = searchParams.get("to");
    const q = searchParams.get("q");

    const where: any = { storeId, deletedAt: null };
    if (channel) where.channel = channel;
    if (status) where.status = status;
    if (from || to) {
      where.createdAt = {};
      if (from) where.createdAt.gte = new Date(from);
      if (to) where.createdAt.lte = new Date(to + "T23:59:59.999Z");
    }
    if (q) {
      where.OR = [
        { orderNumber: { contains: q, mode: "insensitive" } },
        { customerName: { contains: q, mode: "insensitive" } },
        { customerPhone: { contains: q, mode: "insensitive" } },
        { trackingNumber: { contains: q, mode: "insensitive" } },
      ];
    }

    const [orders, total] = await Promise.all([
      prisma.offlineOrder.findMany({
        where,
        orderBy: { createdAt: "desc" },
        skip,
        take: limit,
        include: {
          items: {
            select: {
              sku: true,
              productName: true,
              quantity: true,
              unitPrice: true,
              taxRate: true,
              taxAmount: true,
              totalAmount: true,
            },
          },
        },
      }),
      prisma.offlineOrder.count({ where }),
    ]);

    return NextResponse.json({
      success: true,
      orders,
      pagination: { page, limit, total, pages: Math.ceil(total / limit) },
    });
  } catch (error: any) {
    console.error("[Billing GET Error]", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

// ─── POST /api/billing ────────────────────────────────────────────────────
export async function POST(request: NextRequest) {
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

    const {
      channel = "WALK_IN",
      customerName,
      customerPhone,
      customerAddress,
      paymentMode,
      paymentStatus,
      advanceAmount = 0,
      notes,
      courier,
      trackingNumber,
      delhiveryRefNo,
      shippingCharge = 0,
      items, // Array of { sku, productName, quantity, unitPrice, discount, taxRate, hsnCode }
    } = body;

    if (!items || !Array.isArray(items) || items.length === 0) {
      return NextResponse.json({ error: "At least one item is required" }, { status: 400 });
    }

    // ── Pre-process items: Expand Combos ────────────────────────────────
    const skus = items.map((i: any) => i.sku);
    const stockItems = await prisma.stockItem.findMany({
      where: { storeId, sku: { in: skus } },
      include: {
        comboComponents: {
          include: { componentItem: true }
        }
      }
    });
    const stockMap = Object.fromEntries(stockItems.map((s) => [s.sku, s]));

    const componentSkus = stockItems.flatMap((s) => s.type === "COMBO" ? s.comboComponents.map((c: any) => c.componentSku) : []);
    const taxConfigs = await prisma.productTaxConfig.findMany({
      where: { storeId, sku: { in: componentSkus } }
    });
    const taxMap = Object.fromEntries(taxConfigs.map((t) => [t.sku, t]));

    const expandedItems: any[] = [];
    for (const item of items) {
      const stock = stockMap[item.sku];
      if (stock?.type === "COMBO" && stock.comboComponents.length > 0) {
        const totalBaseCost = stock.comboComponents.reduce((sum: number, c: any) => sum + (c.componentItem.avgUnitCost * c.quantity), 0) || 1;
        for (const comp of stock.comboComponents) {
          const compTax = taxMap[comp.componentSku];
          const weight = (comp.componentItem.avgUnitCost * comp.quantity) / totalBaseCost;
          // Calculate unit price per single component item
          const compQty = parseFloat(item.quantity) * comp.quantity;
          const proratedUnitPrice = (parseFloat(item.unitPrice) * weight) / comp.quantity;
          
          expandedItems.push({
            sku: comp.componentSku,
            productName: `${item.productName} (${comp.componentItem.name})`,
            quantity: compQty,
            unitPrice: proratedUnitPrice,
            discount: (parseFloat(item.discount) || 0) * weight,
            taxRate: compTax?.taxRate ?? item.taxRate,
            hsnCode: compTax?.hsnCode ?? item.hsnCode,
            isTaxInclusive: compTax ? compTax.isTaxInclusive : (item.isTaxInclusive ?? true)
          });
        }
      } else {
        expandedItems.push({
          ...item,
          isTaxInclusive: item.isTaxInclusive ?? true
        });
      }
    }

    // ── Calculate totals ─────────────────────────────────────────────────
    let subtotal = 0;
    let totalDiscount = 0;
    let totalTax = 0;

    const lineItems = expandedItems.map((item: any) => {
      const qty = parseFloat(item.quantity) || 1;
      const price = parseFloat(item.unitPrice) || 0;
      const discount = parseFloat(item.discount) || 0;
      const taxRate = parseFloat(item.taxRate) || 0;

      const lineBase = qty * price - discount;
      // If tax is inclusive: extract GST from price. If exclusive: add on top.
      const taxAmount = item.isTaxInclusive
        ? lineBase - lineBase / (1 + taxRate / 100)
        : lineBase * (taxRate / 100);
      const lineTotal = item.isTaxInclusive ? lineBase : lineBase + taxAmount;

      subtotal += lineBase;
      totalDiscount += discount;
      totalTax += taxAmount;

      return {
        storeId,
        sku: item.sku,
        productName: item.productName,
        quantity: qty,
        unitPrice: price,
        discount,
        taxRate,
        taxAmount: Math.round(taxAmount * 100) / 100,
        totalAmount: Math.round(lineTotal * 100) / 100,
        hsnCode: item.hsnCode || null,
      };
    });

    const totalAmount = subtotal + (item => item)(shippingCharge);
    // Recalc cleanly
    const grandTotal =
      lineItems.reduce((sum: number, i: any) => sum + i.totalAmount, 0) +
      parseFloat(shippingCharge) || 0;

    // ── Generate order number ─────────────────────────────────────────────
    const orderNumber = trackingNumber?.trim() ? trackingNumber.trim() : await generateOrderNumber();

    // ── Create order + items in a transaction ─────────────────────────────
    const order = await prisma.$transaction(async (tx) => {
      // 1. Create the offline order
      const newOrder = await tx.offlineOrder.create({
        data: {
          storeId,
          orderNumber,
          channel,
          customerName: customerName || null,
          customerPhone: customerPhone || null,
          customerAddress: customerAddress ? JSON.stringify(customerAddress) : null,
          paymentMode,
          paymentStatus,
          subtotal: Math.round(subtotal * 100) / 100,
          totalDiscount: Math.round(totalDiscount * 100) / 100,
          totalTax: Math.round(totalTax * 100) / 100,
          shippingCharge: parseFloat(shippingCharge) || 0,
          totalAmount: Math.round(grandTotal * 100) / 100,
          advanceAmount: paymentStatus === "PARTIAL" ? parseFloat(advanceAmount) || 0 : 0,
          pendingAmount: paymentStatus === "PARTIAL" ? Math.max(0, Math.round(grandTotal * 100) / 100 - (parseFloat(advanceAmount) || 0)) : 0,
          notes: notes || null,
          courier: courier || null,
          trackingNumber: trackingNumber || null,
          delhiveryRefNo: delhiveryRefNo || null,
          status: "CONFIRMED",
          items: {
            create: lineItems,
          },
        },
        include: { items: true },
      });

      // 2. Deduct stock for each item via InventoryLedger + update StockItem
      for (const item of lineItems) {
        // Get current stock
        const stockItem = await tx.stockItem.findUnique({
          where: { storeId_sku: { storeId, sku: item.sku } },
          select: { currentStock: true, availableStock: true, avgUnitCost: true },
        });

        if (!stockItem) continue;

        const newCurrent = Math.max(0, stockItem.currentStock - item.quantity);
        const newAvailable = Math.max(0, stockItem.availableStock - item.quantity);

        // Update stock levels
        await tx.stockItem.update({
          where: { storeId_sku: { storeId, sku: item.sku } },
          data: {
            currentStock: newCurrent,
            availableStock: newAvailable,
          },
        });

        // Write ledger entry
        await tx.inventoryLedger.create({
          data: {
            storeId,
            sku: item.sku,
            type: "OFFLINE_SALE",
            inventoryBucket: "SALEABLE",
            quantity: -item.quantity, // Negative = outward
            unitCost: item.unitPrice,
            balanceAfter: newCurrent,
            referenceType: "OFFLINE_ORDER",
            referenceId: newOrder.id,
            orderId: newOrder.id,
            notes: `Offline sale — ${newOrder.orderNumber} — ${channel}`,
            createdBy: "Billing",
          },
        });
      }

      // 3. If tracking number provided, upsert a Shipment row
      if (trackingNumber) {
        await tx.shipment.upsert({
          where: { storeId_awb: { storeId, awb: trackingNumber } },
          create: {
            storeId,
            awb: trackingNumber,
            orderNumber: newOrder.orderNumber,
            carrier: courier || "Other",
            status: "Manifested",
            normalizedStatus: "MANIFESTED",
            customerName: customerName || null,
            customerPhone: customerPhone || null,
            payment: paymentMode === "COD" ? "COD" : "Prepaid",
            amount: grandTotal,
            notes: `Offline order ${newOrder.orderNumber}`,
          },
          update: {
            orderNumber: newOrder.orderNumber,
            carrier: courier || undefined,
            customerName: customerName || undefined,
            customerPhone: customerPhone || undefined,
          },
        });
      }

      return newOrder;
    });

    return NextResponse.json({ success: true, order }, { status: 201 });
  } catch (error: any) {
    console.error("[Billing POST Error]", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
