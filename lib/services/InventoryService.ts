import { prisma } from "../prisma";

export interface DeductSaleableInventoryParams {
  storeId: string;
  orderId?: string;               // VOOP ShopifyOrder.id or shopifyOrderId
  shopifyOrderId?: string;        // Shopify numeric order id
  orderNumber?: string;           // e.g. "1972"
  orderLineId?: string;           // ShopifyOrderItem.shopifyLineItemId
  shopifyLineItemId?: string;     // alias for orderLineId
  sku: string;                    // Raw SKU (Single or Combo)
  quantity: number;               // Requested quantity to deduct for this event
  source: "SHOPIFY_FULFILLMENT" | "OUTWARD_SCAN";
  referenceId?: string;           // orderNumber for fulfillment, AWB for outward
  shipmentId?: string;            // AWB or shipment ID
  awb?: string;                   // AWB
  notes?: string;
  userName?: string;
  fulfillmentId?: string;
  tx?: any;
}

export interface DeductSaleableInventoryResult {
  success: boolean;
  deductedQuantity: number;
  alreadyDeducted: boolean;
  previouslyDeducted: number;
  remainingEligible: number;
  isCombo: boolean;
  deductedComponents: Array<{ sku: string; quantity: number }>;
  message?: string;
  unmappedSku?: boolean;
}

export class InventoryService {
  /**
   * Get complete SKU-based Physical Inventory Overview
   * Differentiates SINGLE items (own physical stock) vs COMBO items (0 physical stock, derived availability)
   */
  static async getInventoryOverview(
    storeId: string,
    options?: { days?: number; limit?: number; offset?: number }
  ) {
    // 1. VOOP Stock Items with relations
    let stockItemsRaw = await prisma.stockItem.findMany({
      where: { storeId },
      include: {
        comboComponents: {
          include: {
            componentItem: true,
          },
        },
        componentInCombos: true,
      },
      orderBy: [{ type: "asc" }, { category: "asc" }, { currentStock: "asc" }],
    });

    // Auto-seed: if store has 0 physical stock items, but has synced Shopify variants, automatically import SKUs
    if (stockItemsRaw.length === 0) {
      const variantCount = await prisma.shopifyVariant.count({ where: { storeId } });
      if (variantCount > 0) {
        try {
          await this.syncItemsFromShopify(storeId);
          stockItemsRaw = await prisma.stockItem.findMany({
            where: { storeId },
            include: {
              comboComponents: {
                include: {
                  componentItem: true,
                },
              },
              componentInCombos: true,
            },
            orderBy: [{ type: "asc" }, { category: "asc" }, { currentStock: "asc" }],
          });
        } catch (seedErr) {
          console.error("[getInventoryOverview] Auto-seed physical inventory error:", seedErr);
        }
      }
    }

    // 2. Fetch all Shopify catalog variants to resolve canonical product titles
    const shopifyVariants = await prisma.shopifyVariant.findMany({
      where: { storeId },
      include: { product: true },
      orderBy: { inventoryQuantity: "desc" },
    });

    const variantBySku = new Map<string, (typeof shopifyVariants)[0]>();
    shopifyVariants.forEach((v) => {
      if (v.sku) {
        variantBySku.set(v.sku.toUpperCase().trim(), v);
      }
    });

    // Map Stock Items & Calculate Derived Availability for Combos
    const stockItemMap = new Map();
    stockItemsRaw.forEach((s) => stockItemMap.set(s.sku.toUpperCase(), s));

    const stockItems = stockItemsRaw.map((s) => {
      if (s.type === "COMBO") {
        // Calculate derived availability from limiting component
        let derivedStock = 0;
        let derivedUnitCost = 0;
        let derivedSellingPrice = 0;

        if (s.comboComponents && s.comboComponents.length > 0) {
          const availabilityPerComponent = s.comboComponents.map((c) => {
            const compStock = c.componentItem ? c.componentItem.currentStock : (stockItemMap.get(c.componentSku.toUpperCase())?.currentStock || 0);
            const reqQty = Math.max(1, c.quantity || 1);
            return Math.floor(compStock / reqQty);
          });
          derivedStock = Math.max(0, Math.min(...availabilityPerComponent));

          derivedUnitCost = s.comboComponents.reduce((acc, c) => {
            const compCost = c.componentItem
              ? (c.componentItem.costPrice || c.componentItem.avgUnitCost || 0)
              : (stockItemMap.get(c.componentSku.toUpperCase())?.costPrice || stockItemMap.get(c.componentSku.toUpperCase())?.avgUnitCost || 0);
            return acc + (c.quantity * compCost);
          }, 0);

          derivedSellingPrice = s.comboComponents.reduce((acc, c) => {
            const compVariant = variantBySku.get(c.componentSku.toUpperCase().trim());
            const compSell =
              compVariant?.price ||
              (c.componentItem ? c.componentItem.sellingPrice : 0) ||
              (stockItemMap.get(c.componentSku.toUpperCase())?.sellingPrice || 0) ||
              (c.componentItem ? c.componentItem.avgUnitCost : 0);
            return acc + (c.quantity * compSell);
          }, 0);
        }

        const matchedVariant = variantBySku.get(s.sku.toUpperCase().trim());
        const effectiveSellingPrice = matchedVariant?.price || s.sellingPrice || derivedSellingPrice || s.avgUnitCost;

        return {
          ...s,
          currentStock: 0, // Invariant: Combos hold zero physical inventory
          availableStock: 0,
          derivedStock,
          derivedUnitCost,
          derivedSellingPrice,
          sellingPrice: effectiveSellingPrice,
          unitCostWithoutProfit: s.costPrice || derivedUnitCost,
          isCombo: true,
        };
      }

      // Single items: Resolve canonical Shopify Product Title for ITEM DESCRIPTION
      let displayName = s.name;
      const matchedVariant = variantBySku.get(s.sku.toUpperCase().trim());
      if (matchedVariant?.product?.title) {
        const prodTitle = matchedVariant.product.title.trim();
        const varTitle = matchedVariant.title?.trim();
        const isMeaningful =
          varTitle &&
          varTitle !== "Default Title" &&
          varTitle.toLowerCase() !== "default" &&
          !prodTitle.toLowerCase().includes(varTitle.toLowerCase());
        displayName = isMeaningful ? `${prodTitle} — ${varTitle}` : prodTitle;
      }

      const effectiveSellingPrice = matchedVariant?.price ?? s.sellingPrice ?? s.avgUnitCost ?? 0;
      const effectiveCostPrice = s.costPrice ?? s.avgUnitCost ?? 0;

      return {
        ...s,
        name: displayName,
        isCombo: false,
        derivedStock: s.currentStock,
        derivedUnitCost: effectiveCostPrice,
        sellingPrice: effectiveSellingPrice,
        unitCostWithoutProfit: effectiveCostPrice,
      };
    });

    // 2. Recent Inventory Ledger Transactions (Strict 7-Day Window)
    const days = options?.days ?? 7;
    const dateBoundary = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
    const recentLedger = await prisma.inventoryLedger.findMany({
      where: {
        storeId,
        createdAt: {
          gte: dateBoundary,
          lte: new Date(),
        },
      },
      ...(options?.limit ? { take: options.limit } : {}),
      ...(options?.offset ? { skip: options.offset } : {}),
      orderBy: { createdAt: "desc" },
      include: {
        stockItem: true,
      },
    });

    // 3. Active Shopify Catalog Variants (for reference & mapping status)
    const activeShopifyVariants = shopifyVariants.filter((v) => v.product?.status === "ACTIVE");

    const mappedVariants = activeShopifyVariants.map((v) => {
      const rawSku = (v.sku || "").trim().toUpperCase();
      const existingStockItem = stockItemMap.get(rawSku);
      
      let isCombo = false;
      let components: string[] = [];
      let isMapped = false;

      if (existingStockItem) {
        isCombo = existingStockItem.type === "COMBO";
        if (isCombo && existingStockItem.comboComponents) {
          components = existingStockItem.comboComponents.map((c: any) => `${c.componentSku} (×${c.quantity})`);
          isMapped = existingStockItem.comboComponents.length > 0;
        } else {
          isMapped = true;
        }
      } else {
        // Check if SKU is a combo string dynamically against store catalog
        const analysis = this.parseComboSegments(rawSku, variantBySku);
        isCombo = analysis.isCombo;
        components = analysis.components.map((c) => `${c.componentSku} (×${c.quantity})`);
        isMapped = isCombo ? components.length > 0 && analysis.components.every((c) => stockItemMap.has(c.componentSku)) : true;
      }

      return {
        shopifyVariantId: v.shopifyVariantId,
        productTitle: v.product.title,
        variantTitle: v.title,
        sku: v.sku || "NO_SKU",
        price: v.price,
        isCombo,
        components,
        isMapped,
        stockStatus: isMapped ? "MAPPED" : "MAPPING_REQUIRED",
      };
    });

    // Valuations strictly on physical SINGLE stock items
    const singleItems = stockItems.filter((s) => s.type !== "COMBO");
    const totalPhysicalUnits = singleItems.reduce((acc, s) => acc + (s.currentStock || 0), 0);
    const totalPhysicalValue = singleItems.reduce((acc, s) => acc + (s.currentStock || 0) * (s.avgUnitCost || 0), 0);
    const totalDamagedUnits = singleItems.reduce((acc, s) => acc + (s.damagedStock || 0), 0);
    const totalDamagedValue = singleItems.reduce((acc, s) => acc + (s.damagedStock || 0) * (s.avgUnitCost || 0), 0);
    const lowStockItems = singleItems.filter((s) => s.currentStock <= s.reorderLevel);

    return {
      summary: {
        totalStockSkus: stockItems.length,
        singleItemsCount: singleItems.length,
        combosCount: stockItems.length - singleItems.length,
        totalPhysicalUnits,
        totalPhysicalValue,
        totalDamagedUnits,
        totalDamagedValue,
        lowStockCount: lowStockItems.length,
        shopifyVariantsCount: shopifyVariants.length,
        mappedVariantsCount: mappedVariants.filter((m) => m.isMapped).length,
      },
      stockItems,
      recentLedger,
      mappedVariants,
    };
  }

