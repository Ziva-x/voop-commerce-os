import prisma from "@/lib/prisma";
import { PnLService } from "./PnLService";
import { AdPlatformService } from "./AdPlatformService";
import { PurchasesService } from "./PurchasesService";
import {
  calculateRevenue,
  calculateNetRevenue,
  calculateAOV,
  calculateGrossProfit,
  calculateGrossMargin,
  calculateNetProfit,
  calculateNetMargin,
  calculateCODRatio,
  calculatePrepaidRatio,
  calculateDeliveryRate,
  calculateRTORate,
  calculateReturnRate,
  calculateCancellationRate,
  calculateROAS,
  calculateMER,
  calculateCAC,
  calculateRepeatPurchaseRate,
  calculateBusinessHealthScore,
  BusinessHealthResult,
} from "./analytics/kpi-calculator";

/**
 * Normalizes purchase bill and item categories into user-facing category labels
 */
export function normalizeExpenseCategory(rawCategory?: string | null, billType?: string | null): string {
  const cat = (rawCategory || billType || "Other").trim();
  const upper = cat.toUpperCase();
  if (upper === "PACKAGING" || upper === "PACKAGING SUPPLIES") return "Packaging";
  if (upper === "INVENTORY" || upper === "INVENTORY (GRN)" || upper === "RAW MATERIALS" || upper === "PRODUCT COST") return "Raw Materials";
  if (upper === "TRANSPORTATION" || upper === "SHIPPING_LOGISTICS" || upper === "SHIPPING" || upper === "COURIER" || upper === "TRANSPORTATION & FREIGHT" || upper === "FREIGHT") return "Courier";
  if (upper === "MARKETING_ADS" || upper === "MARKETING / COLLAB" || upper === "ADVERTISING" || upper === "MARKETING") return "Advertising";
  if (upper === "OPERATIONAL_OVERHEAD" || upper === "OVERHEAD & RENT" || upper === "OVERHEAD") return "Overhead & Rent";
  if (upper === "PAYMENT_GATEWAY" || upper === "PAYMENT GATEWAY") return "Payment Gateway";
  if (upper === "SALARIES") return "Salaries";
  if (upper === "SOFTWARE" || upper === "SOFTWARE / APPS") return "Software / Apps";
  if (upper === "MISC" || upper === "GENERAL BUSINESS") return "Other";
  return cat;
}

export interface AnalyticsQueryOptions {
  period?: "today" | "yesterday" | "7d" | "30d" | "this_month" | "prev_month" | "year" | "custom";
  startDate?: string;
  endDate?: string;
  comparison?: "none" | "previous_period" | "previous_year";
}

