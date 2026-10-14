/**
 * VOOP Modular Ecommerce KPI Calculation Engine
 * Reusable, pure, deterministic business intelligence formulas.
 */

export interface ProfitWaterfallInputs {
  grossRevenue: number;
  discounts: number;
  cogs: number;
  shippingCost: number;
  gatewayFees: number;
  adSpend: number;
  rtoCost: number;
  returnCost: number;
  otherExpenses: number;
}

export interface BusinessHealthFactors {
  revenueGrowthPct: number; // e.g. 15.4 or -5.2
  netMarginPct: number;     // e.g. 22.5
  mer: number;              // Total Revenue / Ad Spend e.g. 4.2
  rtoRatePct: number;       // e.g. 12.0
  returnRatePct: number;    // e.g. 3.0
  deliveryRatePct: number;  // e.g. 88.5
  conversionRatePct: number;// e.g. 68.0
}

export interface BusinessHealthResult {
  score: number; // 0 to 100
  rating: "Excellent" | "Good" | "Fair" | "Needs Attention" | "Critical";
  breakdown: {
    revenue: { status: "Healthy" | "Moderate" | "Needs attention"; score: number; label: string };
    profit: { status: "Healthy" | "Moderate" | "Needs attention"; score: number; label: string };
    rto: { status: "Healthy" | "Needs attention" | "Critical"; score: number; label: string };
    adEfficiency: { status: "Strong" | "Moderate" | "Needs attention" | "N/A"; score: number; label: string };
    delivery: { status: "Healthy" | "Needs attention" | "Critical"; score: number; label: string };
  };
}

/**
 * 1. Calculate Gross Revenue from Orders
 */
export function calculateRevenue(orders: Array<{ totalPrice: number }>): number {
  if (!orders || orders.length === 0) return 0;
  return orders.reduce((acc, o) => acc + (Number(o.totalPrice) || 0), 0);
}

/**
 * 2. Calculate Net Revenue (Gross Revenue minus Discounts and Refunds)
 */
export function calculateNetRevenue(
  orders: Array<{ totalPrice: number; totalDiscounts?: number }>,
  refunds = 0
): number {
  if (!orders || orders.length === 0) return 0;
  const gross = orders.reduce((acc, o) => acc + (Number(o.totalPrice) || 0), 0);
  const discounts = orders.reduce((acc, o) => acc + (Number(o.totalDiscounts) || 0), 0);
  return Math.max(0, gross - discounts - (Number(refunds) || 0));
}

/**
 * 3. Calculate Average Order Value (AOV)
 */
export function calculateAOV(revenue: number, orderCount: number): number {
  if (!orderCount || orderCount <= 0) return 0;
  return Number((revenue / orderCount).toFixed(2));
}

/**
 * 4. Calculate Gross Profit (Net Revenue - Cost of Goods Sold)
 */
export function calculateGrossProfit(netRevenue: number, cogs: number): number {
  return Number((netRevenue - cogs).toFixed(2));
}

/**
 * 5. Calculate Gross Margin Percentage
 */
export function calculateGrossMargin(grossProfit: number, netRevenue: number): number {
  if (!netRevenue || netRevenue <= 0) return 0;
  return Number(((grossProfit / netRevenue) * 100).toFixed(2));
}

/**
 * 6. Calculate Net Profit (Waterfall deducting all operational & marketing costs)
 */
export function calculateNetProfit(inputs: ProfitWaterfallInputs): number {
  const totalDeductions =
    (inputs.discounts || 0) +
    (inputs.cogs || 0) +
    (inputs.shippingCost || 0) +
    (inputs.gatewayFees || 0) +
    (inputs.adSpend || 0) +
    (inputs.rtoCost || 0) +
    (inputs.returnCost || 0) +
    (inputs.otherExpenses || 0);

  return Number((inputs.grossRevenue - totalDeductions).toFixed(2));
}

/**
 * 7. Calculate Net Margin Percentage
 */
