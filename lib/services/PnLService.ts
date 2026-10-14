import prisma from "@/lib/prisma";
import { MetaAdsService } from "@/lib/services/MetaAdsService";

export interface PnLFilterParams {
  period?: "today" | "yesterday" | "7d" | "30d" | "this_month" | "custom";
  startDate?: string;
  endDate?: string;
}

export class PnLService {
  /**
   * Get or initialize customizable Expense Settings
   */
  static async getExpenseSettings(storeId: string) {
    if (!storeId) {
      throw new Error("storeId is required to retrieve expense settings");
    }

    try {
      const existing = await prisma.expenseSetting.findUnique({ where: { storeId } });
      if (existing) return existing;

      return await prisma.expenseSetting.upsert({
        where: { storeId },
        update: {},
        create: {
          storeId,
          packagingCostPerOrder: 30.0,
          freightCostPerOrder: 90.0,
          rtoCostPerOrder: 90.0,
          gatewayFeePercent: 2.0,
          monthlyFixedOverhead: 0.0,
          defaultCogsPercent: 35.0,
          autoFetchMetaAds: true,
          useEstimatedExpenses: true,
          customRules: "{}",
        },
      });
    } catch (_err: any) {
      // In case of concurrent race condition, fallback to findUnique
      const fallback = await prisma.expenseSetting.findUnique({ where: { storeId } });
      if (fallback) return fallback;
      throw _err;
    }
  }

  /**
   * Save customized expense settings
   */
  static async saveExpenseSettings(
    storeId: string,
    data: {
      packagingCostPerOrder?: number;
      freightCostPerOrder?: number;
      rtoCostPerOrder?: number;
      gatewayFeePercent?: number;
      monthlyFixedOverhead?: number;
      defaultCogsPercent?: number;
      autoFetchMetaAds?: boolean;
      useEstimatedExpenses?: boolean;
      customRules?: string;
    }
  ) {
    if (!storeId) {
      throw new Error("storeId is required to save expense settings");
    }

    try {
      return await prisma.expenseSetting.upsert({
        where: { storeId },
        create: {
          storeId,
          packagingCostPerOrder: Number(data.packagingCostPerOrder ?? 30.0),
          freightCostPerOrder: Number(data.freightCostPerOrder ?? 90.0),
          rtoCostPerOrder: Number(data.rtoCostPerOrder ?? 90.0),
          gatewayFeePercent: Number(data.gatewayFeePercent ?? 2.0),
          monthlyFixedOverhead: Number(data.monthlyFixedOverhead ?? 0.0),
          defaultCogsPercent: Number(data.defaultCogsPercent ?? 35.0),
          autoFetchMetaAds: data.autoFetchMetaAds ?? true,
          useEstimatedExpenses: data.useEstimatedExpenses ?? true,
          customRules: data.customRules ?? "{}",
        },
        update: {
          packagingCostPerOrder: data.packagingCostPerOrder !== undefined ? Number(data.packagingCostPerOrder) : undefined,
          freightCostPerOrder: data.freightCostPerOrder !== undefined ? Number(data.freightCostPerOrder) : undefined,
          rtoCostPerOrder: data.rtoCostPerOrder !== undefined ? Number(data.rtoCostPerOrder) : undefined,
          gatewayFeePercent: data.gatewayFeePercent !== undefined ? Number(data.gatewayFeePercent) : undefined,
          monthlyFixedOverhead: data.monthlyFixedOverhead !== undefined ? Number(data.monthlyFixedOverhead) : undefined,
          defaultCogsPercent: data.defaultCogsPercent !== undefined ? Number(data.defaultCogsPercent) : undefined,
          autoFetchMetaAds: data.autoFetchMetaAds !== undefined ? Boolean(data.autoFetchMetaAds) : undefined,
          useEstimatedExpenses: data.useEstimatedExpenses !== undefined ? Boolean(data.useEstimatedExpenses) : undefined,
          customRules: data.customRules !== undefined ? String(data.customRules) : undefined,
        },
      });
    } catch (_err: any) {
      // In case of conflict, retry with update
      return await prisma.expenseSetting.update({
        where: { storeId },
        data: {
          packagingCostPerOrder: data.packagingCostPerOrder !== undefined ? Number(data.packagingCostPerOrder) : undefined,
          freightCostPerOrder: data.freightCostPerOrder !== undefined ? Number(data.freightCostPerOrder) : undefined,
          rtoCostPerOrder: data.rtoCostPerOrder !== undefined ? Number(data.rtoCostPerOrder) : undefined,
          gatewayFeePercent: data.gatewayFeePercent !== undefined ? Number(data.gatewayFeePercent) : undefined,
          monthlyFixedOverhead: data.monthlyFixedOverhead !== undefined ? Number(data.monthlyFixedOverhead) : undefined,
          defaultCogsPercent: data.defaultCogsPercent !== undefined ? Number(data.defaultCogsPercent) : undefined,
          autoFetchMetaAds: data.autoFetchMetaAds !== undefined ? Boolean(data.autoFetchMetaAds) : undefined,
          useEstimatedExpenses: data.useEstimatedExpenses !== undefined ? Boolean(data.useEstimatedExpenses) : undefined,
          customRules: data.customRules !== undefined ? String(data.customRules) : undefined,
        },
      });
    }
  }