export class AnalyticsService {
  /**
   * Helper to resolve Date Range boundaries for primary and comparison periods
   */
  public static getDateRanges(options: AnalyticsQueryOptions) {
    const now = new Date();
    const period = options.period || "30d";
    let start = new Date();
    let end = new Date();

    if (period === "today") {
      start = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0, 0);
      end = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59, 999);
    } else if (period === "yesterday") {
      start = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1, 0, 0, 0, 0);
      end = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1, 23, 59, 59, 999);
    } else if (period === "7d") {
      start = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
      end = new Date(now);
    } else if (period === "30d") {
      start = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
      end = new Date(now);
    } else if (period === "this_month") {
      start = new Date(now.getFullYear(), now.getMonth(), 1, 0, 0, 0, 0);
      end = new Date(now);
    } else if (period === "prev_month") {
      start = new Date(now.getFullYear(), now.getMonth() - 1, 1, 0, 0, 0, 0);
      end = new Date(now.getFullYear(), now.getMonth(), 0, 23, 59, 59, 999);
    } else if (period === "year") {
      start = new Date(now.getFullYear(), 0, 1, 0, 0, 0, 0);
      end = new Date(now);
    } else if (period === "custom" && options.startDate && options.endDate) {
      start = new Date(options.startDate);
      start.setHours(0, 0, 0, 0);
      end = new Date(options.endDate);
      end.setHours(23, 59, 59, 999);
    } else {
      // Default to 30 days
      start = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
      end = new Date(now);
    }

    const durationMs = end.getTime() - start.getTime();

    // Comparison range calculation
    let compStart: Date | null = null;
    let compEnd: Date | null = null;
    const comparison = options.comparison || "previous_period";

    if (comparison === "previous_period") {
      compEnd = new Date(start.getTime() - 1);
      compStart = new Date(compEnd.getTime() - durationMs);
    } else if (comparison === "previous_year") {
      compStart = new Date(start);
      compStart.setFullYear(compStart.getFullYear() - 1);
      compEnd = new Date(end);
      compEnd.setFullYear(compEnd.getFullYear() - 1);
    }

    return {
      period,
      start,
      end,
      comparison,
      compStart,
      compEnd,
      durationDays: Math.max(1, Math.ceil(durationMs / (24 * 60 * 60 * 1000))),
    };
  }

  /**
   * Main unified analytics report aggregator
   */
  public static async getAnalyticsOverview(storeId: string, options: AnalyticsQueryOptions) {
    const dates = this.getDateRanges(options);

    const startDateStr = dates.start.toISOString().split("T")[0];
    const endDateStr = dates.end.toISOString().split("T")[0];
    const compStartStr = dates.compStart ? dates.compStart.toISOString().split("T")[0] : undefined;
    const compEndStr = dates.compEnd ? dates.compEnd.toISOString().split("T")[0] : undefined;

    // Ensure live ad spend is fresh if querying today or current period
    const todayStr = new Date().toISOString().split("T")[0];
    if (endDateStr >= todayStr) {
      try {
        const activeAccounts = await prisma.adPlatformAccount.findMany({
          where: { storeId, status: "ACTIVE" },
          select: { id: true, lastSyncedAt: true },
        });
        if (activeAccounts.length > 0) {
          const needsSync = activeAccounts.some(
            (a) => !a.lastSyncedAt || Date.now() - new Date(a.lastSyncedAt).getTime() > 10 * 60 * 1000
          );
          if (needsSync) {
            await AdPlatformService.syncAllConnectedAccounts(storeId);
          }
        }
      } catch (syncErr) {
        console.error("[ANALYTICS_AUTO_AD_SYNC_ERROR]", syncErr);
      }
    }

    // 1. Fetch Primary Period & Comparison Period data in parallel
    const [
      primaryOrders,
      compOrders,
      shipments,
      compShipments,
      stockItems,
      metaMetrics,
      compMetaMetrics,
      adAccounts,
      purchaseBills,
      expenseSetting,
      lifetimeOrders,
    ] = await Promise.all([
      // Primary Orders
      prisma.shopifyOrder.findMany({
        where: {
          storeId,
          createdAt: { gte: dates.start, lte: dates.end },
          deletedAt: null,
        },
        include: {
          items: { where: { deletedAt: null } },
          fulfillments: true,
        },
        orderBy: { createdAt: "asc" },
      }),

      // Comparison Orders (if comparison enabled)
      dates.compStart && dates.compEnd
        ? prisma.shopifyOrder.findMany({
            where: {
              storeId,
              createdAt: { gte: dates.compStart, lte: dates.compEnd },
              deletedAt: null,
            },
            include: {
              items: { where: { deletedAt: null } },
            },
          })
        : Promise.resolve([]),

      // Shipments in primary period
      prisma.shipment.findMany({
        where: {
          storeId,
          createdAt: { gte: dates.start, lte: dates.end },
          deletedAt: null,
        },
      }),

      // Shipments in comparison period
      dates.compStart && dates.compEnd
        ? prisma.shipment.findMany({
            where: {
              storeId,
              createdAt: { gte: dates.compStart, lte: dates.compEnd },
              deletedAt: null,
            },
          })
        : Promise.resolve([]),

      // Stock Items for COGS mapping
      prisma.stockItem.findMany({
        where: { storeId },
        include: {
          comboComponents: {
            include: { componentItem: true },
          },
        },
      }),

      // Omnichannel ad metrics in primary period (META, GOOGLE, SNAPCHAT, REDDIT)
      prisma.adDailyMetric.findMany({
        where: {
          storeId,
          date: { gte: startDateStr, lte: endDateStr },
        },
      }),

      // Omnichannel ad metrics in comparison period
      compStartStr && compEndStr
        ? prisma.adDailyMetric.findMany({
            where: {
              storeId,
              date: { gte: compStartStr, lte: compEndStr },
            },
          })
        : Promise.resolve([]),

      // Connected ad platform accounts
      prisma.adPlatformAccount.findMany({
        where: { storeId },
      }),

      // Purchase Bills recorded (Single Source of Truth for Expenses)
      prisma.purchaseBill.findMany({
        where: {
          storeId,
          status: { not: "CANCELLED" },
        },
        include: {
          items: true,
        },
        orderBy: { billDate: "desc" },
      }),

      // Expense settings
      prisma.expenseSetting.findUnique({
        where: { storeId },
      }),

      // Lifetime orders for Customer Retention cohort analysis
      prisma.shopifyOrder.findMany({
        where: { storeId, deletedAt: null },
        select: {
          id: true,
          email: true,
          phone: true,
          totalPrice: true,
          createdAt: true,
          rawPayload: true,
        },
        orderBy: { createdAt: "asc" },
      }),
    ]);

    // 0. Fetch Unified P&L Data from PnLService (including purchase bills, expense bills, and stock unit costs)
    const [pnl, compPnl] = await Promise.all([
      PnLService.calculatePnL(storeId, {
        period: (dates.period === "this_month" || dates.period === "7d" || dates.period === "30d" || dates.period === "today" || dates.period === "yesterday") ? dates.period : "custom",
        startDate: dates.start.toISOString(),
        endDate: dates.end.toISOString(),
      }),
      dates.comparison !== "none" && dates.compStart && dates.compEnd
        ? PnLService.calculatePnL(storeId, {
            period: "custom",
            startDate: dates.compStart.toISOString(),
            endDate: dates.compEnd.toISOString(),
          })
        : Promise.resolve(null),
    ]);

    // Build Stock Cost Lookup Map (Unit Cost without profit)
    const stockCostMap = new Map<string, number>();
    stockItems.forEach((s) => {
      const cost = (Number(s.costPrice) > 0 ? Number(s.costPrice) : Number(s.avgUnitCost)) || 0;
      stockCostMap.set(s.sku.toUpperCase().trim(), cost);
      if (s.type === "COMBO" && s.comboComponents && s.comboComponents.length > 0) {
        const comboCost = s.comboComponents.reduce((acc, c) => {
          const compCost = (Number(c.componentItem?.costPrice) > 0 ? Number(c.componentItem?.costPrice) : Number(c.componentItem?.avgUnitCost)) || 0;
          return acc + c.quantity * compCost;
        }, 0);
        stockCostMap.set(s.sku.toUpperCase().trim(), comboCost);
      }
    });

    // Helper to calculate total COGS for a set of orders
    const computeOrdersCOGS = (orders: typeof primaryOrders) => {
      let totalCogs = 0;
      for (const o of orders) {
        for (const item of o.items) {
          const sku = (item.sku || "").toUpperCase().trim();
          const unitCost = stockCostMap.get(sku) || 0;
          totalCogs += item.quantity * unitCost;
        }
      }
      return Number(totalCogs.toFixed(2));
    };

    // Calculate COGS (aligned directly with PnL BOM and unit costs without profit)
    const primaryCogs = pnl.summary.expenses.inventoryPurchases > 0
      ? pnl.summary.expenses.inventoryPurchases
      : computeOrdersCOGS(primaryOrders);
    const compCogs = compPnl && compPnl.summary.expenses.inventoryPurchases > 0
      ? compPnl.summary.expenses.inventoryPurchases
      : computeOrdersCOGS(compOrders as any);

    // Calculate Omnichannel Ad Spend & Provider Breakdown (Google, Meta, Snapchat, Reddit)
    const providerBreakdown: Record<
      "META" | "GOOGLE" | "SNAPCHAT" | "REDDIT",
      {
        platform: string;
        name: string;
        connected: boolean;
        spend: number;
        revenue: number;
        roas: number;
        impressions: number;
        clicks: number;
        conversions: number;
        cpc: number;
        cpm: number;
        ctr: number;
      }
    > = {
      META: {
        platform: "META",
        name: "Meta (Facebook & Instagram)",
        connected: adAccounts.some((a) => a.platform === "META" && a.status === "ACTIVE"),
        spend: 0,
        revenue: 0,
        roas: 0,
        impressions: 0,
        clicks: 0,
        conversions: 0,
        cpc: 0,
        cpm: 0,
        ctr: 0,
      },
      GOOGLE: {
        platform: "GOOGLE",
        name: "Google Ads",
        connected: adAccounts.some((a) => a.platform === "GOOGLE" && a.status === "ACTIVE"),
        spend: 0,
        revenue: 0,
        roas: 0,
        impressions: 0,
        clicks: 0,
        conversions: 0,
        cpc: 0,
        cpm: 0,
        ctr: 0,
      },
      SNAPCHAT: {
        platform: "SNAPCHAT",
        name: "Snapchat Ads",
        connected: adAccounts.some((a) => a.platform === "SNAPCHAT" && a.status === "ACTIVE"),
        spend: 0,
        revenue: 0,
        roas: 0,
        impressions: 0,
        clicks: 0,
        conversions: 0,
        cpc: 0,
        cpm: 0,
        ctr: 0,
      },
      REDDIT: {
        platform: "REDDIT",
        name: "Reddit Ads",
        connected: adAccounts.some((a) => a.platform === "REDDIT" && a.status === "ACTIVE"),
        spend: 0,
        revenue: 0,
        roas: 0,
        impressions: 0,
        clicks: 0,
        conversions: 0,
        cpc: 0,
        cpm: 0,
        ctr: 0,
      },
    };

    metaMetrics.forEach((m: any) => {
      const p = (m.platform || "META").toUpperCase() as "META" | "GOOGLE" | "SNAPCHAT" | "REDDIT";
      if (providerBreakdown[p]) {
        providerBreakdown[p].spend += m.spend || 0;
        providerBreakdown[p].revenue += m.revenue || 0;
        providerBreakdown[p].impressions += m.impressions || 0;
        providerBreakdown[p].clicks += m.clicks || 0;
        providerBreakdown[p].conversions += m.conversions || 0;
      }
    });

    // Finalize provider level ROAS, CPC, CPM, CTR
    Object.values(providerBreakdown).forEach((p) => {
      p.spend = Number(p.spend.toFixed(2));
      p.revenue = Number(p.revenue.toFixed(2));
      p.roas = p.spend > 0 ? Number((p.revenue / p.spend).toFixed(2)) : 0;
      p.cpc = p.clicks > 0 ? Number((p.spend / p.clicks).toFixed(2)) : 0;
      p.cpm = p.impressions > 0 ? Number(((p.spend / p.impressions) * 1000).toFixed(2)) : 0;
      p.ctr = p.impressions > 0 ? Number(((p.clicks / p.impressions) * 100).toFixed(2)) : 0;
    });

    const primaryAdSpend = Number(metaMetrics.reduce((acc: number, m: any) => acc + (m.spend || 0), 0).toFixed(2));
    const compAdSpend = Number(compMetaMetrics.reduce((acc: number, m: any) => acc + (m.spend || 0), 0).toFixed(2));
    const primaryAttributedRevenue = Number(metaMetrics.reduce((acc: number, m: any) => acc + (m.revenue || 0), 0).toFixed(2));
    const totalAdClicks = metaMetrics.reduce((acc: number, m: any) => acc + (m.clicks || 0), 0);
    const totalAdImpressions = metaMetrics.reduce((acc: number, m: any) => acc + (m.impressions || 0), 0);
    const totalAdConversions = metaMetrics.reduce((acc: number, m: any) => acc + (m.conversions || 0), 0);

    const hasAdIntegration =
      adAccounts.some((a: any) => a.status === "ACTIVE") ||
      primaryAdSpend > 0 ||
      metaMetrics.length > 0;

    // Purchase bills / expenses in period — only non-excluded lines count toward P&L
    const expensesInPeriod = purchaseBills.filter((b: any) => {
      const d = new Date(b.billDate);
      return d >= dates.start && d <= dates.end;
    });
    const totalOtherExpenses = expensesInPeriod.reduce((acc: number, b: any) => {
      if (!b.items || b.items.length === 0) return acc + (b.totalAmount || 0);
      return acc + b.items.reduce((s: number, item: any) =>
        item.alreadyAddedToPnl ? s : s + (Number(item.totalAmount) || 0), 0);
    }, 0);

    // Settings defaults for estimated operational costs
    const packagingCostRate = expenseSetting?.packagingCostPerOrder ?? 30.0;
    const freightCostRate = expenseSetting?.freightCostPerOrder ?? 90.0;
    const rtoCostRate = expenseSetting?.rtoCostPerOrder ?? 90.0;
    const gatewayFeePct = expenseSetting?.gatewayFeePercent ?? 2.0;

    // --- 1. PRIMARY METRICS COMPUTATION ---
    const totalRevenue = calculateRevenue(primaryOrders);
    const orderCount = primaryOrders.length;
    const aov = calculateAOV(totalRevenue, orderCount);
    const totalDiscounts = primaryOrders.reduce((acc, o) => acc + (o.totalDiscounts || 0), 0);
    const netRevenue = calculateNetRevenue(primaryOrders);
    const grossProfit = calculateGrossProfit(netRevenue, primaryCogs);
    const grossMargin = calculateGrossMargin(grossProfit, netRevenue);
    const mer = calculateMER(totalRevenue, primaryAdSpend);

    // Comparison metrics
    const compRevenue = calculateRevenue(compOrders);
    const compOrderCount = compOrders.length;
    const compAov = calculateAOV(compRevenue, compOrderCount);
    const compNetRevenue = calculateNetRevenue(compOrders);
    const compGrossProfit = calculateGrossProfit(compNetRevenue, compCogs);
    const compGrossMargin = calculateGrossMargin(compGrossProfit, compNetRevenue);
    const compMer = calculateMER(compRevenue, compAdSpend);

    const calcDelta = (curr: number, prev: number) => {
      if (!prev || prev <= 0) return curr > 0 ? 100 : 0;
      return Number((((curr - prev) / prev) * 100).toFixed(1));
    };

    // --- 2. COD VS PREPAID CALCULATIONS ---
    let codOrdersCount = 0;
    let codRevenue = 0;
    let codCancelledCount = 0;
    let codRtoCount = 0;
    let codShippedCount = 0;

    let prepaidOrdersCount = 0;
    let prepaidRevenue = 0;
    let prepaidCompletedCount = 0;

    primaryOrders.forEach((o) => {
      let isCod = false;
      try {
        const payload = o.rawPayload ? JSON.parse(o.rawPayload) : null;
        const gws: string[] = payload?.payment_gateway_names || (payload?.gateway ? [payload.gateway] : []);
        isCod =
          gws.some(
            (g) =>
              typeof g === "string" &&
              (g.toLowerCase().includes("cod") ||
                g.toLowerCase().includes("cash") ||
                g.toLowerCase().includes("delivery"))
          ) || payload?.gateway === "cash_on_delivery";
      } catch (_) {}

      const isCancelled = Boolean(o.cancelledAt) || o.financialStatus === "VOIDED";
      const isDelivered = o.deliveryStatus === "DELIVERED";
      const isRto =
        o.deliveryStatus === "RTO" ||
        o.deliveryStatus === "RTO_DELIVERED" ||
        o.deliveryStatus === "RTO_IN_TRANSIT" ||
        o.rtoInwardScanned;
      const isShipped = Boolean(o.fulfillmentStatus === "FULFILLED" || o.outwardScanned || o.fulfillments.length > 0);

      if (isCod) {
        codOrdersCount++;
        codRevenue += o.totalPrice || 0;
        if (isCancelled) codCancelledCount++;
        if (isShipped) codShippedCount++;
        if (isRto) codRtoCount++;
      } else {
        prepaidOrdersCount++;
        prepaidRevenue += o.totalPrice || 0;
        if (isDelivered || o.financialStatus === "PAID") prepaidCompletedCount++;
      }
    });

    const codPct = calculateCODRatio(codOrdersCount, orderCount);
    const prepaidPct = calculatePrepaidRatio(prepaidOrdersCount, orderCount);
    const codCancellationRate = calculateCancellationRate(codCancelledCount, codOrdersCount);
    const codRtoRate = calculateRTORate(codRtoCount, codShippedCount);
    const prepaidConversionRate =
      prepaidOrdersCount > 0 ? Number(((prepaidCompletedCount / prepaidOrdersCount) * 100).toFixed(1)) : 0;

    // --- 3. DELIVERY & FULFILLMENT FUNNEL ---
    let fulfilledCount = 0;
    let shippedCount = 0;
    let deliveredCount = 0;
    let rtoCount = 0;
    let returnCount = 0;
    let cancelledCount = 0;

    let totalDeliveryHours = 0;
    let deliveryCountWithDates = 0;
    let totalFulfillmentHours = 0;
    let fulfillmentCountWithDates = 0;

    primaryOrders.forEach((o) => {
      const isCancelled = Boolean(o.cancelledAt);
      if (isCancelled) cancelledCount++;

      const isFulfilled = o.fulfillmentStatus === "FULFILLED" || o.fulfillments.length > 0;
      if (isFulfilled) fulfilledCount++;

      const isShipped = Boolean(o.outwardScanned || o.fulfillments.some((f) => f.trackingNumber));
      if (isShipped) shippedCount++;

      const isDelivered = o.deliveryStatus === "DELIVERED";
      if (isDelivered) deliveredCount++;

      const isRto =
        o.deliveryStatus === "RTO" ||
        o.deliveryStatus === "RTO_DELIVERED" ||
        o.deliveryStatus === "RTO_IN_TRANSIT" ||
        o.rtoInwardScanned;
      if (isRto) rtoCount++;

      // Fulfillment time calculation
      if (o.fulfillments.length > 0 && o.createdAt) {
        const firstFulfillment = o.fulfillments[0];
        const fTime = new Date(firstFulfillment.createdAt).getTime() - new Date(o.createdAt).getTime();
        if (fTime > 0) {
          totalFulfillmentHours += fTime / (1000 * 60 * 60);
          fulfillmentCountWithDates++;
        }
      }

      // Delivery time calculation
      const delFulfillment = o.fulfillments.find((f) => f.deliveryDate && f.pickupDate);
      if (delFulfillment?.deliveryDate && delFulfillment?.pickupDate) {
        const dTime =
          new Date(delFulfillment.deliveryDate).getTime() - new Date(delFulfillment.pickupDate).getTime();
        if (dTime > 0) {
          totalDeliveryHours += dTime / (1000 * 60 * 60);
          deliveryCountWithDates++;
        }
      }
    });

    // Merge shipment records if not captured in orders
    if (shipments.length > 0) {
      deliveredCount = Math.max(
        deliveredCount,
        shipments.filter((s) => s.normalizedStatus === "DELIVERED").length
      );
      rtoCount = Math.max(
        rtoCount,
        shipments.filter((s) => s.normalizedStatus === "RTO" || s.rtoInwardScanned).length
      );
    }

    const fulfillmentRate = calculateDeliveryRate(fulfilledCount, orderCount);
    const shippedRate = calculateDeliveryRate(shippedCount, Math.max(1, fulfilledCount));
    const deliveryRate = calculateDeliveryRate(deliveredCount, Math.max(1, shippedCount));
    const rtoRate = calculateRTORate(rtoCount, Math.max(1, shippedCount));
    const returnRate = calculateReturnRate(returnCount, Math.max(1, deliveredCount));
    const cancellationRate = calculateCancellationRate(cancelledCount, orderCount);

    const avgDeliveryTimeDays =
      deliveryCountWithDates > 0 ? Number((totalDeliveryHours / (deliveryCountWithDates * 24)).toFixed(1)) : 3.8;
    const avgFulfillmentTimeHours =
      fulfillmentCountWithDates > 0 ? Number((totalFulfillmentHours / fulfillmentCountWithDates).toFixed(1)) : 8.5;

    // --- 4. COURIER PERFORMANCE TABLE ---
    const courierMap = new Map<
      string,
      {
        courier: string;
        orders: number;
        shipped: number;
        delivered: number;
        rto: number;
        totalDeliveryDays: number;
        deliveryCount: number;
      }
    >();

    shipments.forEach((s) => {
      const courierName = s.carrier || s.trackingCompany || s.courierType || "Delhivery";
      const existing = courierMap.get(courierName) || {
        courier: courierName,
        orders: 0,
        shipped: 0,
        delivered: 0,
        rto: 0,
        totalDeliveryDays: 0,
        deliveryCount: 0,
      };

      existing.orders++;
      existing.shipped++;
      if (s.normalizedStatus === "DELIVERED") existing.delivered++;
      if (s.normalizedStatus === "RTO" || s.rtoInwardScanned) existing.rto++;

      if (s.deliveryDate && s.pickupDate) {
        const days =
          (new Date(s.deliveryDate).getTime() - new Date(s.pickupDate).getTime()) / (1000 * 60 * 60 * 24);
        if (days > 0) {
          existing.totalDeliveryDays += days;
          existing.deliveryCount++;
        }
      }
      courierMap.set(courierName, existing);
    });

    // If no shipments table records, extract from orders fulfillments
    if (courierMap.size === 0) {
      primaryOrders.forEach((o) => {
        o.fulfillments.forEach((f) => {
          const courierName = f.trackingCompany || "Delhivery";
          const existing = courierMap.get(courierName) || {
            courier: courierName,
            orders: 0,
            shipped: 0,
            delivered: 0,
            rto: 0,
            totalDeliveryDays: 0,
            deliveryCount: 0,
          };
          existing.orders++;
          existing.shipped++;
          if (f.deliveryStatus === "DELIVERED") existing.delivered++;
          if (f.deliveryStatus?.includes("RTO")) existing.rto++;
          courierMap.set(courierName, existing);
        });
      });
    }

    const courierPerformance = Array.from(courierMap.values()).map((c) => {
      const delRate = c.shipped > 0 ? Number(((c.delivered / c.shipped) * 100).toFixed(1)) : 0;
      const rtoP = c.shipped > 0 ? Number(((c.rto / c.shipped) * 100).toFixed(1)) : 0;
      const avgDays = c.deliveryCount > 0 ? Number((c.totalDeliveryDays / c.deliveryCount).toFixed(1)) : 3.8;
      return {
        courier: c.courier,
        orders: c.orders,
        shipped: c.shipped,
        delivered: c.delivered,
        deliveryRate: delRate,
        rto: c.rto,
        rtoRate: rtoP,
        avgDeliveryTime: avgDays,
        status: rtoP > 20 ? "Poor" : delRate > 80 ? "Top Performer" : "Standard",
      };
    });

    // --- 5. RTO ANALYTICS BREAKDOWNS ---
    const rtoRevenue = primaryOrders
      .filter(
        (o) =>
          o.deliveryStatus === "RTO" ||
          o.deliveryStatus === "RTO_DELIVERED" ||
          o.deliveryStatus === "RTO_IN_TRANSIT" ||
          o.rtoInwardScanned
      )
      .reduce((acc, o) => acc + (o.totalPrice || 0), 0);

    const estimatedRtoLoss = rtoCount * (rtoCostRate + packagingCostRate);

    // RTO By State
    const stateRtoMap = new Map<string, { total: number; rto: number; revenue: number }>();
    const cityRtoMap = new Map<string, { total: number; rto: number; revenue: number }>();
    const pincodeRtoMap = new Map<string, { total: number; rto: number; revenue: number }>();
    const productRtoMap = new Map<string, { name: string; total: number; rto: number }>();

    primaryOrders.forEach((o) => {
      const isRto =
        o.deliveryStatus === "RTO" ||
        o.deliveryStatus === "RTO_DELIVERED" ||
        o.deliveryStatus === "RTO_IN_TRANSIT" ||
        o.rtoInwardScanned;

      let address: any = null;
      try {
        address = o.shippingAddress ? JSON.parse(o.shippingAddress) : null;
      } catch (_) {}

      const state = address?.province || address?.state || "Other";
      const city = address?.city || "Other";
      const pin = address?.zip || address?.pincode || "Other";

      // State Map
      const st = stateRtoMap.get(state) || { total: 0, rto: 0, revenue: 0 };
      st.total++;
      st.revenue += o.totalPrice || 0;
      if (isRto) st.rto++;
      stateRtoMap.set(state, st);

      // City Map
      const ct = cityRtoMap.get(city) || { total: 0, rto: 0, revenue: 0 };
      ct.total++;
      ct.revenue += o.totalPrice || 0;
      if (isRto) ct.rto++;
      cityRtoMap.set(city, ct);

      // Pincode Map
      if (pin && pin !== "Other") {
        const pn = pincodeRtoMap.get(pin) || { total: 0, rto: 0, revenue: 0 };
        pn.total++;
        pn.revenue += o.totalPrice || 0;
        if (isRto) pn.rto++;
        pincodeRtoMap.set(pin, pn);
      }

      // Product RTO
      o.items.forEach((item) => {
        const pName = item.productTitle || "Unknown Product";
        const pr = productRtoMap.get(pName) || { name: pName, total: 0, rto: 0 };
        pr.total += item.quantity || 1;
        if (isRto) pr.rto += item.quantity || 1;
        productRtoMap.set(pName, pr);
      });
    });

    const rtoByState = Array.from(stateRtoMap.entries())
      .map(([state, data]) => ({
        state,
        totalOrders: data.total,
        rtoOrders: data.rto,
        rtoRate: data.total > 0 ? Number(((data.rto / data.total) * 100).toFixed(1)) : 0,
        revenue: data.revenue,
      }))
      .sort((a, b) => b.rtoRate - a.rtoRate)
      .slice(0, 10);

    const rtoByCity = Array.from(cityRtoMap.entries())
      .map(([city, data]) => ({
        city,
        totalOrders: data.total,
        rtoOrders: data.rto,
        rtoRate: data.total > 0 ? Number(((data.rto / data.total) * 100).toFixed(1)) : 0,
      }))
      .sort((a, b) => b.rtoOrders - a.rtoOrders)
      .slice(0, 10);

    const rtoByPincode = Array.from(pincodeRtoMap.entries())
      .map(([pincode, data]) => ({
        pincode,
        totalOrders: data.total,
        rtoOrders: data.rto,
        rtoRate: data.total > 0 ? Number(((data.rto / data.total) * 100).toFixed(1)) : 0,
      }))
      .filter((p) => p.rtoOrders > 0)
      .sort((a, b) => b.rtoOrders - a.rtoOrders)
      .slice(0, 10);

    const rtoByProduct = Array.from(productRtoMap.values())
      .map((p) => ({
        name: p.name,
        units: p.total,
        rtoUnits: p.rto,
        rtoRate: p.total > 0 ? Number(((p.rto / p.total) * 100).toFixed(1)) : 0,
      }))
      .sort((a, b) => b.rtoRate - a.rtoRate)
      .slice(0, 10);

    // Insights Generation
    const rtoInsights: string[] = [];
    if (orderCount >= 10) {
      if (codRtoRate > 0 && codRtoRate > 15) {
        rtoInsights.push(
          `COD orders have a ${codRtoRate.toFixed(1)}% RTO rate. Implementing OTP verification at checkout can reduce this.`
        );
      }
      if (rtoByState.length > 0 && rtoByState[0].rtoRate > 25) {
        rtoInsights.push(
          `${rtoByState[0].state} has a significantly elevated RTO rate of ${rtoByState[0].rtoRate.toFixed(1)}%. Consider requiring prepaid only for this region.`
        );
      }
      if (compOrders.length > 0) {
        const compRtoRate = (compShipments.filter((s) => s.normalizedStatus === "RTO").length / Math.max(1, compShipments.length)) * 100;
        const diff = rtoRate - compRtoRate;
        if (Math.abs(diff) >= 1) {
          rtoInsights.push(
            `RTO ${diff > 0 ? "increased" : "decreased"} by ${Math.abs(diff).toFixed(1)}% compared with the previous period.`
          );
        }
      }
    }

    // --- 6. MARKETING / ADS PERFORMANCE ---
    const roas = calculateROAS(primaryAttributedRevenue, primaryAdSpend);
    const adOrders = totalAdConversions;
    const cpa = adOrders > 0 ? Number((primaryAdSpend / adOrders).toFixed(2)) : 0;

    // --- 7. PROFITABILITY WATERFALL (FETCHED DIRECTLY FROM P&L ENGINE & EXPENSES BILLS) ---
    const finalGrossRevenue = pnl.summary.revenue;
    const finalDiscounts = pnl.summary.totalDiscounts;
    const finalCogs = pnl.summary.expenses.inventoryPurchases;
    const finalGrossProfit = pnl.summary.grossProfit;
    const finalGrossMargin = Number(pnl.summary.grossMarginPercent.toFixed(2));
    const finalShippingCost = pnl.summary.expenses.shippingExpense;
    const finalPackagingCost = pnl.summary.expenses.packagingExpense;
    const finalGatewayFees = pnl.summary.expenses.gatewayFees;
    const finalAdSpend = pnl.summary.expenses.marketingExpense;
    const finalRtoCost = pnl.summary.expenses.rtoExpense + (pnl.summary.expenses.rtoDamageLoss || 0);
    const finalOtherExpenses = pnl.summary.expenses.overheadExpense;
    const finalNetProfit = pnl.summary.netProfit;
    const finalNetMargin = Number(pnl.summary.netMarginPercent.toFixed(2));

    // Comparison Net Profit from compPnl
    const compNetProfit = compPnl ? compPnl.summary.netProfit : 0;
    const compNetMargin = compPnl ? Number(compPnl.summary.netMarginPercent.toFixed(2)) : 0;
    const finalCompGrossProfit = compPnl ? compPnl.summary.grossProfit : compGrossProfit;
    const finalCompGrossMargin = compPnl ? Number(compPnl.summary.grossMarginPercent.toFixed(2)) : compGrossMargin;
    const finalCompAdSpend = compPnl ? compPnl.summary.expenses.marketingExpense : compAdSpend;

    // --- 8. BUSINESS HEALTH SCORE ---
    const revGrowth = calcDelta(finalGrossRevenue, compPnl?.summary.revenue || compRevenue);
    const businessHealth = calculateBusinessHealthScore({
      revenueGrowthPct: revGrowth,
      netMarginPct: finalNetMargin,
      mer: finalAdSpend > 0 ? Number((finalGrossRevenue / finalAdSpend).toFixed(2)) : mer,
      rtoRatePct: rtoRate,
      returnRatePct: returnRate,
      deliveryRatePct: deliveryRate,
      conversionRatePct: prepaidConversionRate || 65,
    });

    // --- 9. REVENUE & ORDERS TIME-SERIES CHART ---
    // Hourly for Today/Yesterday, Daily for <= 60 days, Monthly for year
    const isHourly = dates.period === "today" || dates.period === "yesterday";
    const isMonthly = dates.period === "year" || dates.durationDays > 60;

    const timeSeriesMap = new Map<string, { label: string; revenue: number; orders: number; timestamp: string }>();

    if (isHourly) {
      // 24 hours
      for (let h = 0; h < 24; h++) {
        const hourLabel = h === 0 ? "12 AM" : h < 12 ? `${h} AM` : h === 12 ? "12 PM" : `${h - 12} PM`;
        const key = String(h).padStart(2, "0");
        timeSeriesMap.set(key, { label: hourLabel, revenue: 0, orders: 0, timestamp: key });
      }

      primaryOrders.forEach((o) => {
        const h = new Date(o.createdAt).getHours();
        const key = String(h).padStart(2, "0");
        const pt = timeSeriesMap.get(key);
        if (pt) {
          pt.revenue += o.totalPrice || 0;
          pt.orders += 1;
        }
      });
    } else if (isMonthly) {
      const monthNames = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
      monthNames.forEach((m, idx) => {
        const key = String(idx);
        timeSeriesMap.set(key, { label: m, revenue: 0, orders: 0, timestamp: key });
      });

      primaryOrders.forEach((o) => {
        const m = new Date(o.createdAt).getMonth();
        const key = String(m);
        const pt = timeSeriesMap.get(key);
        if (pt) {
          pt.revenue += o.totalPrice || 0;
          pt.orders += 1;
        }
      });
    } else {
      // Daily sequence
      const curr = new Date(dates.start);
      while (curr <= dates.end) {
        const key = curr.toISOString().split("T")[0];
        const label = curr.toLocaleDateString("en-US", { month: "short", day: "numeric" });
        timeSeriesMap.set(key, { label, revenue: 0, orders: 0, timestamp: key });
        curr.setDate(curr.getDate() + 1);
      }

      primaryOrders.forEach((o) => {
        const key = new Date(o.createdAt).toISOString().split("T")[0];
        const pt = timeSeriesMap.get(key);
        if (pt) {
          pt.revenue += o.totalPrice || 0;
          pt.orders += 1;
        }
      });
    }

    const revenueOrdersChart = Array.from(timeSeriesMap.values()).map((p) => ({
      ...p,
      revenue: Number(p.revenue.toFixed(2)),
    }));

    // --- 10. PRODUCT PERFORMANCE TABLE ---
    const productStatsMap = new Map<
      string,
      {
        name: string;
        sku: string;
        units: number;
        orderIds: Set<string>;
        revenue: number;
        cogs: number;
        rtoOrders: number;
        returnOrders: number;
      }
    >();

    primaryOrders.forEach((o) => {
      const isRto =
        o.deliveryStatus === "RTO" ||
        o.deliveryStatus === "RTO_DELIVERED" ||
        o.deliveryStatus === "RTO_IN_TRANSIT" ||
        o.rtoInwardScanned;

      o.items.forEach((item) => {
        const pKey = (item.shopifyProductId || item.productTitle || item.sku || "UNKNOWN").trim();
        const existing = productStatsMap.get(pKey) || {
          name: item.productTitle || "Product",
          sku: item.sku || "—",
          units: 0,
          orderIds: new Set<string>(),
          revenue: 0,
          cogs: 0,
          rtoOrders: 0,
          returnOrders: 0,
        };

        const itemCost = stockCostMap.get((item.sku || "").toUpperCase().trim()) || 0;
        existing.units += item.quantity || 1;
        existing.orderIds.add(o.id);
        existing.revenue += item.totalPrice || 0;
        existing.cogs += (item.quantity || 1) * itemCost;
        if (isRto) existing.rtoOrders += 1;

        productStatsMap.set(pKey, existing);
      });
    });

    const productPerformance = Array.from(productStatsMap.values()).map((p) => {
      const orderCountForProd = p.orderIds.size;
      const grossProf = p.revenue - p.cogs;
      const margin = p.revenue > 0 ? Number(((grossProf / p.revenue) * 100).toFixed(1)) : 0;
      const prodAov = orderCountForProd > 0 ? Number((p.revenue / orderCountForProd).toFixed(2)) : 0;
      const rtoP = orderCountForProd > 0 ? Number(((p.rtoOrders / orderCountForProd) * 100).toFixed(1)) : 0;

      return {
        productName: p.name,
        sku: p.sku,
        unitsSold: p.units,
        orders: orderCountForProd,
        revenue: Number(p.revenue.toFixed(2)),
        aov: prodAov,
        cogs: Number(p.cogs.toFixed(2)),
        grossProfit: Number(grossProf.toFixed(2)),
        margin,
        rtoRate: rtoP,
        returnRate: 0.0,
      };
    });

    // --- 11. CUSTOMER PERFORMANCE & COHORTS ---
    const customerOrderCounts = new Map<string, { count: number; totalSpent: number; firstOrderDate: Date }>();
    lifetimeOrders.forEach((lo) => {
      const custId = lo.email || lo.phone || lo.id;
      const existing = customerOrderCounts.get(custId) || { count: 0, totalSpent: 0, firstOrderDate: lo.createdAt };
      existing.count++;
      existing.totalSpent += lo.totalPrice || 0;
      customerOrderCounts.set(custId, existing);
    });

    let newCustomersCount = 0;
    let returningCustomersCount = 0;

    primaryOrders.forEach((o) => {
      const custId = o.email || o.phone || o.id;
      const stats = customerOrderCounts.get(custId);
      // If customer's first order was within this period => New Customer
      if (stats && stats.firstOrderDate >= dates.start && stats.firstOrderDate <= dates.end && stats.count === 1) {
        newCustomersCount++;
      } else {
        returningCustomersCount++;
      }
    });

    const totalCustomersInPeriod = Math.max(1, newCustomersCount + returningCustomersCount);
    const newCustomerPct = Number(((newCustomersCount / totalCustomersInPeriod) * 100).toFixed(1));
    const returningCustomerPct = Number(((returningCustomersCount / totalCustomersInPeriod) * 100).toFixed(1));

    const totalUniqueLifetimeCustomers = Math.max(1, customerOrderCounts.size);
    const repeatCustomersLifetime = Array.from(customerOrderCounts.values()).filter((c) => c.count > 1).length;
    const repeatPurchaseRate = calculateRepeatPurchaseRate(repeatCustomersLifetime, totalUniqueLifetimeCustomers);
    const totalLifetimeRevenue = Array.from(customerOrderCounts.values()).reduce((acc, c) => acc + c.totalSpent, 0);
    const clv = Number((totalLifetimeRevenue / totalUniqueLifetimeCustomers).toFixed(2));
    const revenuePerCustomer = Number((totalRevenue / totalCustomersInPeriod).toFixed(2));
    const avgOrdersPerCustomer = Number((orderCount / totalCustomersInPeriod).toFixed(2));
    const cac = calculateCAC(primaryAdSpend, newCustomersCount);

    // --- 12. MONTHLY EXPENSES BREAKDOWN (DERIVED DIRECTLY FROM PURCHASE BILLS) ---
    const monthlyExpenseMap = new Map<string, { month: string; amount: number }>();
    const categoryExpenseMap = new Map<string, number>();
    const now = new Date();

    // Seed past 6 months dynamically relative to current date
    for (let i = 5; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const mKey = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
      const label = d.toLocaleDateString("en-US", { month: "short", year: "2-digit" }).replace(",", "");
      monthlyExpenseMap.set(mKey, { month: label, amount: 0 });
    }

    // Process Purchase Bills (Single Source of Truth)
    purchaseBills.forEach((b) => {
      const bDate = new Date(b.billDate);
      if (!isNaN(bDate.getTime())) {
        const mKey = `${bDate.getFullYear()}-${String(bDate.getMonth() + 1).padStart(2, "00")}`;
        const pt = monthlyExpenseMap.get(mKey);
        if (pt) {
          // Sum only items NOT already counted in P&L elsewhere
          if (b.items && b.items.length > 0) {
            const pnlAmount = b.items.reduce((acc: number, item: any) =>
              item.alreadyAddedToPnl ? acc : acc + (Number(item.totalAmount) || 0), 0);
            pt.amount += pnlAmount;
          } else {
            pt.amount += b.totalAmount;
          }
        }
      }

      // Group category breakdown by line items — respect alreadyAddedToPnl per item
      if (b.items && b.items.length > 0) {
        b.items.forEach((item: any) => {
          if (item.alreadyAddedToPnl) return; // Skip lines already accounted for elsewhere
          const cat = normalizeExpenseCategory(item.category, b.billType);
          const amt = Number(item.totalAmount) || 0;
          categoryExpenseMap.set(cat, (categoryExpenseMap.get(cat) || 0) + amt);
        });
      } else {
        const cat = normalizeExpenseCategory(null, b.billType);
        categoryExpenseMap.set(cat, (categoryExpenseMap.get(cat) || 0) + b.totalAmount);
      }
    });

    const monthlyExpensesChart = Array.from(monthlyExpenseMap.values());
    const totalRecordedExpenseSum = Array.from(categoryExpenseMap.values()).reduce((a, b) => a + b, 0);
    const expenseCategoriesBreakdown = Array.from(categoryExpenseMap.entries())
      .filter(([_, amt]) => amt > 0)
      .map(([cat, amt]) => ({
        category: cat,
        amount: amt,
        pct: totalRecordedExpenseSum > 0 ? Number(((amt / totalRecordedExpenseSum) * 100).toFixed(1)) : 0,
      }))
      .sort((a, b) => b.amount - a.amount);

    const recentExpenses = purchaseBills.slice(0, 25).map((b) => ({
      id: b.id,
      date: b.billDate,
      category: normalizeExpenseCategory(b.items?.[0]?.category, b.billType),
      description: b.items && b.items.length > 0
        ? b.items.map((i) => i.itemName).filter(Boolean).join(", ")
        : b.notes || b.billNumber || "Business Expense",
      vendor: b.supplier || "—",
      amount: b.totalAmount,
      note: b.notes,
      billNumber: b.billNumber,
    }));

    // --- 13. GEOGRAPHIC PERFORMANCE ---
    const geoStateTable = Array.from(stateRtoMap.entries())
      .map(([st, d]) => ({
        state: st,
        orders: d.total,
        revenue: d.revenue,
        aov: d.total > 0 ? Number((d.revenue / d.total).toFixed(2)) : 0,
        deliveryRate: d.total > 0 ? Number((((d.total - d.rto) / d.total) * 100).toFixed(1)) : 0,
        rtoRate: d.total > 0 ? Number(((d.rto / d.total) * 100).toFixed(1)) : 0,
      }))
      .sort((a, b) => b.orders - a.orders);

    const geoCityTable = Array.from(cityRtoMap.entries())
      .map(([ct, d]) => ({
        city: ct,
        orders: d.total,
        revenue: d.revenue,
        aov: d.total > 0 ? Number((d.revenue / d.total).toFixed(2)) : 0,
        deliveryRate: d.total > 0 ? Number((((d.total - d.rto) / d.total) * 100).toFixed(1)) : 0,
        rtoRate: d.total > 0 ? Number(((d.rto / d.total) * 100).toFixed(1)) : 0,
      }))
      .sort((a, b) => b.orders - a.orders);

    const geoPincodeTable = Array.from(pincodeRtoMap.entries())
      .map(([pn, d]) => ({
        pincode: pn,
        orders: d.total,
        revenue: d.revenue,
        aov: d.total > 0 ? Number((d.revenue / d.total).toFixed(2)) : 0,
        deliveryRate: d.total > 0 ? Number((((d.total - d.rto) / d.total) * 100).toFixed(1)) : 0,
        rtoRate: d.total > 0 ? Number(((d.rto / d.total) * 100).toFixed(1)) : 0,
      }))
      .sort((a, b) => b.orders - a.orders);

    return {
      periodInfo: {
        period: dates.period,
        startDate: dates.start.toISOString(),
        endDate: dates.end.toISOString(),
        comparison: dates.comparison,
        durationDays: dates.durationDays,
      },

      // Section 3: Business Health
      businessHealth,

      // Section 4: Primary KPIs
      primaryKPIs: {
        totalRevenue: {
          value: finalGrossRevenue,
          deltaPct: calcDelta(finalGrossRevenue, compPnl?.summary.revenue || compRevenue),
          description: "Gross order value across period",
        },
        orders: {
          value: orderCount,
          deltaPct: calcDelta(orderCount, compOrderCount),
          description: "Total orders received",
        },
        aov: {
          value: aov,
          deltaPct: calcDelta(aov, compAov),
          description: "Average order basket size",
        },
        netRevenue: {
          value: netRevenue,
          deltaPct: calcDelta(netRevenue, compNetRevenue),
          description: "Revenue after discounts & returns",
        },
        grossProfit: {
          value: finalGrossProfit,
          deltaPct: calcDelta(finalGrossProfit, finalCompGrossProfit),
          description: "Revenue minus product COGS & packaging",
        },
        grossMargin: {
          value: finalGrossMargin,
          deltaPct: calcDelta(finalGrossMargin, finalCompGrossMargin),
          description: "Gross margin percentage",
        },
        adSpend: {
          value: finalAdSpend,
          deltaPct: calcDelta(finalAdSpend, finalCompAdSpend),
          description: finalAdSpend > 0 ? "Connected ad spend & bills" : "No ad spend recorded",
        },
        mer: {
          value: finalAdSpend > 0 ? Number((finalGrossRevenue / finalAdSpend).toFixed(2)) : 0,
          deltaPct: 0,
          description: finalAdSpend > 0 ? "Total Revenue / Ad Spend" : "No ad spend recorded",
        },
      },

      // Section 5: Revenue & Orders Chart
      revenueOrdersChart,

      // Section 6: Payment Performance
      paymentPerformance: {
        codOrders: codOrdersCount,
        codRevenue,
        codPct,
        prepaidOrders: prepaidOrdersCount,
        prepaidRevenue,
        prepaidPct,
        codCancellationRate,
        codRtoRate,
        prepaidConversionRate,
      },

      // Section 7: Delivery & Fulfillment
      deliveryPerformance: {
        funnel: {
          orders: orderCount,
          fulfilled: fulfilledCount,
          shipped: shippedCount,
          delivered: deliveredCount,
        },
        highlights: {
          rto: rtoCount,
          rtoPct: rtoRate,
          returns: returnCount,
          returnPct: returnRate,
          cancelled: cancelledCount,
          cancellationPct: cancellationRate,
        },
        kpis: {
          fulfillmentRate,
          shippedRate,
          deliveredRate: deliveryRate,
          rtoRate,
          returnRate,
          cancellationRate,
          avgDeliveryTimeDays,
          avgFulfillmentTimeHours,
        },
      },

      // Section 8: Courier Performance Table
      courierPerformance,

      // Section 9: RTO Analytics
      rtoAnalytics: {
        kpis: {
          rtoRate,
          rtoOrders: rtoCount,
          rtoRevenue,
          estimatedRtoLoss,
        },
        byCourier: courierPerformance.map((c) => ({ courier: c.courier, rtoRate: c.rtoRate, rto: c.rto })),
        byState: rtoByState,
        byCity: rtoByCity,
        byPincode: rtoByPincode,
        byProduct: rtoByProduct,
        codVsPrepaid: {
          codRtoRate,
          prepaidRtoRate: prepaidOrdersCount > 0 ? Number(((0 / prepaidOrdersCount) * 100).toFixed(1)) : 0,
        },
        insights: rtoInsights,
      },

      // Section 10: Marketing / Ads
      marketingPerformance: {
        hasAdIntegration,
        kpis: {
          adSpend: primaryAdSpend,
          attributedRevenue: primaryAttributedRevenue,
          roas,
          mer,
          cac,
          cpa,
          ordersFromAds: adOrders,
          clicks: totalAdClicks,
          impressions: totalAdImpressions,
        },
        byProvider: providerBreakdown,
        accounts: adAccounts.map((a: any) => ({
          id: a.id,
          platform: a.platform,
          accountId: a.accountId,
          accountName: a.accountName,
          status: a.status,
          currency: a.currency,
          spendThisMonth: a.spendThisMonth,
          roas: a.roas,
          lastSyncedAt: a.lastSyncedAt,
        })),
      },

      // Section 11: Profitability Overview
      profitability: {
        grossRevenue: finalGrossRevenue,
        discounts: finalDiscounts,
        cogs: finalCogs,
        shippingCost: finalShippingCost,
        packagingCost: finalPackagingCost,
        gatewayFees: finalGatewayFees,
        adSpend: finalAdSpend,
        rtoCost: finalRtoCost,
        otherExpenses: finalOtherExpenses,
        netProfit: finalNetProfit,
        grossProfit: finalGrossProfit,
        grossMargin: finalGrossMargin,
        netMargin: finalNetMargin,
        breakdownDetails: pnl.summary.expenses.breakdownDetails,
        comparison: {
          compNetProfit,
          compNetMargin,
          deltaPct: calcDelta(finalNetProfit, compNetProfit),
        },
      },

      // Section 12: Monthly Expenses (Single Source of Truth from Purchase Bills)
      monthlyExpenses: {
        chart: monthlyExpensesChart,
        breakdown: expenseCategoriesBreakdown,
        recentExpenses,
      },

      // Section 13: Product Performance Table
      productPerformance,

      // Section 14: Customer Performance
      customerPerformance: {
        newCustomers: newCustomersCount,
        returningCustomers: returningCustomersCount,
        newCustomerPct,
        returningCustomerPct,
        repeatPurchaseRate,
        revenuePerCustomer,
        avgOrdersPerCustomer,
        customerLifetimeValue: clv,
      },

      // Section 15: Geographic Performance
      geographicPerformance: {
        byState: geoStateTable.slice(0, 15),
        byCity: geoCityTable.slice(0, 15),
        byPincode: geoPincodeTable.slice(0, 15),
      },
    };
  }

  /**
   * Record a new business expense (Delegates to PurchasesService to maintain single source of truth)
   */
  public static async createExpense(
    storeId: string,
    data: {
      amount: number | string;
      category: string;
      date?: string | Date;
      description: string;
      vendor?: string;
      note?: string;
    }
  ) {
    const amount = Math.max(0, Number(data.amount) || 0);
    const billNumber = data.note && /^INV-|^EXP-/i.test(data.note.trim())
      ? data.note.trim()
      : `EXP-${new Date().toISOString().slice(2, 10).replace(/-/g, "")}-${Math.floor(1000 + Math.random() * 9000)}`;

    const c = (data.category || "").toUpperCase();
    let billType = "MISC";
    if (c.includes("PACK")) billType = "PACKAGING";
    else if (c.includes("SHIP") || c.includes("RTO") || c.includes("RETURN") || c.includes("COURIER") || c.includes("FREIGHT") || c.includes("LOGISTICS")) billType = "SHIPPING_LOGISTICS";
    else if (c.includes("PRODUCT") || c.includes("INVENTORY") || c.includes("RAW")) billType = "INVENTORY";
    else if (c.includes("AD") || c.includes("MARKET")) billType = "MARKETING_ADS";
    else if (c.includes("GATEWAY") || c.includes("SALAR") || c.includes("SOFT") || c.includes("RENT") || c.includes("OVERHEAD")) billType = "OPERATIONAL_OVERHEAD";

    return await PurchasesService.createBill(storeId, {
      billNumber,
      billType,
      supplier: data.vendor?.trim() || "Operating Expense",
      billDate: data.date ? new Date(data.date) : new Date(),
      paymentStatus: "PAID",
      paymentMode: "BANK_TRANSFER",
      notes: data.note?.trim() || data.description?.trim(),
      items: [
        {
          itemName: data.description?.trim() || "Business Expense",
          category: data.category || "Other",
          quantity: 1,
          unitCost: amount,
          taxRate: 0,
          discount: 0,
        },
      ],
    });
  }

  /**
   * Delete an existing expense (Delegates to PurchasesService to delete PurchaseBill)
   */
  public static async deleteExpense(storeId: string, expenseId: string) {
    const bill = await prisma.purchaseBill.findFirst({
      where: { id: expenseId, storeId },
    });
    if (bill) {
      return await PurchasesService.deleteBill(storeId, expenseId);
    }
    return await prisma.businessExpense.deleteMany({
      where: { id: expenseId, storeId },
    });
  }
}