  /**
   * 100% SKU-Agnostic Dynamic Combo Detection & Parsing
   * Inspects any SKU against the store's Shopify-synced catalog.
   * Delimiter is '-' or '+' (convention).
   * No hardcoded SKU names anywhere.
   */
  static parseComboSegments(
    rawSku: string,
    catalogVariantsMap: Map<string, any>
  ): { isCombo: boolean; components: Array<{ componentSku: string; quantity: number; name: string; unitCost: number }> } {
    const sku = (rawSku || "").trim().toUpperCase();
    if (!sku || sku === "NULL" || sku === "NO-SKU" || sku === "NO_SKU" || sku.startsWith("VAR-")) {
      return { isCombo: false, components: [] };
    }

    if (!sku.includes("-") && !sku.includes("+")) {
      return { isCombo: false, components: [] };
    }

    const rawTokens = sku.split(/[-+]/).map((s) => s.trim()).filter(Boolean);
    if (rawTokens.length <= 1) {
      return { isCombo: false, components: [] };
    }

    const matchedComponents: Array<{ componentSku: string; quantity: number; name: string; unitCost: number }> = [];
    let matchedCatalogCount = 0;
    let i = 0;

    while (i < rawTokens.length) {
      let token = rawTokens[i];
      let qty = 1;

      // Check for standalone quantity token like "2X", "3X" preceding a SKU
      const standaloneMultiplier = token.match(/^(\d+)[X*]$/i);
      if (standaloneMultiplier && i + 1 < rawTokens.length) {
        qty = Math.max(1, parseInt(standaloneMultiplier[1], 10));
        i += 1;
        token = rawTokens[i];
      }

      // Check for quantity multiplier e.g. 2XABC, ABCX2, 2*ABC
      const prefixMatch = token.match(/^(\d+)[X*](.+)$/i);
      const suffixMatch = token.match(/^(.+)[X*](\d+)$/i);
      if (prefixMatch) {
        qty = Math.max(1, parseInt(prefixMatch[1], 10));
        token = prefixMatch[2].trim().toUpperCase();
      } else if (suffixMatch) {
        token = suffixMatch[1].trim().toUpperCase();
        qty = Math.max(1, parseInt(suffixMatch[2], 10));
      }

      // Check if current token matches catalog directly
      let matchedVariant = catalogVariantsMap.get(token);
      let matchedSku = token;

      // Check greedy 2-token join if single token not found in catalog (e.g. token1-token2)
      if (!matchedVariant && i + 1 < rawTokens.length) {
        const twoToken = `${token}-${rawTokens[i + 1]}`;
        const matchTwo = catalogVariantsMap.get(twoToken);
        if (matchTwo) {
          matchedVariant = matchTwo;
          matchedSku = twoToken;
          i += 1; // consume extra token
        }
      }

      // Fuzzy / stem match against catalog if still not found
      if (!matchedVariant) {
        catalogVariantsMap.forEach((v, catSku) => {
          if (!matchedVariant && catSku !== sku && (catSku.startsWith(token) || token.startsWith(catSku))) {
            matchedVariant = v;
            matchedSku = catSku;
          }
        });
      }

      if (matchedVariant) {
        matchedCatalogCount++;
      }

      let compName = matchedSku;
      if (matchedVariant?.product?.title) {
        const prodTitle = matchedVariant.product.title.trim();
        const varTitle = matchedVariant.title?.trim();
        const isMeaningful =
          varTitle &&
          varTitle !== "Default Title" &&
          varTitle.toLowerCase() !== "default" &&
          !prodTitle.toLowerCase().includes(varTitle.toLowerCase());
        compName = isMeaningful ? `${prodTitle} — ${varTitle}` : prodTitle;
      }

      matchedComponents.push({
        componentSku: matchedSku,
        quantity: qty,
        name: compName,
        unitCost: matchedVariant?.price || 0,
      });

      i++;
    }

    // A delimited SKU is a COMBO if:
    // 1. At least 2 candidate components were parsed, AND
    // 2. Either all components exist in the catalog, OR at least 2 catalog variants matched,
    //    OR at least 1 catalog variant matched in a 2-4 component recipe.
    const isCombo =
      matchedComponents.length >= 2 &&
      (matchedCatalogCount >= 2 ||
        (matchedCatalogCount >= 1 && matchedCatalogCount === matchedComponents.length) ||
        (matchedCatalogCount >= 1 && matchedComponents.length <= 4));

    if (!isCombo) {
      return { isCombo: false, components: [] };
    }

    return { isCombo: true, components: matchedComponents };
  }

