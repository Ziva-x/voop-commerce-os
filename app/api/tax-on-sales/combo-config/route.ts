import { NextRequest, NextResponse } from "next/server";
import { authorizeStoreAccess } from "@/lib/auth-helpers";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

/**
 * GET /api/tax-on-sales/combo-config?sku=COMBO_SKU
 * Returns the Combo invoice configuration and recipe breakdown for the authorized store.
 */
export async function GET(request: NextRequest) {
  try {
    const auth = await authorizeStoreAccess(request, { requiredPermission: "tax.view" });
    if (!auth.authorized || !auth.storeId) {
      return NextResponse.json({ error: auth.error || "Unauthorized" }, { status: auth.status || 401 });
    }
    const storeId = auth.storeId;

    const { searchParams } = new URL(request.url);
    const rawSku = searchParams.get("sku")?.trim();
    if (!rawSku) {
      return NextResponse.json({ error: "SKU parameter is required" }, { status: 400 });
    }
    const cleanSku = rawSku.toUpperCase();

    // 1. Verify Combo exists in StockItem for this store
    const comboStock = await prisma.stockItem.findFirst({
      where: { storeId, sku: cleanSku, type: "COMBO" },
      include: {
        comboComponents: {
          include: { componentItem: true },
        },
      },
    });

    if (!comboStock) {
      return NextResponse.json({ error: `Combo SKU "${cleanSku}" not found in this store.` }, { status: 404 });
    }

    // 2. Fetch Parent ProductTaxConfig
    const taxConfig = await prisma.productTaxConfig.findUnique({
      where: { storeId_sku: { storeId, sku: cleanSku } },
    });

    const comboSellingPrice =
      taxConfig?.overridePrice !== null && taxConfig?.overridePrice !== undefined
        ? taxConfig.overridePrice
        : comboStock.sellingPrice || 0;

    // 3. Fetch existing ComboInvoiceComponent configurations
    const existingConfigs = await prisma.comboInvoiceComponent.findMany({
      where: { storeId, comboSku: cleanSku },
    });
    const configMap = new Map<string, (typeof existingConfigs)[0]>();
    existingConfigs.forEach((c) => configMap.set(c.componentSku.toUpperCase().trim(), c));

    // 4. Build Component Breakdown (reconciled against current recipe)
    let totalAllocatedPaise = 0;
    let hasUnconfigured = false;
    let recipeChanged = false;

    const recipeSkuSet = new Set<string>();
    const components = comboStock.comboComponents.map((rc) => {
      const compSku = rc.componentSku.toUpperCase().trim();
      recipeSkuSet.add(compSku);
      const existing = configMap.get(compSku);

      if (!existing) {
        hasUnconfigured = true;
      }

      const allocatedValue = existing ? existing.allocatedValue : 0;
      const gstRate = existing ? existing.gstRate : 18.0;
      const hsnCode = existing ? existing.hsnCode || "" : "";
      const taxMode = existing ? existing.taxMode || "INCLUSIVE" : "INCLUSIVE";

      totalAllocatedPaise += Math.round(allocatedValue * 100);

      // Unit tax preview calculations
      const compNetPaise = Math.round(allocatedValue * 100);
      const isInclusive = taxMode === "INCLUSIVE";
      const compTaxablePaise = isInclusive
        ? gstRate > 0
          ? Math.round(compNetPaise / (1 + gstRate / 100))
          : compNetPaise
        : compNetPaise;
      const compTaxPaise = isInclusive
        ? compNetPaise - compTaxablePaise
        : gstRate > 0
        ? Math.round(compTaxablePaise * (gstRate / 100))
        : 0;

      return {
        componentSku: compSku,
        name: rc.componentItem?.name || compSku,
        quantity: rc.quantity,
        unitCost: rc.componentItem?.avgUnitCost || 0,
        allocatedValue,
        gstRate,
        hsnCode,
        taxMode,
        taxableValue: Number((compTaxablePaise / 100).toFixed(2)),
        taxAmount: Number((compTaxPaise / 100).toFixed(2)),
        isConfigured: !!existing,
      };
    });

    // Check if previous configurations exist for components no longer in recipe
    for (const existing of existingConfigs) {
      if (!recipeSkuSet.has(existing.componentSku.toUpperCase().trim())) {
        recipeChanged = true;
        break;
      }
    }

    const totalAllocated = totalAllocatedPaise / 100;
    const sellingPricePaise = Math.round(comboSellingPrice * 100);
    const isBalanced = totalAllocatedPaise === sellingPricePaise && !hasUnconfigured && components.length > 0;
    const difference = Number(((sellingPricePaise - totalAllocatedPaise) / 100).toFixed(2));

    // GST Breakdown summary
    const gstRateSet = new Set(components.map((c) => c.gstRate));
    let mixedGstLabel = "18% GST";
    if (gstRateSet.size > 1) {
      mixedGstLabel = `Mixed GST (${Array.from(gstRateSet).sort((a, b) => a - b).map((r) => `${r}%`).join(" + ")})`;
    } else if (gstRateSet.size === 1) {
      mixedGstLabel = `${Array.from(gstRateSet)[0]}% GST`;
    }

    return NextResponse.json({
      success: true,
      combo: {
        sku: comboStock.sku,
        title: comboStock.name,
        sellingPrice: comboSellingPrice,
        recipeCost: comboStock.comboComponents.reduce(
          (sum, c) => sum + (c.componentItem?.avgUnitCost || 0) * c.quantity,
          0
        ),
      },
      components,
      summary: {
        totalAllocated,
        comboSellingPrice,
        difference,
        isBalanced,
        hasUnconfigured,
        requiresReview: recipeChanged,
        mixedGstLabel,
        componentsCount: components.length,
      },
    });
  } catch (error: any) {
    console.error("GET /api/tax-on-sales/combo-config error:", error);
    return NextResponse.json({ error: error.message || "Failed to load combo invoice config" }, { status: 500 });
  }
}