export function calculateNetMargin(netProfit: number, revenue: number): number {
  if (!revenue || revenue <= 0) return 0;
  return Number(((netProfit / revenue) * 100).toFixed(2));
}

/**
 * 8. Calculate COD Ratio Percentage
 */
export function calculateCODRatio(codOrders: number, totalOrders: number): number {
  if (!totalOrders || totalOrders <= 0) return 0;
  return Number(((codOrders / totalOrders) * 100).toFixed(2));
}

/**
 * 9. Calculate Prepaid Ratio Percentage
 */
export function calculatePrepaidRatio(prepaidOrders: number, totalOrders: number): number {
  if (!totalOrders || totalOrders <= 0) return 0;
  return Number(((prepaidOrders / totalOrders) * 100).toFixed(2));
}

/**
 * 10. Calculate Delivery Rate Percentage
 */
export function calculateDeliveryRate(deliveredCount: number, shippedCount: number): number {
  if (!shippedCount || shippedCount <= 0) return 0;
  return Number(((deliveredCount / shippedCount) * 100).toFixed(2));
}

/**
 * 11. Calculate RTO (Return to Origin) Rate Percentage
 */
export function calculateRTORate(rtoCount: number, shippedCount: number): number {
  if (!shippedCount || shippedCount <= 0) return 0;
  return Number(((rtoCount / shippedCount) * 100).toFixed(2));
}

/**
 * 12. Calculate Customer Return Rate Percentage
 */
export function calculateReturnRate(returnCount: number, deliveredCount: number): number {
  if (!deliveredCount || deliveredCount <= 0) return 0;
  return Number(((returnCount / deliveredCount) * 100).toFixed(2));
}

/**
 * 13. Calculate Cancellation Rate Percentage
 */
export function calculateCancellationRate(cancelledCount: number, totalOrders: number): number {
  if (!totalOrders || totalOrders <= 0) return 0;
  return Number(((cancelledCount / totalOrders) * 100).toFixed(2));
}

/**
 * 14. Calculate Return on Ad Spend (ROAS)
 */
export function calculateROAS(attributedRevenue: number, adSpend: number): number {
  if (!adSpend || adSpend <= 0) return 0;
  return Number((attributedRevenue / adSpend).toFixed(2));
}

/**
 * 15. Calculate Marketing Efficiency Ratio (MER = Total Revenue / Total Ad Spend)
 */
export function calculateMER(totalRevenue: number, adSpend: number): number {
  if (!adSpend || adSpend <= 0) return 0;
  return Number((totalRevenue / adSpend).toFixed(2));
}

/**
 * 16. Calculate Customer Acquisition Cost (CAC)
 */
export function calculateCAC(adSpend: number, newCustomers: number): number {
  if (!newCustomers || newCustomers <= 0 || !adSpend || adSpend <= 0) return 0;
  return Number((adSpend / newCustomers).toFixed(2));
}

/**
 * 17. Calculate Repeat Purchase Rate Percentage
 */
export function calculateRepeatPurchaseRate(returningCustomers: number, totalCustomers: number): number {
  if (!totalCustomers || totalCustomers <= 0) return 0;
  return Number(((returningCustomers / totalCustomers) * 100).toFixed(2));
}

/**
 * 18. Dynamic Business Health Score Algorithm (0 - 100)
 * Evaluates holistic ecommerce health across Revenue, Profitability, RTO, Ads, and Logistics.
 */