  /**
   * Calculate Real Dynamic P&L with live Shopify sales, customizable expense rules, RTO charges, Damaged Goods loss, and recorded bills
   */
  static async calculatePnL(storeId: string, params: PnLFilterParams = {}) {
    const period = params.period || "30d";
    let dateFilter: any = {};
    const now = new Date();

    let daysInPeriod = 30;

    if (period === "today") {
      const start = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0, 0);
      dateFilter = { gte: start };
      daysInPeriod = 1;
    } else if (period === "yesterday") {
      const start = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1, 0, 0, 0, 0);
      const end = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0, 0);
      dateFilter = { gte: start, lt: end };
      daysInPeriod = 1;
    } else if (period === "7d") {
      const start = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
      dateFilter = { gte: start };
      daysInPeriod = 7;
    } else if (period === "30d") {
      const start = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
      dateFilter = { gte: start };
      daysInPeriod = 30;
    } else if (period === "this_month") {
      const start = new Date(now.getFullYear(), now.getMonth(), 1, 0, 0, 0, 0);
      dateFilter = { gte: start };
      daysInPeriod = Math.max(1, now.getDate());
    } else if (period === "custom" || (params.startDate && params.endDate)) {
      if (params.startDate && params.endDate) {
        const s = new Date(params.startDate);
        s.setHours(0, 0, 0, 0);
        const e = new Date(params.endDate);
        e.setHours(23, 59, 59, 999);
        dateFilter = { gte: s, lte: e };
        daysInPeriod = Math.max(1, Math.ceil((e.getTime() - s.getTime()) / (24 * 60 * 60 * 1000)));
      }
    }

    const settings = await this.getExpenseSettings(storeId);

    // 1. Fetch Orders in range with items
    const orders = await prisma.shopifyOrder.findMany({
      where: {
        storeId,
        createdAt: Object.keys(dateFilter).length > 0 ? dateFilter : undefined,
        deletedAt: null,
      },
      include: {
        items: { where: { deletedAt: null } },
      },
      orderBy: { createdAt: "desc" },
    });

    // 2. Fetch Shipments in range to accurately compute RTO & Delivered counts
    const shipments = await prisma.shipment.findMany({
      where: {
        storeId,
        createdAt: Object.keys(dateFilter).length > 0 ? dateFilter : undefined,
        deletedAt: null,
      },
    });

    // 3. Fetch Purchase Bills & Business Expenses in range
    const [bills, businessExpenses] = await Promise.all([
      prisma.purchaseBill.findMany({
        where: {
          storeId,
          status: { not: "CANCELLED" },
          billDate: Object.keys(dateFilter).length > 0 ? dateFilter : undefined,
        },
        include: { items: true },
        orderBy: { billDate: "desc" },
      }),
      prisma.businessExpense.findMany({
        where: {
          storeId,
          date: Object.keys(dateFilter).length > 0 ? dateFilter : undefined,
        },
        orderBy: { date: "desc" },
      }),
    ]);

    // 4. Fetch Stock Items for COGS unit costs & Shopify Catalog Variants for product names
    const [stockItems, shopifyVariants] = await Promise.all([
      prisma.stockItem.findMany({
        where: { storeId },
        include: {
          comboComponents: {
            include: { componentItem: true },
          },
        },
      }),
      prisma.shopifyVariant.findMany({
        where: { storeId },
        include: { product: true },
      }),
    ]);

    const stockItemMap = new Map<string, any>();
    stockItems.forEach((si) => stockItemMap.set(si.sku.toUpperCase(), si));

    const variantSkuMap = new Map<string, any>();
    shopifyVariants.forEach((v) => {
      if (v.sku) variantSkuMap.set(v.sku.trim().toUpperCase(), v);
    });

    // 5. Fetch Damage / Scrap Write-Off Ledger Entries in period
    const damageLedgerEntries = await prisma.inventoryLedger.findMany({
      where: {
        storeId,
        createdAt: Object.keys(dateFilter).length > 0 ? dateFilter : undefined,
        OR: [
          { type: "DAMAGE_QUARANTINE" },
          { type: "WRITE_OFF" },
          { notes: { contains: "damage", mode: "insensitive" } },
        ],
      },
      include: { stockItem: true },
      orderBy: { createdAt: "desc" },
    });

    let rtoDamageLossValue = 0;
    let damagedUnitsCount = 0;
    const damagedBreakdown = damageLedgerEntries.map((e) => {
      const qty = Math.abs(e.quantity);
      const unitCost = e.unitCost > 0 ? e.unitCost : (e.stockItem?.avgUnitCost || 0);
      const totalLoss = qty * unitCost;
      rtoDamageLossValue += totalLoss;
      damagedUnitsCount += qty;
      return {
        id: e.id,
        sku: e.sku,
        name: e.stockItem?.name || e.sku,
        quantity: qty,
        unitCost,
        totalLoss,
        referenceId: e.referenceId,
        createdAt: e.createdAt,
        notes: e.notes,
      };
    });

    // 6. Calculate Aggregate Sales, Payment Splits (Paid vs COD) & COGS
    let grossRevenue = 0;
    let prepaidRevenue = 0;
    let codRevenue = 0;
    let prepaidOrdersCount = 0;
    let codOrdersCount = 0;

    let rtoOrdersCount = 0;
    let rtoLostRevenue = 0;
    let deliveredOrdersCount = 0;

    let totalDiscounts = 0;
    let totalTax = 0;
    let totalUnitsSold = 0;
    let totalBOMCost = 0;

    const singleProductsBreakdownMap = new Map<string, any>();
    const bundledOrdersBreakdownMap = new Map<string, any>();
    const physicalSkuDeductionMap = new Map<string, any>();

    for (const order of orders) {
      grossRevenue += order.totalPrice;
      totalDiscounts += order.totalDiscounts;
      totalTax += order.totalTax;

      // Gateway fee split: Paid (Prepaid) vs Pending (COD)
      const isPaid = order.financialStatus?.toUpperCase() === "PAID";
      if (isPaid) {
        prepaidRevenue += order.totalPrice;
        prepaidOrdersCount++;
      } else {
        codRevenue += order.totalPrice;
        codOrdersCount++;
      }

      // Check RTO from order tags, delivery status, or shipments
      const isRto =
        order.deliveryStatus === "RTO" ||
        (order.tags && order.tags.toUpperCase().includes("RTO"));

      if (isRto) {
        rtoOrdersCount++;
        rtoLostRevenue += order.totalPrice;
      } else if (order.deliveryStatus === "DELIVERED") {
        deliveredOrdersCount++;
      }

      for (const item of order.items) {
        const itemQty = item.quantity || 1;
        totalUnitsSold += itemQty;

        const rawSku = (item.sku || "").trim().toUpperCase();
        const variantTitle = (item.variantTitle || "").trim();
        const stockItem = stockItemMap.get(rawSku);

        // Smart Combo Decomposition (via DB ComboComponent relations or delimiter syntax)
        let isCombo = false;
        let comboComponentsList: Array<{
          componentSku: string;
          quantity: number;
          name: string;
          variantTitle?: string;
          unitCost: number;
        }> = [];

        if (stockItem && stockItem.type === "COMBO" && stockItem.comboComponents?.length > 0) {
          isCombo = true;
          comboComponentsList = stockItem.comboComponents.map((c: any) => {
            const vMatch = variantSkuMap.get(c.componentSku.toUpperCase());
            const unitCost = Number(c.componentItem?.costPrice) > 0
              ? Number(c.componentItem?.costPrice)
              : (Number(c.componentItem?.avgUnitCost) || 0);
            return {
              componentSku: c.componentSku,
              quantity: c.quantity || 1,
              name: c.componentItem?.name || vMatch?.product?.title || c.componentSku,
              variantTitle: vMatch?.title || "",
              unitCost,
            };
          });
        } else if (rawSku.includes("-") || rawSku.includes("+")) {
          // Auto-decompose combo SKU syntax dynamically (e.g. ABC-XYZ -> ABC + XYZ)
          const parts = rawSku.split(/[-+]/).map((p: string) => p.trim()).filter(Boolean);
          const matchedComponents: any[] = [];
          let allPartsMatched = true;

          for (const p of parts) {
            const matchedStockItem = stockItemMap.get(p.toUpperCase());
            const vMatch = variantSkuMap.get(p.toUpperCase());

            if (matchedStockItem || vMatch) {
              const unitCost = Number(matchedStockItem?.costPrice) > 0
                ? Number(matchedStockItem?.costPrice)
                : (Number(matchedStockItem?.avgUnitCost) || 0);
              matchedComponents.push({
                componentSku: p.toUpperCase(),
                quantity: 1,
                name: matchedStockItem?.name || vMatch?.product?.title || p,
                variantTitle: vMatch?.title || "",
                unitCost,
              });
            } else {
              allPartsMatched = false;
              break;
            }
          }

          if (allPartsMatched && matchedComponents.length > 1) {
            isCombo = true;
            comboComponentsList = matchedComponents;
          }
        }

        // Calculate COGS for this line item
        let lineItemCogs = 0;

        if (isCombo && comboComponentsList.length > 0) {
          const totalComponentCost = comboComponentsList.reduce(
            (acc, c) => acc + c.unitCost * c.quantity,
            0
          );
          lineItemCogs = totalComponentCost * itemQty;
          totalBOMCost += lineItemCogs;

          // Decompose combo into individual single products
          for (const comp of comboComponentsList) {
            const compKey = comp.componentSku.toUpperCase();
            const componentUnits = comp.quantity * itemQty;
            const compUnitCost = comp.unitCost;
            const compTotalCost = compUnitCost * componentUnits;

            // Proportional share of revenue for this component
            const costRatio = totalComponentCost > 0 ? (compUnitCost * comp.quantity) / totalComponentCost : (1 / comboComponentsList.length);
            const compRevenue = item.totalPrice * costRatio;

            // 1. Single Product Breakdown Map
            const existingSingle = singleProductsBreakdownMap.get(compKey) || {
              productTitle: comp.name,
              variantTitle: comp.variantTitle,
              sku: comp.componentSku,
              unitsSold: 0,
              revenue: 0,
              unitCost: compUnitCost,
              totalCost: 0,
              isDecomposedComponent: true,
            };
            existingSingle.unitsSold += componentUnits;
            existingSingle.revenue += compRevenue;
            existingSingle.unitCost = compUnitCost;
            existingSingle.totalCost += compTotalCost;
            singleProductsBreakdownMap.set(compKey, existingSingle);

            // 2. Physical SKU Deduction Map
            const existingDeduction = physicalSkuDeductionMap.get(compKey) || {
              sku: comp.componentSku,
              name: comp.name,
              directUnits: 0,
              comboUnits: 0,
              totalUnits: 0,
              unitCost: compUnitCost,
              totalCost: 0,
            };
            existingDeduction.comboUnits += componentUnits;
            existingDeduction.totalUnits += componentUnits;
            existingDeduction.totalCost += compTotalCost;
            physicalSkuDeductionMap.set(compKey, existingDeduction);
          }
        } else {
          // Direct Single Item - prioritize costPrice (Unit Cost Without Profit)
          const unitCost = stockItem
            ? (Number(stockItem.costPrice) > 0 ? Number(stockItem.costPrice) : (Number(stockItem.avgUnitCost) || 0))
            : 0;
          lineItemCogs = unitCost * itemQty;
          totalBOMCost += lineItemCogs;

          const compKey = (rawSku || item.productTitle || "UNKNOWN").toUpperCase();
          const prodTitle = stockItem?.name || item.productTitle || rawSku;

          // 1. Single Product Breakdown Map
          const existingSingle = singleProductsBreakdownMap.get(compKey) || {
            productTitle: prodTitle,
            variantTitle: item.variantTitle,
            sku: rawSku || "—",
            unitsSold: 0,
            revenue: 0,
            unitCost,
            totalCost: 0,
            isDecomposedComponent: false,
          };
          existingSingle.unitsSold += itemQty;
          existingSingle.revenue += item.totalPrice;
          existingSingle.unitCost = unitCost;
          existingSingle.totalCost += lineItemCogs;
          singleProductsBreakdownMap.set(compKey, existingSingle);

          // 2. Physical SKU Deduction Map
          const existingDeduction = physicalSkuDeductionMap.get(compKey) || {
            sku: rawSku || "—",
            name: prodTitle,
            directUnits: 0,
            comboUnits: 0,
            totalUnits: 0,
            unitCost,
            totalCost: 0,
          };
          existingDeduction.directUnits += itemQty;
          existingDeduction.totalUnits += itemQty;
          existingDeduction.totalCost += lineItemCogs;
          physicalSkuDeductionMap.set(compKey, existingDeduction);
        }

        // Also track raw bundled order lines
        const bundleKey = rawSku ? `${rawSku}` : variantTitle ? `${item.productTitle}__${variantTitle}` : item.productTitle;
        const currentBundle = bundledOrdersBreakdownMap.get(bundleKey) || {
          productTitle: item.productTitle,
          variantTitle: item.variantTitle,
          sku: item.sku || rawSku,
          isCombo,
          components: comboComponentsList.map((c) => `${c.quantity}× ${c.componentSku}`),
          unitsSold: 0,
          revenue: 0,
          unitCost: lineItemCogs / itemQty,
          totalCost: 0,
        };
        currentBundle.unitsSold += itemQty;
        currentBundle.revenue += item.totalPrice;
        currentBundle.totalCost += lineItemCogs;
        bundledOrdersBreakdownMap.set(bundleKey, currentBundle);
      }
    }

    // Only factor in shipments that were actually dispatched and went into RTO (exclude pre-dispatch cancellations)
    const shipmentRtos = shipments.filter(
      (s) =>
        s.normalizedStatus === "RTO" &&
        (s.outwardScanned === true || (s.status && s.status.toLowerCase().includes("transit")) || (s.status && s.status.toLowerCase().includes("rto")))
    );
    if (shipmentRtos.length > rtoOrdersCount) {
      rtoOrdersCount = shipmentRtos.length;
    }

    // 7. Aggregate Recorded Purchase Bills & Business Expenses
    // Only include line items NOT already accounted for in P&L elsewhere.
    // alreadyAddedToPnl = true → exclude from P&L contribution (bill total stays intact).
    function billPnLAmount(bill: any): number {
      if (!bill.items || bill.items.length === 0) return bill.totalAmount;
      return bill.items.reduce((acc: number, item: any) => {
        if (item.alreadyAddedToPnl) return acc;
        return acc + (Number(item.totalAmount) || 0);
      }, 0);
    }

    let billedInventory = bills
      .filter((b) => b.billType === "INVENTORY")
      .reduce((acc, b) => acc + billPnLAmount(b), 0);

    let billedShipping = bills
      .filter((b) => b.billType === "SHIPPING_LOGISTICS" || b.billType === "TRANSPORTATION")
      .reduce((acc, b) => acc + billPnLAmount(b), 0);

    let billedPackaging = bills
      .filter((b) => b.billType === "PACKAGING")
      .reduce((acc, b) => acc + billPnLAmount(b), 0);

    let billedMarketing = bills
      .filter((b) => b.billType === "MARKETING_ADS")
      .reduce((acc, b) => acc + billPnLAmount(b), 0);

    let billedOverhead = bills
      .filter((b) => b.billType === "OPERATIONAL_OVERHEAD" || b.billType === "MISC")
      .reduce((acc, b) => acc + billPnLAmount(b), 0);

    // Merge logged business expenses by category
    businessExpenses.forEach((e) => {
      const cat = (e.category || "").toLowerCase();
      const amt = Number(e.amount) || 0;
      if (cat.includes("ship") || cat.includes("logistics") || cat.includes("freight")) {
        billedShipping += amt;
      } else if (cat.includes("pack")) {
        billedPackaging += amt;
      } else if (cat.includes("ad") || cat.includes("market")) {
        billedMarketing += amt;
      } else if (cat.includes("inventory")) {
        billedInventory += amt;
      } else {
        billedOverhead += amt;
      }
    });

    // 8. Apply Customizable & Auto-Fetched Rules

    // A. Product Cost (COGS)
    let finalCogs = totalBOMCost > 0 ? totalBOMCost : billedInventory;
    if (finalCogs === 0 && settings.defaultCogsPercent > 0 && grossRevenue > 0) {
      finalCogs = grossRevenue * (settings.defaultCogsPercent / 100);
    }

    // B. Packaging Expense (Average per order rate)
    const estimatedPackaging = orders.length * settings.packagingCostPerOrder;
    const finalPackaging = settings.useEstimatedExpenses
      ? Math.max(billedPackaging, estimatedPackaging)
      : billedPackaging;

    // C. Forward Freight & Logistics Expense (Average per shipped order rate - exclude pre-dispatch cancels)
    const shippedOrders = orders.filter(
      (o) =>
        (o.fulfillmentStatus === "FULFILLED" || o.deliveryStatus) &&
        o.deliveryStatus !== "CANCELLED_PRE_DISPATCH"
    );
    const estimatedFreight = (shippedOrders.length || orders.length) * settings.freightCostPerOrder;
    const finalFreight = settings.useEstimatedExpenses
      ? Math.max(billedShipping, estimatedFreight)
      : billedShipping;

    // D. RTO Reverse Freight & Penalty Charges (Applied strictly to In-Transit RTOs, 0 on Pre-Dispatch Cancels)
    const rtoUnitCost = (settings as any).rtoCostPerOrder ?? 90.0;
    const finalRtoFreight = rtoOrdersCount * rtoUnitCost;

    // E. Marketing & All Ads Spend (Aggregated across ALL connected Ad Accounts + Bills)
    let liveAllAdsSpend = 0;
    let activeAdAccountsCount = 0;
    let adAccountsBreakdown: Array<{ id: string; name: string; platform: string; spend: number; currency: string }> = [];

    if (settings.autoFetchMetaAds) {
      try {
        const allAdsData = await PnLService.fetchAllAdAccountsSpend(storeId, params);
        liveAllAdsSpend = allAdsData.totalAdSpend;
        activeAdAccountsCount = allAdsData.activeAccountsCount;
        adAccountsBreakdown = allAdsData.accountsBreakdown;
      } catch (e) {
        console.error("Error fetching all ad accounts spend:", e);
        const adMetrics = await prisma.adDailyMetric.findMany({
          where: { storeId },
        });
        liveAllAdsSpend = adMetrics.reduce((acc, m) => acc + (m.spend || 0), 0);
      }
    }
    const finalMarketing = liveAllAdsSpend + billedMarketing;

    // F. Gateway Fees: ONLY APPLIED TO PREPAID / PAID REVENUE! (0% on COD)
    const gatewayFees = prepaidRevenue * (settings.gatewayFeePercent / 100);

    // G. Overheads & Rent (Pro-rated monthly fixed + billed)
    const proRatedFixedOverhead = (settings.monthlyFixedOverhead / 30) * daysInPeriod;
    const finalOverhead = billedOverhead + proRatedFixedOverhead;

    // 9. Calculate Bottomline Profits (including RTO reverse freight AND RTO damaged goods loss)
    const totalExpenses =
      finalCogs +
      finalFreight +
      finalRtoFreight +
      rtoDamageLossValue +
      finalPackaging +
      finalMarketing +
      finalOverhead +
      gatewayFees;

    const grossProfit = grossRevenue - finalCogs - finalPackaging;
    const grossMarginPercent = grossRevenue > 0 ? (grossProfit / grossRevenue) * 100 : 0;
    const netProfit = grossRevenue - totalExpenses;
    const netMarginPercent = grossRevenue > 0 ? (netProfit / grossRevenue) * 100 : 0;

    return {
      period,
      settings: {
        ...settings,
        rtoCostPerOrder: rtoUnitCost,
      },
      summary: {
        revenue: grossRevenue,
        prepaidRevenue,
        codRevenue,
        prepaidOrdersCount,
        codOrdersCount,
        rtoOrdersCount,
        rtoLostRevenue,
        deliveredOrdersCount,
        ordersCount: orders.length,
        unitsSold: totalUnitsSold,
        totalDiscounts,
        totalTax,
        expenses: {
          inventoryPurchases: finalCogs,
          shippingExpense: finalFreight,
          rtoExpense: finalRtoFreight,
          rtoDamageLoss: rtoDamageLossValue,
          damagedUnitsCount,
          packagingExpense: finalPackaging,
          marketingExpense: finalMarketing,
          overheadExpense: finalOverhead,
          gatewayFees,
          totalExpenses,
          breakdownDetails: {
            cogsFromBOM: totalBOMCost,
            billedInventory,
            estimatedFreight,
            billedShipping,
            rtoOrdersCount,
            rtoUnitCost,
            finalRtoFreight,
            rtoDamageLossValue,
            damagedUnitsCount,
            estimatedPackaging,
            billedPackaging,
            liveMetaSpend: liveAllAdsSpend,
            allAdsSpent: liveAllAdsSpend,
            activeAdAccountsCount,
            adAccountsBreakdown,
            billedMarketing,
            proRatedFixedOverhead,
            billedOverhead,
            gatewayFeeOnPrepaid: gatewayFees,
          },
        },
        grossProfit,
        grossMarginPercent,
        netProfit,
        netMarginPercent,
      },
      billsBreakdown: bills.slice(0, 15),
      damagedBreakdown,
      productBreakdown: Array.from(singleProductsBreakdownMap.values()).sort(
        (a, b) => b.revenue - a.revenue
      ),
      bundledBreakdown: Array.from(bundledOrdersBreakdownMap.values()).sort(
        (a, b) => b.revenue - a.revenue
      ),
      physicalSkuDeductions: Array.from(physicalSkuDeductionMap.values()).sort(
        (a, b) => b.totalUnits - a.totalUnits
      ),
    };
  }

  /**
   * Fetch total ad spend aggregated across ALL active connected ad accounts
   */
  static async fetchAllAdAccountsSpend(storeId: string, params: PnLFilterParams = {}) {
    const period = params.period || "30d";
    let totalAdSpend = 0;
    const accountsBreakdown: Array<{
      id: string;
      name: string;
      platform: string;
      spend: number;
      currency: string;
    }> = [];

    // 1. Fetch from AdPlatformAccount
    let adPlatformAccounts: any[] = [];
    try {
      adPlatformAccounts = await prisma.adPlatformAccount.findMany({
        where: { storeId, status: "ACTIVE" },
      });
    } catch {}

    // 2. Fetch from MetaAccount
    let metaAccounts: any[] = [];
    try {
      metaAccounts = await prisma.metaAccount.findMany({
        where: { storeId, status: "ACTIVE" },
      });
    } catch {}

    // Merge unique active accounts
    const mergedAccounts: Array<{
      id: string;
      platform: string;
      accountId: string;
      name: string;
      accessToken?: string | null;
      currency: string;
    }> = [];

    const seenIds = new Set<string>();

    for (const a of adPlatformAccounts) {
      const cleanId = a.accountId.replace(/^act_/i, "").trim().toLowerCase();
      if (!seenIds.has(cleanId)) {
        seenIds.add(cleanId);
        mergedAccounts.push({
          id: a.id,
          platform: a.platform,
          accountId: a.accountId,
          name: a.accountName,
          accessToken: a.accessToken,
          currency: a.currency || "INR",
        });
      }
    }

    for (const ma of metaAccounts) {
      const cleanId = ma.adAccountId.replace(/^act_/i, "").trim().toLowerCase();
      if (!seenIds.has(cleanId)) {
        seenIds.add(cleanId);
        mergedAccounts.push({
          id: ma.id,
          platform: "META",
          accountId: ma.adAccountId,
          name: ma.name,
          accessToken: ma.accessToken,
          currency: ma.currency || "INR",
        });
      }
    }

    // 3. Query spend for each account
    for (const acc of mergedAccounts) {
      let spend = 0;

      if (acc.platform === "META" && acc.accessToken) {
        const cleanAdAccountId = acc.accountId.startsWith("act_") ? acc.accountId : `act_${acc.accountId}`;
        let dateQuery = `date_preset=${
          period === "today"
            ? "today"
            : period === "yesterday"
            ? "yesterday"
            : period === "7d"
            ? "last_7d"
            : period === "this_month"
            ? "this_month"
            : "last_30d"
        }`;

        if (params.startDate && params.endDate) {
          const s = new Date(params.startDate).toISOString().split("T")[0];
          const e = new Date(params.endDate).toISOString().split("T")[0];
          dateQuery = `time_range={'since':'${s}','until':'${e}'}`;
        }

        try {
          const url = `https://graph.facebook.com/v19.0/${cleanAdAccountId}/insights?${dateQuery}&fields=spend,impressions,clicks&access_token=${acc.accessToken}`;
          const res = await fetch(url);
          if (res.ok) {
            const data = await res.json();
            if (data.data && data.data.length > 0) {
              spend = parseFloat(data.data[0].spend || "0");
            }
          }
        } catch (err) {
          console.error(`Error querying Meta API for ${cleanAdAccountId}:`, err);
        }
      }

      // If live API returned 0 or wasn't reachable, check database recorded daily metrics
      if (spend === 0) {
        try {
          let sDateStr = "";
          let eDateStr = "";
          if (params.startDate && params.endDate) {
            sDateStr = new Date(params.startDate).toISOString().split("T")[0];
            eDateStr = new Date(params.endDate).toISOString().split("T")[0];
          } else {
            const now = new Date();
            if (period === "today") {
              sDateStr = now.toISOString().split("T")[0];
              eDateStr = sDateStr;
            } else if (period === "yesterday") {
              const y = new Date(now);
              y.setDate(y.getDate() - 1);
              sDateStr = y.toISOString().split("T")[0];
              eDateStr = sDateStr;
            } else if (period === "7d") {
              const d7 = new Date(now);
              d7.setDate(d7.getDate() - 7);
              sDateStr = d7.toISOString().split("T")[0];
              eDateStr = now.toISOString().split("T")[0];
            } else if (period === "this_month") {
              const mStart = new Date(now.getFullYear(), now.getMonth(), 1);
              sDateStr = mStart.toISOString().split("T")[0];
              eDateStr = now.toISOString().split("T")[0];
            } else {
              const d30 = new Date(now);
              d30.setDate(d30.getDate() - 30);
              sDateStr = d30.toISOString().split("T")[0];
              eDateStr = now.toISOString().split("T")[0];
            }
          }

          const adDateFilter = sDateStr && eDateStr ? { gte: sDateStr, lte: eDateStr } : undefined;

          const dbMetrics = await prisma.adDailyMetric.findMany({
            where: {
              storeId,
              accountId: acc.id,
              date: adDateFilter,
            },
          });
          if (dbMetrics.length > 0) {
            spend = dbMetrics.reduce((s, m) => s + (m.spend || 0), 0);
          } else {
            const metaMetrics = await prisma.metaDailyMetric.findMany({
              where: {
                storeId,
                date: adDateFilter,
                OR: [
                  { metaAccountId: acc.id },
                  { account: { adAccountId: acc.accountId } },
                ],
              },
            });
            spend = metaMetrics.reduce((s, m) => s + (m.spend || 0), 0);
          }
        } catch {}
      }

      totalAdSpend += spend;
      accountsBreakdown.push({
        id: acc.id,
        name: acc.name,
        platform: acc.platform,
        spend,
        currency: acc.currency,
      });
    }

    return {
      totalAdSpend,
      activeAccountsCount: mergedAccounts.length,
      accountsBreakdown,
    };
  }
}

