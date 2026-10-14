"use client";

import { useEffect, useState } from "react";
import {
  TrendingUp,
  DollarSign,
  ShoppingCart,
  Percent,
  Calendar,
  Layers,
  Truck,
  CreditCard,
  Megaphone,
  ArrowUpRight,
  ArrowDownRight,
  Package,
  Receipt,
  Boxes,
  Wrench,
  HelpCircle,
  SlidersHorizontal,
  Settings,
  Sparkles,
  CheckCircle2,
  X,
  RefreshCw,
  Info,
  Edit2,
  Check,
  RotateCcw,
  ShieldAlert,
  Download,
  Flame,
  FileSpreadsheet,
  ExternalLink,
} from "lucide-react";
import Link from "next/link";
import { formatDate } from "@/lib/utils";
import { CardGridSkeleton, TableSkeleton } from "@/components/LoadingSkeleton";
import { appFetch } from "@/lib/api";
import { RouteGuard } from "@/components/auth/RouteGuard";

export default function PnLPage() {
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [period, setPeriod] = useState<"today" | "yesterday" | "7d" | "30d" | "custom">("30d");

  // Custom Date Range State
  const defaultStartDate = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().split("T")[0];
  const defaultEndDate = new Date().toISOString().split("T")[0];
  const [customStartDate, setCustomStartDate] = useState(defaultStartDate);
  const [customEndDate, setCustomEndDate] = useState(defaultEndDate);

  // Expense Settings Modal & Inline Editing State
  const [showConfigModal, setShowConfigModal] = useState(false);
  const [savingConfig, setSavingConfig] = useState(false);
  const [editingCard, setEditingCard] = useState<string | null>(null);
  const [productViewMode, setProductViewMode] = useState<"shopify" | "physical">("shopify");
  const [notification, setNotification] = useState<{ type: "success" | "error"; message: string } | null>(null);

  const [expenseForm, setExpenseForm] = useState({
    packagingCostPerOrder: 30.0,
    freightCostPerOrder: 90.0,
    rtoCostPerOrder: 90.0,
    gatewayFeePercent: 2.0,
    monthlyFixedOverhead: 0.0,
    defaultCogsPercent: 35.0,
    autoFetchMetaAds: true,
    useEstimatedExpenses: true,
  });

  const loadPnL = async (overridePeriod?: string, overrideStart?: string, overrideEnd?: string) => {
    setLoading(true);
    const activePeriod = overridePeriod || period;
    const sDate = overrideStart || customStartDate;
    const eDate = overrideEnd || customEndDate;

    try {
      let url = `/api/pnl?period=${activePeriod}`;
      if (activePeriod === "custom") {
        url += `&startDate=${sDate}&endDate=${eDate}`;
      }
      const res = await appFetch(url);
      const json = await res.json();
      if (!res.ok || json.success === false) {
        setNotification({ type: "error", message: json.error || "Failed to calculate P&L data." });
      } else {
        setData(json);
        if (json.settings) {
          setExpenseForm({
            packagingCostPerOrder: json.settings.packagingCostPerOrder ?? 30.0,
            freightCostPerOrder: json.settings.freightCostPerOrder ?? 90.0,
            rtoCostPerOrder: json.settings.rtoCostPerOrder ?? 90.0,
            gatewayFeePercent: json.settings.gatewayFeePercent ?? 2.0,
            monthlyFixedOverhead: json.settings.monthlyFixedOverhead ?? 0.0,
            defaultCogsPercent: json.settings.defaultCogsPercent ?? 35.0,
            autoFetchMetaAds: json.settings.autoFetchMetaAds ?? true,
            useEstimatedExpenses: json.settings.useEstimatedExpenses ?? true,
          });
        }
      }
    } catch (e: any) {
      console.error("[PNL_LOAD_ERROR]", e);
      setNotification({ type: "error", message: e.message || "Network error loading P&L data." });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (period !== "custom") {
      loadPnL(period);
    }
  }, [period]);

  const handleApplyCustomRange = (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    setPeriod("custom");
    loadPnL("custom", customStartDate, customEndDate);
  };

  const saveSettings = async (updatedValues: Partial<typeof expenseForm>) => {
    setSavingConfig(true);
    const newForm = { ...expenseForm, ...updatedValues };
    setExpenseForm(newForm);
    try {
      const res = await appFetch("/api/pnl", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(newForm),
      });
      const json = await res.json();
      if (json.success) {
        setEditingCard(null);
        setShowConfigModal(false);
        setNotification({ type: "success", message: "Expense settings saved successfully." });
        setTimeout(() => setNotification(null), 4000);
        await loadPnL();
      } else {
        setNotification({ type: "error", message: json.error || "Failed to update expense rules." });
      }
    } catch (e: any) {
      setNotification({ type: "error", message: `Error saving rules: ${e.message}` });
    } finally {
      setSavingConfig(false);
    }
  };

  const handleSaveModal = (e: React.FormEvent) => {
    e.preventDefault();
    saveSettings(expenseForm);
  };

  const summary = data?.summary || {};
  const expenses = summary?.expenses || {};
  const breakdown = expenses?.breakdownDetails || {};
  const bills = data?.billsBreakdown || [];
  const products = data?.productBreakdown || [];
  const physicalDeductions = data?.physicalSkuDeductions || [];
  const damagedBreakdown = data?.damagedBreakdown || [];
  const settings = data?.settings || expenseForm;

  // Generate & Download Comprehensive P&L CSV Report
  const downloadPnLCSV = () => {
    if (!data) return;

    const rows: string[] = [];
    const escapeCsv = (val: any) => {
      const str = String(val ?? "").replace(/"/g, '""');
      return `"${str}"`;
    };

    const periodLabel = period === "custom" ? `Custom (${customStartDate} to ${customEndDate})` : period.toUpperCase();

    // 1. Title & Header
    rows.push(`"VOOP Universal Commerce OS - Profit & Loss (P&L) Financial Statement"`);
    rows.push(`"Period",${escapeCsv(periodLabel)}`);
    rows.push(`"Generated At",${escapeCsv(new Date().toLocaleString())}`);
    rows.push("");

    // 2. Executive Summary Metrics
    rows.push(`"--- EXECUTIVE FINANCIAL SUMMARY ---"`);
    rows.push(`"Metric","Value (INR)","Notes"`);
    rows.push(`"Gross Shopify Revenue",${(summary.revenue ?? 0).toFixed(2)},"Total sales value across all ${summary.ordersCount ?? 0} orders"`);
    rows.push(`"Paid / Prepaid Revenue",${(summary.prepaidRevenue ?? 0).toFixed(2)},"${summary.prepaidOrdersCount ?? 0} orders paid via payment gateway"`);
    rows.push(`"COD (Pending) Revenue",${(summary.codRevenue ?? 0).toFixed(2)},"${summary.codOrdersCount ?? 0} Cash on Delivery orders"`);
    rows.push(`"Total Units Sold",${summary.unitsSold ?? 0},"Physical product quantities"`);
    rows.push(`"RTO Returned Orders",${summary.rtoOrdersCount ?? 0},"Orders returned before delivery"`);
    rows.push(`"RTO Lost Sales Revenue",${(summary.rtoLostRevenue ?? 0).toFixed(2)},"Uncollected sales from RTO"`);
    rows.push("");

    // 3. Operational Expenses Itemization
    rows.push(`"--- OPERATIONAL EXPENSES BREAKDOWN ---"`);
    rows.push(`"Expense Category","Amount (INR)","Calculation Basis"`);
    rows.push(`"Product Manufacturing Cost (COGS)",${(expenses.inventoryPurchases ?? 0).toFixed(2)},"From SKU BOM unit manufacturing costs & inventory bills"`);
    rows.push(`"Forward Freight & Logistics",${(expenses.shippingExpense ?? 0).toFixed(2)},"Avg ₹${settings.freightCostPerOrder}/shipped package"`);
    rows.push(`"RTO Reverse Freight Charges",${(expenses.rtoExpense ?? 0).toFixed(2)},"${summary.rtoOrdersCount ?? 0} returns × ₹${settings.rtoCostPerOrder}/return penalty"`);
    rows.push(`"RTO Damaged Goods Write-Off Loss",${(expenses.rtoDamageLoss ?? 0).toFixed(2)},"${expenses.damagedUnitsCount ?? 0} broken units quarantined in physical scanner"`);
    rows.push(`"Packaging Supplies Charge",${(expenses.packagingExpense ?? 0).toFixed(2)},"Avg ₹${settings.packagingCostPerOrder}/package"`);
    rows.push(`"All Ads Spent & Marketing",${(expenses.marketingExpense ?? 0).toFixed(2)},"Auto-fetched across all connected Ad Accounts (Meta & Omnichannel) + ad bills"`);
    rows.push(`"Overheads & Rent",${(expenses.overheadExpense ?? 0).toFixed(2)},"Monthly fixed overhead pro-rated by days + bills"`);
    rows.push(`"Payment Gateway Fees",${(expenses.gatewayFees ?? 0).toFixed(2)},"${settings.gatewayFeePercent}% applied strictly to Paid revenue (0% on COD)"`);
    rows.push(`"TOTAL COMPUTED EXPENSES",${(expenses.totalExpenses ?? 0).toFixed(2)},"All operational deductions combined"`);
    rows.push("");

    // 4. Bottomline Profits
    rows.push(`"--- BOTTOMLINE PROFITABILITY ---"`);
    rows.push(`"Gross Profit",${(summary.grossProfit ?? 0).toFixed(2)},"${(summary.grossMarginPercent ?? 0).toFixed(2)}% Gross Margin"`);
    rows.push(`"Net Profit (EBIT)",${(summary.netProfit ?? 0).toFixed(2)},"${(summary.netMarginPercent ?? 0).toFixed(2)}% Net Profit Margin"`);
    rows.push("");

    // 5. Product Sales Breakdown Table
    rows.push(`"--- PRODUCT SALES & COGS CONTRIBUTION ---"`);
    rows.push(`"Product Title","SKU","Units Sold","Unit COGS (INR)","Total Cost (INR)","Gross Revenue (INR)","Net Margin (INR)"`);
    products.forEach((p: any) => {
      const netMargin = (p.revenue || 0) - (p.totalCost || 0);
      const titleWithVariant = p.variantTitle && p.variantTitle.toLowerCase() !== "default title"
        ? `${p.productTitle} (${p.variantTitle})`
        : p.productTitle;
      rows.push([
        escapeCsv(titleWithVariant),
        escapeCsv(p.sku || ""),
        p.unitsSold || 0,
        (p.unitCost || 0).toFixed(2),
        (p.totalCost || 0).toFixed(2),
        (p.revenue || 0).toFixed(2),
        netMargin.toFixed(2),
      ].join(","));
    });
    rows.push("");

    // 6. Damaged Goods Quarantine Table
    if (damagedBreakdown.length > 0) {
      rows.push(`"--- RTO DAMAGED GOODS QUARANTINE AUDIT ---"`);
      rows.push(`"SKU","Item / Component Name","Damaged Qty","Unit Cost (INR)","Total Loss (INR)","Ref AWB / Order","Date","Notes"`);
      damagedBreakdown.forEach((d: any) => {
        rows.push([
          escapeCsv(d.sku),
          escapeCsv(d.name),
          d.quantity,
          (d.unitCost || 0).toFixed(2),
          (d.totalLoss || 0).toFixed(2),
          escapeCsv(d.referenceId || "—"),
          escapeCsv(new Date(d.createdAt).toLocaleDateString()),
          escapeCsv(d.notes || "—"),
        ].join(","));
      });
      rows.push("");
    }

    // 7. Purchase & Expense Bills
    if (bills.length > 0) {
      rows.push(`"--- RECORDED PURCHASE & EXPENSE BILLS ---"`);
      rows.push(`"Bill #","Supplier","Category","Amount (INR)","Status","Date"`);
      bills.forEach((b: any) => {
        rows.push([
          escapeCsv(b.billNumber),
          escapeCsv(b.supplier),
          escapeCsv(b.billType),
          (b.totalAmount || 0).toFixed(2),
          escapeCsv(b.paymentStatus),
          escapeCsv(new Date(b.billDate).toLocaleDateString()),
        ].join(","));
      });
    }

    const csvContent = "data:text/csv;charset=utf-8," + rows.join("\n");
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement("a");
    link.setAttribute("href", encodedUri);
    link.setAttribute("download", `VOOP_PnL_Statement_${period}_${new Date().toISOString().slice(0, 10)}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  return (
    <RouteGuard requiredPermission="pnl.view" moduleName="P&L Statement">
      <div className="space-y-6 min-w-0">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-[var(--border)]/80 pb-4">
        <div>
          <h2 className="text-xl sm:text-2xl font-bold text-[var(--text-primary)] tracking-tight flex items-center gap-2">
            <TrendingUp className="text-cyan-600 dark:text-cyan-400" size={24} /> Profit &amp; Loss (P&amp;L)
          </h2>
          <p className="text-xs text-[var(--text-muted)] mt-1">
            Dynamic P&amp;L driven by live Shopify sales, average unit rates, RTO penalties, damaged goods losses, and Paid-only gateway splits.
          </p>
        </div>

        <div className="flex items-center gap-2 flex-wrap self-start sm:self-auto">
          {/* Date Selector */}
          <div className="flex items-center gap-1 p-1 bg-[var(--bg-secondary)] border border-[var(--border)] rounded-xl overflow-x-auto max-w-full">
            {[
              { id: "today", label: "Today" },
              { id: "yesterday", label: "Yesterday" },
              { id: "7d", label: "7 Days" },
              { id: "30d", label: "30 Days" },
              { id: "custom", label: "Custom Range" },
            ].map((tab) => (
              <button
                key={tab.id}
                onClick={() => {
                  setPeriod(tab.id as any);
                  if (tab.id === "custom") {
                    loadPnL("custom", customStartDate, customEndDate);
                  }
                }}
                className={`px-3 py-1.5 rounded-lg text-xs font-semibold whitespace-nowrap transition-all cursor-pointer ${
                  period === tab.id
                    ? "bg-cyan-500 text-slate-950 shadow-md font-bold"
                    : "text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>

          <button
            onClick={downloadPnLCSV}
            disabled={!data}
            className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-emerald-600/20 hover:bg-emerald-600/30 text-emerald-700 dark:text-emerald-300 border border-emerald-500/40 text-xs font-bold transition-all cursor-pointer shadow-md shadow-emerald-500/10"
          >
            <Download size={13} className="text-emerald-600 dark:text-emerald-400" />
            <span>Download P&amp;L CSV</span>
          </button>

          <button
            onClick={() => setShowConfigModal(true)}
            className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-slate-100 dark:bg-[var(--surface-hover)] hover:bg-[var(--surface-hover)] text-cyan-700 dark:text-cyan-300 border border-cyan-500/30 text-xs font-bold transition-all cursor-pointer"
          >
            <SlidersHorizontal size={13} className="text-cyan-600 dark:text-cyan-400" />
            <span>Customize Rules</span>
          </button>
        </div>
      </div>

      {/* In-app Notification Banner */}
      {notification && (
        <div
          className={`p-3.5 rounded-xl border flex items-center justify-between gap-3 text-xs font-semibold ${
            notification.type === "error"
              ? "bg-rose-500/10 border-rose-500/30 text-rose-600 dark:text-rose-400"
              : "bg-emerald-500/10 border-emerald-500/30 text-emerald-600 dark:text-emerald-400"
          }`}
        >
          <span>{notification.message}</span>
          <button
            onClick={() => setNotification(null)}
            className="text-[var(--text-secondary)] hover:text-slate-600 dark:hover:text-slate-200 cursor-pointer font-bold ml-2"
          >
            ✕
          </button>
        </div>
      )}

      {/* Custom Date Range Picker Bar (Shown when Custom Range is active) */}
      {period === "custom" && (
        <form
          onSubmit={handleApplyCustomRange}
          className="glass-panel p-3.5 flex flex-wrap items-center justify-between gap-3 border border-cyan-500/30 bg-cyan-950/10"
        >
          <div className="flex items-center gap-3 flex-wrap">
            <span className="text-xs font-bold text-[var(--text-secondary)] flex items-center gap-1.5">
              <Calendar size={14} className="text-cyan-600 dark:text-cyan-400" /> Select Custom Date Range:
            </span>

            <div className="flex items-center gap-2">
              <label className="text-[11px] text-[var(--text-muted)] font-semibold">From:</label>
              <input
                type="date"
                value={customStartDate}
                onChange={(e) => setCustomStartDate(e.target.value)}
                className="bg-[var(--surface)] border border-[var(--border)] rounded-lg px-2.5 py-1.5 text-xs text-[var(--text-primary)] font-mono"
              />
            </div>

            <div className="flex items-center gap-2">
              <label className="text-[11px] text-[var(--text-muted)] font-semibold">To:</label>
              <input
                type="date"
                value={customEndDate}
                onChange={(e) => setCustomEndDate(e.target.value)}
                className="bg-[var(--surface)] border border-[var(--border)] rounded-lg px-2.5 py-1.5 text-xs text-[var(--text-primary)] font-mono"
              />
            </div>
          </div>

          <button
            type="submit"
            disabled={loading}
            className="px-4 py-1.5 rounded-lg bg-cyan-500 hover:bg-cyan-400 text-slate-950 font-bold text-xs shadow-sm transition-all flex items-center gap-1.5 cursor-pointer"
          >
            <RefreshCw size={12} className={loading ? "animate-spin" : ""} />
            <span>Apply Date Range</span>
          </button>
        </form>
      )}

      {/* Top Level Summary Cards */}
      {loading ? (
        <CardGridSkeleton count={4} />
      ) : (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 animate-fade-in">
          {/* Gross Revenue */}
          <div className="glass-panel p-5 space-y-1.5">
            <span className="text-xs font-semibold text-[var(--text-muted)] uppercase tracking-wider flex items-center gap-1.5">
              <DollarSign size={15} className="text-cyan-600 dark:text-cyan-400" /> Gross Shopify Revenue
            </span>
            <p className="text-2xl sm:text-3xl font-black text-[var(--text-primary)] font-mono">
              ₹{(summary.revenue ?? 0).toLocaleString("en-IN", { minimumFractionDigits: 2 })}
            </p>
            <div className="text-xs text-[var(--text-muted)] flex items-center gap-2 flex-wrap pt-0.5">
              <span className="text-emerald-600 dark:text-emerald-400 font-semibold">
                Paid: ₹{(summary.prepaidRevenue ?? 0).toLocaleString("en-IN", { maximumFractionDigits: 0 })} ({summary.prepaidOrdersCount ?? 0})
              </span>
              <span>•</span>
              <span className="text-amber-600 dark:text-amber-400 font-semibold">
                COD: ₹{(summary.codRevenue ?? 0).toLocaleString("en-IN", { maximumFractionDigits: 0 })} ({summary.codOrdersCount ?? 0})
              </span>
            </div>
          </div>

          {/* Total Billed & Computed Expenses */}
          <div className="glass-panel p-5 space-y-1.5 border-l-4 border-l-amber-500">
            <span className="text-xs font-semibold text-[var(--text-muted)] uppercase tracking-wider flex items-center gap-1.5">
              <Receipt size={15} className="text-amber-600 dark:text-amber-400" /> Total Computed Expenses
            </span>
            <p className="text-2xl sm:text-3xl font-black text-amber-600 dark:text-amber-400 font-mono">
              ₹{(expenses.totalExpenses ?? 0).toLocaleString("en-IN", { minimumFractionDigits: 2 })}
            </p>
            <p className="text-xs text-[var(--text-muted)]">COGS + Freight + RTO + Damage + Ads + Fees</p>
          </div>

          {/* Gross Profit */}
          <div className="glass-panel p-5 space-y-1.5 border-l-4 border-l-emerald-500">
            <span className="text-xs font-semibold text-[var(--text-muted)] uppercase tracking-wider flex items-center gap-1.5">
              <Percent size={15} className="text-emerald-600 dark:text-emerald-400" /> Gross Profit
            </span>
            <p className="text-2xl sm:text-3xl font-black text-emerald-600 dark:text-emerald-400 font-mono">
              ₹{(summary.grossProfit ?? 0).toLocaleString("en-IN", { minimumFractionDigits: 2 })}
            </p>
            <p className="text-xs text-emerald-600 dark:text-emerald-400 font-bold">
              {(summary.grossMarginPercent ?? 0).toFixed(1)}% Gross Margin
            </p>
          </div>

          {/* Net Profit */}
          <div className="glass-panel p-5 space-y-1.5 border-l-4 border-l-purple-500">
            <span className="text-xs font-semibold text-[var(--text-muted)] uppercase tracking-wider flex items-center gap-1.5">
              <TrendingUp size={15} className="text-purple-600 dark:text-purple-400" /> Net Profit (EBIT)
            </span>
            <p
              className={`text-2xl sm:text-3xl font-black font-mono ${
                summary.netProfit >= 0 ? "text-emerald-600 dark:text-emerald-400" : "text-red-600 dark:text-red-400"
              }`}
            >
              ₹{(summary.netProfit ?? 0).toLocaleString("en-IN", { minimumFractionDigits: 2 })}
            </p>
            <p className="text-xs text-[var(--text-muted)] font-mono font-medium">
              {(summary.netMarginPercent ?? 0).toFixed(1)}% Net Margin
            </p>
          </div>
        </div>
      )}

      {/* Operational Expenses Breakdown Grid with INLINE EDITING */}
      <div className="space-y-3">
        <div className="flex justify-between items-center">
          <h3 className="text-xs font-bold text-[var(--text-muted)] uppercase tracking-wider flex items-center gap-1.5">
            <Receipt size={14} className="text-cyan-600 dark:text-cyan-400" /> Operational Expenses Breakdown (Click Edit icon on any card to customize rate)
          </h3>
          <Link href="/purchases" className="text-xs text-cyan-600 dark:text-cyan-400 hover:underline font-semibold">
            Manage All Bills &rarr;
          </Link>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-8 gap-3">
          {/* 1. Product Manufacturing Cost (COGS) */}
          <div className="glass-panel p-3.5 space-y-1 border-l-2 border-l-emerald-500 flex flex-col justify-between">
            <div>
              <span className="text-[10px] text-[var(--text-muted)] uppercase flex items-center gap-1 font-bold">
                <Boxes size={11} className="text-emerald-600 dark:text-emerald-400" /> Product COGS
              </span>
              <p className="text-base font-bold text-[var(--text-primary)] font-mono mt-0.5">
                ₹{(expenses.inventoryPurchases ?? 0).toLocaleString("en-IN", { maximumFractionDigits: 0 })}
              </p>
            </div>
            <p className="text-[9px] text-[var(--text-muted)] truncate">
              {breakdown.cogsFromBOM > 0 ? "From SKU BOM Unit Costs" : "From Inventory Bills / Rule"}
            </p>
          </div>

          {/* 2. Shipping & Forward Freight (Customizable Average) */}
          <div className="glass-panel p-3.5 space-y-1 border-l-2 border-l-purple-500 flex flex-col justify-between relative group">
            <div>
              <div className="flex items-center justify-between">
                <span className="text-[10px] text-[var(--text-muted)] uppercase flex items-center gap-1 font-bold">
                  <Truck size={11} className="text-purple-600 dark:text-purple-400" /> Forward Freight
                </span>
                <button
                  onClick={() => setEditingCard(editingCard === "freight" ? null : "freight")}
                  className="text-purple-600 dark:text-purple-400 hover:text-purple-500 text-[10px] p-0.5 cursor-pointer"
                  title="Edit average forward freight rate"
                >
                  <Edit2 size={10} />
                </button>
              </div>

              {editingCard === "freight" ? (
                <div className="flex items-center gap-1 mt-1">
                  <span className="text-xs text-purple-600 dark:text-purple-300 font-mono">₹</span>
                  <input
                    type="number"
                    value={expenseForm.freightCostPerOrder}
                    onChange={(e) =>
                      setExpenseForm({ ...expenseForm, freightCostPerOrder: parseFloat(e.target.value) || 0 })
                    }
                    onBlur={() => saveSettings({ freightCostPerOrder: expenseForm.freightCostPerOrder })}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") saveSettings({ freightCostPerOrder: expenseForm.freightCostPerOrder });
                    }}
                    className="w-14 bg-[var(--surface)] border border-purple-500 rounded px-1.5 py-0.5 text-xs text-[var(--text-primary)] font-mono font-bold"
                    autoFocus
                  />
                  <button
                    onClick={() => saveSettings({ freightCostPerOrder: expenseForm.freightCostPerOrder })}
                    className="p-1 bg-purple-600 rounded text-white cursor-pointer"
                  >
                    <Check size={10} />
                  </button>
                </div>
              ) : (
                <p className="text-base font-bold text-[var(--text-primary)] font-mono mt-0.5">
                  ₹{(expenses.shippingExpense ?? 0).toLocaleString("en-IN", { maximumFractionDigits: 0 })}
                </p>
              )}
            </div>

            <p className="text-[9px] text-purple-600 dark:text-purple-300 font-mono truncate">
              Avg: ₹{settings.freightCostPerOrder}/pkg ({summary.ordersCount} pkgs)
            </p>
          </div>

          {/* 3. RTO Reverse Freight & Penalty Charges */}
          <div className="glass-panel p-3.5 space-y-1 border-l-2 border-l-rose-500 flex flex-col justify-between relative group">
            <div>
              <div className="flex items-center justify-between">
                <span className="text-[10px] text-[var(--text-muted)] uppercase flex items-center gap-1 font-bold">
                  <RotateCcw size={11} className="text-rose-600 dark:text-rose-400" /> RTO Charges
                </span>
                <button
                  onClick={() => setEditingCard(editingCard === "rto" ? null : "rto")}
                  className="text-rose-600 dark:text-rose-400 hover:text-rose-500 text-[10px] p-0.5 cursor-pointer"
                  title="Edit average RTO reverse penalty rate"
                >
                  <Edit2 size={10} />
                </button>
              </div>

              {editingCard === "rto" ? (
                <div className="flex items-center gap-1 mt-1">
                  <span className="text-xs text-rose-600 dark:text-rose-300 font-mono">₹</span>
                  <input
                    type="number"
                    value={expenseForm.rtoCostPerOrder}
                    onChange={(e) =>
                      setExpenseForm({ ...expenseForm, rtoCostPerOrder: parseFloat(e.target.value) || 0 })
                    }
                    onBlur={() => saveSettings({ rtoCostPerOrder: expenseForm.rtoCostPerOrder })}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") saveSettings({ rtoCostPerOrder: expenseForm.rtoCostPerOrder });
                    }}
                    className="w-14 bg-[var(--surface)] border border-rose-500 rounded px-1.5 py-0.5 text-xs text-[var(--text-primary)] font-mono font-bold"
                    autoFocus
                  />
                  <button
                    onClick={() => saveSettings({ rtoCostPerOrder: expenseForm.rtoCostPerOrder })}
                    className="p-1 bg-rose-600 rounded text-white cursor-pointer"
                  >
                    <Check size={10} />
                  </button>
                </div>
              ) : (
                <p className="text-base font-bold text-rose-600 dark:text-rose-400 font-mono mt-0.5">
                  ₹{(expenses.rtoExpense ?? 0).toLocaleString("en-IN", { maximumFractionDigits: 0 })}
                </p>
              )}
            </div>

            <p className="text-[9px] text-rose-600 dark:text-rose-300 font-mono truncate" title="Reverse courier fee on RTO shipments">
              {summary.rtoOrdersCount ?? 0} RTOs × ₹{settings.rtoCostPerOrder}
            </p>
          </div>

          {/* 4. RTO Damaged Goods Loss (Quarantined Inventory) */}
          <div className="glass-panel p-3.5 space-y-1 border-l-2 border-l-red-600 flex flex-col justify-between bg-red-500/5 dark:bg-red-950/10">
            <div>
              <span className="text-[10px] text-red-600 dark:text-red-400 uppercase flex items-center gap-1 font-bold">
                <ShieldAlert size={11} className="text-red-600 dark:text-red-400" /> Damage Loss
              </span>
              <p className="text-base font-bold text-red-600 dark:text-red-400 font-mono mt-0.5">
                ₹{(expenses.rtoDamageLoss ?? 0).toLocaleString("en-IN", { maximumFractionDigits: 0 })}
              </p>
            </div>
            <p className="text-[9px] text-red-600 dark:text-red-300 font-mono truncate" title="Manufacturing write-off cost of damaged components quarantined in scanner">
              {expenses.damagedUnitsCount ?? 0} broken units quarantined
            </p>
          </div>

          {/* 5. Packaging Supplies (Customizable Average) */}
          <div className="glass-panel p-3.5 space-y-1 border-l-2 border-l-amber-500 flex flex-col justify-between relative group">
            <div>
              <div className="flex items-center justify-between">
                <span className="text-[10px] text-[var(--text-muted)] uppercase flex items-center gap-1 font-bold">
                  <Layers size={11} className="text-amber-600 dark:text-amber-400" /> Packaging
                </span>
                <button
                  onClick={() => setEditingCard(editingCard === "packaging" ? null : "packaging")}
                  className="text-amber-600 dark:text-amber-400 hover:text-amber-500 text-[10px] p-0.5 cursor-pointer"
                  title="Edit average packaging rate"
                >
                  <Edit2 size={10} />
                </button>
              </div>

              {editingCard === "packaging" ? (
                <div className="flex items-center gap-1 mt-1">
                  <span className="text-xs text-amber-600 dark:text-amber-300 font-mono">₹</span>
                  <input
                    type="number"
                    value={expenseForm.packagingCostPerOrder}
                    onChange={(e) =>
                      setExpenseForm({ ...expenseForm, packagingCostPerOrder: parseFloat(e.target.value) || 0 })
                    }
                    onBlur={() => saveSettings({ packagingCostPerOrder: expenseForm.packagingCostPerOrder })}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") saveSettings({ packagingCostPerOrder: expenseForm.packagingCostPerOrder });
                    }}
                    className="w-14 bg-[var(--surface)] border border-amber-500 rounded px-1.5 py-0.5 text-xs text-[var(--text-primary)] font-mono font-bold"
                    autoFocus
                  />
                  <button
                    onClick={() => saveSettings({ packagingCostPerOrder: expenseForm.packagingCostPerOrder })}
                    className="p-1 bg-amber-600 rounded text-white cursor-pointer"
                  >
                    <Check size={10} />
                  </button>
                </div>
              ) : (
                <p className="text-base font-bold text-[var(--text-primary)] font-mono mt-0.5">
                  ₹{(expenses.packagingExpense ?? 0).toLocaleString("en-IN", { maximumFractionDigits: 0 })}
                </p>
              )}
            </div>

            <p className="text-[9px] text-amber-600 dark:text-amber-300 font-mono truncate">
              Avg: ₹{settings.packagingCostPerOrder}/pkg ({summary.ordersCount} pkgs)
            </p>
          </div>

          {/* 6. Marketing & All Ads Spent */}
          <div className="glass-panel p-3.5 space-y-1 border-l-2 border-l-pink-500 flex flex-col justify-between">
            <div>
              <div className="flex items-center justify-between">
                <span className="text-[10px] text-[var(--text-muted)] uppercase flex items-center gap-1 font-bold">
                  <Megaphone size={11} className="text-pink-600 dark:text-pink-400" /> All Ads Spent
                </span>
                <Link
                  href="/meta-ads"
                  className="text-pink-600 dark:text-pink-400 hover:text-pink-500 text-[10px] p-0.5"
                  title="View All Ads Accounts & ROAS"
                >
                  <ExternalLink size={10} />
                </Link>
              </div>
              <p className="text-base font-bold text-[var(--text-primary)] font-mono mt-0.5">
                ₹{(expenses.marketingExpense ?? 0).toLocaleString("en-IN", { maximumFractionDigits: 0 })}
              </p>
            </div>
            <Link
              href="/meta-ads"
              className="text-[9px] text-pink-600 dark:text-pink-300 hover:underline font-mono truncate block"
              title="View all ad accounts & ROAS"
            >
              {breakdown.activeAdAccountsCount > 0
                ? `Auto-fetched: ${breakdown.activeAdAccountsCount} Ad Account${breakdown.activeAdAccountsCount > 1 ? "s" : ""}`
                : breakdown.liveMetaSpend > 0
                ? "Auto-fetched Meta API"
                : "From Ad Bills"}
            </Link>
          </div>

          {/* 7. Overheads & Rent (Customizable Monthly Value) */}
          <div className="glass-panel p-3.5 space-y-1 border-l-2 border-l-blue-500 flex flex-col justify-between relative group">
            <div>
              <div className="flex items-center justify-between">
                <span className="text-[10px] text-[var(--text-muted)] uppercase flex items-center gap-1 font-bold">
                  <Wrench size={11} className="text-blue-600 dark:text-blue-400" /> Overheads
                </span>
                <button
                  onClick={() => setEditingCard(editingCard === "overhead" ? null : "overhead")}
                  className="text-blue-600 dark:text-blue-400 hover:text-blue-500 text-[10px] p-0.5 cursor-pointer"
                  title="Edit monthly fixed overhead"
                >
                  <Edit2 size={10} />
                </button>
              </div>

              {editingCard === "overhead" ? (
                <div className="flex items-center gap-1 mt-1">
                  <span className="text-xs text-blue-600 dark:text-blue-300 font-mono">₹</span>
                  <input
                    type="number"
                    value={expenseForm.monthlyFixedOverhead}
                    onChange={(e) =>
                      setExpenseForm({ ...expenseForm, monthlyFixedOverhead: parseFloat(e.target.value) || 0 })
                    }
                    onBlur={() => saveSettings({ monthlyFixedOverhead: expenseForm.monthlyFixedOverhead })}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") saveSettings({ monthlyFixedOverhead: expenseForm.monthlyFixedOverhead });
                    }}
                    className="w-16 bg-[var(--surface)] border border-blue-500 rounded px-1.5 py-0.5 text-xs text-[var(--text-primary)] font-mono font-bold"
                    autoFocus
                  />
                  <button
                    onClick={() => saveSettings({ monthlyFixedOverhead: expenseForm.monthlyFixedOverhead })}
                    className="p-1 bg-blue-600 rounded text-white cursor-pointer"
                  >
                    <Check size={10} />
                  </button>
                </div>
              ) : (
                <p className="text-base font-bold text-[var(--text-primary)] font-mono mt-0.5">
                  ₹{(expenses.overheadExpense ?? 0).toLocaleString("en-IN", { maximumFractionDigits: 0 })}
                </p>
              )}
            </div>

            <p className="text-[9px] text-blue-600 dark:text-blue-300 font-mono truncate">
              ₹{settings.monthlyFixedOverhead}/mo pro-rated
            </p>
          </div>

          {/* 8. Payment Gateway Fees: ONLY ON PAID/PREPAID ORDERS */}
          <div className="glass-panel p-3.5 space-y-1 border-l-2 border-l-cyan-500 flex flex-col justify-between relative group">
            <div>
              <div className="flex items-center justify-between">
                <span className="text-[10px] text-[var(--text-muted)] uppercase flex items-center gap-1 font-bold">
                  <CreditCard size={11} className="text-cyan-600 dark:text-cyan-400" /> Gateway ({settings.gatewayFeePercent}%)
                </span>
                <button
                  onClick={() => setEditingCard(editingCard === "gateway" ? null : "gateway")}
                  className="text-cyan-600 dark:text-cyan-400 hover:text-cyan-500 text-[10px] p-0.5 cursor-pointer"
                  title="Edit gateway fee percentage"
                >
                  <Edit2 size={10} />
                </button>
              </div>

              {editingCard === "gateway" ? (
                <div className="flex items-center gap-1 mt-1">
                  <input
                    type="number"
                    step="0.1"
                    value={expenseForm.gatewayFeePercent}
                    onChange={(e) =>
                      setExpenseForm({ ...expenseForm, gatewayFeePercent: parseFloat(e.target.value) || 0 })
                    }
                    onBlur={() => saveSettings({ gatewayFeePercent: expenseForm.gatewayFeePercent })}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") saveSettings({ gatewayFeePercent: expenseForm.gatewayFeePercent });
                    }}
                    className="w-12 bg-[var(--surface)] border border-cyan-500 rounded px-1.5 py-0.5 text-xs text-[var(--text-primary)] font-mono font-bold"
                    autoFocus
                  />
                  <span className="text-xs text-cyan-600 dark:text-cyan-300 font-mono">%</span>
                  <button
                    onClick={() => saveSettings({ gatewayFeePercent: expenseForm.gatewayFeePercent })}
                    className="p-1 bg-cyan-600 rounded text-white cursor-pointer"
                  >
                    <Check size={10} />
                  </button>
                </div>
              ) : (
                <p className="text-base font-bold text-[var(--text-primary)] font-mono mt-0.5">
                  ₹{(expenses.gatewayFees ?? 0).toLocaleString("en-IN", { maximumFractionDigits: 0 })}
                </p>
              )}
            </div>

            <p className="text-[9px] text-cyan-600 dark:text-cyan-300 font-mono truncate" title="Applied strictly to Paid/Prepaid revenue only. 0% on COD">
              {settings.gatewayFeePercent}% on ₹{(summary.prepaidRevenue ?? 0).toLocaleString("en-IN", { maximumFractionDigits: 0 })} Paid (COD: ₹0)
            </p>
          </div>
        </div>
      </div>

      {/* 2-Column Tables: Recent Bills & Product Revenue */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Left: Recent Expense Bills */}
        <div className="glass-panel overflow-hidden space-y-3 p-4">
          <div className="flex justify-between items-center">
            <h4 className="text-sm font-bold text-[var(--text-primary)] flex items-center gap-1.5">
              <Receipt size={15} className="text-cyan-600 dark:text-cyan-400" /> Recent Purchase &amp; Expense Bills
            </h4>
            <Link href="/purchases" className="text-xs text-[var(--text-muted)] hover:text-slate-900 dark:text-[var(--text-secondary)] dark:hover:text-white">
              View All &rarr;
            </Link>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs text-[var(--text-secondary)]">
              <thead className="bg-[var(--bg-secondary)]/80 text-[var(--text-muted)] uppercase text-[10px] tracking-wider border-b border-[var(--border)]">
                <tr>
                  <th className="py-2.5 px-3">Bill #</th>
                  <th className="py-2.5 px-3">Supplier</th>
                  <th className="py-2.5 px-3">Category</th>
                  <th className="py-2.5 px-3">Amount</th>
                  <th className="py-2.5 px-3">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--border)]">
                {bills.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="py-8 text-center text-[var(--text-muted)]">
                      No purchase bills recorded in this period.{" "}
                      <Link href="/purchases" className="text-cyan-600 dark:text-cyan-400 underline">
                        Add a Purchase Bill &rarr;
                      </Link>
                    </td>
                  </tr>
                ) : (
                  bills.map((bill: any) => (
                    <tr key={bill.id} className="hover:bg-slate-100/60 dark:hover:bg-[var(--bg-secondary)]">
                      <td className="py-2.5 px-3 font-mono font-semibold text-[var(--text-primary)]">{bill.billNumber}</td>
                      <td className="py-2.5 px-3 text-[var(--text-secondary)]">{bill.supplier}</td>
                      <td className="py-2.5 px-3 text-[10px] text-[var(--text-muted)]">{bill.billType}</td>
                      <td className="py-2.5 px-3 font-mono font-bold text-[var(--text-primary)]">₹{bill.totalAmount.toFixed(2)}</td>
                      <td className="py-2.5 px-3">
                        <span className="badge badge-success">{bill.paymentStatus}</span>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>

        {/* Right: Product Sales & Physical SKU Breakdown */}
        <div className="glass-panel overflow-hidden space-y-3 p-4">
          <div className="flex flex-wrap justify-between items-center gap-2">
            <div className="flex items-center gap-1.5">
              <Package size={15} className="text-emerald-600 dark:text-emerald-400" />
              <h4 className="text-sm font-bold text-[var(--text-primary)]">
                {productViewMode === "shopify" ? "Shopify Product Sales" : "Physical SKU Deductions"}
              </h4>
            </div>

            {/* View Mode Switcher */}
            <div className="flex items-center bg-[var(--bg-secondary)] border border-[var(--border)] rounded-lg p-0.5 text-[10px] font-bold">
              <button
                onClick={() => setProductViewMode("shopify")}
                className={`px-2 py-1 rounded transition-all cursor-pointer ${
                  productViewMode === "shopify"
                    ? "bg-white dark:bg-[var(--surface-hover)] text-emerald-600 dark:text-emerald-400 shadow-sm font-black"
                    : "text-[var(--text-muted)] hover:text-[var(--text-primary)]"
                }`}
              >
                Shopify Items ({products.length})
              </button>
              <button
                onClick={() => setProductViewMode("physical")}
                className={`px-2 py-1 rounded transition-all cursor-pointer ${
                  productViewMode === "physical"
                    ? "bg-white dark:bg-[var(--surface-hover)] text-indigo-600 dark:text-indigo-400 shadow-sm font-black"
                    : "text-[var(--text-muted)] hover:text-[var(--text-primary)]"
                }`}
              >
                📦 SKU Deductions ({physicalDeductions.length})
              </button>
            </div>
          </div>

          <div className="overflow-x-auto max-h-80 overflow-y-auto">
            {productViewMode === "shopify" ? (
              <table className="w-full text-left text-xs text-[var(--text-secondary)]">
                <thead className="bg-[var(--bg-secondary)]/80 text-[var(--text-muted)] uppercase text-[10px] tracking-wider border-b border-[var(--border)] sticky top-0">
                  <tr>
                    <th className="py-2.5 px-3">Product &amp; SKU</th>
                    <th className="py-2.5 px-3">Units Sold</th>
                    <th className="py-2.5 px-3">COGS (Unit)</th>
                    <th className="py-2.5 px-3">Gross Revenue</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[var(--border)]">
                  {products.length === 0 ? (
                    <tr>
                      <td colSpan={4} className="py-8 text-center text-[var(--text-muted)]">
                        No product sales recorded in this period.
                      </td>
                    </tr>
                  ) : (
                    products.map((prod: any, idx: number) => (
                      <tr key={idx} className="hover:bg-slate-100/60 dark:hover:bg-[var(--bg-secondary)]">
                        <td className="py-2.5 px-3">
                          <div className="font-semibold text-[var(--text-primary)] truncate max-w-[220px]" title={prod.productTitle}>
                            {prod.productTitle}
                          </div>
                          <div className="flex items-center gap-1.5 flex-wrap mt-0.5">
                            {prod.variantTitle && prod.variantTitle.toLowerCase() !== "default title" && (
                              <span className="text-[9px] px-1.5 py-0.5 bg-indigo-50 dark:bg-indigo-950/60 text-indigo-700 dark:text-indigo-300 font-semibold rounded border border-indigo-200 dark:border-indigo-800/60">
                                {prod.variantTitle}
                              </span>
                            )}
                            <span className="text-[10px] text-[var(--text-muted)] font-mono font-bold">
                              {prod.sku || "—"}
                            </span>
                          </div>
                          {prod.isCombo && prod.components?.length > 0 && (
                            <div className="text-[9px] text-indigo-600 dark:text-indigo-400 font-mono mt-1 font-semibold flex items-center gap-1">
                              <span>📦 Combo:</span>
                              <span>{prod.components.join(" + ")}</span>
                            </div>
                          )}
                        </td>
                        <td className="py-2.5 px-3 font-mono font-bold text-[var(--text-primary)]">
                          {prod.unitsSold} units
                        </td>
                        <td className="py-2.5 px-3 font-mono text-[var(--text-muted)]">
                          {prod.unitCost > 0 ? `₹${prod.unitCost.toFixed(0)}` : "—"}
                        </td>
                        <td className="py-2.5 px-3 font-mono font-bold text-emerald-600 dark:text-emerald-400">
                          ₹{prod.revenue.toFixed(2)}
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            ) : (
              <table className="w-full text-left text-xs text-[var(--text-secondary)]">
                <thead className="bg-[var(--bg-secondary)]/80 text-[var(--text-muted)] uppercase text-[10px] tracking-wider border-b border-[var(--border)] sticky top-0">
                  <tr>
                    <th className="py-2.5 px-3">Physical Component SKU</th>
                    <th className="py-2.5 px-3">Total Deducted</th>
                    <th className="py-2.5 px-3">BOM Unit Cost</th>
                    <th className="py-2.5 px-3">Total Cost</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[var(--border)]">
                  {physicalDeductions.length === 0 ? (
                    <tr>
                      <td colSpan={4} className="py-8 text-center text-[var(--text-muted)]">
                        No physical SKU deductions computed for this period.
                      </td>
                    </tr>
                  ) : (
                    physicalDeductions.map((ded: any, idx: number) => (
                      <tr key={idx} className="hover:bg-slate-100/60 dark:hover:bg-[var(--bg-secondary)]">
                        <td className="py-2.5 px-3">
                          <div className="font-mono font-bold text-[var(--text-primary)]">
                            {ded.sku}
                          </div>
                          <div className="text-[10px] text-[var(--text-muted)] truncate max-w-[200px]">
                            {ded.name || ded.sku}
                          </div>
                        </td>
                        <td className="py-2.5 px-3 font-mono font-bold text-slate-800 dark:text-slate-200">
                          <div>{ded.totalUnits} units</div>
                          <div className="text-[9px] text-[var(--text-muted)] font-normal">
                            {ded.directUnits > 0 && `${ded.directUnits} Direct`}
                            {ded.directUnits > 0 && ded.comboUnits > 0 && " + "}
                            {ded.comboUnits > 0 && `${ded.comboUnits} via Combos`}
                          </div>
                        </td>
                        <td className="py-2.5 px-3 font-mono text-[var(--text-muted)]">
                          {ded.unitCost > 0 ? `₹${ded.unitCost.toFixed(0)}` : "—"}
                        </td>
                        <td className="py-2.5 px-3 font-mono font-bold text-[var(--text-primary)]">
                          ₹{ded.totalCost.toFixed(2)}
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            )}
          </div>
        </div>
      </div>

      {/* Damaged Goods Quarantine Write-Off Section (If any exist) */}
      {damagedBreakdown.length > 0 && (
        <div className="glass-panel p-4 space-y-3 border-l-2 border-l-red-600 bg-red-500/5 dark:bg-red-950/10">
          <div className="flex justify-between items-center">
            <h4 className="text-sm font-bold text-[var(--text-primary)] flex items-center gap-1.5">
              <ShieldAlert size={15} className="text-red-600 dark:text-red-400" /> RTO Damaged Goods Write-Off Loss ({damagedBreakdown.length} records)
            </h4>
            <span className="text-xs text-red-600 dark:text-red-400 font-mono font-bold">
              Total Scrap Loss: ₹{(expenses.rtoDamageLoss ?? 0).toLocaleString("en-IN", { minimumFractionDigits: 2 })}
            </span>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs text-[var(--text-secondary)]">
              <thead className="bg-[var(--bg-secondary)]/80 text-[var(--text-muted)] uppercase text-[10px] tracking-wider border-b border-[var(--border)]">
                <tr>
                  <th className="py-2 px-3">SKU</th>
                  <th className="py-2 px-3">Component / Product Name</th>
                  <th className="py-2 px-3">Damaged Qty</th>
                  <th className="py-2 px-3">Unit Cost</th>
                  <th className="py-2 px-3">Total Loss Value</th>
                  <th className="py-2 px-3">Reference / AWB</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--border)] font-mono">
                {damagedBreakdown.map((d: any, idx: number) => (
                  <tr key={idx} className="hover:bg-slate-100/60 dark:hover:bg-[var(--bg-secondary)]">
                    <td className="py-2 px-3 font-bold text-[var(--text-primary)]">{d.sku}</td>
                    <td className="py-2 px-3 text-[var(--text-secondary)] font-sans">{d.name}</td>
                    <td className="py-2 px-3 text-red-600 dark:text-red-400 font-bold">{d.quantity} pcs</td>
                    <td className="py-2 px-3 text-[var(--text-muted)]">₹{(d.unitCost || 0).toFixed(0)}</td>
                    <td className="py-2 px-3 text-red-600 dark:text-red-400 font-bold">₹{(d.totalLoss || 0).toFixed(2)}</td>
                    <td className="py-2 px-3 text-[var(--text-muted)]">{d.referenceId || "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ============================================================ */}
      {/* MODAL: CUSTOMIZE EXPENSE RULES & UNIT COST ESTIMATORS        */}
      {/* ============================================================ */}
      {showConfigModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 dark:bg-black/80 p-4 backdrop-blur-sm">
          <div className="w-full max-w-xl bg-[var(--surface)] border border-slate-200 dark:border-cyan-500/40 rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">
            <div className="p-4 sm:p-5 bg-[var(--bg-secondary)]/90 border-b border-[var(--border)] flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <div className="p-2 rounded-xl bg-cyan-500/20 text-cyan-600 dark:text-cyan-400 border border-cyan-500/30">
                  <SlidersHorizontal size={20} />
                </div>
                <div>
                  <h3 className="font-bold text-[var(--text-primary)] text-base">Customize P&amp;L Expense Rules</h3>
                  <p className="text-xs text-[var(--text-muted)]">
                    Configure average packaging rates, courier freight, RTO penalties, gateway fees, and live auto-fetching.
                  </p>
                </div>
              </div>
              <button
                onClick={() => setShowConfigModal(false)}
                className="p-1 rounded-lg text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-slate-200 dark:hover:bg-[var(--surface-hover)] cursor-pointer"
              >
                <X size={18} />
              </button>
            </div>

            <form onSubmit={handleSaveModal} className="p-4 sm:p-6 overflow-y-auto space-y-4 text-xs">
              {/* Packaging, Freight & RTO per Order */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div className="p-3.5 rounded-xl bg-[var(--bg-secondary)]/60 border border-[var(--border)] space-y-1.5">
                  <label className="text-[var(--text-secondary)] font-bold block flex items-center gap-1.5">
                    <Layers size={13} className="text-amber-600 dark:text-amber-400" />
                    <span>Packing Charge (₹/pkg)</span>
                  </label>
                  <input
                    type="number"
                    step="0.5"
                    min="0"
                    value={expenseForm.packagingCostPerOrder}
                    onChange={(e) =>
                      setExpenseForm({ ...expenseForm, packagingCostPerOrder: parseFloat(e.target.value) || 0 })
                    }
                    className="w-full bg-[var(--surface)] border border-[var(--border)] rounded-lg px-3 py-2 text-[var(--text-primary)] font-mono font-bold text-sm"
                  />
                  <p className="text-[10px] text-[var(--text-muted)]">Box + bubble wrap + branded tape</p>
                </div>

                <div className="p-3.5 rounded-xl bg-[var(--bg-secondary)]/60 border border-[var(--border)] space-y-1.5">
                  <label className="text-[var(--text-secondary)] font-bold block flex items-center gap-1.5">
                    <Truck size={13} className="text-purple-600 dark:text-purple-400" />
                    <span>Forward Freight (₹/pkg)</span>
                  </label>
                  <input
                    type="number"
                    step="0.5"
                    min="0"
                    value={expenseForm.freightCostPerOrder}
                    onChange={(e) =>
                      setExpenseForm({ ...expenseForm, freightCostPerOrder: parseFloat(e.target.value) || 0 })
                    }
                    className="w-full bg-[var(--surface)] border border-[var(--border)] rounded-lg px-3 py-2 text-[var(--text-primary)] font-mono font-bold text-sm"
                  />
                  <p className="text-[10px] text-[var(--text-muted)]">Average courier rate per shipped order</p>
                </div>

                <div className="p-3.5 rounded-xl bg-[var(--bg-secondary)]/60 border border-[var(--border)] space-y-1.5">
                  <label className="text-[var(--text-secondary)] font-bold block flex items-center gap-1.5">
                    <RotateCcw size={13} className="text-rose-600 dark:text-rose-400" />
                    <span>RTO Charge (₹/return)</span>
                  </label>
                  <input
                    type="number"
                    step="0.5"
                    min="0"
                    value={expenseForm.rtoCostPerOrder}
                    onChange={(e) =>
                      setExpenseForm({ ...expenseForm, rtoCostPerOrder: parseFloat(e.target.value) || 0 })
                    }
                    className="w-full bg-[var(--surface)] border border-[var(--border)] rounded-lg px-3 py-2 text-[var(--text-primary)] font-mono font-bold text-sm"
                  />
                  <p className="text-[10px] text-[var(--text-muted)]">Courier reverse freight &amp; return penalty</p>
                </div>
              </div>

              {/* Gateway Fees & Fixed Monthly Overheads */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
                <div className="p-3.5 rounded-xl bg-[var(--bg-secondary)]/60 border border-[var(--border)] space-y-1.5">
                  <label className="text-[var(--text-secondary)] font-bold block flex items-center gap-1.5">
                    <CreditCard size={13} className="text-cyan-600 dark:text-cyan-400" />
                    <span>Payment Gateway Fee (%) (Paid Orders Only)</span>
                  </label>
                  <input
                    type="number"
                    step="0.1"
                    min="0"
                    max="10"
                    value={expenseForm.gatewayFeePercent}
                    onChange={(e) =>
                      setExpenseForm({ ...expenseForm, gatewayFeePercent: parseFloat(e.target.value) || 0 })
                    }
                    className="w-full bg-[var(--surface)] border border-[var(--border)] rounded-lg px-3 py-2 text-[var(--text-primary)] font-mono font-bold text-sm"
                  />
                  <p className="text-[10px] text-[var(--text-muted)]">Applied strictly to Paid/Prepaid orders (0% on COD)</p>
                </div>

                <div className="p-3.5 rounded-xl bg-[var(--bg-secondary)]/60 border border-[var(--border)] space-y-1.5">
                  <label className="text-[var(--text-secondary)] font-bold block flex items-center gap-1.5">
                    <Wrench size={13} className="text-blue-600 dark:text-blue-400" />
                    <span>Fixed Monthly Overheads &amp; Rent (₹)</span>
                  </label>
                  <input
                    type="number"
                    step="100"
                    min="0"
                    value={expenseForm.monthlyFixedOverhead}
                    onChange={(e) =>
                      setExpenseForm({ ...expenseForm, monthlyFixedOverhead: parseFloat(e.target.value) || 0 })
                    }
                    className="w-full bg-[var(--surface)] border border-[var(--border)] rounded-lg px-3 py-2 text-[var(--text-primary)] font-mono font-bold text-sm"
                  />
                  <p className="text-[10px] text-[var(--text-muted)]">Warehouse rent + staff salaries (pro-rated by days)</p>
                </div>
              </div>

              {/* COGS Fallback % */}
              <div className="p-3.5 rounded-xl bg-[var(--bg-secondary)]/60 border border-[var(--border)] space-y-1.5">
                <label className="text-[var(--text-secondary)] font-bold block flex items-center gap-1.5">
                  <Boxes size={13} className="text-emerald-600 dark:text-emerald-400" />
                  <span>Fallback Product COGS % (If SKU BOM is 0)</span>
                </label>
                <input
                  type="number"
                  step="1"
                  min="0"
                  max="100"
                  value={expenseForm.defaultCogsPercent}
                  onChange={(e) =>
                    setExpenseForm({ ...expenseForm, defaultCogsPercent: parseFloat(e.target.value) || 0 })
                  }
                  className="w-full bg-[var(--surface)] border border-[var(--border)] rounded-lg px-3 py-2 text-[var(--text-primary)] font-mono font-bold text-sm"
                />
                <p className="text-[10px] text-[var(--text-muted)]">
                  Estimated product manufacturing cost % of retail price if SKU average cost is unconfigured.
                </p>
              </div>

              {/* Toggles */}
              <div className="space-y-2 pt-2 border-t border-[var(--border)]">
                <label className="flex items-center justify-between p-3 rounded-xl bg-[var(--bg-secondary)]/40 border border-[var(--border)] cursor-pointer">
                  <div>
                    <span className="font-bold text-[var(--text-primary)] block">Auto-Fetch Live Ad Spend (All Accounts)</span>
                    <span className="text-[10px] text-[var(--text-muted)]">
                      Pulls exact real-time marketing spend from all connected Meta &amp; Omnichannel ad accounts.
                    </span>
                  </div>
                  <input
                    type="checkbox"
                    checked={expenseForm.autoFetchMetaAds}
                    onChange={(e) => setExpenseForm({ ...expenseForm, autoFetchMetaAds: e.target.checked })}
                    className="w-4 h-4 rounded text-cyan-600 focus:ring-cyan-500"
                  />
                </label>

                <label className="flex items-center justify-between p-3 rounded-xl bg-[var(--bg-secondary)]/40 border border-[var(--border)] cursor-pointer">
                  <div>
                    <span className="font-bold text-[var(--text-primary)] block">Use Unit Estimates When Bills Not Yet Entered</span>
                    <span className="text-[10px] text-[var(--text-muted)]">
                      Calculates freight, RTO &amp; packaging from order volume if vendor invoices are pending.
                    </span>
                  </div>
                  <input
                    type="checkbox"
                    checked={expenseForm.useEstimatedExpenses}
                    onChange={(e) => setExpenseForm({ ...expenseForm, useEstimatedExpenses: e.target.checked })}
                    className="w-4 h-4 rounded text-cyan-600 focus:ring-cyan-500"
                  />
                </label>
              </div>

              {/* Footer */}
              <div className="pt-4 border-t border-[var(--border)] flex items-center justify-between">
                <button
                  type="button"
                  onClick={() => setShowConfigModal(false)}
                  className="px-4 py-2 rounded-xl bg-slate-100 dark:bg-[var(--surface-hover)] hover:bg-[var(--surface-hover)] text-[var(--text-secondary)] font-semibold cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={savingConfig}
                  className="px-5 py-2 rounded-xl bg-cyan-500 hover:bg-cyan-400 text-slate-950 font-bold shadow-md shadow-cyan-500/20 transition-all flex items-center gap-1.5 cursor-pointer"
                >
                  <RefreshCw size={13} className={savingConfig ? "animate-spin" : ""} />
                  <span>{savingConfig ? "Saving..." : "Save Expense Rules"}</span>
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