/**
 * POST /api/tax-on-sales/combo-config
 * Saves the custom invoice price allocation and GST setup for a Combo SKU.
 */
export async function POST(request: NextRequest) {
  try {
    const auth = await authorizeStoreAccess(request, { requiredPermission: "tax.manage" });
    if (!auth.authorized || !auth.storeId) {
      return NextResponse.json({ error: auth.error || "Unauthorized" }, { status: auth.status || 401 });
    }
    const storeId = auth.storeId;

    const body = await request.json();
    const { comboSku, sellingPrice, components } = body;

    const cleanSku = (comboSku || "").toUpperCase().trim();
    if (!cleanSku) {
      return NextResponse.json({ error: "Combo SKU is required." }, { status: 400 });
    }

    if (!Array.isArray(components) || components.length === 0) {
      return NextResponse.json({ error: "At least one component configuration is required." }, { status: 400 });
    }

    // 1. Verify Combo exists and get its recipe
    const comboStock = await prisma.stockItem.findFirst({
      where: { storeId, sku: cleanSku, type: "COMBO" },
      include: {
        comboComponents: true,
      },
    });

    if (!comboStock) {
      return NextResponse.json({ error: `Combo SKU "${cleanSku}" not found in this store.` }, { status: 404 });
    }

    if (comboStock.comboComponents.length === 0) {
      return NextResponse.json(
        { error: "Cannot configure invoice tax for a Combo with an empty recipe. Please register recipe components in Inventory first." },
        { status: 400 }
      );
    }

    // 2. Validate parsed selling price
    const parsedSellingPrice = parseFloat(sellingPrice);
    if (isNaN(parsedSellingPrice) || parsedSellingPrice < 0) {
      return NextResponse.json({ error: "Valid non-negative Combo selling price is required." }, { status: 400 });
    }

    // 3. Validate every recipe component is present and has matching quantity
    const recipeMap = new Map<string, number>();
    comboStock.comboComponents.forEach((rc) => recipeMap.set(rc.componentSku.toUpperCase().trim(), rc.quantity));

    let totalAllocatedPaise = 0;
    const cleanComponents: Array<{
      componentSku: string;
      quantity: number;
      allocatedValue: number;
      gstRate: number;
      hsnCode: string;
      taxMode: string;
    }> = [];

    const VALID_GST_RATES = [0, 5, 12, 18, 28];

    for (const comp of components) {
      const compSku = (comp.componentSku || "").toUpperCase().trim();
      if (!compSku) {
        return NextResponse.json({ error: "Each component must have a valid component SKU." }, { status: 400 });
      }

      if (!recipeMap.has(compSku)) {
        return NextResponse.json(
          { error: `Component SKU "${compSku}" is not part of the physical recipe for Combo "${cleanSku}".` },
          { status: 400 }
        );
      }

      const allocatedVal = parseFloat(comp.allocatedValue);
      if (isNaN(allocatedVal) || allocatedVal < 0) {
        return NextResponse.json(
          { error: `Component "${compSku}" allocated invoice value must be greater than or equal to zero.` },
          { status: 400 }
        );
      }

      const gstRate = parseFloat(comp.gstRate);
      if (isNaN(gstRate) || !VALID_GST_RATES.includes(gstRate)) {
        return NextResponse.json(
          { error: `Component "${compSku}" has invalid GST rate (${comp.gstRate}%). Allowed rates are 0%, 5%, 12%, 18%, 28%.` },
          { status: 400 }
        );
      }

      const hsnCode = (comp.hsnCode || "").trim();
      const taxMode = comp.taxMode === "EXCLUSIVE" ? "EXCLUSIVE" : "INCLUSIVE";
      const quantity = recipeMap.get(compSku) || 1.0;

      totalAllocatedPaise += Math.round(allocatedVal * 100);

      cleanComponents.push({
        componentSku: compSku,
        quantity,
        allocatedValue: Number(allocatedVal.toFixed(2)),
        gstRate,
        hsnCode,
        taxMode,
      });
    }

    // Ensure all recipe components were provided
    if (cleanComponents.length !== comboStock.comboComponents.length) {
      return NextResponse.json(
        { error: `Missing component configurations. Expected ${comboStock.comboComponents.length} recipe components, received ${cleanComponents.length}.` },
        { status: 400 }
      );
    }

    // 4. Strict Balance Validation: sum of allocations must equal combo selling price
    const sellingPricePaise = Math.round(parsedSellingPrice * 100);
    if (totalAllocatedPaise !== sellingPricePaise) {
      const diff = Number(((sellingPricePaise - totalAllocatedPaise) / 100).toFixed(2));
      return NextResponse.json(
        {
          error: `Allocation does not match Combo selling price. Total allocated: ₹${(totalAllocatedPaise / 100).toFixed(2)}, Combo price: ₹${parsedSellingPrice.toFixed(2)}. Difference: ₹${diff.toFixed(2)}.`,
          difference: diff,
          totalAllocated: totalAllocatedPaise / 100,
          comboSellingPrice: parsedSellingPrice,
        },
        { status: 400 }
      );
    }

    // 5. Atomic transaction to persist ComboInvoiceComponent records and update ProductTaxConfig
    await prisma.$transaction(async (tx) => {
      // Upsert each component configuration
      for (const comp of cleanComponents) {
        await tx.comboInvoiceComponent.upsert({
          where: {
            storeId_comboSku_componentSku: {
              storeId,
              comboSku: cleanSku,
              componentSku: comp.componentSku,
            },
          },
          create: {
            storeId,
            comboSku: cleanSku,
            componentSku: comp.componentSku,
            quantity: comp.quantity,
            allocatedValue: comp.allocatedValue,
            gstRate: comp.gstRate,
            hsnCode: comp.hsnCode,
            taxMode: comp.taxMode,
          },
          update: {
            quantity: comp.quantity,
            allocatedValue: comp.allocatedValue,
            gstRate: comp.gstRate,
            hsnCode: comp.hsnCode,
            taxMode: comp.taxMode,
          },
        });
      }

      // Remove any obsolete components that are no longer in the recipe
      const validSkus = cleanComponents.map((c) => c.componentSku);
      await tx.comboInvoiceComponent.deleteMany({
        where: {
          storeId,
          comboSku: cleanSku,
          componentSku: { notIn: validSkus },
        },
      });

      // Update parent ProductTaxConfig selling price
      await tx.productTaxConfig.upsert({
        where: { storeId_sku: { storeId, sku: cleanSku } },
        create: {
          storeId,
          sku: cleanSku,
          title: comboStock.name,
          overridePrice: parsedSellingPrice,
          taxRate: cleanComponents[0]?.gstRate ?? 18.0,
          isTaxInclusive: cleanComponents.every((c) => c.taxMode === "INCLUSIVE"),
        },
        update: {
          overridePrice: parsedSellingPrice,
          isTaxInclusive: cleanComponents.every((c) => c.taxMode === "INCLUSIVE"),
        },
      });

      // Synchronize StockItem selling price (does NOT alter recipe BOM)
      await tx.stockItem.updateMany({
        where: { storeId, sku: cleanSku },
        data: { sellingPrice: parsedSellingPrice },
      });

      // Synchronize all UNFINALIZED order line items in this store matching this Combo SKU.
      // This ensures unissued / draft invoices immediately reflect the updated breakdown.
      // Finalized orders (outward scanned, delivered, or fulfilled) are protected and untouched.
      const snapshotJson = JSON.stringify(
        cleanComponents.map((c) => ({
          componentSku: c.componentSku,
          quantity: c.quantity,
          allocatedValue: c.allocatedValue,
          gstRate: c.gstRate,
          hsnCode: c.hsnCode,
          taxMode: c.taxMode,
        }))
      );

      const unfinalizedOrders = await tx.shopifyOrder.findMany({
        where: {
          storeId,
          outwardScanned: false,
          fulfillmentStatus: { not: "FULFILLED" },
          deliveryStatus: { notIn: ["DELIVERED", "IN_TRANSIT", "SHIPPED"] },
        },
        select: { id: true },
      });

      if (unfinalizedOrders.length > 0) {
        const unfinalizedOrderIds = unfinalizedOrders.map((o) => o.id);
        await tx.shopifyOrderItem.updateMany({
          where: {
            orderId: { in: unfinalizedOrderIds },
            sku: { equals: cleanSku, mode: "insensitive" },
          },
          data: {
            comboInvoiceComponents: snapshotJson,
          },
        });
      }
    });

    return NextResponse.json({
      success: true,
      message: `Combo invoice configuration for "${cleanSku}" saved successfully.`,
    });
  } catch (error: any) {
    console.error("POST /api/tax-on-sales/combo-config error:", error);
    return NextResponse.json({ error: error.message || "Failed to save combo invoice config" }, { status: 500 });
  }
}
