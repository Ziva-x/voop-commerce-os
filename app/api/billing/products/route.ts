import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { resolveStoreId } from "@/lib/auth-helpers";

export const dynamic = "force-dynamic";

/**
 * GET /api/billing/products?q=<search>&limit=10
 *
 * Searches StockItem by SKU or name, joins ProductTaxConfig for GST rate.
 * Used by billing form's product autocomplete.
 */
export async function GET(request: NextRequest) {
  try {
    const storeId = await resolveStoreId(request);
    if (!storeId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const q = searchParams.get("q")?.trim() || "";
    const limit = Math.min(parseInt(searchParams.get("limit") || "10"), 50);

    const items = await prisma.stockItem.findMany({
      where: q
        ? {
            storeId,
            OR: [
              { sku: { contains: q, mode: "insensitive" } },
              { name: { contains: q, mode: "insensitive" } },
            ],
            // Only SINGLE items (not combos that have 0 stock tracked)
          }
        : { storeId },
      select: {
        sku: true,
        name: true,
        type: true,
        unit: true,
        currentStock: true,
        availableStock: true,
        avgUnitCost: true,
      },
      orderBy: [{ availableStock: "desc" }, { name: "asc" }],
      take: limit,
    });

    // Fetch GST configs for matched SKUs
    const skus = items.map((i) => i.sku);
    const taxConfigs = await prisma.productTaxConfig.findMany({
      where: { storeId, sku: { in: skus } },
      select: { sku: true, taxRate: true, hsnCode: true, isTaxInclusive: true, overridePrice: true },
    });
    const taxMap = Object.fromEntries(taxConfigs.map((t) => [t.sku, t]));

    // Fetch combo components for COMBO items to calculate true available stock
    const comboSkus = items.filter(i => i.type === "COMBO").map(i => i.sku);
    let comboStockMap: Record<string, { availableStock: number, currentStock: number }> = {};
    
    if (comboSkus.length > 0) {
      const components = await prisma.comboComponent.findMany({
        where: { storeId, comboSku: { in: comboSkus } },
        include: {
          componentItem: {
            select: { availableStock: true, currentStock: true }
          }
        }
      });

      // Group by comboSku and find the limiting component
      const comboGroups = components.reduce((acc: any, curr) => {
        if (!acc[curr.comboSku]) acc[curr.comboSku] = [];
        acc[curr.comboSku].push(curr);
        return acc;
      }, {});

      for (const comboSku of Object.keys(comboGroups)) {
        const comps = comboGroups[comboSku];
        let maxAvailable = Infinity;
        let maxCurrent = Infinity;
        
        for (const comp of comps) {
          const qtyRequired = comp.quantity || 1;
          const compAvail = Math.floor((comp.componentItem?.availableStock || 0) / qtyRequired);
          const compCurr = Math.floor((comp.componentItem?.currentStock || 0) / qtyRequired);
          
          if (compAvail < maxAvailable) maxAvailable = compAvail;
          if (compCurr < maxCurrent) maxCurrent = compCurr;
        }
        
        comboStockMap[comboSku] = {
          availableStock: maxAvailable === Infinity ? 0 : maxAvailable,
          currentStock: maxCurrent === Infinity ? 0 : maxCurrent,
        };
      }
    }

    const result = items.map((item) => {
      const tax = taxMap[item.sku];
      
      // Use calculated stock for combos, otherwise use raw DB stock
      const availableStock = item.type === "COMBO" && comboStockMap[item.sku]
        ? comboStockMap[item.sku].availableStock
        : item.availableStock;
        
      const currentStock = item.type === "COMBO" && comboStockMap[item.sku]
        ? comboStockMap[item.sku].currentStock
        : item.currentStock;

      return {
        sku: item.sku,
        name: item.name,
        type: item.type,
        unit: item.unit,
        availableStock,
        currentStock,
        avgUnitCost: item.avgUnitCost,
        // Selling price: use overridePrice if set, else avgUnitCost as baseline
        sellingPrice: tax?.overridePrice ?? item.avgUnitCost,
        taxRate: tax?.taxRate ?? 18,
        hsnCode: tax?.hsnCode ?? "",
        isTaxInclusive: tax?.isTaxInclusive ?? true,
      };
    });

    return NextResponse.json({ success: true, products: result });
  } catch (error: any) {
    console.error("[Billing Products Error]", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