  /**
   * Async helper to inspect and parse combo with catalog variants from DB or map
   */
  static async detectAndParseCombo(
    storeId: string,
    rawSku: string,
    options?: { catalogVariants?: any[]; stockItemMap?: Map<string, any>; tx?: any }
  ): Promise<{
    isCombo: boolean;
    effectiveSku: string;
    components: Array<{ componentSku: string; quantity: number; name: string; unitCost: number }>;
  }> {
    const effectiveSku = (rawSku || "").trim().toUpperCase();
    if (!effectiveSku || effectiveSku === "NULL" || effectiveSku === "NO-SKU" || effectiveSku === "NO_SKU" || effectiveSku.startsWith("VAR-")) {
      return { isCombo: false, effectiveSku, components: [] };
    }

    const db = options?.tx || prisma;

    // 1. Check if already configured in StockItem as COMBO
    let existing: any = null;
    try {
      existing = options?.stockItemMap?.get(effectiveSku) || (db?.stockItem ? await db.stockItem.findUnique({
        where: { storeId_sku: { storeId, sku: effectiveSku } },
        include: { comboComponents: { include: { componentItem: true } } },
      }) : null);
    } catch {
      existing = null;
    }

    if (existing?.type === "COMBO" && existing.comboComponents && existing.comboComponents.length > 0) {
      return {
        isCombo: true,
        effectiveSku,
        components: existing.comboComponents.map((c: any) => ({
          componentSku: c.componentSku.toUpperCase(),
          quantity: Math.max(1, Number(c.quantity) || 1),
          name: c.componentItem?.name || c.componentSku,
          unitCost: c.componentItem?.avgUnitCost || 0,
        })),
      };
    }

    // 2. Fetch catalog variants if not provided
    let catalogVariants = options?.catalogVariants;
    if (!catalogVariants) {
      try {
        catalogVariants = db?.shopifyVariant ? await db.shopifyVariant.findMany({
          where: { storeId },
          include: { product: true },
        }) : [];
      } catch {
        catalogVariants = [];
      }
    }

    const catalogVariantsMap = new Map<string, any>();
    (catalogVariants || []).forEach((v: any) => {
      if (v.sku) {
        catalogVariantsMap.set(v.sku.trim().toUpperCase(), v);
      }
    });

    // 3. Dynamic delimiter & catalog analysis
    const parsed = this.parseComboSegments(effectiveSku, catalogVariantsMap);
    return {
      isCombo: parsed.isCombo,
      effectiveSku,
      components: parsed.components,
    };
  }

