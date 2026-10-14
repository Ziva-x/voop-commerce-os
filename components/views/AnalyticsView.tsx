"use client";

import React, { useEffect, useState, useMemo } from "react";
import Link from "next/link";
import {
  TrendingUp,
  TrendingDown,
  Calendar,
  Download,
  AlertTriangle,
  CheckCircle2,
  HelpCircle,
  Package,
  ShoppingCart,
  DollarSign,
  Percent,
  Truck,
  CreditCard,
  Megaphone,
  ArrowUpRight,
  ArrowDownRight,
  Search,
  Plus,
  Trash2,
  RefreshCw,
  ExternalLink,
  ChevronDown,
  ChevronUp,
  MapPin,
  Users,
  ShieldAlert,
  SlidersHorizontal,
  Info,
  X,
  Layers,
} from "lucide-react";
import { appFetch } from "@/lib/api";
import { RouteGuard } from "@/components/auth/RouteGuard";
import { SearchInput } from "@/components/ui/Input";
import { useParams } from "next/navigation";
import { formatShortDate } from "@/lib/utils";

export default function AnalyticsView({ targetVoopStoreId }: { targetVoopStoreId?: string } = {}) {
  const params = useParams();
  const activeStoreId = targetVoopStoreId || (params?.storeId as string | undefined);
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Filter state
  const [period, setPeriod] = useState<
    "today" | "yesterday" | "7d" | "30d" | "this_month" | "prev_month" | "year" | "custom"
  >("30d");
  const [comparison, setComparison] = useState<"previous_period" | "previous_year" | "none">("previous_period");
  const [showDatePicker, setShowDatePicker] = useState(false);

  // Custom date picker state
  const [customStart, setCustomStart] = useState<string>(
    new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().split("T")[0]
  );
  const [customEnd, setCustomEnd] = useState<string>(new Date().toISOString().split("T")[0]);

  // Tab states for various sections
  const [rtoTab, setRtoTab] = useState<"courier" | "state" | "pincode" | "product">("state");
  const [productTab, setProductTab] = useState<
    "best_sellers" | "revenue" | "profit" | "units_sold" | "orders" | "rto_rate"
  >("revenue");
  const [productSearch, setProductSearch] = useState("");
  const [geoTab, setGeoTab] = useState<"state" | "city" | "pincode">("state");

  // Courier sorting state
  const [courierSortKey, setCourierSortKey] = useState<"orders" | "deliveryRate" | "rtoRate" | "avgDeliveryTime">(
    "orders"
  );
  const [courierSortAsc, setCourierSortAsc] = useState(false);

  // Chart hover states
  const [hoveredPoint, setHoveredPoint] = useState<any | null>(null);

  // Add Expense Modal state
  const [showExpenseModal, setShowExpenseModal] = useState(false);
  const [savingExpense, setSavingExpense] = useState(false);
  const [expenseForm, setExpenseForm] = useState({
    amount: "",
    category: "Advertising",
    date: new Date().toISOString().split("T")[0],
    description: "",
    vendor: "",
    note: "",
  });

  const [syncingAds, setSyncingAds] = useState(false);

  const handleSyncAds = async () => {
    setSyncingAds(true);
    try {
      const res = await appFetch("/api/ads/sync", { method: "POST" });
      const json = await res.json();
      if (json.success) {
        await loadAnalytics();
      } else {
        alert(json.error || "Failed to sync ad platforms.");
      }
    } catch (e: any) {
      alert(`Sync error: ${e.message}`);
    } finally {
      setSyncingAds(false);
    }
  };

  const loadAnalytics = async () => {
    setLoading(true);
    setError(null);
    try {
      let url = `/api/analytics?period=${period}&comparison=${comparison}`;
      if (activeStoreId) {
        url += `&storeRef=${encodeURIComponent(activeStoreId)}`;
      }
      const headers: Record<string, string> = {};
      if (activeStoreId) {
        if (activeStoreId.toUpperCase().startsWith("VOOP-")) {
          headers["x-voop-store-id"] = activeStoreId.toUpperCase();
        } else {
          headers["x-public-store-ref"] = activeStoreId;
        }
      }
      if (period === "custom") {
        url += `&startDate=${customStart}&endDate=${customEnd}`;
      }
      const res = await appFetch(url, { headers });
      const json = await res.json();
      if (!res.ok || json.success === false) {
        setError(json.error || "Failed to load analytics");
      } else {
        setData(json);
      }
    } catch (e: any) {
      setError(e.message || "Failed to load analytics data");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadAnalytics();
  }, [period, comparison]);

  // Handle CSV Export
  const handleExportCSV = () => {
    if (!data) return;
    const rows = [
      ["Metric", "Value", "Comparison Delta"],
      ["Total Revenue", `₹${data.primaryKPIs.totalRevenue.value}`, `${data.primaryKPIs.totalRevenue.deltaPct}%`],
      ["Orders", data.primaryKPIs.orders.value, `${data.primaryKPIs.orders.deltaPct}%`],
      ["Average Order Value", `₹${data.primaryKPIs.aov.value}`, `${data.primaryKPIs.aov.deltaPct}%`],
      ["Net Revenue", `₹${data.primaryKPIs.netRevenue.value}`, `${data.primaryKPIs.netRevenue.deltaPct}%`],
      ["Gross Profit", `₹${data.primaryKPIs.grossProfit.value}`, `${data.primaryKPIs.grossProfit.deltaPct}%`],
      ["Gross Margin", `${data.primaryKPIs.grossMargin.value}%`, `${data.primaryKPIs.grossMargin.deltaPct}%`],
      ["Ad Spend", `₹${data.primaryKPIs.adSpend.value}`, `${data.primaryKPIs.adSpend.deltaPct}%`],
      ["MER", `${data.primaryKPIs.mer.value}x`, `${data.primaryKPIs.mer.deltaPct}%`],
      ["COD Share", `${data.paymentPerformance.codPct}%`, ""],
      ["Prepaid Share", `${data.paymentPerformance.prepaidPct}%`, ""],
      ["Delivery Rate", `${data.deliveryPerformance.kpis.deliveryRate}%`, ""],
      ["RTO Rate", `${data.deliveryPerformance.kpis.rtoRate}%`, ""],
      ["Net Profit", `₹${data.profitability.netProfit}`, ""],
      ["Net Margin", `${data.profitability.netMargin}%`, ""],
    ];

    const csvContent = "data:text/csv;charset=utf-8," + rows.map((e) => e.join(",")).join("\n");
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement("a");
    link.setAttribute("href", encodedUri);
    link.setAttribute("download", `VOOP_Analytics_${period}_${new Date().toISOString().split("T")[0]}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  // Handle Add Expense Submit
  const handleAddExpense = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!expenseForm.amount || !expenseForm.description) return;
    setSavingExpense(true);
    try {
      const res = await appFetch("/api/analytics/expenses", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(expenseForm),
      });
      const json = await res.json();
      if (json.success) {
        setShowExpenseModal(false);
        setExpenseForm({
          amount: "",
          category: "Advertising",
          date: new Date().toISOString().split("T")[0],
          description: "",
          vendor: "",
          note: "",
        });
        await loadAnalytics();
      } else {
        alert(json.error || "Failed to save expense");
      }
    } catch (err: any) {
      alert(err.message || "Failed to save expense");
    } finally {
      setSavingExpense(false);
    }
  };

  // Handle Delete Expense
  const handleDeleteExpense = async (id: string) => {
    if (!confirm("Are you sure you want to delete this recorded expense?")) return;
    try {
      const res = await appFetch(`/api/analytics/expenses?id=${id}`, {
        method: "DELETE",
      });
      const json = await res.json();
      if (json.success) {
        await loadAnalytics();
      } else {
        alert(json.error || "Failed to delete expense");
      }
    } catch (err: any) {
      alert(err.message || "Failed to delete expense");
    }
  };

  // Sorted Couriers
  const sortedCouriers = useMemo(() => {
    if (!data?.courierPerformance) return [];
    return [...data.courierPerformance].sort((a, b) => {
      const valA = a[courierSortKey];
      const valB = b[courierSortKey];
      return courierSortAsc ? (valA > valB ? 1 : -1) : valA < valB ? 1 : -1;
    });
  }, [data?.courierPerformance, courierSortKey, courierSortAsc]);

  // Sorted and Filtered Products
  const filteredProducts = useMemo(() => {
    if (!data?.productPerformance) return [];
    let list = [...data.productPerformance];
    if (productSearch) {
      const q = productSearch.toLowerCase();
      list = list.filter(
        (p) => p.productName.toLowerCase().includes(q) || p.sku.toLowerCase().includes(q)
      );
    }

    if (productTab === "best_sellers" || productTab === "units_sold") {
      list.sort((a, b) => b.unitsSold - a.unitsSold);
    } else if (productTab === "revenue") {
      list.sort((a, b) => b.revenue - a.revenue);
    } else if (productTab === "profit") {
      list.sort((a, b) => b.grossProfit - a.grossProfit);
    } else if (productTab === "orders") {
      list.sort((a, b) => b.orders - a.orders);
    } else if (productTab === "rto_rate") {
      list.sort((a, b) => b.rtoRate - a.rtoRate);
    }
    return list;
  }, [data?.productPerformance, productTab, productSearch]);

  const periodLabelMap: Record<string, string> = {
    today: "Today",
    yesterday: "Yesterday",
    "7d": "Last 7 days",
    "30d": "Last 30 days",
    this_month: "This month",
    prev_month: "Previous month",
    year: "This year",
    custom: "Custom Range",
  };

  return (
    <RouteGuard requiredPermission="dashboard.view" moduleName="Analytics">
      <div className="space-y-6 pb-20" data-analytics-loaded={!loading && !!data ? "true" : "false"}>
          {/* =========================================================================
              SECTION 1 & 2: ANALYTICS HEADER & CONTROLS
             ========================================================================= */}
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 bg-[var(--surface)] p-5 rounded-2xl border border-[var(--border)] shadow-xs">
            <div>
              <div className="flex items-center gap-2">
                <span className="inline-block w-2.5 h-2.5 rounded-full bg-[var(--accent)]" />
                <h1 className="text-2xl font-black tracking-tight text-[var(--text-primary)]">Analytics</h1>
              </div>
              <p className="text-xs text-[var(--text-secondary)] mt-1 font-medium">
                Understand your revenue, profitability, marketing, delivery and customer performance.
              </p>
            </div>

            {/* Right Controls: Date Range, Compare, Export */}
            <div className="flex items-center gap-2.5 flex-wrap">
              {/* Date Range Dropdown */}
              <div className="relative">
                <button
                  type="button"
                  onClick={() => setShowDatePicker(!showDatePicker)}
                  className="flex items-center gap-2 px-3 py-2 bg-[var(--surface)] hover:bg-[var(--surface-hover)] border border-[var(--border)] rounded-xl text-xs font-semibold text-[var(--text-primary)] shadow-2xs transition-all cursor-pointer"
                >
                  <Calendar size={14} className="text-[var(--accent)]" />
                  <span>{periodLabelMap[period]}</span>
                  <ChevronDown size={13} className="text-[var(--text-muted)]" />
                </button>

                {/* Date Picker Popover */}
                {showDatePicker && (
                  <div className="absolute right-0 top-11 z-50 w-72 bg-[var(--surface)] border border-[var(--border)] rounded-2xl shadow-xl p-3 space-y-2 animate-in fade-in zoom-in-95 duration-100">
                    <div className="text-[11px] font-bold text-[var(--text-muted)] uppercase tracking-wider px-2 pt-1">
                      Select Range
                    </div>
                    <div className="grid grid-cols-2 gap-1 text-xs font-medium">
                      {(
                        ["today", "yesterday", "7d", "30d", "this_month", "prev_month", "year"] as const
                      ).map((p) => (
                        <button
                          key={p}
                          onClick={() => {
                            setPeriod(p);
                            setShowDatePicker(false);
                          }}
                          className={`px-2.5 py-1.5 rounded-lg text-left transition-colors cursor-pointer ${
                            period === p
                              ? "bg-[var(--accent)]/10 text-[var(--accent)] font-bold"
                              : "text-[var(--text-secondary)] hover:bg-[var(--bg-secondary)]"
                          }`}
                        >
                          {periodLabelMap[p]}
                        </button>
                      ))}
                    </div>

                    <div className="pt-2 border-t border-[var(--border)] space-y-2">
                      <div className="text-[11px] font-bold text-[var(--text-muted)] uppercase tracking-wider px-2">
                        Custom Dates
                      </div>
                      <div className="grid grid-cols-2 gap-2 text-xs">
                        <div>
                          <label className="text-[10px] text-[var(--text-muted)] block mb-0.5">Start</label>
                          <input
                            type="date"
                            value={customStart}
                            onChange={(e) => setCustomStart(e.target.value)}
                            className="w-full bg-[var(--bg-secondary)] border border-[var(--border)] rounded-lg px-2 py-1 text-xs text-[var(--text-primary)]"
                          />
                        </div>
                        <div>
                          <label className="text-[10px] text-[var(--text-muted)] block mb-0.5">End</label>
                          <input
                            type="date"
                            value={customEnd}
                            onChange={(e) => setCustomEnd(e.target.value)}
                            className="w-full bg-[var(--bg-secondary)] border border-[var(--border)] rounded-lg px-2 py-1 text-xs text-[var(--text-primary)]"
                          />
                        </div>
                      </div>
                      <button
                        onClick={() => {
                          setPeriod("custom");
                          setShowDatePicker(false);
                        }}
                        className="w-full py-1.5 bg-[var(--accent)] hover:bg-[var(--accent-hover)] text-white rounded-lg text-xs font-bold transition-colors cursor-pointer shadow-2xs"
                      >
                        Apply Range
                      </button>
                    </div>
                  </div>
                )}
              </div>

              {/* Comparison Dropdown */}
              <div className="flex items-center gap-1.5 bg-[var(--surface)] border border-[var(--border)] rounded-xl px-2.5 py-1.5 text-xs shadow-2xs">
                <span className="text-[var(--text-muted)] font-medium text-[11px]">Compared to:</span>
                <select
                  value={comparison}
                  onChange={(e) => setComparison(e.target.value as any)}
                  className="bg-transparent font-semibold text-[var(--text-primary)] outline-none cursor-pointer text-xs"
                >
                  <option value="previous_period">Previous period</option>
                  <option value="previous_year">Previous year</option>
                  <option value="none">No comparison</option>
                </select>
              </div>

              {/* Export Report Button */}
              <button
                type="button"
                onClick={handleExportCSV}
                className="flex items-center gap-1.5 px-3 py-2 bg-[var(--surface)] hover:bg-[var(--surface-hover)] border border-[var(--border)] rounded-xl text-xs font-semibold text-[var(--text-primary)] shadow-2xs transition-all cursor-pointer"
                title="Download CSV export of this dataset"
              >
                <Download size={13} className="text-[var(--accent)]" />
                <span>Export report</span>
              </button>
            </div>
          </div>

          {/* Loading Skeleton */}
          {loading && !data && (
            <div className="space-y-4 animate-pulse">
              <div className="h-28 bg-[var(--surface)] border border-[var(--border)] rounded-2xl" />
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                {[...Array(8)].map((_, i) => (
                  <div key={i} className="h-24 bg-[var(--surface)] border border-[var(--border)] rounded-2xl" />
                ))}
              </div>
              <div className="h-72 bg-[var(--surface)] border border-[var(--border)] rounded-2xl" />
            </div>
          )}

          {/* Error Message */}
          {error && (
            <div className="p-4 bg-red-50 border border-red-200 rounded-2xl text-xs text-red-700 flex items-center justify-between">
              <span>{error}</span>
              <button onClick={loadAnalytics} className="font-bold underline cursor-pointer">
                Retry
              </button>
            </div>
          )}

          {data && (
            <>
              {/* =========================================================================
                  SECTION 3: BUSINESS HEALTH
                 ========================================================================= */}
              <div className="bg-[var(--surface)] p-5 rounded-2xl border border-[var(--border)] shadow-xs">
                <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-6">
                  {/* Left: Overall Score Circle */}
                  <div className="flex items-center gap-4">
                    <div className="relative w-16 h-16 shrink-0 flex items-center justify-center rounded-2xl bg-[var(--accent)]/10 border border-[var(--accent)]/20">
                      <span className="text-xl font-black text-[var(--accent)]">
                        {data.businessHealth.score}
                      </span>
                      <span className="text-[10px] text-[var(--text-secondary)] font-bold absolute bottom-1">/ 100</span>
                    </div>
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="text-[11px] font-bold text-[var(--text-muted)] uppercase tracking-wider">
                          Business Health
                        </span>
                        <span
                          className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                            data.businessHealth.rating === "Excellent" || data.businessHealth.rating === "Good"
                              ? "bg-emerald-50 text-emerald-700 border border-emerald-200"
                              : "bg-amber-50 text-amber-700 border border-amber-200"
                          }`}
                        >
                          {data.businessHealth.rating}
                        </span>
                      </div>
                      <p className="text-xs text-[var(--text-secondary)] mt-0.5 font-medium">
                        Holistic score calculated across revenue, margins, RTO risk, ad efficiency, and delivery.
                      </p>
                    </div>
                  </div>

                  {/* Right: Dynamic Sub-metric Indicators */}
                  <div className="grid grid-cols-2 sm:grid-cols-5 gap-2.5">
                    {/* Revenue Status */}
                    <div className="p-2.5 rounded-xl bg-[var(--bg-secondary)] border border-[var(--border)] space-y-1">
                      <span className="text-[10px] font-bold text-[var(--text-muted)] uppercase tracking-wider block">
                        Revenue
                      </span>
                      <div className="flex items-center gap-1.5">
                        <span
                          className={`w-1.5 h-1.5 rounded-full ${
                            data.businessHealth.breakdown.revenue.status === "Healthy"
                              ? "bg-emerald-500"
                              : "bg-amber-500"
                          }`}
                        />
                        <span className="text-xs font-bold text-[var(--text-primary)]">
                          {data.businessHealth.breakdown.revenue.status}
                        </span>
                      </div>
                      <span className="text-[10px] text-[var(--text-secondary)] block">
                        {data.businessHealth.breakdown.revenue.label}
                      </span>
                    </div>

                    {/* Profit Status */}
                    <div className="p-2.5 rounded-xl bg-[var(--bg-secondary)] border border-[var(--border)] space-y-1">
                      <span className="text-[10px] font-bold text-[var(--text-muted)] uppercase tracking-wider block">
                        Profit
                      </span>
                      <div className="flex items-center gap-1.5">
                        <span
                          className={`w-1.5 h-1.5 rounded-full ${
                            data.businessHealth.breakdown.profit.status === "Healthy"
                              ? "bg-emerald-500"
                              : "bg-amber-500"
                          }`}
                        />
                        <span className="text-xs font-bold text-[var(--text-primary)]">
                          {data.businessHealth.breakdown.profit.status}
                        </span>
                      </div>
                      <span className="text-[10px] text-[var(--text-secondary)] block">
                        {data.businessHealth.breakdown.profit.label}
                      </span>
                    </div>

                    {/* RTO Status */}
                    <div className="p-2.5 rounded-xl bg-[var(--bg-secondary)] border border-[var(--border)] space-y-1">
                      <span className="text-[10px] font-bold text-[var(--text-muted)] uppercase tracking-wider block">
                        RTO
                      </span>
                      <div className="flex items-center gap-1.5">
                        <span
                          className={`w-1.5 h-1.5 rounded-full ${
                            data.businessHealth.breakdown.rto.status === "Healthy"
                              ? "bg-emerald-500"
                              : data.businessHealth.breakdown.rto.status === "Needs attention"
                              ? "bg-amber-500"
                              : "bg-red-500"
                          }`}
                        />
                        <span className="text-xs font-bold text-[var(--text-primary)]">
                          {data.businessHealth.breakdown.rto.status}
                        </span>
                      </div>
                      <span className="text-[10px] text-[var(--text-secondary)] block">
                        {data.businessHealth.breakdown.rto.label}
                      </span>
                    </div>

                    {/* Ad Efficiency Status */}
                    <div className="p-2.5 rounded-xl bg-[var(--bg-secondary)] border border-[var(--border)] space-y-1">
                      <span className="text-[10px] font-bold text-[var(--text-muted)] uppercase tracking-wider block">
                        Ad Efficiency
                      </span>
                      <div className="flex items-center gap-1.5">
                        <span
                          className={`w-1.5 h-1.5 rounded-full ${
                            data.businessHealth.breakdown.adEfficiency.status === "Strong"
                              ? "bg-emerald-500"
                              : "bg-slate-400"
                          }`}
                        />
                        <span className="text-xs font-bold text-[var(--text-primary)]">
                          {data.businessHealth.breakdown.adEfficiency.status}
                        </span>
                      </div>
                      <span className="text-[10px] text-[var(--text-secondary)] block truncate">
                        {data.businessHealth.breakdown.adEfficiency.label}
                      </span>
                    </div>

                    {/* Delivery Status */}
                    <div className="p-2.5 rounded-xl bg-[var(--bg-secondary)] border border-[var(--border)] space-y-1">
                      <span className="text-[10px] font-bold text-[var(--text-muted)] uppercase tracking-wider block">
                        Delivery
                      </span>
                      <div className="flex items-center gap-1.5">
                        <span
                          className={`w-1.5 h-1.5 rounded-full ${
                            data.businessHealth.breakdown.delivery.status === "Healthy"
                              ? "bg-emerald-500"
                              : "bg-amber-500"
                          }`}
                        />
                        <span className="text-xs font-bold text-[var(--text-primary)]">
                          {data.businessHealth.breakdown.delivery.status}
                        </span>
                      </div>
                      <span className="text-[10px] text-[var(--text-secondary)] block">
                        {data.businessHealth.breakdown.delivery.label}
                      </span>
                    </div>
                  </div>
                </div>
              </div>

              {/* =========================================================================
                  SECTION 4: PRIMARY KPI SECTION (8 CARDS IN 2 ROWS)
                 ========================================================================= */}
              <div>
                <h2 className="text-xs font-bold uppercase tracking-wider text-[var(--text-muted)] mb-3">
                  Key Performance Indicators
                </h2>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                  {/* Card 1: Total Revenue */}
                  <KpiCard
                    title="Total Revenue"
                    value={`₹${data.primaryKPIs.totalRevenue.value.toLocaleString("en-IN")}`}
                    delta={data.primaryKPIs.totalRevenue.deltaPct}
                    desc={data.primaryKPIs.totalRevenue.description}
                    comparisonMode={comparison}
                  />

                  {/* Card 2: Orders */}
                  <KpiCard
                    title="Orders"
                    value={data.primaryKPIs.orders.value.toLocaleString("en-IN")}
                    delta={data.primaryKPIs.orders.deltaPct}
                    desc={data.primaryKPIs.orders.description}
                    comparisonMode={comparison}
                  />

                  {/* Card 3: Average Order Value */}
                  <KpiCard
                    title="Average Order Value"
                    value={`₹${data.primaryKPIs.aov.value.toLocaleString("en-IN")}`}
                    delta={data.primaryKPIs.aov.deltaPct}
                    desc={data.primaryKPIs.aov.description}
                    comparisonMode={comparison}
                  />

                  {/* Card 4: Net Revenue */}
                  <KpiCard
                    title="Net Revenue"
                    value={`₹${data.primaryKPIs.netRevenue.value.toLocaleString("en-IN")}`}
                    delta={data.primaryKPIs.netRevenue.deltaPct}
                    desc={data.primaryKPIs.netRevenue.description}
                    comparisonMode={comparison}
                  />

                  {/* Card 5: Gross Profit */}
                  <KpiCard
                    title="Gross Profit"
                    value={`₹${data.primaryKPIs.grossProfit.value.toLocaleString("en-IN")}`}
                    delta={data.primaryKPIs.grossProfit.deltaPct}
                    desc={data.primaryKPIs.grossProfit.description}
                    comparisonMode={comparison}
                  />

                  {/* Card 6: Gross Margin */}
                  <KpiCard
                    title="Gross Margin"
                    value={`${data.primaryKPIs.grossMargin.value}%`}
                    delta={data.primaryKPIs.grossMargin.deltaPct}
                    desc={data.primaryKPIs.grossMargin.description}
                    comparisonMode={comparison}
                  />

                  {/* Card 7: Ad Spend */}
                  <KpiCard
                    title="Ad Spend"
                    value={
                      data.marketingPerformance.hasAdIntegration
                        ? `₹${data.primaryKPIs.adSpend.value.toLocaleString("en-IN")}`
                        : "N/A"
                    }
                    delta={data.marketingPerformance.hasAdIntegration ? data.primaryKPIs.adSpend.deltaPct : 0}
                    desc={data.primaryKPIs.adSpend.description}
                    comparisonMode={comparison}
                    invertDelta
                  />

                  {/* Card 8: MER */}
                  <KpiCard
                    title="MER (Marketing Efficiency)"
                    value={data.primaryKPIs.mer.value > 0 ? `${data.primaryKPIs.mer.value}x` : "N/A"}
                    delta={data.primaryKPIs.mer.value > 0 ? data.primaryKPIs.mer.deltaPct : 0}
                    desc={data.primaryKPIs.mer.description}
                    comparisonMode={comparison}
                  />
                </div>
              </div>

              {/* =========================================================================
                  SECTION 5: REVENUE & ORDERS (TIME-SERIES CHART)
                 ========================================================================= */}
              <div className="bg-[var(--surface)] p-5 rounded-2xl border border-[var(--border)] shadow-xs space-y-4">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                  <div>
                    <h3 className="text-base font-bold text-[var(--text-primary)]">Revenue &amp; Orders</h3>
                    <p className="text-xs text-[var(--text-secondary)] mt-0.5">
                      Daily order frequency and gross revenue trend across selected period.
                    </p>
                  </div>
                  <div className="flex items-center gap-4 text-xs font-semibold">
                    <div className="flex items-center gap-1.5 text-[var(--accent)]">
                      <span className="w-2.5 h-2.5 rounded-full bg-[var(--accent)]" />
                      <span>Revenue (₹)</span>
                    </div>
                    <div className="flex items-center gap-1.5 text-[var(--success)]">
                      <span className="w-2.5 h-2.5 rounded-full bg-[#16A34A]" />
                      <span>Orders Count</span>
                    </div>
                  </div>
                </div>

                {/* Interactive SVG Smooth Area / Line Chart */}
                <div className="relative pt-2">
                  <SvgAreaLineChart
                    dataPoints={data.revenueOrdersChart}
                    hoveredPoint={hoveredPoint}
                    setHoveredPoint={setHoveredPoint}
                  />
                </div>
              </div>

              {/* =========================================================================
                  SECTION 6: COD VS PREPAID (PAYMENT PERFORMANCE)
                 ========================================================================= */}
              <div className="bg-[var(--surface)] p-5 rounded-2xl border border-[var(--border)] shadow-xs space-y-4">
                <div className="flex items-center justify-between">
                  <div>
                    <h3 className="text-base font-bold text-[var(--text-primary)]">Payment Performance (COD vs Prepaid)</h3>
                    <p className="text-xs text-[var(--text-secondary)] mt-0.5">
                      Actual breakdown of cash-on-delivery and online prepaid orders from checkout.
                    </p>
                  </div>
                </div>

                {/* Visual Ratio Bar */}
                <div className="space-y-1.5">
                  <div className="flex justify-between text-xs font-bold">
                    <span className="text-[var(--accent)]">
                      COD: {data.paymentPerformance.codPct}% ({data.paymentPerformance.codOrders} orders)
                    </span>
                    <span className="text-[var(--success)]">
                      Prepaid: {data.paymentPerformance.prepaidPct}% ({data.paymentPerformance.prepaidOrders} orders)
                    </span>
                  </div>
                  <div className="w-full h-3 rounded-full bg-[var(--bg-secondary)] overflow-hidden flex">
                    <div
                      className="h-full bg-[var(--accent)] transition-all duration-500"
                      style={{ width: `${data.paymentPerformance.codPct}%` }}
                    />
                    <div
                      className="h-full bg-[#16A34A] transition-all duration-500"
                      style={{ width: `${data.paymentPerformance.prepaidPct}%` }}
                    />
                  </div>
                </div>

                {/* COD vs Prepaid Detailed Metrics Grid */}
                <div className="grid grid-cols-2 md:grid-cols-4 gap-3 pt-2">
                  <div className="p-3 rounded-xl bg-[var(--bg-secondary)] border border-[var(--border)]">
                    <span className="text-[10px] font-bold text-[var(--text-muted)] uppercase tracking-wider block">
                      COD Revenue
                    </span>
                    <p className="text-lg font-black text-[var(--text-primary)] mt-0.5">
                      ₹{data.paymentPerformance.codRevenue.toLocaleString("en-IN")}
                    </p>
                    <span className="text-[11px] text-[var(--text-secondary)]">
                      {data.paymentPerformance.codOrders} orders received
                    </span>
                  </div>

                  <div className="p-3 rounded-xl bg-[var(--bg-secondary)] border border-[var(--border)]">
                    <span className="text-[10px] font-bold text-[var(--text-muted)] uppercase tracking-wider block">
                      Prepaid Revenue
                    </span>
                    <p className="text-lg font-black text-[var(--success)] mt-0.5">
                      ₹{data.paymentPerformance.prepaidRevenue.toLocaleString("en-IN")}
                    </p>
                    <span className="text-[11px] text-[var(--text-secondary)]">
                      {data.paymentPerformance.prepaidOrders} orders received
                    </span>
                  </div>

                  <div className="p-3 rounded-xl bg-[var(--bg-secondary)] border border-[var(--border)]">
                    <span className="text-[10px] font-bold text-[var(--text-muted)] uppercase tracking-wider block">
                      COD Cancellation Rate
                    </span>
                    <p className="text-lg font-black text-rose-600 mt-0.5">
                      {data.paymentPerformance.codCancellationRate}%
                    </p>
                    <span className="text-[11px] text-[var(--text-secondary)]">Drop-offs prior to dispatch</span>
                  </div>

                  <div className="p-3 rounded-xl bg-[var(--bg-secondary)] border border-[var(--border)]">
                    <span className="text-[10px] font-bold text-[var(--text-muted)] uppercase tracking-wider block">
                      COD RTO Rate
                    </span>
                    <p className="text-lg font-black text-amber-600 mt-0.5">
                      {data.paymentPerformance.codRtoRate}%
                    </p>
                    <span className="text-[11px] text-[var(--text-secondary)]">RTO failure rate on COD dispatches</span>
                  </div>
                </div>
              </div>

              {/* =========================================================================
                  SECTION 7: DELIVERY PERFORMANCE & FUNNEL
                 ========================================================================= */}
              <div className="bg-[var(--surface)] p-5 rounded-2xl border border-[var(--border)] shadow-xs space-y-4">
                <div>
                  <h3 className="text-base font-bold text-[var(--text-primary)]">Delivery &amp; Fulfillment Performance</h3>
                  <p className="text-xs text-[var(--text-secondary)] mt-0.5">
                    Order journey from placement through courier dispatch to final doorstep delivery.
                  </p>
                </div>

                {/* Fulfillment Funnel */}
                <div className="grid grid-cols-1 sm:grid-cols-4 gap-2.5">
                  <div className="p-3.5 rounded-xl bg-[var(--bg-secondary)] border border-[var(--border)] text-center space-y-1">
                    <span className="text-[11px] font-bold text-[var(--text-muted)] uppercase">1. Placed Orders</span>
                    <p className="text-xl font-black text-[var(--text-primary)]">
                      {data.deliveryPerformance.funnel.orders}
                    </p>
                    <span className="text-[10px] font-semibold text-[var(--text-secondary)]">100% of pipeline</span>
                  </div>

                  <div className="p-3.5 rounded-xl bg-[var(--bg-secondary)] border border-[var(--border)] text-center space-y-1">
                    <span className="text-[11px] font-bold text-[var(--text-muted)] uppercase">2. Fulfilled</span>
                    <p className="text-xl font-black text-[var(--accent)]">
                      {data.deliveryPerformance.funnel.fulfilled}
                    </p>
                    <span className="text-[10px] font-semibold text-[var(--accent)]">
                      {data.deliveryPerformance.kpis.fulfillmentRate}% fulfillment rate
                    </span>
                  </div>

                  <div className="p-3.5 rounded-xl bg-[var(--bg-secondary)] border border-[var(--border)] text-center space-y-1">
                    <span className="text-[11px] font-bold text-[var(--text-muted)] uppercase">3. Shipped / In Transit</span>
                    <p className="text-xl font-black text-sky-600">
                      {data.deliveryPerformance.funnel.shipped}
                    </p>
                    <span className="text-[10px] font-semibold text-sky-600">
                      {data.deliveryPerformance.kpis.shippedRate}% dispatch rate
                    </span>
                  </div>

                  <div className="p-3.5 rounded-xl bg-[var(--bg-secondary)] border border-[var(--border)] text-center space-y-1">
                    <span className="text-[11px] font-bold text-[var(--text-muted)] uppercase">4. Delivered</span>
                    <p className="text-xl font-black text-[var(--success)]">
                      {data.deliveryPerformance.funnel.delivered}
                    </p>
                    <span className="text-[10px] font-semibold text-[var(--success)]">
                      {data.deliveryPerformance.kpis.deliveredRate}% success rate
                    </span>
                  </div>
                </div>

                {/* Funnel Exceptions Highlights */}
                <div className="grid grid-cols-3 gap-3 pt-1">
                  <div className="p-3 rounded-xl bg-amber-50/70 border border-amber-200">
                    <span className="text-[10px] font-bold text-amber-800 uppercase tracking-wider block">
                      RTO Quarantine
                    </span>
                    <p className="text-base font-black text-amber-900 mt-0.5">
                      {data.deliveryPerformance.highlights.rto} orders ({data.deliveryPerformance.highlights.rtoPct}%)
                    </p>
                  </div>
                  <div className="p-3 rounded-xl bg-blue-50/70 border border-blue-200">
                    <span className="text-[10px] font-bold text-blue-800 uppercase tracking-wider block">
                      Customer Returns
                    </span>
                    <p className="text-base font-black text-blue-900 mt-0.5">
                      {data.deliveryPerformance.highlights.returns} orders ({data.deliveryPerformance.highlights.returnPct}%)
                    </p>
                  </div>
                  <div className="p-3 rounded-xl bg-rose-50/70 border border-rose-200">
                    <span className="text-[10px] font-bold text-rose-800 uppercase tracking-wider block">
                      Cancelled
                    </span>
                    <p className="text-base font-black text-rose-900 mt-0.5">
                      {data.deliveryPerformance.highlights.cancelled} orders ({data.deliveryPerformance.highlights.cancellationPct}%)
                    </p>
                  </div>
                </div>
              </div>

              {/* =========================================================================
                  SECTION 8: COURIER PERFORMANCE TABLE
                 ========================================================================= */}
              <div className="bg-[var(--surface)] p-5 rounded-2xl border border-[var(--border)] shadow-xs space-y-4">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                  <div>
                    <h3 className="text-base font-bold text-[var(--text-primary)]">Courier Performance</h3>
                    <p className="text-xs text-[var(--text-secondary)] mt-0.5">
                      Live tracking stats across Delhivery and integrated logistics partners.
                    </p>
                  </div>
                </div>

                <div className="overflow-x-auto">
                  <table className="w-full text-left text-xs border-collapse">
                    <thead>
                      <tr className="border-b border-[var(--border)] bg-[var(--bg-secondary)] text-[var(--text-secondary)] font-bold uppercase text-[10px]">
                        <th className="py-3 px-4">Courier</th>
                        <th
                          className="py-3 px-4 cursor-pointer hover:text-[var(--text-primary)]"
                          onClick={() => {
                            setCourierSortKey("orders");
                            setCourierSortAsc(!courierSortAsc);
                          }}
                        >
                          Orders {courierSortKey === "orders" ? (courierSortAsc ? "↑" : "↓") : ""}
                        </th>
                        <th className="py-3 px-4">Shipped</th>
                        <th className="py-3 px-4">Delivered</th>
                        <th
                          className="py-3 px-4 cursor-pointer hover:text-[var(--text-primary)]"
                          onClick={() => {
                            setCourierSortKey("deliveryRate");
                            setCourierSortAsc(!courierSortAsc);
                          }}
                        >
                          Delivery Rate % {courierSortKey === "deliveryRate" ? (courierSortAsc ? "↑" : "↓") : ""}
                        </th>
                        <th className="py-3 px-4">RTO</th>
                        <th
                          className="py-3 px-4 cursor-pointer hover:text-[var(--text-primary)]"
                          onClick={() => {
                            setCourierSortKey("rtoRate");
                            setCourierSortAsc(!courierSortAsc);
                          }}
                        >
                          RTO Rate % {courierSortKey === "rtoRate" ? (courierSortAsc ? "↑" : "↓") : ""}
                        </th>
                        <th
                          className="py-3 px-4 cursor-pointer hover:text-[var(--text-primary)]"
                          onClick={() => {
                            setCourierSortKey("avgDeliveryTime");
                            setCourierSortAsc(!courierSortAsc);
                          }}
                        >
                          Avg Delivery Time {courierSortKey === "avgDeliveryTime" ? (courierSortAsc ? "↑" : "↓") : ""}
                        </th>
                        <th className="py-3 px-4 text-right">Status</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-[var(--border)]">
                      {sortedCouriers.length === 0 ? (
                        <tr>
                          <td colSpan={8} className="py-8 text-center text-[var(--text-muted)]">
                            No courier tracking data available for this range.
                          </td>
                        </tr>
                      ) : (
                        sortedCouriers.map((c: any, idx: number) => (
                          <tr key={idx} className="hover:bg-[var(--surface-hover)] transition-colors">
                            <td className="py-3 px-4 font-bold text-[var(--text-primary)]">{c.courier}</td>
                            <td className="py-3 px-4 font-mono font-bold text-[var(--text-primary)]">{c.orders}</td>
                            <td className="py-3 px-4 font-mono text-[var(--text-secondary)]">{c.shipped}</td>
                            <td className="py-3 px-4 font-mono font-bold text-[var(--success)]">{c.delivered}</td>
                            <td className="py-3 px-4 font-mono font-bold text-[var(--success)]">{c.deliveryRate}%</td>
                            <td className="py-3 px-4 font-mono font-bold text-amber-600">{c.rto}</td>
                            <td className="py-3 px-4 font-mono font-bold text-amber-600">{c.rtoRate}%</td>
                            <td className="py-3 px-4 font-mono text-[var(--text-secondary)]">{c.avgDeliveryTime} days</td>
                            <td className="py-3 px-4 text-right">
                              <span
                                className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                                  c.rtoRate > 20
                                    ? "bg-rose-50 text-rose-700 border border-rose-200"
                                    : c.deliveryRate > 80
                                    ? "bg-emerald-50 text-emerald-700 border border-emerald-200"
                                    : "bg-[var(--bg-secondary)] text-[var(--text-secondary)]"
                                }`}
                              >
                                {c.status}
                              </span>
                            </td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>
              </div>

              {/* =========================================================================
                  SECTION 9: RTO ANALYTICS
                 ========================================================================= */}
              <div className="bg-[var(--surface)] p-5 rounded-2xl border border-[var(--border)] shadow-xs space-y-4">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                  <div>
                    <h3 className="text-base font-bold text-[var(--text-primary)]">RTO Analytics &amp; Loss Prevention</h3>
                    <p className="text-xs text-[var(--text-secondary)] mt-0.5">
                      Identify where undelivered orders originate to eliminate reverse shipping loss.
                    </p>
                  </div>
                  {/* Tab Switcher */}
                  <div className="flex items-center gap-1 bg-[var(--bg-secondary)] p-1 rounded-xl border border-[var(--border)] text-xs font-semibold">
                    <button
                      onClick={() => setRtoTab("state")}
                      className={`px-3 py-1 rounded-lg transition-colors cursor-pointer ${
                        rtoTab === "state" ? "bg-[var(--surface)] text-[var(--text-primary)] shadow-2xs" : "text-[var(--text-secondary)]"
                      }`}
                    >
                      By State
                    </button>
                    <button
                      onClick={() => setRtoTab("pincode")}
                      className={`px-3 py-1 rounded-lg transition-colors cursor-pointer ${
                        rtoTab === "pincode" ? "bg-[var(--surface)] text-[var(--text-primary)] shadow-2xs" : "text-[var(--text-secondary)]"
                      }`}
                    >
                      By Pincode
                    </button>
                    <button
                      onClick={() => setRtoTab("product")}
                      className={`px-3 py-1 rounded-lg transition-colors cursor-pointer ${
                        rtoTab === "product" ? "bg-[var(--surface)] text-[var(--text-primary)] shadow-2xs" : "text-[var(--text-secondary)]"
                      }`}
                    >
                      By Product
                    </button>
                  </div>
                </div>

                {/* 4 RTO Summary Cards */}
                <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                  <div className="p-3 rounded-xl bg-amber-50/60 border border-amber-200">
                    <span className="text-[10px] font-bold text-amber-800 uppercase tracking-wider block">
                      RTO Rate
                    </span>
                    <p className="text-xl font-black text-amber-900 mt-0.5">
                      {data.rtoAnalytics.kpis.rtoRate}%
                    </p>
                    <span className="text-[10px] text-amber-700">Of dispatched packages</span>
                  </div>

                  <div className="p-3 rounded-xl bg-amber-50/60 border border-amber-200">
                    <span className="text-[10px] font-bold text-amber-800 uppercase tracking-wider block">
                      RTO Orders
                    </span>
                    <p className="text-xl font-black text-amber-900 mt-0.5">
                      {data.rtoAnalytics.kpis.rtoOrders}
                    </p>
                    <span className="text-[10px] text-amber-700">Returned to origin</span>
                  </div>

                  <div className="p-3 rounded-xl bg-rose-50/60 border border-rose-200">
                    <span className="text-[10px] font-bold text-rose-800 uppercase tracking-wider block">
                      RTO Revenue at Risk
                    </span>
                    <p className="text-xl font-black text-rose-900 mt-0.5">
                      ₹{data.rtoAnalytics.kpis.rtoRevenue.toLocaleString("en-IN")}
                    </p>
                    <span className="text-[10px] text-rose-700">Gross value uncollected</span>
                  </div>

                  <div className="p-3 rounded-xl bg-rose-50/60 border border-rose-200">
                    <span className="text-[10px] font-bold text-rose-800 uppercase tracking-wider block">
                      Est. Reverse Logistics Loss
                    </span>
                    <p className="text-xl font-black text-rose-900 mt-0.5">
                      ₹{data.rtoAnalytics.kpis.estimatedRtoLoss.toLocaleString("en-IN")}
                    </p>
                    <span className="text-[10px] text-rose-700">Reverse freight + packaging</span>
                  </div>
                </div>

                {/* Actionable Insights Box */}
                {data.rtoAnalytics.insights && data.rtoAnalytics.insights.length > 0 && (
                  <div className="p-3.5 bg-blue-50/60 border border-blue-200 rounded-xl space-y-1">
                    <div className="flex items-center gap-1.5 text-xs font-bold text-blue-900">
                      <Info size={14} className="text-blue-600 shrink-0" />
                      <span>Actionable RTO Insights</span>
                    </div>
                    {data.rtoAnalytics.insights.map((ins: string, i: number) => (
                      <p key={i} className="text-xs text-blue-800 pl-5 leading-relaxed">
                        • {ins}
                      </p>
                    ))}
                  </div>
                )}

                {/* Sub-tab Table: By State / Pincode / Product */}
                <div className="overflow-x-auto">
                  {rtoTab === "state" && (
                    <table className="w-full text-left text-xs border-collapse">
                      <thead>
                        <tr className="border-b border-[var(--border)] bg-[var(--bg-secondary)] text-[var(--text-secondary)] font-bold uppercase text-[10px]">
                          <th className="py-2.5 px-4">State / Province</th>
                          <th className="py-2.5 px-4">Total Orders</th>
                          <th className="py-2.5 px-4">RTO Orders</th>
                          <th className="py-2.5 px-4">RTO Rate %</th>
                          <th className="py-2.5 px-4 text-right">Revenue</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-[var(--border)]">
                        {data.rtoAnalytics.byState.slice(0, 8).map((st: any, idx: number) => (
                          <tr key={idx} className="hover:bg-[var(--surface-hover)]">
                            <td className="py-2.5 px-4 font-bold text-[var(--text-primary)]">{st.state}</td>
                            <td className="py-2.5 px-4 font-mono">{st.totalOrders}</td>
                            <td className="py-2.5 px-4 font-mono font-bold text-amber-600">{st.rtoOrders}</td>
                            <td className="py-2.5 px-4 font-mono font-bold text-amber-600">{st.rtoRate}%</td>
                            <td className="py-2.5 px-4 font-mono text-right">₹{st.revenue.toLocaleString("en-IN")}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  )}

                  {rtoTab === "pincode" && (
                    <table className="w-full text-left text-xs border-collapse">
                      <thead>
                        <tr className="border-b border-[var(--border)] bg-[var(--bg-secondary)] text-[var(--text-secondary)] font-bold uppercase text-[10px]">
                          <th className="py-2.5 px-4">Pincode</th>
                          <th className="py-2.5 px-4">Total Orders</th>
                          <th className="py-2.5 px-4">RTO Count</th>
                          <th className="py-2.5 px-4 text-right">RTO Rate %</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-[var(--border)]">
                        {data.rtoAnalytics.byPincode.slice(0, 8).map((pn: any, idx: number) => (
                          <tr key={idx} className="hover:bg-[var(--surface-hover)]">
                            <td className="py-2.5 px-4 font-mono font-bold text-[var(--text-primary)]">{pn.pincode}</td>
                            <td className="py-2.5 px-4 font-mono">{pn.totalOrders}</td>
                            <td className="py-2.5 px-4 font-mono font-bold text-amber-600">{pn.rtoOrders}</td>
                            <td className="py-2.5 px-4 font-mono font-bold text-amber-600 text-right">{pn.rtoRate}%</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  )}

                  {rtoTab === "product" && (
                    <table className="w-full text-left text-xs border-collapse">
                      <thead>
                        <tr className="border-b border-[var(--border)] bg-[var(--bg-secondary)] text-[var(--text-secondary)] font-bold uppercase text-[10px]">
                          <th className="py-2.5 px-4">Product Title</th>
                          <th className="py-2.5 px-4">Units Dispatched</th>
                          <th className="py-2.5 px-4">RTO Units</th>
                          <th className="py-2.5 px-4 text-right">RTO Rate %</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-[var(--border)]">
                        {data.rtoAnalytics.byProduct.slice(0, 8).map((pr: any, idx: number) => (
                          <tr key={idx} className="hover:bg-[var(--surface-hover)]">
                            <td className="py-2.5 px-4 font-bold text-[var(--text-primary)] truncate max-w-xs">{pr.name}</td>
                            <td className="py-2.5 px-4 font-mono">{pr.units}</td>
                            <td className="py-2.5 px-4 font-mono font-bold text-amber-600">{pr.rtoUnits}</td>
                            <td className="py-2.5 px-4 font-mono font-bold text-amber-600 text-right">{pr.rtoRate}%</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  )}
                </div>
              </div>

              {/* =========================================================================
                  SECTION 10: MARKETING / ADS PERFORMANCE (OMNICHANNEL)
                 ========================================================================= */}
              <div className="bg-[var(--surface)] p-5 rounded-2xl border border-[var(--border)] shadow-xs space-y-5">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                  <div>
                    <h3 className="text-base font-bold text-[var(--text-primary)] flex items-center gap-2">
                      <Megaphone size={18} className="text-[var(--accent)]" />
                      <span>Marketing &amp; Advertising Performance</span>
                    </h3>
                    <p className="text-xs text-[var(--text-secondary)] mt-0.5 font-medium">
                      Omnichannel ad spend, attributed revenue, and ROAS synced across Meta, Google, Snapchat, and Reddit.
                    </p>
                  </div>
                  <div className="flex items-center gap-2 flex-wrap">
                    <button
                      onClick={handleSyncAds}
                      disabled={syncingAds}
                      className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-[var(--surface)] border border-[var(--border)] hover:bg-[var(--surface-hover)] text-xs font-semibold text-[var(--accent)] shadow-2xs transition-all cursor-pointer disabled:opacity-50"
                      title="Fetch live ad spend from all connected providers"
                    >
                      <RefreshCw size={13} className={syncingAds ? "animate-spin text-[var(--accent)]" : "text-[var(--accent)]"} />
                      <span>{syncingAds ? "Syncing Providers..." : "Sync Live Ad Spend"}</span>
                    </button>
                    <a
                      href="/settings/ads"
                      className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-[var(--accent)]/10 hover:bg-[var(--accent)]/20 text-xs font-semibold text-[var(--accent)] transition-all cursor-pointer"
                    >
                      <Layers size={13} />
                      <span>Manage Ad Accounts</span>
                    </a>
                  </div>
                </div>

                {/* 4 Summary KPIs */}
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                  <div className="p-3.5 rounded-xl bg-[var(--bg-secondary)] border border-[var(--border)] space-y-0.5">
                    <span className="text-[10px] font-bold text-[var(--text-muted)] uppercase tracking-wider block">
                      Total Ad Spend
                    </span>
                    <p className="text-lg font-black text-[var(--text-primary)] font-mono">
                      ₹{(data.marketingPerformance.kpis.adSpend || 0).toLocaleString("en-IN", { minimumFractionDigits: 2 })}
                    </p>
                    <span className="text-[10px] text-[var(--text-secondary)] block">Across connected channels</span>
                  </div>

                  <div className="p-3.5 rounded-xl bg-[var(--bg-secondary)] border border-[var(--border)] space-y-0.5">
                    <span className="text-[10px] font-bold text-[var(--text-muted)] uppercase tracking-wider block">
                      Attributed Revenue
                    </span>
                    <p className="text-lg font-black text-[var(--success)] font-mono">
                      ₹{(data.marketingPerformance.kpis.attributedRevenue || 0).toLocaleString("en-IN", { minimumFractionDigits: 2 })}
                    </p>
                    <span className="text-[10px] text-[var(--success)] block">Pixel &amp; API trackable sales</span>
                  </div>

                  <div className="p-3.5 rounded-xl bg-[var(--bg-secondary)] border border-[var(--border)] space-y-0.5">
                    <span className="text-[10px] font-bold text-[var(--text-muted)] uppercase tracking-wider block">
                      Blended ROAS
                    </span>
                    <p className="text-lg font-black text-[var(--accent)] font-mono">
                      {data.marketingPerformance.kpis.roas > 0 ? `${data.marketingPerformance.kpis.roas}x` : "0.0x"}
                    </p>
                    <span className="text-[10px] text-[var(--text-secondary)] block">
                      MER: {data.marketingPerformance.kpis.mer > 0 ? `${data.marketingPerformance.kpis.mer}x` : "—"}
                    </span>
                  </div>

                  <div className="p-3.5 rounded-xl bg-[var(--bg-secondary)] border border-[var(--border)] space-y-0.5">
                    <span className="text-[10px] font-bold text-[var(--text-muted)] uppercase tracking-wider block">
                      CPA / CAC
                    </span>
                    <p className="text-lg font-black text-[var(--text-primary)] font-mono">
                      ₹{(data.marketingPerformance.kpis.cpa || 0).toLocaleString("en-IN", { minimumFractionDigits: 2 })}
                    </p>
                    <span className="text-[10px] text-[var(--text-secondary)] block">
                      {data.marketingPerformance.kpis.ordersFromAds || 0} orders from ads
                    </span>
                  </div>
                </div>

                {/* Omnichannel Ad Providers Breakdown Cards (Google, Meta, Snapchat, Reddit) */}
                <div className="space-y-2.5 pt-1">
                  <div className="flex items-center justify-between">
                    <h4 className="text-xs font-bold uppercase tracking-wider text-[var(--text-secondary)]">
                      Ad Spend by Provider
                    </h4>
                    <span className="text-[11px] text-[var(--text-muted)]">Google • Meta • Snapchat • Reddit</span>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
                    {[
                      {
                        key: "META",
                        name: "Meta Ads",
                        subtitle: "Facebook & Instagram",
                        borderClass: "hover:border-blue-400",
                        badgeClass: "bg-blue-50 text-blue-700 border-blue-200",
                        accentColor: "text-blue-600",
                        dotColor: "bg-blue-600",
                      },
                      {
                        key: "GOOGLE",
                        name: "Google Ads",
                        subtitle: "Search, Shopping & PMax",
                        borderClass: "hover:border-amber-400",
                        badgeClass: "bg-amber-50 text-amber-700 border-amber-200",
                        accentColor: "text-amber-600",
                        dotColor: "bg-amber-500",
                      },
                      {
                        key: "SNAPCHAT",
                        name: "Snapchat Ads",
                        subtitle: "Snap Ads & Dynamic",
                        borderClass: "hover:border-yellow-400",
                        badgeClass: "bg-yellow-50 text-yellow-800 border-yellow-200",
                        accentColor: "text-yellow-600",
                        dotColor: "bg-yellow-500",
                      },
                      {
                        key: "REDDIT",
                        name: "Reddit Ads",
                        subtitle: "Promoted Posts & Feed",
                        borderClass: "hover:border-orange-400",
                        badgeClass: "bg-orange-50 text-orange-700 border-orange-200",
                        accentColor: "text-orange-600",
                        dotColor: "bg-orange-500",
                      },
                    ].map((prov) => {
                      const pData = data.marketingPerformance.byProvider?.[prov.key] || {
                        connected: false,
                        spend: 0,
                        revenue: 0,
                        roas: 0,
                        conversions: 0,
                        clicks: 0,
                        impressions: 0,
                      };

                      return (
                        <div
                          key={prov.key}
                          className={`p-4 rounded-2xl border border-[var(--border)] bg-[var(--surface-hover)] transition-all flex flex-col justify-between space-y-3 ${prov.borderClass}`}
                        >
                          {/* Header */}
                          <div className="flex items-start justify-between gap-2">
                            <div>
                              <div className="flex items-center gap-1.5">
                                <span className={`w-2 h-2 rounded-full ${pData.connected ? prov.dotColor : "bg-[var(--text-muted)]"}`} />
                                <span className="text-xs font-bold text-[var(--text-primary)]">{prov.name}</span>
                              </div>
                              <span className="text-[10px] text-[var(--text-secondary)] block mt-0.5">{prov.subtitle}</span>
                            </div>
                            <span
                              className={`px-2 py-0.5 rounded-full text-[9px] font-bold border ${
                                pData.connected ? prov.badgeClass : "bg-[var(--bg-secondary)] text-[var(--text-muted)] border-[var(--border)]"
                              }`}
                            >
                              {pData.connected ? "Connected" : "Not Linked"}
                            </span>
                          </div>

                          {/* Stats or Connect prompt */}
                          {pData.connected ? (
                            <div className="space-y-2">
                              <div className="flex items-baseline justify-between">
                                <span className="text-[11px] text-[var(--text-secondary)]">Spend:</span>
                                <span className="font-mono text-sm font-black text-[var(--text-primary)]">
                                  ₹{pData.spend.toLocaleString("en-IN", { minimumFractionDigits: 2 })}
                                </span>
                              </div>
                              <div className="grid grid-cols-2 gap-1 text-[11px] pt-1.5 border-t border-[var(--border)]">
                                <div>
                                  <span className="text-[10px] text-[var(--text-muted)] block">Revenue</span>
                                  <span className="font-mono font-bold text-[var(--success)]">
                                    ₹{pData.revenue.toLocaleString("en-IN")}
                                  </span>
                                </div>
                                <div>
                                  <span className="text-[10px] text-[var(--text-muted)] block">ROAS</span>
                                  <span className="font-mono font-bold text-[var(--accent)]">{pData.roas}x</span>
                                </div>
                                <div className="mt-1">
                                  <span className="text-[10px] text-[var(--text-muted)] block">Orders</span>
                                  <span className="font-mono font-semibold text-[var(--text-primary)]">{pData.conversions}</span>
                                </div>
                                <div className="mt-1">
                                  <span className="text-[10px] text-[var(--text-muted)] block">Clicks</span>
                                  <span className="font-mono font-semibold text-[var(--text-primary)]">{pData.clicks?.toLocaleString() || 0}</span>
                                </div>
                              </div>
                            </div>
                          ) : (
                            <div className="py-2 text-center space-y-1.5 bg-[var(--surface)]/60 rounded-xl border border-dashed border-[var(--border)]">
                              <p className="text-[11px] text-[var(--text-secondary)]">No active {prov.name} linked</p>
                              <a
                                href="/settings/ads"
                                className="inline-flex items-center gap-1 text-[11px] font-bold text-[var(--accent)] hover:underline cursor-pointer"
                              >
                                <span>Connect Account</span>
                                <ArrowUpRight size={11} />
                              </a>
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>
              </div>

              {/* =========================================================================
                  SECTION 11: PROFITABILITY WATERFALL
                 ========================================================================= */}
              <div className="bg-[var(--surface)] p-5 rounded-2xl border border-[var(--border)] shadow-xs space-y-4">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                  <div>
                    <div className="flex items-center gap-2">
                      <h3 className="text-base font-bold text-[var(--text-primary)]">Profitability Overview (Waterfall)</h3>
                      <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-50 text-emerald-700 border border-emerald-200">
                        P&amp;L Synced
                      </span>
                    </div>
                    <p className="text-xs text-[var(--text-secondary)] mt-0.5">
                      Full unit economics breakdown fetched from P&amp;L engine, purchase bills, logged expenses, and physical stock unit costs (without profit).
                    </p>
                  </div>
                  <div className="flex items-center gap-2 flex-wrap sm:flex-nowrap">
                    <div className="text-right pr-2 border-r border-[var(--border)]">
                      <span className="text-[10px] font-bold text-[var(--text-muted)] uppercase block">Net Margin</span>
                      <span className={`text-base font-black ${data.profitability.netMargin < 0 ? "text-rose-600" : "text-[var(--success)]"}`}>
                        {data.profitability.netMargin}%
                      </span>
                    </div>
                    <Link
                      href="/pnl"
                      className="px-2.5 py-1.5 rounded-lg border border-[var(--border)] bg-[var(--bg-secondary)] hover:bg-[var(--surface)] text-[11px] font-bold text-[var(--text-primary)] transition-all flex items-center gap-1 shadow-2xs hover:border-[var(--accent)]"
                    >
                      <span>P&amp;L Statement</span>
                      <ArrowUpRight className="w-3.5 h-3.5 text-[var(--text-secondary)]" />
                    </Link>
                    <Link
                      href="/inventory"
                      className="px-2.5 py-1.5 rounded-lg border border-[var(--border)] bg-[var(--bg-secondary)] hover:bg-[var(--surface)] text-[11px] font-bold text-[var(--text-primary)] transition-all flex items-center gap-1 shadow-2xs hover:border-[var(--accent)]"
                    >
                      <span>Unit Costs</span>
                      <ArrowUpRight className="w-3.5 h-3.5 text-[var(--text-secondary)]" />
                    </Link>
                    <Link
                      href="/purchases"
                      className="px-2.5 py-1.5 rounded-lg border border-[var(--border)] bg-[var(--bg-secondary)] hover:bg-[var(--surface)] text-[11px] font-bold text-[var(--text-primary)] transition-all flex items-center gap-1 shadow-2xs hover:border-[var(--accent)]"
                    >
                      <span>Expense Bills</span>
                      <ArrowUpRight className="w-3.5 h-3.5 text-[var(--text-secondary)]" />
                    </Link>
                  </div>
                </div>

                {/* Waterfall Step Rows */}
                <div className="space-y-1.5 font-mono text-xs border border-[var(--border)] rounded-xl p-3 bg-[var(--bg-secondary)]">
                  <div className="flex justify-between font-bold text-[var(--text-primary)] pb-1 border-b border-[var(--border)]">
                    <span>Total Sales (Gross Turnover)</span>
                    <span>₹{data.profitability.grossRevenue.toLocaleString("en-IN", { minimumFractionDigits: 2 })}</span>
                  </div>

                  <div className="flex justify-between text-[var(--text-secondary)]">
                    <span>- Customer Discounts</span>
                    <span className="text-rose-600">
                      -₹{data.profitability.discounts.toLocaleString("en-IN", { minimumFractionDigits: 2 })}
                    </span>
                  </div>

                  <div className="flex justify-between text-[var(--text-secondary)]">
                    <span>- Product Cost / COGS (Unit Cost Without Profit)</span>
                    <span className="text-rose-600">
                      -₹{data.profitability.cogs.toLocaleString("en-IN", { minimumFractionDigits: 2 })}
                    </span>
                  </div>

                  <div className="flex justify-between font-bold text-[var(--accent)] pt-1 pb-1 border-t border-b border-[var(--border)]">
                    <span>= Gross Profit ({data.profitability.grossMargin}% Gross Margin)</span>
                    <span>₹{data.profitability.grossProfit.toLocaleString("en-IN", { minimumFractionDigits: 2 })}</span>
                  </div>

                  <div className="flex justify-between text-[var(--text-secondary)]">
                    <span>- Outward Shipping Freight (Billed Logistics &amp; Forward Freight)</span>
                    <span className="text-rose-600">
                      -₹{data.profitability.shippingCost.toLocaleString("en-IN", { minimumFractionDigits: 2 })}
                    </span>
                  </div>

                  <div className="flex justify-between text-[var(--text-secondary)]">
                    <span>- Packaging Materials (Billed Packaging &amp; Estimated)</span>
                    <span className="text-rose-600">
                      -₹{(data.profitability.packagingCost || 0).toLocaleString("en-IN", { minimumFractionDigits: 2 })}
                    </span>
                  </div>

                  <div className="flex justify-between text-[var(--text-secondary)]">
                    <span>- Payment Gateway Fees (PG Charges on Prepaid Sales)</span>
                    <span className="text-rose-600">
                      -₹{data.profitability.gatewayFees.toLocaleString("en-IN", { minimumFractionDigits: 2 })}
                    </span>
                  </div>

                  <div className="flex justify-between text-[var(--text-secondary)]">
                    <span>- Advertising Spend (Omnichannel Live Ads &amp; Agency Bills)</span>
                    <span className="text-rose-600">
                      -₹{data.profitability.adSpend.toLocaleString("en-IN", { minimumFractionDigits: 2 })}
                    </span>
                  </div>

                  <div className="flex justify-between text-[var(--text-secondary)]">
                    <span>- RTO Reverse Shipping &amp; Damaged Scrap Loss</span>
                    <span className="text-rose-600">
                      -₹{data.profitability.rtoCost.toLocaleString("en-IN", { minimumFractionDigits: 2 })}
                    </span>
                  </div>

                  <div className="flex justify-between text-[var(--text-secondary)]">
                    <span>- Other Recorded Expenses (Operating Bills, Salaries, Rent, Overhead)</span>
                    <span className="text-rose-600">
                      -₹{data.profitability.otherExpenses.toLocaleString("en-IN", { minimumFractionDigits: 2 })}
                    </span>
                  </div>

                  <div className="flex justify-between font-black text-sm text-[var(--success)] pt-2 border-t-2 border-[#16A34A]/30">
                    <span>= Bottom-Line Net Profit</span>
                    <span className={data.profitability.netProfit < 0 ? "text-rose-600" : "text-[var(--success)]"}>
                      ₹{data.profitability.netProfit.toLocaleString("en-IN", { minimumFractionDigits: 2 })}
                    </span>
                  </div>
                </div>
              </div>

              {/* =========================================================================
                  SECTION 12: MONTHLY EXPENSES (DB-PERSISTED)
                 ========================================================================= */}
              <div className="bg-[var(--surface)] p-5 rounded-2xl border border-[var(--border)] shadow-xs space-y-4">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                  <div>
                    <h3 className="text-base font-bold text-[var(--text-primary)]">Monthly Business Expenses</h3>
                    <p className="text-xs text-[var(--text-secondary)] mt-0.5">
                      Log fixed and variable operating costs to maintain audited net profitability.
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => setShowExpenseModal(true)}
                    className="flex items-center gap-1.5 px-3 py-2 bg-[var(--accent)] hover:bg-[var(--accent-hover)] text-white rounded-xl text-xs font-bold transition-colors cursor-pointer shadow-2xs"
                  >
                    <Plus size={14} />
                    <span>Add expense</span>
                  </button>
                </div>

                {/* Expenses Time-Series / Bar Chart */}
                <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
                  <div className="lg:col-span-2 p-4 bg-[var(--bg-secondary)] border border-[var(--border)] rounded-xl space-y-2">
                    <span className="text-[11px] font-bold text-[var(--text-muted)] uppercase tracking-wider block">
                      Monthly Expense Trend (Past 6 Months)
                    </span>
                    <div className="h-36 flex items-end justify-between gap-2 pt-4 px-2">
                      {data.monthlyExpenses.chart.map((m: any, idx: number) => {
                        const maxAmt = Math.max(...data.monthlyExpenses.chart.map((x: any) => x.amount), 1000);
                        const heightPct = Math.max(8, Math.min(100, (m.amount / maxAmt) * 100));
                        return (
                          <div key={idx} className="flex-1 flex flex-col items-center gap-1 h-full justify-end">
                            <span className="text-[10px] font-mono font-semibold text-[var(--text-primary)]">
                              {m.amount > 0 ? `₹${(m.amount / 1000).toFixed(0)}k` : "—"}
                            </span>
                            <div
                              className="w-full max-w-[36px] rounded-t-lg bg-[var(--accent)] transition-all hover:bg-[var(--accent-hover)]"
                              style={{ height: `${heightPct}%` }}
                            />
                            <span className="text-[10px] font-medium text-[var(--text-secondary)]">{m.month}</span>
                          </div>
                        );
                      })}
                    </div>
                  </div>

                  {/* Category Breakdown */}
                  <div className="p-4 bg-[var(--bg-secondary)] border border-[var(--border)] rounded-xl space-y-2">
                    <span className="text-[11px] font-bold text-[var(--text-muted)] uppercase tracking-wider block">
                      Category Breakdown
                    </span>
                    <div className="space-y-2 max-h-36 overflow-y-auto pr-1">
                      {data.monthlyExpenses.breakdown.length === 0 ? (
                        <p className="text-xs text-[var(--text-muted)] py-6 text-center">No expenses recorded yet.</p>
                      ) : (
                        data.monthlyExpenses.breakdown.map((cat: any, i: number) => (
                          <div key={i} className="flex items-center justify-between text-xs">
                            <span className="text-[var(--text-primary)] font-medium">{cat.category}</span>
                            <span className="font-mono font-bold text-[var(--accent)]">
                              ₹{cat.amount.toLocaleString("en-IN")}
                            </span>
                          </div>
                        ))
                      )}
                    </div>
                  </div>
                </div>

                {/* Recent Recorded Expenses List */}
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-xs border-collapse">
                    <thead>
                      <tr className="border-b border-[var(--border)] text-[var(--text-secondary)] font-bold uppercase text-[10px]">
                        <th className="py-2.5 px-3">Date</th>
                        <th className="py-2.5 px-3">Category</th>
                        <th className="py-2.5 px-3">Description</th>
                        <th className="py-2.5 px-3">Vendor</th>
                        <th className="py-2.5 px-3 font-mono text-right">Amount</th>
                        <th className="py-2.5 px-3 text-right">Action</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-[var(--border)]">
                      {data.monthlyExpenses.recentExpenses.length === 0 ? (
                        <tr>
                          <td colSpan={6} className="py-6 text-center text-[var(--text-muted)]">
                            No expenses recorded yet. Click <strong>Add expense</strong> above.
                          </td>
                        </tr>
                      ) : (
                        data.monthlyExpenses.recentExpenses.map((exp: any) => (
                          <tr key={exp.id} className="hover:bg-[var(--surface-hover)]">
                            <td className="py-2.5 px-3 text-[var(--text-secondary)] font-mono">
                              {formatShortDate(exp.date)}
                            </td>
                            <td className="py-2.5 px-3">
                              <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-[var(--accent)]/10 text-[var(--accent)]">
                                {exp.category}
                              </span>
                            </td>
                            <td className="py-2.5 px-3 font-semibold text-[var(--text-primary)]">{exp.description}</td>
                            <td className="py-2.5 px-3 text-[var(--text-secondary)]">{exp.vendor || "—"}</td>
                            <td className="py-2.5 px-3 font-mono font-bold text-rose-600 text-right">
                              ₹{exp.amount.toLocaleString("en-IN")}
                            </td>
                            <td className="py-2.5 px-3 text-right">
                              <button
                                type="button"
                                onClick={() => handleDeleteExpense(exp.id)}
                                className="p-1 text-[var(--text-secondary)] hover:text-red-500 transition-colors cursor-pointer"
                                title="Delete expense"
                              >
                                <Trash2 size={13} />
                              </button>
                            </td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>
              </div>

              {/* =========================================================================
                  SECTION 13: PRODUCT PERFORMANCE TABLE
                 ========================================================================= */}
              <div className="bg-[var(--surface)] p-5 rounded-2xl border border-[var(--border)] shadow-xs space-y-4">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                  <div>
                    <h3 className="text-base font-bold text-[var(--text-primary)]">Product Performance</h3>
                    <p className="text-xs text-[var(--text-secondary)] mt-0.5">
                      Catalog profitability, units sold, gross margins, and RTO return rates per SKU.
                    </p>
                  </div>
                  {/* Search box */}
                  <div className="w-56">
                    <SearchInput
                      placeholder="Search product or SKU..."
                      value={productSearch}
                      onChange={(e) => setProductSearch(e.target.value)}
                      onClear={() => setProductSearch("")}
                      className="py-1.5 text-xs"
                    />
                  </div>
                </div>

                {/* Tabs */}
                <div className="flex items-center gap-1.5 flex-wrap border-b border-[var(--border)] pb-2 text-xs font-semibold">
                  {(
                    [
                      { key: "revenue", label: "Revenue" },
                      { key: "best_sellers", label: "Best Sellers" },
                      { key: "profit", label: "Profit" },
                      { key: "units_sold", label: "Units Sold" },
                      { key: "orders", label: "Orders" },
                      { key: "rto_rate", label: "RTO Rate" },
                    ] as const
                  ).map((t) => (
                    <button
                      key={t.key}
                      onClick={() => setProductTab(t.key)}
                      className={`px-3 py-1 rounded-lg transition-colors cursor-pointer ${
                        productTab === t.key
                          ? "bg-[var(--accent)] text-white shadow-2xs font-bold"
                          : "text-[var(--text-secondary)] hover:bg-[var(--bg-secondary)]"
                      }`}
                    >
                      {t.label}
                    </button>
                  ))}
                </div>

                {/* Product Table */}
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-xs border-collapse">
                    <thead>
                      <tr className="border-b border-[var(--border)] bg-[var(--bg-secondary)] text-[var(--text-secondary)] font-bold uppercase text-[10px]">
                        <th className="py-2.5 px-3">Product Name &amp; SKU</th>
                        <th className="py-2.5 px-3 font-mono">Units Sold</th>
                        <th className="py-2.5 px-3 font-mono">Orders</th>
                        <th className="py-2.5 px-3 font-mono">Revenue</th>
                        <th className="py-2.5 px-3 font-mono">AOV</th>
                        <th className="py-2.5 px-3 font-mono">COGS</th>
                        <th className="py-2.5 px-3 font-mono">Gross Profit</th>
                        <th className="py-2.5 px-3 font-mono">Margin %</th>
                        <th className="py-2.5 px-3 font-mono text-right">RTO %</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-[var(--border)]">
                      {filteredProducts.length === 0 ? (
                        <tr>
                          <td colSpan={9} className="py-8 text-center text-[var(--text-muted)]">
                            No product orders matching your criteria.
                          </td>
                        </tr>
                      ) : (
                        filteredProducts.slice(0, 15).map((p: any, idx: number) => (
                          <tr key={idx} className="hover:bg-[var(--surface-hover)] transition-colors">
                            <td className="py-2.5 px-3">
                              <p className="font-bold text-[var(--text-primary)] leading-snug">{p.productName}</p>
                              <span className="text-[10px] font-mono text-[var(--text-secondary)]">{p.sku}</span>
                            </td>
                            <td className="py-2.5 px-3 font-mono font-bold text-[var(--text-primary)]">{p.unitsSold}</td>
                            <td className="py-2.5 px-3 font-mono text-[var(--text-secondary)]">{p.orders}</td>
                            <td className="py-2.5 px-3 font-mono font-bold text-[var(--text-primary)]">
                              ₹{p.revenue.toLocaleString("en-IN")}
                            </td>
                            <td className="py-2.5 px-3 font-mono text-[var(--text-secondary)]">
                              ₹{p.aov.toLocaleString("en-IN")}
                            </td>
                            <td className="py-2.5 px-3 font-mono text-rose-600">
                              ₹{p.cogs.toLocaleString("en-IN")}
                            </td>
                            <td className="py-2.5 px-3 font-mono font-bold text-[var(--success)]">
                              ₹{p.grossProfit.toLocaleString("en-IN")}
                            </td>
                            <td className="py-2.5 px-3 font-mono font-bold text-[var(--success)]">{p.margin}%</td>
                            <td className="py-2.5 px-3 font-mono font-bold text-amber-600 text-right">
                              {p.rtoRate}%
                            </td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>
              </div>

              {/* =========================================================================
                  SECTION 14 & 15: CUSTOMER & GEOGRAPHIC PERFORMANCE
                 ========================================================================= */}
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                {/* Customer Performance */}
                <div className="bg-[var(--surface)] p-5 rounded-2xl border border-[var(--border)] shadow-xs space-y-4">
                  <div>
                    <h3 className="text-base font-bold text-[var(--text-primary)]">Customer Performance &amp; Retention</h3>
                    <p className="text-xs text-[var(--text-secondary)] mt-0.5">
                      New vs returning customer repeat purchase rate and lifetime customer valuation.
                    </p>
                  </div>

                  {/* Customer Split Bar */}
                  <div className="space-y-1">
                    <div className="flex justify-between text-xs font-bold">
                      <span className="text-[var(--accent)]">
                        New Customers: {data.customerPerformance.newCustomerPct}% ({data.customerPerformance.newCustomers})
                      </span>
                      <span className="text-[var(--success)]">
                        Returning: {data.customerPerformance.returningCustomerPct}% ({data.customerPerformance.returningCustomers})
                      </span>
                    </div>
                    <div className="w-full h-2.5 rounded-full bg-[var(--bg-secondary)] overflow-hidden flex">
                      <div
                        className="h-full bg-[var(--accent)]"
                        style={{ width: `${data.customerPerformance.newCustomerPct}%` }}
                      />
                      <div
                        className="h-full bg-[#16A34A]"
                        style={{ width: `${data.customerPerformance.returningCustomerPct}%` }}
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-3 pt-1">
                    <div className="p-3 rounded-xl bg-[var(--bg-secondary)] border border-[var(--border)]">
                      <span className="text-[10px] font-bold text-[var(--text-muted)] uppercase block">
                        Repeat Purchase Rate
                      </span>
                      <p className="text-lg font-black text-[var(--accent)] mt-0.5">
                        {data.customerPerformance.repeatPurchaseRate}%
                      </p>
                      <span className="text-[10px] text-[var(--text-secondary)]">Customers with &gt;1 order</span>
                    </div>

                    <div className="p-3 rounded-xl bg-[var(--bg-secondary)] border border-[var(--border)]">
                      <span className="text-[10px] font-bold text-[var(--text-muted)] uppercase block">
                        Customer Lifetime Value (LTV)
                      </span>
                      <p className="text-lg font-black text-[var(--success)] mt-0.5">
                        ₹{data.customerPerformance.customerLifetimeValue.toLocaleString("en-IN")}
                      </p>
                      <span className="text-[10px] text-[var(--text-secondary)]">Average revenue per customer</span>
                    </div>

                    <div className="p-3 rounded-xl bg-[var(--bg-secondary)] border border-[var(--border)]">
                      <span className="text-[10px] font-bold text-[var(--text-muted)] uppercase block">
                        Revenue Per Customer
                      </span>
                      <p className="text-lg font-black text-[var(--text-primary)] mt-0.5">
                        ₹{data.customerPerformance.revenuePerCustomer.toLocaleString("en-IN")}
                      </p>
                    </div>

                    <div className="p-3 rounded-xl bg-[var(--bg-secondary)] border border-[var(--border)]">
                      <span className="text-[10px] font-bold text-[var(--text-muted)] uppercase block">
                        Orders Per Customer
                      </span>
                      <p className="text-lg font-black text-[var(--text-primary)] mt-0.5">
                        {data.customerPerformance.avgOrdersPerCustomer}
                      </p>
                    </div>
                  </div>
                </div>

                {/* Geographic Performance */}
                <div className="bg-[var(--surface)] p-5 rounded-2xl border border-[var(--border)] shadow-xs space-y-4">
                  <div className="flex items-center justify-between">
                    <div>
                      <h3 className="text-base font-bold text-[var(--text-primary)]">Geographic Performance</h3>
                      <p className="text-xs text-[var(--text-secondary)] mt-0.5">
                        Top destination hubs by volume, revenue, and delivery success.
                      </p>
                    </div>
                    {/* Geo Switcher */}
                    <div className="flex items-center gap-1 bg-[var(--bg-secondary)] p-1 rounded-xl border border-[var(--border)] text-xs font-semibold">
                      <button
                        onClick={() => setGeoTab("state")}
                        className={`px-2.5 py-0.5 rounded-lg transition-colors cursor-pointer ${
                          geoTab === "state" ? "bg-[var(--surface)] text-[var(--text-primary)] shadow-2xs" : "text-[var(--text-secondary)]"
                        }`}
                      >
                        State
                      </button>
                      <button
                        onClick={() => setGeoTab("city")}
                        className={`px-2.5 py-0.5 rounded-lg transition-colors cursor-pointer ${
                          geoTab === "city" ? "bg-[var(--surface)] text-[var(--text-primary)] shadow-2xs" : "text-[var(--text-secondary)]"
                        }`}
                      >
                        City
                      </button>
                      <button
                        onClick={() => setGeoTab("pincode")}
                        className={`px-2.5 py-0.5 rounded-lg transition-colors cursor-pointer ${
                          geoTab === "pincode" ? "bg-[var(--surface)] text-[var(--text-primary)] shadow-2xs" : "text-[var(--text-secondary)]"
                        }`}
                      >
                        Pincode
                      </button>
                    </div>
                  </div>

                  <div className="overflow-x-auto max-h-72">
                    <table className="w-full text-left text-xs border-collapse">
                      <thead>
                        <tr className="border-b border-[var(--border)] bg-[var(--bg-secondary)] text-[var(--text-secondary)] font-bold uppercase text-[10px]">
                          <th className="py-2.5 px-3">
                            {geoTab === "state" ? "State" : geoTab === "city" ? "City" : "Pincode"}
                          </th>
                          <th className="py-2.5 px-3 font-mono">Orders</th>
                          <th className="py-2.5 px-3 font-mono">Revenue</th>
                          <th className="py-2.5 px-3 font-mono">Delivered %</th>
                          <th className="py-2.5 px-3 font-mono text-right">RTO %</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-[var(--border)]">
                        {(geoTab === "state"
                          ? data.geographicPerformance.byState
                          : geoTab === "city"
                          ? data.geographicPerformance.byCity
                          : data.geographicPerformance.byPincode
                        ).map((row: any, idx: number) => (
                          <tr key={idx} className="hover:bg-[var(--surface-hover)]">
                            <td className="py-2 px-3 font-bold text-[var(--text-primary)]">
                              {row.state || row.city || row.pincode}
                            </td>
                            <td className="py-2 px-3 font-mono font-bold text-[var(--text-primary)]">{row.orders}</td>
                            <td className="py-2 px-3 font-mono">₹{row.revenue.toLocaleString("en-IN")}</td>
                            <td className="py-2 px-3 font-mono font-bold text-[var(--success)]">
                              {row.deliveryRate}%
                            </td>
                            <td className="py-2 px-3 font-mono font-bold text-amber-600 text-right">
                              {row.rtoRate}%
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              </div>
            </>
          )}

          {/* =========================================================================
              MODAL: ADD BUSINESS EXPENSE
             ========================================================================= */}
          {showExpenseModal && (
            <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-xs p-4">
              <div className="w-full max-w-md bg-[var(--surface)] border border-[var(--border)] rounded-2xl shadow-2xl p-5 space-y-4 animate-in fade-in zoom-in-95 duration-150">
                <div className="flex items-center justify-between border-b border-[var(--border)] pb-3">
                  <h3 className="text-base font-bold text-[var(--text-primary)] flex items-center gap-2">
                    <DollarSign size={18} className="text-[var(--accent)]" />
                    <span>Record Business Expense</span>
                  </h3>
                  <button
                    onClick={() => setShowExpenseModal(false)}
                    className="text-[var(--text-muted)] hover:text-[var(--text-primary)] transition-colors cursor-pointer"
                  >
                    <X size={16} />
                  </button>
                </div>

                <form onSubmit={handleAddExpense} className="space-y-3 text-xs">
                  <div>
                    <label className="font-semibold text-[var(--text-primary)] block mb-1">Expense Amount (₹) *</label>
                    <input
                      type="number"
                      step="0.01"
                      required
                      placeholder="e.g. 5000"
                      value={expenseForm.amount}
                      onChange={(e) => setExpenseForm({ ...expenseForm, amount: e.target.value })}
                      className="w-full bg-[var(--bg-secondary)] border border-[var(--border)] rounded-xl px-3 py-2 text-sm font-bold text-[var(--text-primary)] outline-none focus:border-[var(--accent)]"
                    />
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="font-semibold text-[var(--text-primary)] block mb-1">Category *</label>
                      <select
                        value={expenseForm.category}
                        onChange={(e) => setExpenseForm({ ...expenseForm, category: e.target.value })}
                        className="w-full bg-[var(--bg-secondary)] border border-[var(--border)] rounded-xl px-3 py-2 text-xs font-semibold text-[var(--text-primary)] outline-none"
                      >
                        <option value="Advertising">Advertising</option>
                        <option value="Shipping">Shipping</option>
                        <option value="Product Cost">Product Cost</option>
                        <option value="Packaging">Packaging</option>
                        <option value="Payment Gateway">Payment Gateway</option>
                        <option value="RTO">RTO</option>
                        <option value="Returns">Returns</option>
                        <option value="Salaries">Salaries</option>
                        <option value="Software / Apps">Software / Apps</option>
                        <option value="Other">Other</option>
                      </select>
                    </div>

                    <div>
                      <label className="font-semibold text-[var(--text-primary)] block mb-1">Expense Date *</label>
                      <input
                        type="date"
                        required
                        value={expenseForm.date}
                        onChange={(e) => setExpenseForm({ ...expenseForm, date: e.target.value })}
                        className="w-full bg-[var(--bg-secondary)] border border-[var(--border)] rounded-xl px-3 py-2 text-xs text-[var(--text-primary)] outline-none"
                      />
                    </div>
                  </div>

                  <div>
                    <label className="font-semibold text-[var(--text-primary)] block mb-1">Description *</label>
                    <input
                      type="text"
                      required
                      placeholder="e.g. Meta Ads campaign recharge"
                      value={expenseForm.description}
                      onChange={(e) => setExpenseForm({ ...expenseForm, description: e.target.value })}
                      className="w-full bg-[var(--bg-secondary)] border border-[var(--border)] rounded-xl px-3 py-2 text-xs text-[var(--text-primary)] outline-none"
                    />
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="font-semibold text-[var(--text-primary)] block mb-1">Vendor (Optional)</label>
                      <input
                        type="text"
                        placeholder="e.g. Meta / Google"
                        value={expenseForm.vendor}
                        onChange={(e) => setExpenseForm({ ...expenseForm, vendor: e.target.value })}
                        className="w-full bg-[var(--bg-secondary)] border border-[var(--border)] rounded-xl px-3 py-2 text-xs text-[var(--text-primary)] outline-none"
                      />
                    </div>

                    <div>
                      <label className="font-semibold text-[var(--text-primary)] block mb-1">Note (Optional)</label>
                      <input
                        type="text"
                        placeholder="e.g. Invoice #1234"
                        value={expenseForm.note}
                        onChange={(e) => setExpenseForm({ ...expenseForm, note: e.target.value })}
                        className="w-full bg-[var(--bg-secondary)] border border-[var(--border)] rounded-xl px-3 py-2 text-xs text-[var(--text-primary)] outline-none"
                      />
                    </div>
                  </div>

                  <div className="flex items-center justify-end gap-2 pt-3 border-t border-[var(--border)]">
                    <button
                      type="button"
                      onClick={() => setShowExpenseModal(false)}
                      className="px-4 py-2 bg-[var(--bg-secondary)] hover:bg-[var(--surface-hover)] text-[var(--text-primary)] rounded-xl text-xs font-semibold transition-colors cursor-pointer"
                    >
                      Cancel
                    </button>
                    <button
                      type="submit"
                      disabled={savingExpense}
                      className="px-4 py-2 bg-[var(--accent)] hover:bg-[var(--accent-hover)] text-white rounded-xl text-xs font-bold transition-colors cursor-pointer shadow-2xs disabled:opacity-50"
                    >
                      {savingExpense ? "Saving..." : "Save Expense"}
                    </button>
                  </div>
                </form>
              </div>
            </div>
          )}
      </div>
    </RouteGuard>
  );
}

// -----------------------------------------------------------------------------
// SUB-COMPONENT: KPI CARD
// -----------------------------------------------------------------------------
function KpiCard({
  title,
  value,
  delta,
  desc,
  comparisonMode,
  invertDelta,
}: {
  title: string;
  value: string;
  delta: number;
  desc: string;
  comparisonMode: string;
  invertDelta?: boolean;
}) {
  const isPositive = delta > 0;
  const isNeutral = delta === 0 || comparisonMode === "none";

  // For expenses/RTO, positive delta is bad
  const isGood = invertDelta ? !isPositive : isPositive;

  return (
    <div className="p-4 rounded-2xl bg-[var(--surface)] border border-[var(--border)] shadow-xs flex flex-col justify-between space-y-2 hover:border-[var(--accent)]/30 transition-all">
      <div>
        <span className="text-[11px] font-bold text-[var(--text-secondary)] uppercase tracking-wider block">{title}</span>
        <p className="text-2xl font-black text-[var(--text-primary)] mt-1 tracking-tight">{value}</p>
      </div>

      <div className="flex items-center justify-between pt-1 border-t border-[var(--border)]/60 text-xs">
        {comparisonMode !== "none" ? (
          <div
            className={`flex items-center gap-1 font-bold text-xs ${
              isNeutral ? "text-[var(--text-muted)]" : isGood ? "text-[var(--success)]" : "text-[var(--error)]"
            }`}
          >
            {isPositive ? <TrendingUp size={13} /> : <TrendingDown size={13} />}
            <span>
              {isPositive ? "↑" : "↓"} {Math.abs(delta)}%
            </span>
            <span className="text-[10px] text-[var(--text-muted)] font-normal">vs prev</span>
          </div>
        ) : (
          <span className="text-[10px] text-[var(--text-muted)]">Current period</span>
        )}

        <span className="text-[10px] text-[var(--text-muted)] truncate max-w-[130px]" title={desc}>
          {desc}
        </span>
      </div>
    </div>
  );
}

// -----------------------------------------------------------------------------
// SUB-COMPONENT: INTERACTIVE SVG SMOOTH AREA & LINE CHART
// -----------------------------------------------------------------------------
function SvgAreaLineChart({
  dataPoints,
  hoveredPoint,
  setHoveredPoint,
}: {
  dataPoints: Array<{ label: string; revenue: number; orders: number }>;
  hoveredPoint: any;
  setHoveredPoint: (p: any) => void;
}) {
  if (!dataPoints || dataPoints.length === 0) {
    return (
      <div className="h-60 flex items-center justify-center text-xs text-[var(--text-muted)] bg-[var(--bg-secondary)] rounded-xl border border-[var(--border)]">
        No orders recorded in this date range.
      </div>
    );
  }

  const width = 1000;
  const height = 240;
  const paddingX = 40;
  const paddingY = 20;

  const maxRevenue = Math.max(...dataPoints.map((d) => d.revenue), 100);
  const maxOrders = Math.max(...dataPoints.map((d) => d.orders), 1);

  const getX = (index: number) => {
    if (dataPoints.length === 1) return width / 2;
    return paddingX + (index / (dataPoints.length - 1)) * (width - 2 * paddingX);
  };

  const getYRevenue = (val: number) => {
    return height - paddingY - (val / maxRevenue) * (height - 2 * paddingY);
  };

  const getYOrders = (val: number) => {
    return height - paddingY - (val / maxOrders) * (height - 2 * paddingY);
  };

  // Generate smooth SVG path bezier curve
  const generateSmoothPath = (points: Array<[number, number]>) => {
    if (points.length === 0) return "";
    if (points.length === 1) return `M ${points[0][0]} ${points[0][1]}`;

    let path = `M ${points[0][0]},${points[0][1]}`;
    for (let i = 0; i < points.length - 1; i++) {
      const p0 = points[i === 0 ? 0 : i - 1];
      const p1 = points[i];
      const p2 = points[i + 1];
      const p3 = points[i + 2] || p2;

      const cp1x = p1[0] + (p2[0] - p0[0]) / 6;
      const cp1y = p1[1] + (p2[1] - p0[1]) / 6;
      const cp2x = p2[0] - (p3[0] - p1[0]) / 6;
      const cp2y = p2[1] - (p3[1] - p1[1]) / 6;

      path += ` C ${cp1x},${cp1y} ${cp2x},${cp2y} ${p2[0]},${p2[1]}`;
    }
    return path;
  };

  const revPoints: Array<[number, number]> = dataPoints.map((d, i) => [getX(i), getYRevenue(d.revenue)]);
  const orderPoints: Array<[number, number]> = dataPoints.map((d, i) => [getX(i), getYOrders(d.orders)]);

  const revLinePath = generateSmoothPath(revPoints);
  const orderLinePath = generateSmoothPath(orderPoints);

  const revAreaPath = `${revLinePath} L ${getX(dataPoints.length - 1)},${height - paddingY} L ${getX(0)},${
    height - paddingY
  } Z`;

  return (
    <div className="relative w-full overflow-hidden">
      {/* Tooltip Overlay */}
      {hoveredPoint && (
        <div
          className="absolute z-20 pointer-events-none bg-[var(--surface-elevated)] text-[var(--text-primary)] border border-[var(--border)] p-2.5 rounded-xl shadow-xl text-xs space-y-0.5"
          style={{
            left: `${Math.min(85, Math.max(15, (hoveredPoint.index / (dataPoints.length - 1)) * 100))}%`,
            top: 10,
            transform: "translateX(-50%)",
          }}
        >
          <div className="font-bold text-[#C7FF3D] border-b border-[var(--border)] pb-1 mb-1">
            {hoveredPoint.label}
          </div>
          <div className="flex justify-between gap-4">
            <span className="text-[var(--text-secondary)]">Revenue:</span>
            <span className="font-mono font-bold text-white">
              ₹{hoveredPoint.revenue.toLocaleString("en-IN")}
            </span>
          </div>
          <div className="flex justify-between gap-4">
            <span className="text-[var(--text-secondary)]">Orders:</span>
            <span className="font-mono font-bold text-[var(--success)]">{hoveredPoint.orders}</span>
          </div>
        </div>
      )}

      <svg
        viewBox={`0 0 ${width} ${height}`}
        className="w-full h-56 sm:h-64 overflow-visible"
        preserveAspectRatio="none"
      >
        <defs>
          <linearGradient id="revGrad" x1="0%" y1="0%" x2="0%" y2="100%">
            <stop offset="0%" stopColor="var(--accent)" stopOpacity="0.18" />
            <stop offset="100%" stopColor="var(--accent)" stopOpacity="0.0" />
          </linearGradient>
        </defs>

        {/* Grid lines */}
        {[0, 0.25, 0.5, 0.75, 1].map((ratio, i) => {
          const y = paddingY + ratio * (height - 2 * paddingY);
          return (
            <line
              key={i}
              x1={paddingX}
              y1={y}
              x2={width - paddingX}
              y2={y}
              stroke="var(--border)"
              strokeDasharray="4 4"
            />
          );
        })}

        {/* Revenue Area Fill */}
        <path d={revAreaPath} fill="url(#revGrad)" />

        {/* Revenue Smooth Line */}
        <path d={revLinePath} fill="none" stroke="var(--accent)" strokeWidth="2.5" strokeLinecap="round" />

        {/* Orders Smooth Line */}
        <path d={orderLinePath} fill="none" stroke="#16A34A" strokeWidth="2" strokeDasharray="3 3" />

        {/* Points & Hover Interactivity */}
        {dataPoints.map((d, i) => {
          const x = getX(i);
          const yRev = getYRevenue(d.revenue);
          return (
            <g
              key={i}
              onMouseEnter={() => setHoveredPoint({ ...d, index: i })}
              onMouseLeave={() => setHoveredPoint(null)}
              className="cursor-pointer"
            >
              {/* Invisible touch area */}
              <circle cx={x} cy={yRev} r={12} fill="transparent" />
              {/* Revenue Dot */}
              <circle
                cx={x}
                cy={yRev}
                r={hoveredPoint?.index === i ? 5 : 3}
                fill="var(--accent)"
                stroke="var(--surface)"
                strokeWidth={2}
                className="transition-all"
              />
            </g>
          );
        })}
      </svg>

      {/* X-Axis Labels */}
      <div className="flex justify-between px-6 pt-1 text-[10px] font-medium text-[var(--text-muted)]">
        {dataPoints
          .filter((_, i) => i === 0 || i === dataPoints.length - 1 || i % Math.ceil(dataPoints.length / 7) === 0)
          .map((d, idx) => (
            <span key={idx}>{d.label}</span>
          ))}
      </div>
    </div>
  );
}
