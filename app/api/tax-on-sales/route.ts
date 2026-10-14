import { NextRequest, NextResponse } from "next/server";
import { authorizeStoreAccess } from "@/lib/auth-helpers";
import { prisma } from "@/lib/prisma";
import { resolveIndianState, INDIAN_STATES, IndianStateInfo } from "@/lib/gst-state-helper";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  try {
    const auth = await authorizeStoreAccess(request, { requiredPermission: "tax.view" });
    if (!auth.authorized || !auth.storeId) {
      return NextResponse.json({ error: auth.error || "Unauthorized" }, { status: auth.status || 401 });
    }
    const storeId = auth.storeId;
    const { searchParams } = new URL(request.url);
    const search = searchParams.get("search")?.trim().toLowerCase() || "";
    const taxFilter = searchParams.get("taxRate"); // e.g. "18", "12", "5", "0"
    const typeFilter = (searchParams.get("type") || searchParams.get("typeFilter") || "ALL").trim().toUpperCase(); // "ALL", "SINGLE", "COMBO"
    const startDateParam = searchParams.get("startDate");
    const endDateParam = searchParams.get("endDate");
    const originStateParam = searchParams.get("originState") || "KERALA";
    const taxBasis = (searchParams.get("taxBasis") || "DELIVERED").toUpperCase(); // "DELIVERED" or "ORDER_DATE"

    // 1. Resolve Origin State (Shipping From)
    const originStateInfo: IndianStateInfo = resolveIndianState(originStateParam);

    // 2. Fetch physical inventory stock items (Both SINGLE and COMBO with recipe components)
    const stockItems = await prisma.stockItem.findMany({
      where: { storeId },
      include: {
        comboComponents: {
          include: {
            componentItem: true,
          },
        },
      },
      orderBy: { sku: "asc" },
    });

    // 3. Fetch all Shopify product variants for this store — CANONICAL PRODUCT SOURCE
    const shopifyVariants = await prisma.shopifyVariant.findMany({
      where: { storeId },
      include: {
        product: {
          select: {
            id: true,
            shopifyProductId: true,
            title: true,
            status: true,
          },
        },
      },
      orderBy: [{ product: { title: "asc" } }, { title: "asc" }],
    });

    // 4. Fetch tax configurations and combo invoice breakdown components
    const [taxConfigs, comboInvoiceConfigs] = await Promise.all([
      prisma.productTaxConfig.findMany({ where: { storeId } }),
      prisma.comboInvoiceComponent.findMany({ where: { storeId } }),
    ]);

    const taxConfigByVariantId = new Map<string, (typeof taxConfigs)[0]>();
    const taxConfigBySku = new Map<string, (typeof taxConfigs)[0]>();
    for (const tc of taxConfigs) {
      if (tc.shopifyVariantId) {
        taxConfigByVariantId.set(tc.shopifyVariantId, tc);
      }
      if (tc.sku) {
        taxConfigBySku.set(tc.sku.toUpperCase().trim(), tc);
      }
    }

    const comboInvoiceMap = new Map<string, Array<(typeof comboInvoiceConfigs)[0]>>();
    for (const cic of comboInvoiceConfigs) {
      const cSku = cic.comboSku.toUpperCase().trim();
      if (!comboInvoiceMap.has(cSku)) comboInvoiceMap.set(cSku, []);
      comboInvoiceMap.get(cSku)!.push(cic);
    }

    // Map of stock items by SKU
    const stockItemMap = new Map<string, (typeof stockItems)[0]>();
    for (const si of stockItems) {
      stockItemMap.set(si.sku.toUpperCase().trim(), si);
    }

    // 5. Query Actual Shopify Orders with Shipping Address & Shipments (SCOPED TO TENANT)
    const orders = await prisma.shopifyOrder.findMany({
      where: {
        storeId,
        cancelledAt: null,
        NOT: [{ financialStatus: "VOIDED" }, { financialStatus: "CANCELLED" }],
      },
      include: {
        items: {
          where: { deletedAt: null },
          select: {
            sku: true,
            quantity: true,
            unitPrice: true,
            totalPrice: true,
            productTitle: true,
            variantTitle: true,
            comboInvoiceComponents: true,
          },
        },
        fulfillments: {
          select: {
            deliveryDate: true,
            deliveryStatus: true,
            trackingNumber: true,
          },
        },
      },
      orderBy: { createdAt: "desc" },
    });

    // Fetch Delhivery Shipments to get actual Delivery Dates (SCOPED TO TENANT)
    const orderNumbers = orders.map((o) => o.orderNumber).filter(Boolean);
    const shipments = await prisma.shipment.findMany({
      where: {
        storeId,
        orderNumber: { in: orderNumbers },
        deletedAt: null,
      },
      select: {
        orderNumber: true,
        awb: true,
        deliveryDate: true,
        pickupDate: true,
        normalizedStatus: true,
        statusTimestamp: true,
      },
    });

    const shipmentMap = new Map<string, (typeof shipments)[0]>();
    for (const s of shipments) {
      if (s.orderNumber) {
        shipmentMap.set(s.orderNumber.replace("#", "").trim(), s);
      }
    }

    // Prepare Date Range bounds
    let startDateObj: Date | null = startDateParam ? new Date(`${startDateParam}T00:00:00.000Z`) : null;
    let endDateObj: Date | null = endDateParam ? new Date(`${endDateParam}T23:59:59.999Z`) : null;

    // Process each order for Origin -> Destination & CGST/SGST/IGST breakdown
    let totalGrossSales = 0;
    let totalNetSales = 0;
    let totalTaxCollected = 0;
    let totalCgst = 0;
    let totalSgst = 0;
    let totalIgst = 0;
    let intraStateSales = 0;
    let interStateSales = 0;
    let intraStateOrderCount = 0;
    let interStateOrderCount = 0;

    const stateAggregation = new Map<
      string,
      {
        stateName: string;
        stateCode: string;
        orderCount: number;
        grossSales: number;
        netSales: number;
        cgst: number;
        sgst: number;
        igst: number;
        totalTax: number;
        isSameState: boolean;
      }
    >();

    const salesPerSku = new Map<
      string,
      {
        soldQty: number;
        grossSales: number;
        cgst: number;
        sgst: number;
        igst: number;
        taxCollected: number;
      }
    >();

    const salesOrdersLedger: Array<{
      orderId: string;
      orderNumber: string;
      customerName: string;
      orderDate: string;
      deliveryDate: string | null;
      shippingFrom: {
        name: string;
        code: string;
        shortCode: string;
      };
      shippingTo: {
        name: string;
        code: string;
        shortCode: string;
        city: string;
        zip: string;
      };
      taxType: "INTRA_STATE" | "INTER_STATE";
      deliveryStatus: string;
      grossAmount: number;
      netAmount: number;
      taxAmount: number;
      cgst: number;
      sgst: number;
      igst: number;
      itemsCount: number;
    }> = [];

    for (const order of orders) {
      const cleanOrderNum = (order.orderNumber || "").replace("#", "").trim();
      const shipment = shipmentMap.get(cleanOrderNum);
      const fulfillment = order.fulfillments?.[0];

      // Determine actual delivery status and date
      const isDeliveredStatus =
        shipment?.normalizedStatus === "DELIVERED" ||
        fulfillment?.deliveryStatus === "DELIVERED" ||
        (order.fulfillmentStatus === "FULFILLED" && (Boolean(shipment?.deliveryDate) || Boolean(fulfillment?.deliveryDate)));

      const deliveryStatus = shipment?.normalizedStatus || fulfillment?.deliveryStatus || (isDeliveredStatus ? "DELIVERED" : "IN-TRANSIT");
      
      const effectiveDeliveryDate: Date | null =
        shipment?.deliveryDate ||
        fulfillment?.deliveryDate ||
        (isDeliveredStatus ? shipment?.statusTimestamp || order.processedAt || order.createdAt : null);

      // Exclude RTO / Cancelled / In-Transit from output tax realization
      if (
        deliveryStatus === "RTO" ||
        deliveryStatus === "CANCELLED" ||
        deliveryStatus === "CANCELLED_PRE_DISPATCH"
      ) {
        continue;
      }

      // Date Filtering based on taxBasis
      if (taxBasis === "DELIVERED") {
        // STRICT RULE: Only consider confirmed DELIVERED orders because in-transit could result in RTO
        if (!isDeliveredStatus || !effectiveDeliveryDate) {
          continue;
        }

        if (startDateObj && effectiveDeliveryDate < startDateObj) continue;
        if (endDateObj && effectiveDeliveryDate > endDateObj) continue;
      } else {
        // Order date filtering
        if (startDateObj && order.createdAt < startDateObj) continue;
        if (endDateObj && order.createdAt > endDateObj) continue;
      }

      // 1. Resolve Shipping Destination State
      let shippingAddressObj: any = null;
      if (order.shippingAddress) {
        try {
          shippingAddressObj = JSON.parse(order.shippingAddress);
        } catch {
          shippingAddressObj = { province: order.shippingAddress };
        }
      }

      const destStateInfo: IndianStateInfo = resolveIndianState(shippingAddressObj);
      const isIntraState = destStateInfo.code === originStateInfo.code;

      let orderGross = 0;
      let orderNet = 0;
      let orderTax = 0;
      let orderCgst = 0;
      let orderSgst = 0;
      let orderIgst = 0;

      for (const item of order.items) {
        const cleanSku = (item.sku || "").toUpperCase().trim();
        const itemGross = item.totalPrice || item.unitPrice * (item.quantity || 1);
        const stockItem = cleanSku ? stockItemMap.get(cleanSku) : null;
        const isCombo = (stockItem && stockItem.type === "COMBO");

        // Check if Combo has custom invoice components (from order snapshot or store config)
        let comboComponentsToUse: any[] | null = null;
        if (isCombo) {
          if (item.comboInvoiceComponents) {
            try {
              const parsed = JSON.parse(item.comboInvoiceComponents);
              if (Array.isArray(parsed) && parsed.length > 0) comboComponentsToUse = parsed;
            } catch {}
          }
          if (!comboComponentsToUse && cleanSku) {
            const configs = comboInvoiceMap.get(cleanSku);
            if (configs && configs.length > 0) comboComponentsToUse = configs;
          }
        }

        let itemNet = 0;
        let itemTax = 0;
        let itemCgst = 0;
        let itemSgst = 0;
        let itemIgst = 0;

        if (isCombo && comboComponentsToUse && comboComponentsToUse.length > 0) {
          const totalAlloc = comboComponentsToUse.reduce(
            (sum: number, c: any) => sum + (parseFloat(c.allocatedValue) || 0) * (parseFloat(c.quantity) || 1),
            0
          );
          for (const comp of comboComponentsToUse) {
            const compAlloc = (parseFloat(comp.allocatedValue) || 0) * (parseFloat(comp.quantity) || 1);
            const compShare = totalAlloc > 0 ? (compAlloc / totalAlloc) * itemGross : itemGross / comboComponentsToUse.length;
            const compGst = comp.gstRate !== undefined ? parseFloat(comp.gstRate) : 18.0;
            const compNet = compGst > 0 ? compShare / (1 + compGst / 100) : compShare;
            const compTax = compShare - compNet;

            itemNet += compNet;
            itemTax += compTax;
            if (isIntraState) {
              itemCgst += compTax / 2;
              itemSgst += compTax / 2;
            } else {
              itemIgst += compTax;
            }
          }
        } else {
          const taxConfig = cleanSku ? taxConfigBySku.get(cleanSku) : null;
          const taxRate = taxConfig?.taxRate !== undefined ? taxConfig.taxRate : 18.0;
          itemNet = taxRate > 0 ? itemGross / (1 + taxRate / 100) : itemGross;
          itemTax = itemGross - itemNet;
          if (isIntraState) {
            itemCgst = itemTax / 2;
            itemSgst = itemTax / 2;
          } else {
            itemIgst = itemTax;
          }
        }

        orderGross += itemGross;
        orderNet += itemNet;
        orderTax += itemTax;
        orderCgst += itemCgst;
        orderSgst += itemSgst;
        orderIgst += itemIgst;

        // SKU-level aggregation
        if (cleanSku) {
          const currentSku = salesPerSku.get(cleanSku) || {
            soldQty: 0,
            grossSales: 0,
            cgst: 0,
            sgst: 0,
            igst: 0,
            taxCollected: 0,
          };
          currentSku.soldQty += item.quantity || 1;
          currentSku.grossSales += itemGross;
          currentSku.cgst += itemCgst;
          currentSku.sgst += itemSgst;
          currentSku.igst += itemIgst;
          currentSku.taxCollected += itemTax;
          salesPerSku.set(cleanSku, currentSku);
        }
      }

      totalGrossSales += orderGross;
      totalNetSales += orderNet;
      totalTaxCollected += orderTax;
      totalCgst += orderCgst;
      totalSgst += orderSgst;
      totalIgst += orderIgst;

      if (isIntraState) {
        intraStateSales += orderGross;
        intraStateOrderCount += 1;
      } else {
        interStateSales += orderGross;
        interStateOrderCount += 1;
      }

      // State Distribution Aggregation
      const stateKey = destStateInfo.name;
      const stateRec = stateAggregation.get(stateKey) || {
        stateName: destStateInfo.name,
        stateCode: destStateInfo.code,
        orderCount: 0,
        grossSales: 0,
        netSales: 0,
        cgst: 0,
        sgst: 0,
        igst: 0,
        totalTax: 0,
        isSameState: isIntraState,
      };
      stateRec.orderCount += 1;
      stateRec.grossSales += orderGross;
      stateRec.netSales += orderNet;
      stateRec.cgst += orderCgst;
      stateRec.sgst += orderSgst;
      stateRec.igst += orderIgst;
      stateRec.totalTax += orderTax;
      stateAggregation.set(stateKey, stateRec);

      salesOrdersLedger.push({
        orderId: order.id,
        orderNumber: order.orderNumber,
        customerName: order.name || "Customer",
        orderDate: order.createdAt.toISOString(),
        deliveryDate: effectiveDeliveryDate ? effectiveDeliveryDate.toISOString() : null,
        shippingFrom: {
          name: originStateInfo.name,
          code: originStateInfo.code,
          shortCode: originStateInfo.shortCode,
        },
        shippingTo: {
          name: destStateInfo.name,
          code: destStateInfo.code,
          shortCode: destStateInfo.shortCode,
          city: shippingAddressObj?.city || "",
          zip: shippingAddressObj?.zip || "",
        },
        taxType: isIntraState ? "INTRA_STATE" : "INTER_STATE",
        deliveryStatus,
        grossAmount: Number(orderGross.toFixed(2)),
        netAmount: Number(orderNet.toFixed(2)),
        taxAmount: Number(orderTax.toFixed(2)),
        cgst: Number(orderCgst.toFixed(2)),
        sgst: Number(orderSgst.toFixed(2)),
        igst: Number(orderIgst.toFixed(2)),
        itemsCount: order.items.length,
      });
    }    // 6. Build Single Product Variant Tax Catalog from Canonical Shopify Variants
    const items: Array<{
      id?: string;
      voopStoreId?: string;
      shopifyProductId: string;
      shopifyVariantId: string;
      sku: string;
      title: string;
      productName: string;
      variantTitle: string;
      productStatus: string;
      type: string;
      unit: string;
      stockCount: number;
      availableStock: number;
      isConfigured: boolean;
      hsnCode: string;
      taxRate: number;
      isTaxInclusive: boolean;
      price: number;
      priceExclTax: number;
      taxAmount: number;
      priceInclTax: number;
      cgstRate: number;
      sgstRate: number;
      igstRate: number;
      cgstAmount: number;
      sgstAmount: number;
      igstAmount: number;
      totalStockValueInclTax: number;
      totalStockValueExclTax: number;
      totalStockTaxAmount: number;
      recipeCost?: number;
      comboComponents?: Array<{
        componentSku: string;
        quantity: number;
        name: string;
        unitCost: number;
      }>;
      isComboConfigured?: boolean;
      isComboBalanced?: boolean;
      comboAllocatedTotal?: number;
      mixedGstLabel?: string;
      requiresReview?: boolean;
      comboInvoiceComponents?: any[];
      soldQty: number;
      soldGrossAmount: number;
      soldNetAmount: number;
      soldTaxCollected: number;
      soldCgst: number;
      soldSgst: number;
      soldIgst: number;
      notes: string;
    }> = [];

    const processedSkus = new Set<string>();

    for (const variant of shopifyVariants) {
      const cleanSku = (variant.sku || "").toUpperCase().trim();
      if (cleanSku) processedSkus.add(cleanSku);

      const stockItem = cleanSku ? stockItemMap.get(cleanSku) : null;
      const taxConfig =
        taxConfigByVariantId.get(variant.shopifyVariantId) ||
        (cleanSku ? taxConfigBySku.get(cleanSku) : null);

      const isCombo = (stockItem && stockItem.type === "COMBO") || (cleanSku && (cleanSku.includes("-") || cleanSku.includes("+")) && stockItem?.comboComponents && stockItem.comboComponents.length > 0);
      const type = isCombo ? "COMBO" : (stockItem?.type || "SINGLE");

      // Type Filter
      if (typeFilter === "SINGLE" && type !== "SINGLE") continue;
      if (typeFilter === "COMBO" && type !== "COMBO") continue;

      const prodTitle = variant.product.title.trim();
      const varTitle = variant.title && variant.title !== "Default Title" ? variant.title.trim() : "";
      const isMeaningful =
        varTitle &&
        varTitle.toLowerCase() !== "default" &&
        !prodTitle.toLowerCase().includes(varTitle.toLowerCase());
      const title =
        taxConfig?.title ||
        stockItem?.name ||
        (isMeaningful ? `${prodTitle} — ${varTitle}` : prodTitle);

      const productName = prodTitle;
      const variantTitle = varTitle;
      const unit = stockItem?.unit || "pcs";

      // Stock Count calculation: For COMBO, compute buildable count from components if recipe present
      let stockCount = 0;
      let availableStock = 0;
      let recipeCost = 0;
      const comboComponentsList: Array<{
        componentSku: string;
        quantity: number;
        name: string;
        unitCost: number;
      }> = [];

      if (isCombo) {
        if (stockItem?.comboComponents && stockItem.comboComponents.length > 0) {
          const limits: number[] = [];
          for (const c of stockItem.comboComponents) {
            const comp = stockItemMap.get(c.componentSku.toUpperCase().trim());
            const cost = comp?.avgUnitCost || c.componentItem?.avgUnitCost || 0;
            recipeCost += cost * (c.quantity || 1);
            comboComponentsList.push({
              componentSku: c.componentSku,
              quantity: c.quantity || 1,
              name: c.componentItem?.name || comp?.name || c.componentSku,
              unitCost: cost,
            });
            const compStock = comp?.availableStock ?? comp?.currentStock ?? 0;
            const req = c.quantity || 1;
            limits.push(req > 0 ? Math.floor(compStock / req) : 0);
          }
          stockCount = limits.length > 0 ? Math.min(...limits) : 0;
          availableStock = stockCount;
        } else {
          stockCount = stockItem ? stockItem.currentStock : (variant.inventoryQuantity ?? 0);
          availableStock = stockItem ? stockItem.availableStock : (variant.inventoryQuantity ?? 0);
        }
      } else {
        stockCount = stockItem ? stockItem.currentStock : (variant.inventoryQuantity ?? 0);
        availableStock = stockItem ? stockItem.availableStock : (variant.inventoryQuantity ?? 0);
      }

      const taxRate = taxConfig?.taxRate !== undefined ? taxConfig.taxRate : 18.0;
      const isTaxInclusive = taxConfig?.isTaxInclusive ?? true;
      const hsnCode = taxConfig?.hsnCode || "";
      const notes = taxConfig?.notes || "";
      const isConfigured = Boolean(hsnCode || taxConfig?.taxRate !== undefined);

      // Effective Selling Price: independent from recipe components
      const rawPrice =
        taxConfig?.overridePrice !== null && taxConfig?.overridePrice !== undefined
          ? taxConfig.overridePrice
          : (stockItem?.sellingPrice ?? variant.price ?? 0.0);
      const price = Math.max(0, rawPrice);

      // Calculations
      let priceExclTax = 0;
      let taxAmount = 0;
      let priceInclTax = 0;

      if (isTaxInclusive) {
        priceInclTax = price;
        priceExclTax = taxRate > 0 ? price / (1 + taxRate / 100) : price;
        taxAmount = priceInclTax - priceExclTax;
      } else {
        priceExclTax = price;
        taxAmount = price * (taxRate / 100);
        priceInclTax = priceExclTax + taxAmount;
      }

      const cgstRate = taxRate / 2;
      const sgstRate = taxRate / 2;
      const igstRate = taxRate;

      const cgstAmount = taxAmount / 2;
      const sgstAmount = taxAmount / 2;
      const igstAmount = taxAmount;

      const totalStockValueInclTax = stockCount * priceInclTax;
      const totalStockValueExclTax = stockCount * (isCombo && recipeCost > 0 ? recipeCost : priceExclTax);
      const totalStockTaxAmount = stockCount * taxAmount;

      // Actual Sales Data
      const sales = (cleanSku ? salesPerSku.get(cleanSku) : null) || {
        soldQty: 0,
        grossSales: 0,
        cgst: 0,
        sgst: 0,
        igst: 0,
        taxCollected: 0,
      };
      const soldGrossAmount = sales.grossSales;
      const soldTaxCollected = sales.taxCollected;
      // For combos with custom invoice components the tax was already accumulated
      // per-component (each with its own GST rate) in sales.taxCollected.
      // Using the combo's aggregate taxRate here would give the wrong net amount.
      const soldNetAmount = soldGrossAmount - soldTaxCollected;

      // Filters
      if (search) {
        const matchSku = cleanSku.toLowerCase().includes(search);
        const matchTitle = title.toLowerCase().includes(search);
        const matchHsn = hsnCode.toLowerCase().includes(search);
        const matchProdId = variant.shopifyProductId.toLowerCase().includes(search);
        const matchVarId = variant.shopifyVariantId.toLowerCase().includes(search);
        if (!matchSku && !matchTitle && !matchHsn && !matchProdId && !matchVarId) continue;
      }

      if (taxFilter && taxFilter !== "ALL") {
        const filterRate = parseFloat(taxFilter);
        if (!isNaN(filterRate) && Math.abs(taxRate - filterRate) > 0.01) {
          continue;
        }
      }

      // Combo Custom Invoice Breakdown info
      let isComboConfigured = false;
      let isComboBalanced = false;
      let comboAllocatedTotal = 0;
      let mixedGstLabel = `${taxRate}% GST`;
      let requiresReview = false;
      let customInvoiceComponents: any[] = [];

      if (isCombo && stockItem) {
        const savedConfigs = comboInvoiceMap.get(cleanSku) || [];
        const recipeComponents = stockItem.comboComponents || [];
        const recipeSkuSet = new Set(recipeComponents.map((c) => c.componentSku.toUpperCase().trim()));

        customInvoiceComponents = savedConfigs.map((c) => ({
          componentSku: c.componentSku,
          quantity: c.quantity,
          allocatedValue: c.allocatedValue,
          gstRate: c.gstRate,
          hsnCode: c.hsnCode || "",
          taxMode: c.taxMode,
        }));

        comboAllocatedTotal = savedConfigs.reduce((sum, c) => sum + (c.allocatedValue || 0), 0);
        isComboConfigured =
          recipeComponents.length > 0 &&
          recipeComponents.every((rc) =>
            savedConfigs.some((sc) => sc.componentSku.toUpperCase().trim() === rc.componentSku.toUpperCase().trim())
          );
        isComboBalanced = isComboConfigured && Math.round(comboAllocatedTotal * 100) === Math.round(price * 100);

        if (savedConfigs.length > 0) {
          const hasObsolete = savedConfigs.some((sc) => !recipeSkuSet.has(sc.componentSku.toUpperCase().trim()));
          const hasMissing = recipeComponents.some(
            (rc) => !savedConfigs.some((sc) => sc.componentSku.toUpperCase().trim() === rc.componentSku.toUpperCase().trim())
          );
          if (hasObsolete || hasMissing) requiresReview = true;
        }

        if (savedConfigs.length > 0) {
          const distinctRates = Array.from(new Set(savedConfigs.map((c) => c.gstRate))).sort((a, b) => a - b);
          if (distinctRates.length > 1) {
            mixedGstLabel = `Mixed GST (${distinctRates.map((r) => `${r}%`).join(" + ")})`;
          } else if (distinctRates.length === 1) {
            mixedGstLabel = `${distinctRates[0]}% GST`;
          }
        }
      }

      items.push({
        id: taxConfig?.id || variant.id,
        voopStoreId: auth.voopStoreId,
        shopifyProductId: variant.shopifyProductId,
        shopifyVariantId: variant.shopifyVariantId,
        sku: variant.sku || "",
        title,
        productName,
        variantTitle,
        productStatus: variant.product.status,
        type,
        unit,
        stockCount,
        availableStock,
        isConfigured,
        hsnCode,
        taxRate,
        isTaxInclusive,
        price,
        priceExclTax: Number(priceExclTax.toFixed(2)),
        taxAmount: Number(taxAmount.toFixed(2)),
        priceInclTax: Number(priceInclTax.toFixed(2)),
        cgstRate,
        sgstRate,
        igstRate,
        cgstAmount: Number(cgstAmount.toFixed(2)),
        sgstAmount: Number(sgstAmount.toFixed(2)),
        igstAmount: Number(igstAmount.toFixed(2)),
        totalStockValueInclTax: Number(totalStockValueInclTax.toFixed(2)),
        totalStockValueExclTax: Number(totalStockValueExclTax.toFixed(2)),
        totalStockTaxAmount: Number(totalStockTaxAmount.toFixed(2)),
        recipeCost: Number(recipeCost.toFixed(2)),
        comboComponents: comboComponentsList,
        isComboConfigured,
        isComboBalanced,
        comboAllocatedTotal,
        mixedGstLabel,
        requiresReview,
        comboInvoiceComponents: customInvoiceComponents,
        soldQty: sales.soldQty,
        soldGrossAmount: Number(soldGrossAmount.toFixed(2)),
        soldNetAmount: Number(soldNetAmount.toFixed(2)),
        soldTaxCollected: Number(soldTaxCollected.toFixed(2)),
        soldCgst: Number(sales.cgst.toFixed(2)),
        soldSgst: Number(sales.sgst.toFixed(2)),
        soldIgst: Number(sales.igst.toFixed(2)),
        notes,
      });
    }

    // Process any pure VOOP StockItems not present in Shopify variants (e.g. custom combos/stock items)
    for (const stockItem of stockItems) {
      const cleanSku = (stockItem.sku || "").toUpperCase().trim();
      if (!cleanSku || processedSkus.has(cleanSku)) continue;
      processedSkus.add(cleanSku);

      const isCombo = stockItem.type === "COMBO";
      const type = stockItem.type;

      if (typeFilter === "SINGLE" && type !== "SINGLE") continue;
      if (typeFilter === "COMBO" && type !== "COMBO") continue;

      const taxConfig = taxConfigBySku.get(cleanSku);
      const title = taxConfig?.title || stockItem.name;
      const unit = stockItem.unit || "pcs";

      let stockCount = stockItem.currentStock;
      let availableStock = stockItem.availableStock;
      let recipeCost = 0;
      const comboComponentsList: Array<{
        componentSku: string;
        quantity: number;
        name: string;
        unitCost: number;
      }> = [];

      if (isCombo && stockItem.comboComponents && stockItem.comboComponents.length > 0) {
        const limits: number[] = [];
        for (const c of stockItem.comboComponents) {
          const comp = stockItemMap.get(c.componentSku.toUpperCase().trim());
          const cost = comp?.avgUnitCost || c.componentItem?.avgUnitCost || 0;
          recipeCost += cost * (c.quantity || 1);
          comboComponentsList.push({
            componentSku: c.componentSku,
            quantity: c.quantity || 1,
            name: c.componentItem?.name || comp?.name || c.componentSku,
            unitCost: cost,
          });
          const compStock = comp?.availableStock ?? comp?.currentStock ?? 0;
          const req = c.quantity || 1;
          limits.push(req > 0 ? Math.floor(compStock / req) : 0);
        }
        stockCount = limits.length > 0 ? Math.min(...limits) : 0;
        availableStock = stockCount;
      }

      const taxRate = taxConfig?.taxRate !== undefined ? taxConfig.taxRate : 18.0;
      const isTaxInclusive = taxConfig?.isTaxInclusive ?? true;
      const hsnCode = taxConfig?.hsnCode || "";
      const notes = taxConfig?.notes || "";
      const isConfigured = Boolean(hsnCode || taxConfig?.taxRate !== undefined);

      const rawPrice =
        taxConfig?.overridePrice !== null && taxConfig?.overridePrice !== undefined
          ? taxConfig.overridePrice
          : (stockItem.sellingPrice ?? 0.0);
      const price = Math.max(0, rawPrice);

      let priceExclTax = 0;
      let taxAmount = 0;
      let priceInclTax = 0;

      if (isTaxInclusive) {
        priceInclTax = price;
        priceExclTax = taxRate > 0 ? price / (1 + taxRate / 100) : price;
        taxAmount = priceInclTax - priceExclTax;
      } else {
        priceExclTax = price;
        taxAmount = price * (taxRate / 100);
        priceInclTax = priceExclTax + taxAmount;
      }

      const cgstRate = taxRate / 2;
      const sgstRate = taxRate / 2;
      const igstRate = taxRate;
      const cgstAmount = taxAmount / 2;
      const sgstAmount = taxAmount / 2;
      const igstAmount = taxAmount;

      const totalStockValueInclTax = stockCount * priceInclTax;
      const totalStockValueExclTax = stockCount * (isCombo && recipeCost > 0 ? recipeCost : priceExclTax);
      const totalStockTaxAmount = stockCount * taxAmount;

      const sales = salesPerSku.get(cleanSku) || {
        soldQty: 0,
        grossSales: 0,
        cgst: 0,
        sgst: 0,
        igst: 0,
        taxCollected: 0,
      };

      if (search) {
        const matchSku = cleanSku.toLowerCase().includes(search);
        const matchTitle = title.toLowerCase().includes(search);
        const matchHsn = hsnCode.toLowerCase().includes(search);
        if (!matchSku && !matchTitle && !matchHsn) continue;
      }

      if (taxFilter && taxFilter !== "ALL") {
        const filterRate = parseFloat(taxFilter);
        if (!isNaN(filterRate) && Math.abs(taxRate - filterRate) > 0.01) continue;
      }

      // Combo Custom Invoice Breakdown info
      let isComboConfigured = false;
      let isComboBalanced = false;
      let comboAllocatedTotal = 0;
      let mixedGstLabel = `${taxRate}% GST`;
      let requiresReview = false;
      let customInvoiceComponents: any[] = [];

      if (isCombo && stockItem) {
        const savedConfigs = comboInvoiceMap.get(cleanSku) || [];
        const recipeComponents = stockItem.comboComponents || [];
        const recipeSkuSet = new Set(recipeComponents.map((c) => c.componentSku.toUpperCase().trim()));

        customInvoiceComponents = savedConfigs.map((c) => ({
          componentSku: c.componentSku,
          quantity: c.quantity,
          allocatedValue: c.allocatedValue,
          gstRate: c.gstRate,
          hsnCode: c.hsnCode || "",
          taxMode: c.taxMode,
        }));

        comboAllocatedTotal = savedConfigs.reduce((sum, c) => sum + (c.allocatedValue || 0), 0);
        isComboConfigured =
          recipeComponents.length > 0 &&
          recipeComponents.every((rc) =>
            savedConfigs.some((sc) => sc.componentSku.toUpperCase().trim() === rc.componentSku.toUpperCase().trim())
          );
        isComboBalanced = isComboConfigured && Math.round(comboAllocatedTotal * 100) === Math.round(price * 100);

        if (savedConfigs.length > 0) {
          const hasObsolete = savedConfigs.some((sc) => !recipeSkuSet.has(sc.componentSku.toUpperCase().trim()));
          const hasMissing = recipeComponents.some(
            (rc) => !savedConfigs.some((sc) => sc.componentSku.toUpperCase().trim() === rc.componentSku.toUpperCase().trim())
          );
          if (hasObsolete || hasMissing) requiresReview = true;
        }

        if (savedConfigs.length > 0) {
          const distinctRates = Array.from(new Set(savedConfigs.map((c) => c.gstRate))).sort((a, b) => a - b);
          if (distinctRates.length > 1) {
            mixedGstLabel = `Mixed GST (${distinctRates.map((r) => `${r}%`).join(" + ")})`;
          } else if (distinctRates.length === 1) {
            mixedGstLabel = `${distinctRates[0]}% GST`;
          }
        }
      }

      items.push({
        id: taxConfig?.id || stockItem.id,
        voopStoreId: auth.voopStoreId,
        shopifyProductId: "",
        shopifyVariantId: "",
        sku: stockItem.sku,
        title,
        productName: stockItem.name,
        variantTitle: "",
        productStatus: "ACTIVE",
        type,
        unit,
        stockCount,
        availableStock,
        isConfigured,
        hsnCode,
        taxRate,
        isTaxInclusive,
        price,
        priceExclTax: Number(priceExclTax.toFixed(2)),
        taxAmount: Number(taxAmount.toFixed(2)),
        priceInclTax: Number(priceInclTax.toFixed(2)),
        cgstRate,
        sgstRate,
        igstRate,
        cgstAmount: Number(cgstAmount.toFixed(2)),
        sgstAmount: Number(sgstAmount.toFixed(2)),
        igstAmount: Number(igstAmount.toFixed(2)),
        totalStockValueInclTax: Number(totalStockValueInclTax.toFixed(2)),
        totalStockValueExclTax: Number(totalStockValueExclTax.toFixed(2)),
        totalStockTaxAmount: Number(totalStockTaxAmount.toFixed(2)),
        recipeCost: Number(recipeCost.toFixed(2)),
        comboComponents: comboComponentsList,
        isComboConfigured,
        isComboBalanced,
        comboAllocatedTotal,
        mixedGstLabel,
        requiresReview,
        comboInvoiceComponents: customInvoiceComponents,
        soldQty: sales.soldQty,
        soldGrossAmount: Number(sales.grossSales.toFixed(2)),
        // Derive net from already-computed tax (handles mixed-GST combos correctly)
        soldNetAmount: Number((sales.grossSales - sales.taxCollected).toFixed(2)),
        soldTaxCollected: Number(sales.taxCollected.toFixed(2)),
        soldCgst: Number(sales.cgst.toFixed(2)),
        soldSgst: Number(sales.sgst.toFixed(2)),
        soldIgst: Number(sales.igst.toFixed(2)),
        notes,
      });
    }

    // 7. Compute Aggregate Summary
    const summary = {
      originState: originStateInfo,
      taxBasis,
      availableStates: Object.values(INDIAN_STATES),
      totalSkus: items.length,
      totalStockUnits: items.reduce((acc, i) => acc + i.stockCount, 0),
      totalStockValueInclTax: Number(items.reduce((acc, i) => acc + i.totalStockValueInclTax, 0).toFixed(2)),
      totalStockValueExclTax: Number(items.reduce((acc, i) => acc + i.totalStockValueExclTax, 0).toFixed(2)),
      totalStockTaxLiability: Number(items.reduce((acc, i) => acc + i.totalStockTaxAmount, 0).toFixed(2)),
      actualSalesMetrics: {
        totalOrders: salesOrdersLedger.length,
        totalSoldQty: items.reduce((acc, i) => acc + i.soldQty, 0),
        totalGrossSales: Number(totalGrossSales.toFixed(2)),
        totalNetSales: Number(totalNetSales.toFixed(2)),
        totalTaxCollected: Number(totalTaxCollected.toFixed(2)),
        totalCgst: Number(totalCgst.toFixed(2)),
        totalSgst: Number(totalSgst.toFixed(2)),
        totalIgst: Number(totalIgst.toFixed(2)),
        intraState: {
          orderCount: intraStateOrderCount,
          grossSales: Number(intraStateSales.toFixed(2)),
          cgst: Number(totalCgst.toFixed(2)),
          sgst: Number(totalSgst.toFixed(2)),
          totalTax: Number((totalCgst + totalSgst).toFixed(2)),
        },
        interState: {
          orderCount: interStateOrderCount,
          grossSales: Number(interStateSales.toFixed(2)),
          igst: Number(totalIgst.toFixed(2)),
          totalTax: Number(totalIgst.toFixed(2)),
        },
      },
      stateDistribution: Array.from(stateAggregation.values())
        .map((s) => ({
          ...s,
          grossSales: Number(s.grossSales.toFixed(2)),
          netSales: Number(s.netSales.toFixed(2)),
          cgst: Number(s.cgst.toFixed(2)),
          sgst: Number(s.sgst.toFixed(2)),
          igst: Number(s.igst.toFixed(2)),
          totalTax: Number(s.totalTax.toFixed(2)),
        }))
        .sort((a, b) => b.grossSales - a.grossSales),
    };

    return NextResponse.json({
      success: true,
      summary,
      items,
      salesOrdersLedger,
    });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const auth = await authorizeStoreAccess(request, { requiredPermission: "tax.manage" });
    if (!auth.authorized || !auth.storeId) {
      return NextResponse.json({ error: auth.error || "Unauthorized" }, { status: auth.status || 401 });
    }
    const storeId = auth.storeId;

    const body = await request.json();
    const {
      shopifyProductId,
      shopifyVariantId,
      sku,
      title,
      taxRate = 18.0,
      isTaxInclusive = true,
      overridePrice,
      hsnCode = "",
      notes = "",
    } = body;

    const cleanSku = (sku || "").toUpperCase().trim() || (shopifyVariantId ? `VAR-${shopifyVariantId}` : "");
    if (!cleanSku && !shopifyVariantId) {
      return NextResponse.json({ error: "SKU or Variant ID is required" }, { status: 400 });
    }

    const config = await prisma.productTaxConfig.upsert({
      where: { storeId_sku: { storeId, sku: cleanSku } },
      create: {
        storeId,
        shopifyProductId: shopifyProductId || null,
        shopifyVariantId: shopifyVariantId || null,
        sku: cleanSku,
        title: title?.trim() || null,
        taxRate: parseFloat(taxRate),
        isTaxInclusive: Boolean(isTaxInclusive),
        overridePrice: overridePrice !== null && overridePrice !== undefined && overridePrice !== "" ? parseFloat(overridePrice) : null,
        hsnCode: hsnCode?.trim() || "",
        notes: notes?.trim() || null,
      },
      update: {
        shopifyProductId: shopifyProductId || undefined,
        shopifyVariantId: shopifyVariantId || undefined,
        title: title?.trim() || undefined,
        taxRate: parseFloat(taxRate),
        isTaxInclusive: Boolean(isTaxInclusive),
        overridePrice: overridePrice !== null && overridePrice !== undefined && overridePrice !== "" ? parseFloat(overridePrice) : null,
        hsnCode: hsnCode?.trim() || "",
        notes: notes?.trim() || undefined,
      },
    });

    // Also synchronize sellingPrice on StockItem if it exists for this store and SKU (does NOT affect recipe)
    if (overridePrice !== null && overridePrice !== undefined && overridePrice !== "") {
      const parsedPrice = parseFloat(overridePrice);
      if (!isNaN(parsedPrice)) {
        await prisma.stockItem.updateMany({
          where: { storeId, sku: cleanSku },
          data: { sellingPrice: parsedPrice },
        });
      }
    }

    return NextResponse.json({ success: true, config });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export async function PUT(request: NextRequest) {
  try {
    const auth = await authorizeStoreAccess(request, { requiredPermission: "tax.manage" });
    if (!auth.authorized || !auth.storeId) {
      return NextResponse.json({ error: auth.error || "Unauthorized" }, { status: auth.status || 401 });
    }
    const storeId = auth.storeId;

    const body = await request.json();
    const { skus, taxRate, isTaxInclusive, hsnCode } = body;

    if (!Array.isArray(skus) || skus.length === 0) {
      return NextResponse.json({ error: "SKUs array is required" }, { status: 400 });
    }

    const updates = [];
    for (const rawSku of skus) {
      const cleanSku = rawSku.toUpperCase().trim();
      updates.push(
        prisma.productTaxConfig.upsert({
          where: { storeId_sku: { storeId, sku: cleanSku } },
          create: {
            storeId,
            sku: cleanSku,
            taxRate: taxRate !== undefined ? parseFloat(taxRate) : 18.0,
            isTaxInclusive: isTaxInclusive !== undefined ? Boolean(isTaxInclusive) : true,
            hsnCode: hsnCode || "",
          },
          update: {
            taxRate: taxRate !== undefined ? parseFloat(taxRate) : undefined,
            isTaxInclusive: isTaxInclusive !== undefined ? Boolean(isTaxInclusive) : undefined,
            hsnCode: hsnCode !== undefined ? hsnCode : undefined,
          },
        })
      );
    }

    await prisma.$transaction(updates);

    return NextResponse.json({
      success: true,
      message: `Updated ${skus.length} SKU tax configurations.`,
    });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