  /**
   * CANONICAL SALEABLE INVENTORY DEDUCTION SERVICE
   * 
   * Single source of truth for all physical sale inventory deductions across:
   * - Shopify Fulfillment Sync / Webhook
   * - Warehouse Outward Scanner
   * 
   * Guarantees:
   * 1. Multi-tenant store isolation on every query/mutation.
   * 2. Atomic database transaction with row-level locking on ShopifyOrderItem to prevent race conditions.
   * 3. Idempotent deduction: reconciles total quantity already deducted across SALE_FULFILLMENT and OUTWARD_SCAN.
   * 4. Partial quantity support: deducts only remaining eligible quantity, never exceeding ordered/fulfilled quantity.
   * 5. Combo / BOM support: decomposes combos into components and tracks deduction at actual component SKU level.
   * 6. Preserves historical ledger records (never deletes or overwrites).
   * 7. Event order independence: Fulfillment -> Outward and Outward -> Fulfillment yield identical stock results.
   */
  static async deductSaleableInventory(
    params: DeductSaleableInventoryParams
  ): Promise<DeductSaleableInventoryResult> {
    const { storeId } = params;
    if (!storeId) {
      return {
        success: false,
        deductedQuantity: 0,
        alreadyDeducted: false,
        previouslyDeducted: 0,
        remainingEligible: 0,
        isCombo: false,
        deductedComponents: [],
        message: "Missing storeId",
      };
    }

    const rawSku = (params.sku || "").trim().toUpperCase();
    if (!rawSku || rawSku === "NULL" || rawSku === "NO-SKU" || rawSku === "NO_SKU" || params.quantity <= 0) {
      return {
        success: false,
        deductedQuantity: 0,
        alreadyDeducted: false,
        previouslyDeducted: 0,
        remainingEligible: 0,
        isCombo: false,
        deductedComponents: [],
        message: "Invalid SKU or non-positive quantity",
      };
    }

    const orderLineId = params.orderLineId || params.shopifyLineItemId;
    const isOutward = params.source === "OUTWARD_SCAN";
    const refId = params.referenceId || params.awb || params.orderNumber || "UNKNOWN";

    const runInTx = async (tx: any) => {
      // 1. Resolve target ShopifyOrderItem if line identifier is available
      let lineItem = null;
      if (orderLineId) {
        lineItem = await tx.shopifyOrderItem.findFirst({
          where: {
            storeId,
            shopifyLineItemId: orderLineId,
            ...(params.orderId
              ? {
                  OR: [
                    { orderId: params.orderId },
                    { shopifyOrderId: params.orderId },
                    ...(params.shopifyOrderId ? [{ shopifyOrderId: params.shopifyOrderId }] : []),
                  ],
                }
              : {}),
          },
          include: { order: true },
        });

        // Concurrency protection: acquire row lock on lineItem in PostgreSQL
        if (lineItem) {
          try {
            await tx.$queryRawUnsafe(
              `SELECT id FROM "shopify_order_items" WHERE id = $1 FOR UPDATE`,
              lineItem.id
            );
            // Refresh lineItem after acquiring lock
            lineItem = await tx.shopifyOrderItem.findUnique({
              where: { id: lineItem.id },
              include: { order: true },
            });
          } catch (lockErr) {
            // In case driver or DB doesn't support FOR UPDATE in certain test environments, proceed safely
          }
        }
      }

      // If lineItem is still null, try finding by orderNumber or orderId + sku
      if (!lineItem && (params.orderNumber || params.orderId)) {
        lineItem = await tx.shopifyOrderItem.findFirst({
          where: {
            storeId,
            sku: rawSku,
            order: {
              OR: [
                ...(params.orderNumber ? [{ orderNumber: params.orderNumber }, { name: params.orderNumber }, { name: `#${params.orderNumber}` }] : []),
                ...(params.orderId ? [{ id: params.orderId }, { shopifyOrderId: params.orderId }] : []),
              ],
            },
          },
          include: { order: true },
        });

        if (lineItem) {
          try {
            await tx.$queryRawUnsafe(
              `SELECT id FROM "shopify_order_items" WHERE id = $1 FOR UPDATE`,
              lineItem.id
            );
            lineItem = await tx.shopifyOrderItem.findUnique({
              where: { id: lineItem.id },
              include: { order: true },
            });
          } catch (lockErr) {}
        }
      }

      const canonicalOrderLineId = lineItem?.shopifyLineItemId || orderLineId;
      const canonicalOrderId = lineItem?.orderId || params.orderId;
      const canonicalOrderNumber = params.orderNumber || lineItem?.order?.orderNumber || "UNKNOWN";
      const maxAllowedLineQty = lineItem ? lineItem.quantity : params.quantity;

      // 2. Reconcile Total Deductions Already Performed for this Order Line
      // Check both lineItem.deductedQuantity and ledger entries
      const recordedLineDeducted = lineItem ? (lineItem.deductedQuantity || 0) : 0;

      let ledgerDeductedUnits = 0;
      if (canonicalOrderLineId) {
        const priorLedgerEntries = await tx.inventoryLedger.findMany({
          where: {
            storeId,
            orderLineId: canonicalOrderLineId,
            type: { in: ["SALE_FULFILLMENT", "OUTWARD_SCAN"] },
            quantity: { lt: 0 },
          },
        });
        ledgerDeductedUnits = Math.abs(
          priorLedgerEntries.reduce((sum: number, e: any) => sum + e.quantity, 0)
        );
      }

      // Authoritative already deducted quantity across line item and ledger
      const alreadyDeducted = Math.max(recordedLineDeducted, ledgerDeductedUnits);
      const remainingEligible = Math.max(0, maxAllowedLineQty - alreadyDeducted);

      if (remainingEligible <= 0) {
        // Already fully deducted by earlier fulfillment or historical scan
        return {
          success: true,
          deductedQuantity: 0,
          alreadyDeducted: true,
          previouslyDeducted: alreadyDeducted,
          remainingEligible: 0,
          isCombo: false,
          deductedComponents: [],
          message: `Order line quantity (${maxAllowedLineQty}) has already been fully deducted (${alreadyDeducted} units previously accounted for)`,
        };
      }

      // 3. Check canonical Idempotency Key
      // Include fulfillmentId if available, or offset of already deducted units to distinguish partial fulfillments
      const idempotencyKey = params.fulfillmentId
        ? `shopify_fulfillment_${storeId}_f_${params.fulfillmentId}_${canonicalOrderLineId || "noline"}_${rawSku}`
        : `${params.source.toLowerCase()}_${storeId}_${refId}_${canonicalOrderLineId || "noline"}_${rawSku}_offset_${alreadyDeducted}`;

      const existingLedgerWithKey = await tx.inventoryLedger.findFirst({
        where: { storeId, idempotencyKey },
      });

      if (existingLedgerWithKey) {
        return {
          success: true,
          deductedQuantity: 0,
          alreadyDeducted: true,
          previouslyDeducted: alreadyDeducted,
          remainingEligible: 0,
          isCombo: false,
          deductedComponents: [],
          message: `Idempotent duplicate event: ${idempotencyKey} already recorded`,
        };
      }

      // Calculate quantity to deduct in this operation (partial quantity support)
      const quantityToDeductNow = Math.min(params.quantity, remainingEligible);
      if (quantityToDeductNow <= 0) {
        return {
          success: true,
          deductedQuantity: 0,
          alreadyDeducted: true,
          previouslyDeducted: alreadyDeducted,
          remainingEligible: 0,
          isCombo: false,
          deductedComponents: [],
          message: "No remaining quantity eligible for deduction",
        };
      }

      // 4. Validate SKU Mapping and Resolve StockItem / BOM Recipe
      let stockItem = await tx.stockItem.findUnique({
        where: { storeId_sku: { storeId, sku: rawSku } },
        include: { comboComponents: { include: { componentItem: true } } },
      });

      let isComboRecipe = false;
      let comboComponentsToDeduct: Array<{ componentSku: string; quantity: number; avgUnitCost: number }> = [];

      if (stockItem) {
        if (stockItem.type === "COMBO") {
          isComboRecipe = true;
          let components = stockItem.comboComponents || [];
          if (components.length === 0) {
            const comboAnalysis = await this.detectAndParseCombo(storeId, rawSku, { tx });
            if (comboAnalysis.isCombo && comboAnalysis.components.length > 0) {
              for (const comp of comboAnalysis.components) {
                const compItem = await tx.stockItem.findUnique({
                  where: { storeId_sku: { storeId, sku: comp.componentSku } },
                });
                if (!compItem) {
                  return await InventoryService.handleUnmappedSku(
                    tx,
                    storeId,
                    lineItem,
                    rawSku,
                    canonicalOrderNumber,
                    canonicalOrderLineId,
                    alreadyDeducted,
                    remainingEligible,
                    `Component SKU "${comp.componentSku}" for Combo "${rawSku}" is not mapped in VOOP inventory.`
                  );
                }
                comboComponentsToDeduct.push({
                  componentSku: comp.componentSku,
                  quantity: comp.quantity,
                  avgUnitCost: compItem.avgUnitCost || 0,
                });
              }
            } else {
              return await InventoryService.handleUnmappedSku(
                tx,
                storeId,
                lineItem,
                rawSku,
                canonicalOrderNumber,
                canonicalOrderLineId,
                alreadyDeducted,
                remainingEligible,
                `Combo SKU "${rawSku}" has no components configured in VOOP inventory.`
              );
            }
          } else {
            for (const comp of components) {
              let compItem = comp.componentItem;
              if (!compItem) {
                compItem = await tx.stockItem.findUnique({
                  where: { storeId_sku: { storeId, sku: comp.componentSku } },
                });
                if (!compItem) {
                  return await InventoryService.handleUnmappedSku(
                    tx,
                    storeId,
                    lineItem,
                    rawSku,
                    canonicalOrderNumber,
                    canonicalOrderLineId,
                    alreadyDeducted,
                    remainingEligible,
                    `Component SKU "${comp.componentSku}" for Combo "${rawSku}" is not mapped in VOOP inventory.`
                  );
                }
              }
              comboComponentsToDeduct.push({
                componentSku: comp.componentSku,
                quantity: comp.quantity,
                avgUnitCost: compItem?.avgUnitCost || 0,
              });
            }
          }
        }
      } else {
        // stockItem does not exist. Check if it is a COMBO recipe whose components exist in this store
        const comboAnalysis = await this.detectAndParseCombo(storeId, rawSku, { tx });
        if (comboAnalysis.isCombo && comboAnalysis.components.length > 0) {
          let allComponentsExist = true;
          for (const comp of comboAnalysis.components) {
            const compItem = await tx.stockItem.findUnique({
              where: { storeId_sku: { storeId, sku: comp.componentSku } },
            });
            if (!compItem) {
              allComponentsExist = false;
              break;
            }
            comboComponentsToDeduct.push({
              componentSku: comp.componentSku,
              quantity: comp.quantity,
              avgUnitCost: compItem.avgUnitCost || 0,
            });
          }

          if (allComponentsExist && comboComponentsToDeduct.length > 0) {
            isComboRecipe = true;
            stockItem = await tx.stockItem.create({
              data: {
                storeId,
                sku: rawSku,
                name: rawSku,
                type: "COMBO",
                category: "FINISHED_GOODS",
                unit: "pcs",
                currentStock: 0,
                damagedStock: 0,
                availableStock: 0,
                minStockLevel: 0,
                reorderLevel: 0,
              },
            });
            for (const comp of comboAnalysis.components) {
              await tx.comboComponent.upsert({
                where: {
                  storeId_comboSku_componentSku: {
                    storeId,
                    comboSku: rawSku,
                    componentSku: comp.componentSku,
                  },
                },
                create: {
                  storeId,
                  comboSku: rawSku,
                  componentSku: comp.componentSku,
                  quantity: comp.quantity,
                },
                update: { quantity: comp.quantity },
              });
            }
          } else {
            return await InventoryService.handleUnmappedSku(
              tx,
              storeId,
              lineItem,
              rawSku,
              canonicalOrderNumber,
              canonicalOrderLineId,
              alreadyDeducted,
              remainingEligible,
              `SKU "${rawSku}" is not mapped in VOOP inventory.`
            );
          }
        } else {
          // Single SKU is NOT mapped in StockItem!
          return await InventoryService.handleUnmappedSku(
            tx,
            storeId,
            lineItem,
            rawSku,
            canonicalOrderNumber,
            canonicalOrderLineId,
            alreadyDeducted,
            remainingEligible,
            `SKU "${rawSku}" is not mapped in VOOP inventory.`
          );
        }
      }

      const deductedComponents: Array<{ sku: string; quantity: number }> = [];

      // 5. Execute Deduction
      if (!isComboRecipe && stockItem) {
        const updated = await tx.stockItem.update({
          where: { storeId_sku: { storeId, sku: stockItem.sku } },
          data: {
            currentStock: { decrement: quantityToDeductNow },
            availableStock: { decrement: quantityToDeductNow },
          },
        });

        await tx.inventoryLedger.create({
          data: {
            storeId,
            sku: stockItem.sku,
            type: "SALE_FULFILLMENT",
            inventoryBucket: "SALEABLE",
            quantity: -quantityToDeductNow,
            unitCost: stockItem.avgUnitCost || 0,
            balanceAfter: updated.currentStock,
            referenceType: "SHOPIFY_FULFILLMENT",
            referenceId: refId,
            orderId: canonicalOrderId || undefined,
            orderLineId: canonicalOrderLineId || undefined,
            fulfillmentId: params.fulfillmentId || undefined,
            shipmentId: params.shipmentId || undefined,
            idempotencyKey,
            createdBy: params.userName || "System",
            notes: params.notes || `Auto deduction: Order #${canonicalOrderNumber} fulfilled on Shopify (${quantityToDeductNow} unit(s))`,
          },
        });

        deductedComponents.push({ sku: stockItem.sku, quantity: quantityToDeductNow });
      } else {
        // COMBO Deduction
        for (const comp of comboComponentsToDeduct) {
          const compMultiplier = Math.max(1, comp.quantity || 1);
          const deductQty = compMultiplier * quantityToDeductNow;

          const updatedComp = await tx.stockItem.update({
            where: { storeId_sku: { storeId, sku: comp.componentSku } },
            data: {
              currentStock: { decrement: deductQty },
              availableStock: { decrement: deductQty },
            },
          });

          const compIdempotencyKey = `${idempotencyKey}_${comp.componentSku}`;

          await tx.inventoryLedger.create({
            data: {
              storeId,
              sku: comp.componentSku,
              type: "SALE_FULFILLMENT",
              inventoryBucket: "SALEABLE",
              quantity: -deductQty,
              unitCost: comp.avgUnitCost || 0,
              balanceAfter: updatedComp.currentStock,
              referenceType: "SHOPIFY_FULFILLMENT",
              referenceId: refId,
              orderId: canonicalOrderId || undefined,
              orderLineId: canonicalOrderLineId || undefined,
              fulfillmentId: params.fulfillmentId || undefined,
              shipmentId: params.shipmentId || undefined,
              idempotencyKey: compIdempotencyKey,
              createdBy: params.userName || "System",
              notes: params.notes || `Fulfillment deduction of ${deductQty} component(s) (${comp.componentSku} × ${compMultiplier}) for Combo ${rawSku} in Order #${canonicalOrderNumber}`,
            },
          });

          deductedComponents.push({ sku: comp.componentSku, quantity: deductQty });
        }
      }

      // 6. Update ShopifyOrderItem state
      if (lineItem) {
        const newDeductedQuantity = alreadyDeducted + quantityToDeductNow;
        const isFullyDeducted = newDeductedQuantity >= lineItem.quantity;
        await tx.shopifyOrderItem.update({
          where: { id: lineItem.id },
          data: {
            deductedQuantity: newDeductedQuantity,
            isDeducted: isFullyDeducted,
            deductionStatus: isFullyDeducted ? "DEDUCTED" : "PARTIALLY_DEDUCTED",
            deductedComponents: JSON.stringify(deductedComponents),
          },
        });
      }

      return {
        success: true,
        deductedQuantity: quantityToDeductNow,
        alreadyDeducted: false,
        previouslyDeducted: alreadyDeducted,
        remainingEligible: Math.max(0, remainingEligible - quantityToDeductNow),
        isCombo: isComboRecipe,
        deductedComponents,
      };
    };

    if (params.tx) {
      return await runInTx(params.tx);
    }
    return await prisma.$transaction(runInTx);
  }