export function calculateBusinessHealthScore(factors: BusinessHealthFactors): BusinessHealthResult {
  // 1. Revenue Component (max 20)
  let revScore = 14;
  let revStatus: "Healthy" | "Moderate" | "Needs attention" = "Moderate";
  if (factors.revenueGrowthPct >= 10) {
    revScore = 20;
    revStatus = "Healthy";
  } else if (factors.revenueGrowthPct >= 0) {
    revScore = 16;
    revStatus = "Healthy";
  } else if (factors.revenueGrowthPct >= -10) {
    revScore = 11;
    revStatus = "Moderate";
  } else {
    revScore = 5;
    revStatus = "Needs attention";
  }

  // 2. Profit Margin Component (max 25)
  let profScore = 15;
  let profStatus: "Healthy" | "Moderate" | "Needs attention" = "Moderate";
  if (factors.netMarginPct >= 20) {
    profScore = 25;
    profStatus = "Healthy";
  } else if (factors.netMarginPct >= 12) {
    profScore = 20;
    profStatus = "Healthy";
  } else if (factors.netMarginPct >= 5) {
    profScore = 14;
    profStatus = "Moderate";
  } else if (factors.netMarginPct >= 0) {
    profScore = 8;
    profStatus = "Needs attention";
  } else {
    profScore = 2;
    profStatus = "Needs attention";
  }

  // 3. RTO Component (max 20)
  let rtoScore = 15;
  let rtoStatus: "Healthy" | "Needs attention" | "Critical" = "Healthy";
  if (factors.rtoRatePct <= 8) {
    rtoScore = 20;
    rtoStatus = "Healthy";
  } else if (factors.rtoRatePct <= 15) {
    rtoScore = 16;
    rtoStatus = "Healthy";
  } else if (factors.rtoRatePct <= 22) {
    rtoScore = 10;
    rtoStatus = "Needs attention";
  } else {
    rtoScore = 4;
    rtoStatus = "Critical";
  }

  // 4. Marketing / Ad Efficiency (max 15)
  let adScore = 12;
  let adStatus: "Strong" | "Moderate" | "Needs attention" | "N/A" = "Moderate";
  if (factors.mer <= 0) {
    adScore = 12; // Neutral if organic / no ad spend
    adStatus = "N/A";
  } else if (factors.mer >= 4.0) {
    adScore = 15;
    adStatus = "Strong";
  } else if (factors.mer >= 2.5) {
    adScore = 12;
    adStatus = "Strong";
  } else if (factors.mer >= 1.8) {
    adScore = 8;
    adStatus = "Moderate";
  } else {
    adScore = 4;
    adStatus = "Needs attention";
  }

  // 5. Logistics / Delivery (max 20)
  let delScore = 16;
  let delStatus: "Healthy" | "Needs attention" | "Critical" = "Healthy";
  if (factors.deliveryRatePct >= 85) {
    delScore = 20;
    delStatus = "Healthy";
  } else if (factors.deliveryRatePct >= 72) {
    delScore = 15;
    delStatus = "Healthy";
  } else if (factors.deliveryRatePct >= 60) {
    delScore = 9;
    delStatus = "Needs attention";
  } else {
    delScore = 4;
    delStatus = "Critical";
  }

  const rawScore = revScore + profScore + rtoScore + adScore + delScore;
  const score = Math.min(100, Math.max(10, Math.round(rawScore)));

  let rating: "Excellent" | "Good" | "Fair" | "Needs Attention" | "Critical" = "Good";
  if (score >= 85) rating = "Excellent";
  else if (score >= 70) rating = "Good";
  else if (score >= 55) rating = "Fair";
  else if (score >= 40) rating = "Needs Attention";
  else rating = "Critical";

  return {
    score,
    rating,
    breakdown: {
      revenue: { status: revStatus, score: revScore, label: `${factors.revenueGrowthPct >= 0 ? "+" : ""}${factors.revenueGrowthPct.toFixed(1)}% growth` },
      profit: { status: profStatus, score: profScore, label: `${factors.netMarginPct.toFixed(1)}% net margin` },
      rto: { status: rtoStatus, score: rtoScore, label: `${factors.rtoRatePct.toFixed(1)}% RTO` },
      adEfficiency: { status: adStatus, score: adScore, label: factors.mer > 0 ? `${factors.mer.toFixed(1)}x MER` : "No ad spend" },
      delivery: { status: delStatus, score: delScore, label: `${factors.deliveryRatePct.toFixed(1)}% delivery` },
    },
  };
}