  /**
   * Safe Handler for Unmapped or Invalid SKUs
   * Flags shopifyOrderItem with MAPPING_REQUIRED, logs an actionable error, and returns
   * without creating artificial stock items or deducting stock.
   */
  private static async handleUnmappedSku(
    tx: any,
    storeId: string,
    lineItem: any,
    sku: string,
    orderNumber: string,
    orderLineId: string | undefined,
    previouslyDeducted: number,
    remainingEligible: number,
    detailMessage: string
  ): Promise<DeductSaleableInventoryResult> {
    if (lineItem) {
      try {
        await tx.shopifyOrderItem.update({
          where: { id: lineItem.id },
          data: {
            deductionStatus: "MAPPING_REQUIRED",
          },
        });
      } catch (err) {
        console.error(`[VOOP INVENTORY] Failed to mark order item ${lineItem.id} as MAPPING_REQUIRED:`, err);
      }
    }

    console.error(
      `[VOOP INVENTORY ERROR] Unmapped SKU "${sku}" on Order #${orderNumber} (Store: ${storeId}, LineItem: ${orderLineId || "N/A"}). ${detailMessage} No inventory was deducted. Please map this SKU in VOOP inventory.`
    );

    return {
      success: false,
      unmappedSku: true,
      deductedQuantity: 0,
      alreadyDeducted: false,
      previouslyDeducted,
      remainingEligible,
      isCombo: false,
      deductedComponents: [],
      message: `Actionable Error: Unmapped SKU "${sku}" on Order #${orderNumber}. ${detailMessage} No inventory was deducted.`,
    };
  }

  /**
   * Centralized Order Line Fulfillment Physical Inventory Deduction
   * Delegates to canonical deductSaleableInventory for backward compatibility.
   */
  static async deductStockForOrderLine(
    storeId: string,
    params: {
      sku: string;
      quantityToDeduct: number;
      orderNumber: string;
      shopifyOrderId?: string;
      shopifyLineItemId?: string;
      notes?: string;
    }
  ): Promise<{
    success: boolean;
    isCombo: boolean;
    deductedComponents: Array<{ sku: string; quantity: number }>;
    deductedQuantity?: number;
    alreadyDeducted?: boolean;
  }> {
    const res = await this.deductSaleableInventory({
      storeId,
      sku: params.sku,
      quantity: params.quantityToDeduct,
      orderNumber: params.orderNumber,
      shopifyOrderId: params.shopifyOrderId,
      orderLineId: params.shopifyLineItemId,
      source: "SHOPIFY_FULFILLMENT",
      referenceId: params.orderNumber,
      notes: params.notes,
    });

    return {
      success: res.success,
      isCombo: res.isCombo,
      deductedComponents: res.deductedComponents,
      deductedQuantity: res.deductedQuantity,
      alreadyDeducted: res.alreadyDeducted,
    };
  }

  /**
   * Centralized Order Line Fulfillment Physical Inventory Reversal
   * Handles both SINGLE items and COMBO items dynamically.
   * Atomic, idempotent, and store-isolated.
   *
   * Invariants:
   * 1. Only restores quantities that were actually deducted and are legitimately cancelled/voided.
   * 2. Calculates remainingReversibleQty = originalDeductedQty - alreadyReversedQty.
   * 3. Creates linked SHOPIFY_FULFILLMENT_REVERSAL entry without deleting original deduction.
   * 4. Updates StockItem currentStock and availableStock atomically.
   */
  static async reverseOrderLineFulfillment(
    storeId: string,
    params: {
      orderId?: string;
      shopifyOrderId?: string;
      shopifyLineItemId: string;
      fulfillmentId?: string;
      orderNumber?: string;
      cancelledQty?: number;
      cancellationRef?: string;
      reason?: string;
      notes?: string;
    }
  ): Promise<{
    success: boolean;
    reversed: boolean;
    restoredQuantity: number;
    restoredComponents: Array<{ sku: string; quantity: number }>;
    message?: string;
  }> {
    if (!storeId || !params.shopifyLineItemId) {
      return { success: false, reversed: false, restoredQuantity: 0, restoredComponents: [], message: "Missing storeId or shopifyLineItemId" };
    }

    return await prisma.$transaction(async (tx) => {
      // 1. Find line item record
      const lineItem = await tx.shopifyOrderItem.findFirst({
        where: {
          storeId,
          shopifyLineItemId: params.shopifyLineItemId,
          ...(params.orderId ? { orderId: params.orderId } : {}),
          ...(params.shopifyOrderId ? { shopifyOrderId: params.shopifyOrderId } : {}),
        },
        include: {
          order: true,
        },
      });

      const orderNumber = params.orderNumber || lineItem?.order?.orderNumber || "UNKNOWN";
      const shopifyOrderId = params.shopifyOrderId || lineItem?.shopifyOrderId || lineItem?.order?.shopifyOrderId || "";
      const orderId = params.orderId || lineItem?.orderId || "";

      // 2. Find original deductions for this order line
      const originalDeductions = await tx.inventoryLedger.findMany({
        where: {
          storeId,
          orderLineId: params.shopifyLineItemId,
          type: "SALE_FULFILLMENT",
          quantity: { lt: 0 },
          ...(params.fulfillmentId ? { fulfillmentId: params.fulfillmentId } : {}),
        },
        orderBy: { createdAt: "asc" },
      });

      const deductedUnits = lineItem ? lineItem.deductedQuantity : 0;
      const previouslyReversedUnits = lineItem ? (lineItem.reversedQuantity || 0) : 0;

      // 3. Find existing reversals for this order line
      const existingReversals = await tx.inventoryLedger.findMany({
        where: {
          storeId,
          orderLineId: params.shopifyLineItemId,
          type: "SHOPIFY_FULFILLMENT_REVERSAL",
          quantity: { gt: 0 },
        },
      });

      const reversedPerOrigId = new Map<string, number>();
      let totalReversedQty = 0;
      for (const rev of existingReversals) {
        totalReversedQty += rev.quantity;
        if (rev.originalLedgerEntryId) {
          const cur = reversedPerOrigId.get(rev.originalLedgerEntryId) || 0;
          reversedPerOrigId.set(rev.originalLedgerEntryId, cur + rev.quantity);
        }
      }

      // Calculate remaining reversible line units
      const remainingReversibleUnits = lineItem
        ? Math.max(0, deductedUnits - previouslyReversedUnits)
        : Math.max(0, originalDeductions.reduce((acc, d) => acc + Math.abs(d.quantity), 0) - totalReversedQty);

      if (remainingReversibleUnits <= 0) {
        return {
          success: true,
          reversed: false,
          restoredQuantity: 0,
          restoredComponents: [],
          message: deductedUnits === 0 && originalDeductions.length === 0
            ? "No original deduction found to reverse"
            : "Already fully reversed",
        };
      }

      // Calculate actual units to reverse for this operation
      const unitsToReverse = Math.min(
        remainingReversibleUnits,
        params.cancelledQty !== undefined ? params.cancelledQty : remainingReversibleUnits
      );

      if (unitsToReverse <= 0) {
        return {
          success: true,
          reversed: false,
          restoredQuantity: 0,
          restoredComponents: [],
          message: "Zero quantity to reverse",
        };
      }

      const restoredList: Array<{ sku: string; quantity: number }> = [];

      // 4. Restore inventory based on original ledger entries
      if (originalDeductions.length > 0) {
        const totalDeductedQuantity = deductedUnits > 0
          ? deductedUnits
          : Math.max(1, originalDeductions.reduce((acc, d) => acc + Math.abs(d.quantity), 0));

        for (const orig of originalDeductions) {
          const origMag = Math.abs(orig.quantity);
          const alreadyRevForEntry = reversedPerOrigId.get(orig.id) || 0;
          const maxAvailForEntry = Math.max(0, origMag - alreadyRevForEntry);
          if (maxAvailForEntry <= 0) continue;

          // Component ratio per order line unit
          const compMultiplier = origMag / totalDeductedQuantity;
          const toRestore = Math.min(maxAvailForEntry, Math.round(compMultiplier * unitsToReverse * 1000) / 1000);
          if (toRestore <= 0) continue;

          // Update StockItem balance
          const updatedStock = await tx.stockItem.update({
            where: { storeId_sku: { storeId, sku: orig.sku } },
            data: {
              currentStock: { increment: toRestore },
              availableStock: { increment: toRestore },
            },
          });

          // Create linked reversal ledger row
          const idempotencyKey = `REVERSAL_${storeId}_${orig.id}_${params.cancellationRef || Date.now()}`;
          await tx.inventoryLedger.create({
            data: {
              storeId,
              sku: orig.sku,
              type: "SHOPIFY_FULFILLMENT_REVERSAL",
              inventoryBucket: orig.inventoryBucket || "SALEABLE",
              quantity: toRestore,
              unitCost: orig.unitCost || 0,
              balanceAfter: updatedStock.currentStock,
              referenceType: "SHOPIFY_FULFILLMENT_REVERSAL",
              referenceId: orderNumber,
              orderId: orderId || orig.orderId,
              orderLineId: params.shopifyLineItemId,
              fulfillmentId: params.fulfillmentId || orig.fulfillmentId,
              originalLedgerEntryId: orig.id,
              fulfillmentLineId: orig.fulfillmentLineId,
              reversalReference: params.cancellationRef || "ORDER_CANCELLED",
              idempotencyKey,
              notes: params.notes || `Reversal of ${toRestore} unit(s) for Order #${orderNumber} (${params.reason || "Cancellation"})`,
              createdAt: new Date(),
            },
          });

          restoredList.push({ sku: orig.sku, quantity: toRestore });
          console.log(`[VOOP INVENTORY REVERSAL] storeId=${storeId} orderNumber=${orderNumber} orderLineId=${params.shopifyLineItemId} origLedgerId=${orig.id} sku=${orig.sku} restored=${toRestore}`);
        }
      } else if (lineItem && lineItem.sku && lineItem.sku !== "NULL" && lineItem.sku !== "NO_SKU") {
        // Fallback for line item with recorded deductedQuantity but missing original ledger row
        const updatedStock = await tx.stockItem.update({
          where: { storeId_sku: { storeId, sku: lineItem.sku } },
          data: {
            currentStock: { increment: unitsToReverse },
            availableStock: { increment: unitsToReverse },
          },
        });

        await tx.inventoryLedger.create({
          data: {
            storeId,
            sku: lineItem.sku,
            type: "SHOPIFY_FULFILLMENT_REVERSAL",
            inventoryBucket: "SALEABLE",
            quantity: unitsToReverse,
            unitCost: lineItem.unitPrice || 0,
            balanceAfter: updatedStock.currentStock,
            referenceType: "SHOPIFY_FULFILLMENT_REVERSAL",
            referenceId: orderNumber,
            orderId: orderId || lineItem.orderId,
            orderLineId: params.shopifyLineItemId,
            reversalReference: params.cancellationRef || "ORDER_CANCELLED",
            idempotencyKey: `REVERSAL_${storeId}_${lineItem.id}_${params.cancellationRef || Date.now()}`,
            notes: params.notes || `Reversal of ${unitsToReverse} unit(s) for Order #${orderNumber}`,
            createdAt: new Date(),
          },
        });
        restoredList.push({ sku: lineItem.sku, quantity: unitsToReverse });
        console.log(`[VOOP INVENTORY REVERSAL] storeId=${storeId} orderNumber=${orderNumber} orderLineId=${params.shopifyLineItemId} sku=${lineItem.sku} restored=${unitsToReverse} (fallback)`);
      }

      // 5. Update ShopifyOrderItem state
      if (lineItem) {
        const newReversed = previouslyReversedUnits + unitsToReverse;
        const isStillDeducted = (deductedUnits - newReversed) > 0;
        await tx.shopifyOrderItem.update({
          where: { id: lineItem.id },
          data: {
            reversedQuantity: newReversed,
            isDeducted: isStillDeducted,
            deductionStatus: newReversed >= deductedUnits ? "REVERSED" : "PARTIALLY_REVERSED",
          },
        });
      }

      return {
        success: true,
        reversed: restoredList.length > 0,
        restoredQuantity: unitsToReverse,
        restoredComponents: restoredList,
      };
    });
  }

  /**
   * Reconcile complete order cancellation: iterates through all deducted lines and reverses them.
   */
  static async reverseOrderFulfillments(
    storeId: string,
    params: {
      shopifyOrderId: string;
      orderNumber?: string;
      cancellationRef?: string;
      reason?: string;
    }
  ): Promise<{
    success: boolean;
    reversedLinesCount: number;
    restoredItems: Array<{ sku: string; quantity: number }>;
  }> {
    const order = await prisma.shopifyOrder.findFirst({
      where: {
        storeId,
        OR: [
          { shopifyOrderId: params.shopifyOrderId },
          { id: params.shopifyOrderId },
        ],
      },
      include: {
        items: true,
      },
    });

    if (!order) {
      return { success: false, reversedLinesCount: 0, restoredItems: [] };
    }

    let reversedLinesCount = 0;
    const restoredItems: Array<{ sku: string; quantity: number }> = [];

    for (const item of order.items) {
      const previouslyReversed = item.reversedQuantity || 0;
      const remaining = Math.max(0, item.deductedQuantity - previouslyReversed);
      if (remaining > 0) {
        const result = await this.reverseOrderLineFulfillment(storeId, {
          orderId: order.id,
          shopifyOrderId: order.shopifyOrderId,
          shopifyLineItemId: item.shopifyLineItemId,
          orderNumber: params.orderNumber || order.orderNumber,
          cancelledQty: remaining,
          cancellationRef: params.cancellationRef,
          reason: params.reason || "Order Cancelled",
        });

        if (result.reversed) {
          reversedLinesCount++;
          restoredItems.push(...result.restoredComponents);
        }
      }
    }

    return {
      success: true,
      reversedLinesCount,
      restoredItems,
    };
  }

  /**
   * Import all Catalog Items/SKUs from Shopify into VOOP Stock Items Master
   * STRICT INVARIANTS:
   * 1. Does NOT import or overwrite stock quantities from Shopify (Stock is 0 by default).
   * 2. Automatically classifies Single Items vs Combos and establishes DB component relationships dynamically.
   */
  static async syncItemsFromShopify(storeId: string) {
    // Strictly fetch all products & variants synced for this store
    const variants = await prisma.shopifyVariant.findMany({
      include: { product: true },
      where: {
        storeId,
      },
    });

    const variantBySku = new Map<string, (typeof variants)[0]>();
    variants.forEach((v) => {
      if (v.sku) {
        variantBySku.set(v.sku.toUpperCase().trim(), v);
      }
    });

    let importedCount = 0;
    const items: any[] = [];

    for (const v of variants) {
      const rawSku = (v.sku || "").trim().toUpperCase();
      const effectiveSku = rawSku && rawSku !== "NULL" && rawSku !== "NO-SKU" && rawSku !== "NO_SKU"
        ? rawSku
        : `VAR-${v.shopifyVariantId}`;

      const itemTitle =
        v.title && v.title !== "Default Title"
          ? `${v.product.title} - ${v.title}`
          : v.product.title;

      // Dynamic SKU-agnostic combo detection
      const comboAnalysis = this.parseComboSegments(effectiveSku, variantBySku);
      const type = comboAnalysis.isCombo ? "COMBO" : "SINGLE";

      let existing = await prisma.stockItem.findUnique({
        where: { storeId_sku: { storeId, sku: effectiveSku } },
        include: { comboComponents: true },
      });

      if (!existing) {
        existing = await prisma.stockItem.create({
          data: {
            storeId,
            sku: effectiveSku,
            name: itemTitle,
            type,
            category: "FINISHED_GOODS",
            unit: "pcs",
            currentStock: 0, // Invariant: VOOP stock is managed internally, not from Shopify
            availableStock: 0,
            minStockLevel: type === "COMBO" ? 0 : 10,
            reorderLevel: type === "COMBO" ? 0 : 25,
            avgUnitCost: v.price || 0,
            sellingPrice: v.price || 0,
            costPrice: v.price ? Math.round(v.price * 0.35) : 0,
            location: "Main Warehouse",
            notes: `Synced from Shopify Products & Variants (${v.product.title})`,
          },
          include: { comboComponents: true },
        });
        importedCount++;
        items.push(existing);
      } else {
        await prisma.stockItem.update({
          where: { id: existing.id },
          data: {
            name: itemTitle,
            type: existing.type === "COMBO" ? "COMBO" : type,
          },
        });
      }

      // If it's a COMBO, auto-create component relationships dynamically
      if (type === "COMBO" && (!existing.comboComponents || existing.comboComponents.length === 0)) {
        for (const comp of comboAnalysis.components) {
          const compSku = comp.componentSku;
          const compVariant = variantBySku.get(compSku);
          const compName = comp.name || compSku;

          // Ensure single component item exists
          let compItem = await prisma.stockItem.findUnique({
            where: { storeId_sku: { storeId, sku: compSku } },
          });
          if (!compItem) {
            compItem = await prisma.stockItem.create({
              data: {
                storeId,
                sku: compSku,
                name: compName,
                type: "SINGLE",
                category: "FINISHED_GOODS",
                unit: "pcs",
                currentStock: 0,
                availableStock: 0,
                minStockLevel: 10,
                reorderLevel: 25,
                avgUnitCost: compVariant?.price || 0,
                sellingPrice: compVariant?.price || 0,
                costPrice: compVariant?.price ? Math.round(compVariant.price * 0.35) : 0,
                location: "Main Warehouse",
                notes: `Auto-created single component for combo ${effectiveSku}`,
              },
            });
          } else if (compItem.name === compItem.sku && compName !== compSku) {
            await prisma.stockItem.update({
              where: { id: compItem.id },
              data: { name: compName },
            });
          }

          await prisma.comboComponent.upsert({
            where: {
              storeId_comboSku_componentSku: {
                storeId,
                comboSku: effectiveSku,
                componentSku: compSku,
              },
            },
            create: {
              storeId,
              comboSku: effectiveSku,
              componentSku: compSku,
              quantity: comp.quantity,
            },
            update: {
              quantity: comp.quantity,
            },
          });
        }
      }
    }

    return { success: true, importedCount, items };
  }

  /**
   * Create or Update Stock Item by SKU
   */
  static async upsertStockItem(
    storeId: string,
    data: {
      sku: string;
      name: string;
      type?: "SINGLE" | "COMBO";
      category?: string;
      unit?: string;
      currentStock?: number;
      minStockLevel?: number;
      reorderLevel?: number;
      avgUnitCost?: number;
      sellingPrice?: number;
      costPrice?: number;
      location?: string;
      notes?: string;
      components?: Array<{ componentSku: string; quantity: number }>;
    }
  ) {
    const sku = data.sku.trim().toUpperCase();
    const type = data.type === "COMBO" ? "COMBO" : "SINGLE";
    
    // Invariant: Combos must never hold physical stock
    const currentStock = type === "COMBO" ? 0 : (Number(data.currentStock) || 0);
    const avgUnitCost = Number(data.avgUnitCost) || 0;
    const sellingPrice = data.sellingPrice !== undefined ? Number(data.sellingPrice) : undefined;
    const costPrice = data.costPrice !== undefined ? Number(data.costPrice) : (avgUnitCost || undefined);

    const existing = await prisma.stockItem.findUnique({
      where: { storeId_sku: { storeId, sku } },
    });

    const item = await prisma.stockItem.upsert({
      where: { storeId_sku: { storeId, sku } },
      create: {
        storeId,
        sku,
        name: data.name,
        type,
        category: data.category || "FINISHED_GOODS",
        unit: data.unit || "pcs",
        currentStock,
        availableStock: currentStock,
        minStockLevel: Number(data.minStockLevel) || 10,
        reorderLevel: Number(data.reorderLevel) || 25,
        avgUnitCost,
        sellingPrice: sellingPrice ?? 0,
        costPrice: costPrice ?? avgUnitCost,
        location: data.location || "Main Warehouse",
        notes: data.notes,
      },
      update: {
        name: data.name,
        type,
        category: data.category || "FINISHED_GOODS",
        unit: data.unit || "pcs",
        currentStock: type === "COMBO" ? 0 : currentStock,
        availableStock: type === "COMBO" ? 0 : currentStock,
        minStockLevel: Number(data.minStockLevel) || 10,
        reorderLevel: Number(data.reorderLevel) || 25,
        avgUnitCost: avgUnitCost > 0 ? avgUnitCost : undefined,
        sellingPrice: sellingPrice !== undefined ? sellingPrice : undefined,
        costPrice: costPrice !== undefined ? costPrice : undefined,
        location: data.location || "Main Warehouse",
        notes: data.notes,
      },
    });

    // Save combo component recipe if provided
    if (type === "COMBO" && data.components) {
      await prisma.comboComponent.deleteMany({
        where: { storeId, comboSku: sku },
      });

      for (const comp of data.components) {
        const compSku = (comp.componentSku || "").trim().toUpperCase();
        if (!compSku) continue;

        const compVariant = await prisma.shopifyVariant.findFirst({
          where: {
            storeId,
            sku: { equals: compSku, mode: "insensitive" },
          },
          include: { product: true },
        });
        let compName = compSku;
        if (compVariant?.product?.title) {
          const prodTitle = compVariant.product.title.trim();
          const varTitle = compVariant.title?.trim();
          const isMeaningful =
            varTitle &&
            varTitle !== "Default Title" &&
            varTitle.toLowerCase() !== "default" &&
            !prodTitle.toLowerCase().includes(varTitle.toLowerCase());
          compName = isMeaningful ? `${prodTitle} — ${varTitle}` : prodTitle;
        }

        // Ensure component stock item exists as a SINGLE item
        let compItem = await prisma.stockItem.findUnique({
          where: { storeId_sku: { storeId, sku: compSku } },
        });
        if (!compItem) {
          compItem = await prisma.stockItem.create({
            data: {
              storeId,
              sku: compSku,
              name: compName,
              type: "SINGLE",
              category: "FINISHED_GOODS",
              unit: "pcs",
              currentStock: 0,
              availableStock: 0,
              minStockLevel: 10,
              reorderLevel: 25,
              avgUnitCost: 0,
              location: "Main Warehouse",
              notes: `Auto-created single component for combo ${sku}`,
            },
          });
        } else if (compItem.name === compItem.sku && compName !== compSku) {
          await prisma.stockItem.update({
            where: { id: compItem.id },
            data: { name: compName },
          });
        }

        await prisma.comboComponent.create({
          data: {
            storeId,
            comboSku: sku,
            componentSku: compSku,
            quantity: Math.max(1, Number(comp.quantity) || 1),
          },
        });
      }
    }

    // Record initial ledger if new SINGLE item created with opening stock
    if (type === "SINGLE" && !existing && currentStock > 0) {
      await prisma.inventoryLedger.create({
        data: {
          storeId,
          sku,
          type: "ADJUSTMENT",
          quantity: currentStock,
          unitCost: avgUnitCost,
          balanceAfter: currentStock,
          referenceType: "INITIAL_STOCK",
          notes: "Initial physical inventory setup",
        },
      });
    }

    return item;
  }

  /**
   * Manual Stock Adjustment / Quick GRN
   * STRICT INVARIANT: Only SINGLE items can be manually adjusted.
   */
  static async adjustStock(
    storeId: string,
    data: {
      sku: string;
      quantityChange: number;
      bucket?: "SALEABLE" | "DAMAGED";
      unitCost?: number;
      reason?: string; // "GRN_MANUAL", "DAMAGE", "COUNT_CORRECTION", "RETURN"
      notes?: string;
    }
  ) {
    const sku = data.sku.trim().toUpperCase();
    const item = await prisma.stockItem.findUnique({
      where: { storeId_sku: { storeId, sku } },
    });
    if (!item) throw new Error(`Stock Item "${sku}" not found`);

    if (item.type === "COMBO") {
      throw new Error(`Combo SKU "${sku}" cannot hold physical inventory or receive manual adjustments.`);
    }

    const bucket = data.bucket || "SALEABLE";
    let newStock = 0;
    const unitCost = data.unitCost !== undefined ? Number(data.unitCost) : item.avgUnitCost;

    let updatedItem;
    if (bucket === "DAMAGED") {
      newStock = Math.max(0, (item.damagedStock || 0) + data.quantityChange);
      updatedItem = await prisma.stockItem.update({
        where: { storeId_sku: { storeId, sku } },
        data: {
          damagedStock: newStock,
        },
      });
    } else {
      newStock = Math.max(0, item.currentStock + data.quantityChange);
      updatedItem = await prisma.stockItem.update({
        where: { storeId_sku: { storeId, sku } },
        data: {
          currentStock: newStock,
          availableStock: newStock,
          avgUnitCost: data.quantityChange > 0 && unitCost > 0
            ? (item.currentStock * item.avgUnitCost + data.quantityChange * unitCost) / (item.currentStock + data.quantityChange)
            : item.avgUnitCost,
        },
      });
    }

    await prisma.inventoryLedger.create({
      data: {
        storeId,
        sku,
        type: data.quantityChange >= 0 ? (data.reason || "MANUAL_ADJUSTMENT") : (data.reason || "WRITE_OFF"),
        inventoryBucket: bucket,
        quantity: data.quantityChange,
        unitCost,
        balanceAfter: newStock,
        referenceType: "MANUAL_ADJUSTMENT",
        notes: data.notes || `Manual ${bucket.toLowerCase()} stock adjustment: ${data.quantityChange > 0 ? "+" : ""}${data.quantityChange}`,
      },
    });

    return updatedItem;
  }

  /**
   * Move Damaged Stock back to Saleable Stock after repair / inspection
   */
  static async moveDamageToSaleable(storeId: string, sku: string, quantity: number, notes?: string) {
    const cleanSku = sku.trim().toUpperCase();
    const item = await prisma.stockItem.findUnique({
      where: { storeId_sku: { storeId, sku: cleanSku } },
    });
    if (!item) throw new Error(`Stock Item "${cleanSku}" not found`);

    if (item.type === "COMBO") {
      throw new Error(`Combo SKU "${cleanSku}" cannot hold physical inventory.`);
    }

    const qty = Math.max(1, Number(quantity) || 1);
    if ((item.damagedStock || 0) < qty) {
      throw new Error(`Insufficient damaged stock for SKU "${cleanSku}". Available damaged: ${item.damagedStock}, Requested: ${qty}`);
    }

    return await prisma.$transaction(async (tx) => {
      const updated = await tx.stockItem.update({
        where: { storeId_sku: { storeId, sku: cleanSku } },
        data: {
          damagedStock: { decrement: qty },
          currentStock: { increment: qty },
          availableStock: { increment: qty },
        },
      });

      await tx.inventoryLedger.create({
        data: {
          storeId,
          sku: cleanSku,
          type: "DAMAGE_TO_SALEABLE",
          inventoryBucket: "SALEABLE",
          quantity: qty,
          unitCost: item.avgUnitCost,
          balanceAfter: updated.currentStock,
          referenceType: "INSPECTION_REPAIR",
          notes: notes || `Restored ${qty} unit(s) from Damaged stock to Saleable stock after inspection.`,
        },
      });

      return updated;
    });
  }

  /**
   * Delete Stock Item by SKU or ID
   */
  static async deleteStockItem(storeId: string, sku: string, id?: string) {
    let item = null;
    if (id) {
      item = await prisma.stockItem.findFirst({
        where: { storeId, id },
      });
    }
    if (!item && sku) {
      const rawSku = sku.trim();
      item = await prisma.stockItem.findFirst({
        where: {
          storeId,
          OR: [
            { sku: rawSku },
            { sku: rawSku.toUpperCase() },
            { sku: rawSku.toLowerCase() },
          ],
        },
      });
    }

    if (!item) {
      return { success: true, message: "Item not found or already removed." };
    }

    const itemSku = item.sku;

    // Delete associated combo component links
    await prisma.comboComponent.deleteMany({
      where: {
        storeId,
        OR: [{ comboSku: itemSku }, { componentSku: itemSku }],
      },
    });

    // Delete inventory ledger entries
    await prisma.inventoryLedger.deleteMany({
      where: { storeId, sku: itemSku },
    });

    // Delete the stock item itself
    await prisma.stockItem.delete({
      where: { id: item.id },
    });

    return { success: true, message: `Product "${itemSku}" deleted from Physical Inventory.` };
  }

  /**
   * Purge products from Physical Inventory that do not exist in the Products & Variants catalog
   */
  static async purgeOrphanedStockItems(storeId: string) {
    const variants = await prisma.shopifyVariant.findMany({
      where: { storeId },
      select: { sku: true, shopifyVariantId: true },
    });

    const validSkus = new Set<string>();
    for (const v of variants) {
      if (v.sku && v.sku.trim()) validSkus.add(v.sku.trim().toUpperCase());
      validSkus.add(`VAR-${v.shopifyVariantId}`.toUpperCase());
    }

    const allStockItems = await prisma.stockItem.findMany({
      where: { storeId },
      select: { id: true, sku: true },
    });

    const toPurge = allStockItems.filter((s) => !validSkus.has(s.sku.toUpperCase()));
    for (const item of toPurge) {
      await this.deleteStockItem(storeId, item.sku, item.id);
    }

    return {
      success: true,
      purgedCount: toPurge.length,
      remainingCount: allStockItems.length - toPurge.length,
    };
  }
}
