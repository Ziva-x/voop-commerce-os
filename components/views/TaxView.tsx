"use client";

import React, { useState, useEffect } from "react";
import {
  Percent,
  Receipt,
  Search,
  Sliders,
  CheckCircle2,
  AlertCircle,
  RefreshCw,
  Edit2,
  Check,
  X,
  FileSpreadsheet,
  Layers,
  ArrowUpDown,
  Boxes,
  TrendingUp,
  DollarSign,
  Calendar,
  Building2,
  MapPin,
  Truck,
  ArrowRight,
  ShieldCheck,
  Sparkles,
} from "lucide-react";
import { TableSkeleton, CardGridSkeleton } from "@/components/LoadingSkeleton";
import { appFetch } from "@/lib/api";
import { RouteGuard } from "@/components/auth/RouteGuard";
import { SearchInput } from "@/components/ui/Input";

interface TaxItem {
  id?: string;
  voopStoreId?: string;
  shopifyProductId: string;
  shopifyVariantId: string;
  sku: string;
  title: string;
  productName: string;
  variantTitle: string;
  productStatus?: string;
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
  comboInvoiceComponents?: Array<{
    componentSku: string;
    quantity: number;
    allocatedValue: number;
    gstRate: number;
    hsnCode: string;
    taxMode: string;
  }>;
  soldQty: number;
  soldGrossAmount: number;
  soldNetAmount: number;
  soldTaxCollected: number;
  soldCgst: number;
  soldSgst: number;
  soldIgst: number;
  notes: string;
}

interface ComboInvoiceComponentFormItem {
  componentSku: string;
  name: string;
  quantity: number;
  unitCost: number;
  allocatedValue: number | string;
  gstRate: number;
  hsnCode: string;
  taxMode: "INCLUSIVE" | "EXCLUSIVE";
  isConfigured?: boolean;
}

interface SalesOrderLedgerItem {
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
}

interface StateDistributionItem {
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

interface TaxSummary {
  originState: {
    name: string;
    code: string;
    shortCode: string;
  };
  availableStates: Array<{
    name: string;
    code: string;
    shortCode: string;
  }>;
  totalSkus: number;
  totalStockUnits: number;
  totalStockValueInclTax: number;
  totalStockValueExclTax: number;
  totalStockTaxLiability: number;
  actualSalesMetrics: {
    totalOrders: number;
    totalSoldQty: number;
    totalGrossSales: number;
    totalNetSales: number;
    totalTaxCollected: number;
    totalCgst: number;
    totalSgst: number;
    totalIgst: number;
    intraState: {
      orderCount: number;
      grossSales: number;
      cgst: number;
      sgst: number;
      totalTax: number;
    };
    interState: {
      orderCount: number;
      grossSales: number;
      igst: number;
      totalTax: number;
    };
  };
  stateDistribution: StateDistributionItem[];
}

export default function TaxOnSalesPage() {
  const [items, setItems] = useState<TaxItem[]>([]);
  const [salesOrders, setSalesOrders] = useState<SalesOrderLedgerItem[]>([]);
  const [summary, setSummary] = useState<TaxSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  // Origin State (Shipping From)
  const [originState, setOriginState] = useState("KERALA");

  // Tax Basis: "DELIVERED" (Realized Delivered Goods) vs "ORDER_DATE"
  const [taxBasis, setTaxBasis] = useState("DELIVERED");

  // Filters
  const [search, setSearch] = useState("");
  const [taxFilter, setTaxFilter] = useState("ALL");
  const [activeTab, setActiveTab] = useState<"catalog" | "sales" | "stateBreakdown">("catalog");

  // Date Filters for Sales Tax
  const [dateRangePreset, setDateRangePreset] = useState("ALL");
  const [customStartDate, setCustomStartDate] = useState("");
  const [customEndDate, setCustomEndDate] = useState("");

  // Edit Modal State
  const [editingItem, setEditingItem] = useState<TaxItem | null>(null);
  const [editForm, setEditForm] = useState<{
    taxRate: number;
    isTaxInclusive: boolean;
    overridePrice: string;
    hsnCode: string;
    notes: string;
    title: string;
  }>({
    taxRate: 18,
    isTaxInclusive: true,
    overridePrice: "",
    hsnCode: "",
    notes: "",
    title: "",
  });
  const [saving, setSaving] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);

  // Inline Price / Tax Edit State
  const [inlineValues, setInlineValues] = useState<{
    [sku: string]: { taxRate: number; overridePrice: number; isTaxInclusive: boolean };
  }>({});
  const [savingSku, setSavingSku] = useState<string | null>(null);

  // Type Filter: ALL | SINGLE | COMBO
  const [typeFilter, setTypeFilter] = useState<"ALL" | "SINGLE" | "COMBO">("ALL");

  // Informational Recipe Modal for Combo SKUs
  const [recipeModalCombo, setRecipeModalCombo] = useState<TaxItem | null>(null);

  // Combo Custom Invoice Breakdown Configuration Modal State
  const [comboModalOpen, setComboModalOpen] = useState(false);
  const [comboModalItem, setComboModalItem] = useState<TaxItem | null>(null);
  const [comboSellingPrice, setComboSellingPrice] = useState<number | string>(0);
  const [comboComponentsForm, setComboComponentsForm] = useState<ComboInvoiceComponentFormItem[]>([]);
  const [comboLoading, setComboLoading] = useState(false);
  const [comboSaving, setComboSaving] = useState(false);
  const [comboError, setComboError] = useState<string | null>(null);
  const [comboSuccess, setComboSuccess] = useState<string | null>(null);

  // Bulk Edit Selection State
  const [selectedSkus, setSelectedSkus] = useState<string[]>([]);
  const [bulkModalOpen, setBulkModalOpen] = useState(false);
  const [bulkTaxRate, setBulkTaxRate] = useState(18);
  const [bulkInclusive, setBulkInclusive] = useState(true);
  const [bulkHsn, setBulkHsn] = useState("");
  const [bulkSaving, setBulkSaving] = useState(false);

  // Shopify Products Sync State & Feedback
  const [syncingShopify, setSyncingShopify] = useState(false);
  const [syncModalOpen, setSyncModalOpen] = useState(false);
  const [syncFeedbackStep, setSyncFeedbackStep] = useState<string>("");
  const [syncResultStats, setSyncResultStats] = useState<{
    productsFetched: number;
    variantsFetched: number;
    newCount: number;
    updatedCount: number;
    unchangedCount: number;
    failedCount: number;
  } | null>(null);
  const [syncError, setSyncError] = useState<string | null>(null);

  const handleFetchFromShopify = async () => {
    try {
      setSyncingShopify(true);
      setSyncModalOpen(true);
      setSyncResultStats(null);
      setSyncError(null);
      setSyncFeedbackStep("Fetching Shopify products...");

      const stepTimer1 = setTimeout(() => {
        setSyncFeedbackStep("Fetching variants...");
      }, 700);

      const stepTimer2 = setTimeout(() => {
        setSyncFeedbackStep("Updating products...");
      }, 1500);

      const res = await appFetch("/api/tax-on-sales/sync-products", {
        method: "POST",
      });
      clearTimeout(stepTimer1);
      clearTimeout(stepTimer2);

      const json = await res.json();
      if (!res.ok || !json.success) {
        throw new Error(json.error || "Failed to sync products from Shopify");
      }

      setSyncFeedbackStep("Updating tax catalog...");
      await new Promise((resolve) => setTimeout(resolve, 500));

      setSyncFeedbackStep("Sync complete.");
      setSyncResultStats(json.stats);
      // Immediately refresh tax data on screen
      await fetchTaxData();
    } catch (err: any) {
      console.error("Shopify product fetch failed:", err);
      setSyncError(err.message || "Failed to fetch products from Shopify");
    } finally {
      setSyncingShopify(false);
    }
  };

  // Fetch Tax Catalog & Calculation Data
  const fetchTaxData = async () => {
    try {
      setRefreshing(true);
      const params = new URLSearchParams();
      if (search) params.set("search", search);
      if (taxFilter && taxFilter !== "ALL") params.set("taxRate", taxFilter);
      if (originState) params.set("originState", originState);
      if (taxBasis) params.set("taxBasis", taxBasis);

      // Handle Date Presets
      const now = new Date();
      if (dateRangePreset === "TODAY") {
        const todayStr = now.toISOString().split("T")[0];
        params.set("startDate", todayStr);
        params.set("endDate", todayStr);
      } else if (dateRangePreset === "YESTERDAY") {
        const y = new Date(Date.now() - 24 * 60 * 60 * 1000);
        const yStr = y.toISOString().split("T")[0];
        params.set("startDate", yStr);
        params.set("endDate", yStr);
      } else if (dateRangePreset === "7DAYS") {
        const d7 = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
        params.set("startDate", d7.toISOString().split("T")[0]);
        params.set("endDate", now.toISOString().split("T")[0]);
      } else if (dateRangePreset === "30DAYS") {
        const d30 = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
        params.set("startDate", d30.toISOString().split("T")[0]);
        params.set("endDate", now.toISOString().split("T")[0]);
      } else if (dateRangePreset === "CUSTOM") {
        if (customStartDate) params.set("startDate", customStartDate);
        if (customEndDate) params.set("endDate", customEndDate);
      }

      if (typeFilter && typeFilter !== "ALL") {
        params.set("type", typeFilter);
      }

      const res = await appFetch(`/api/tax-on-sales?${params.toString()}`);
      const data = await res.json();
      if (data.success) {
        setItems(data.items || []);
        setSalesOrders(data.salesOrdersLedger || []);
        setSummary(data.summary || null);

        // Initialize inline editable inputs
        const initialInline: { [sku: string]: any } = {};
        for (const item of data.items || []) {
          initialInline[item.sku] = {
            taxRate: item.taxRate,
            overridePrice: item.price,
            isTaxInclusive: item.isTaxInclusive,
          };
        }
        setInlineValues(initialInline);
      }
    } catch (err) {
      console.error("Failed to load tax data:", err);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    fetchTaxData();
  }, [taxFilter, typeFilter, dateRangePreset, customStartDate, customEndDate, originState, taxBasis]);

  const handleSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    fetchTaxData();
  };

  // Open Edit Modal
  const handleOpenEdit = (item: TaxItem) => {
    setEditingItem(item);
    setEditForm({
      taxRate: item.taxRate,
      isTaxInclusive: item.isTaxInclusive,
      overridePrice: item.price > 0 ? String(item.price) : "",
      hsnCode: item.hsnCode || "",
      notes: item.notes || "",
      title: item.title || "",
    });
    setSaveSuccess(false);
  };

  // Save Single SKU Configuration via Modal
  const handleSaveModal = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingItem) return;
    setSaving(true);
    setSaveSuccess(false);

    try {
      const res = await appFetch("/api/tax-on-sales", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          shopifyProductId: editingItem.shopifyProductId,
          shopifyVariantId: editingItem.shopifyVariantId,
          sku: editingItem.sku,
          title: editForm.title || editingItem.title,
          taxRate: editForm.taxRate,
          isTaxInclusive: editForm.isTaxInclusive,
          overridePrice: editForm.overridePrice ? parseFloat(editForm.overridePrice) : null,
          hsnCode: editForm.hsnCode,
          notes: editForm.notes,
        }),
      });

      const json = await res.json();
      if (json.success) {
        setSaveSuccess(true);
        setTimeout(() => {
          setEditingItem(null);
          fetchTaxData();
        }, 500);
      }
    } catch (err) {
      console.error("Failed to save tax config:", err);
    } finally {
      setSaving(false);
    }
  };

  // Inline Save
  const handleSaveInline = async (item: TaxItem) => {
    const key = item.shopifyVariantId || item.sku;
    const values = inlineValues[key] || inlineValues[item.sku];
    if (!values) return;
    setSavingSku(key);

    try {
      await appFetch("/api/tax-on-sales", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          shopifyProductId: item.shopifyProductId,
          shopifyVariantId: item.shopifyVariantId,
          sku: item.sku,
          taxRate: values.taxRate,
          overridePrice: values.overridePrice,
          isTaxInclusive: values.isTaxInclusive,
        }),
      });
      fetchTaxData();
    } catch (err) {
      console.error("Failed to save inline tax:", err);
    } finally {
      setSavingSku(null);
    }
  };

  // Open Combo Invoice Configuration Modal
  const handleOpenComboInvoiceSetup = async (item: TaxItem) => {
    setComboModalItem(item);
    setComboModalOpen(true);
    setComboLoading(true);
    setComboError(null);
    setComboSuccess(null);
    setComboSellingPrice(item.price || 0);

    try {
      const res = await appFetch(`/api/tax-on-sales/combo-config?sku=${encodeURIComponent(item.sku)}`);
      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.error || "Failed to load combo invoice configuration");
      }

      setComboSellingPrice(data.combo.sellingPrice);
      const comps: ComboInvoiceComponentFormItem[] = (data.components || []).map((c: any) => ({
        componentSku: c.componentSku,
        name: c.name,
        quantity: c.quantity || 1,
        unitCost: c.unitCost || 0,
        allocatedValue: c.allocatedValue !== undefined ? c.allocatedValue : 0,
        gstRate: c.gstRate !== undefined ? c.gstRate : 18,
        hsnCode: c.hsnCode || "",
        taxMode: c.taxMode === "EXCLUSIVE" ? "EXCLUSIVE" : "INCLUSIVE",
        isConfigured: c.isConfigured,
      }));

      // If all allocated values are 0 and selling price > 0, suggest proportional initial fill
      const allZero = comps.every((c) => Number(c.allocatedValue) === 0);
      if (allZero && comps.length > 0 && data.combo.sellingPrice > 0) {
        const totalP = Math.round(data.combo.sellingPrice * 100);
        const eachP = Math.floor(totalP / comps.length);
        const remP = totalP - eachP * comps.length;
        comps.forEach((c, idx) => {
          const paise = eachP + (idx === 0 ? remP : 0);
          c.allocatedValue = paise / 100;
        });
      }

      setComboComponentsForm(comps);
    } catch (err: any) {
      console.error("Failed to load combo config:", err);
      setComboError(err.message || "Failed to load combo recipe & invoice config");
    } finally {
      setComboLoading(false);
    }
  };

  // Auto-Balance action: distribute difference across components
  const handleProportionalAutoFill = () => {
    if (comboComponentsForm.length === 0) return;
    const targetSellingPrice = parseFloat(String(comboSellingPrice)) || 0;
    if (targetSellingPrice <= 0) return;

    const targetPaise = Math.round(targetSellingPrice * 100);
    const currentTotalAllocPaise = comboComponentsForm.reduce((sum, c) => {
      const v = parseFloat(String(c.allocatedValue)) || 0;
      return sum + Math.round(v * 100);
    }, 0);

    const updated = [...comboComponentsForm];
    if (currentTotalAllocPaise === 0) {
      const basePaise = Math.floor(targetPaise / updated.length);
      const remainder = targetPaise - basePaise * updated.length;
      updated.forEach((c, idx) => {
        const paise = basePaise + (idx === 0 ? remainder : 0);
        c.allocatedValue = paise / 100;
      });
    } else {
      let allocatedSoFar = 0;
      for (let i = 0; i < updated.length; i++) {
        if (i === updated.length - 1) {
          const finalPaise = targetPaise - allocatedSoFar;
          updated[i].allocatedValue = Math.max(0, finalPaise) / 100;
        } else {
          const curPaise = Math.round((parseFloat(String(updated[i].allocatedValue)) || 0) * 100);
          const ratio = curPaise / currentTotalAllocPaise;
          const newPaise = Math.round(targetPaise * ratio);
          allocatedSoFar += newPaise;
          updated[i].allocatedValue = newPaise / 100;
        }
      }
    }
    setComboComponentsForm(updated);
  };

  // Save Combo Configuration
  const handleSaveComboConfig = async () => {
    if (!comboModalItem) return;
    const cleanPrice = parseFloat(String(comboSellingPrice)) || 0;
    const totalAllocatedPaise = comboComponentsForm.reduce((sum, c) => {
      const val = parseFloat(String(c.allocatedValue)) || 0;
      return sum + Math.round(val * 100);
    }, 0);
    const sellingPricePaise = Math.round(cleanPrice * 100);

    if (totalAllocatedPaise !== sellingPricePaise) {
      const diff = ((sellingPricePaise - totalAllocatedPaise) / 100).toFixed(2);
      setComboError(`Allocation does not match Combo selling price. Difference: ₹${diff}. Please balance before saving.`);
      return;
    }

    setComboSaving(true);
    setComboError(null);
    setComboSuccess(null);

    try {
      const res = await appFetch("/api/tax-on-sales/combo-config", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          comboSku: comboModalItem.sku,
          sellingPrice: cleanPrice,
          components: comboComponentsForm.map((c) => ({
            componentSku: c.componentSku,
            allocatedValue: parseFloat(String(c.allocatedValue)) || 0,
            gstRate: c.gstRate,
            hsnCode: c.hsnCode,
            taxMode: c.taxMode,
          })),
        }),
      });

      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.error || "Failed to save combo invoice setup");
      }

      setComboSuccess("Combo invoice breakdown saved successfully!");
      setTimeout(() => {
        setComboModalOpen(false);
        fetchTaxData();
      }, 700);
    } catch (err: any) {
      console.error("Save combo config error:", err);
      setComboError(err.message || "Failed to save combo invoice config");
    } finally {
      setComboSaving(false);
    }
  };

  // Handle Bulk Update
  const handleBulkUpdate = async () => {
    if (selectedSkus.length === 0) return;
    setBulkSaving(true);
    try {
      const res = await appFetch("/api/tax-on-sales", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          skus: selectedSkus,
          taxRate: bulkTaxRate,
          isTaxInclusive: bulkInclusive,
          hsnCode: bulkHsn || undefined,
        }),
      });
      const json = await res.json();
      if (json.success) {
        setBulkModalOpen(false);
        setSelectedSkus([]);
        fetchTaxData();
      } else {
        alert(json.error || "Bulk update failed");
      }
    } catch (err: any) {
      alert(err.message);
    } finally {
      setBulkSaving(false);
    }
  };

  // Toggle Selection
  const toggleSelectAll = () => {
    if (selectedSkus.length === items.length) {
      setSelectedSkus([]);
    } else {
      setSelectedSkus(items.map((i) => i.sku));
    }
  };

  const toggleSelectSku = (sku: string) => {
    setSelectedSkus((prev) =>
      prev.includes(sku) ? prev.filter((s) => s !== sku) : [...prev, sku]
    );
  };

  // Export CSV
  const handleExportCsv = () => {
    if (activeTab === "sales") {
      if (salesOrders.length === 0) return;
      const headers = [
        "Order Number",
        "Order Date",
        "Delivered Date",
        "Delivery Status",
        "Customer Name",
        "Shipping From State",
        "Shipping From Code",
        "Shipping To State",
        "Shipping To Code",
        "Shipping To City",
        "Shipping To ZIP",
        "Tax Classification",
        "Taxable Net Amount (INR)",
        "CGST (INR)",
        "SGST (INR)",
        "IGST (INR)",
        "Total Tax (INR)",
        "Gross Order Value (INR)",
      ];

      const rows = salesOrders.map((o) => [
        `"${o.orderNumber}"`,
        `"${new Date(o.orderDate).toLocaleDateString()}"`,
        `"${o.deliveryDate ? new Date(o.deliveryDate).toLocaleDateString() : "Pending"}"`,
        `"${o.deliveryStatus}"`,
        `"${o.customerName}"`,
        `"${o.shippingFrom.name}"`,
        `"${o.shippingFrom.code}"`,
        `"${o.shippingTo.name}"`,
        `"${o.shippingTo.code}"`,
        `"${o.shippingTo.city}"`,
        `"${o.shippingTo.zip}"`,
        `"${o.taxType === "INTRA_STATE" ? "Intra-State (CGST+SGST)" : "Inter-State (IGST)"}"`,
        o.netAmount,
        o.cgst,
        o.sgst,
        o.igst,
        o.taxAmount,
        o.grossAmount,
      ]);

      const csvContent =
        "data:text/csv;charset=utf-8," +
        [headers.join(","), ...rows.map((e) => e.join(","))].join("\n");
      const encodedUri = encodeURI(csvContent);
      const link = document.createElement("a");
      link.setAttribute("href", encodedUri);
      link.setAttribute(
        "download",
        `GST_Sales_Output_Ledger_${originState}_${new Date().toISOString().split("T")[0]}.csv`
      );
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
    } else {
      if (items.length === 0) return;
      const headers = [
        "SKU",
        "Product Title",
        "Stock Count (Units)",
        "HSN Code",
        "Tax Rate (%)",
        "Tax Mode",
        "Selling Price (INR)",
        "Base Price Excl Tax (INR)",
        "Tax Amount (INR)",
        "CGST Rate (%)",
        "CGST Amount (INR)",
        "SGST Rate (%)",
        "SGST Amount (INR)",
        "IGST Rate (%)",
        "IGST Amount (INR)",
        "Total Stock Value Incl Tax (INR)",
        "Total Stock Value Excl Tax (INR)",
        "Total Stock Tax Liability (INR)",
      ];

      const rows = items.map((i) => [
        `"${i.sku}"`,
        `"${i.title.replace(/"/g, '""')}"`,
        i.stockCount,
        `"${i.hsnCode}"`,
        i.taxRate,
        i.isTaxInclusive ? "Inclusive" : "Exclusive",
        i.price,
        i.priceExclTax,
        i.taxAmount,
        i.cgstRate,
        i.cgstAmount,
        i.sgstRate,
        i.sgstAmount,
        i.igstRate,
        i.igstAmount,
        i.totalStockValueInclTax,
        i.totalStockValueExclTax,
        i.totalStockTaxAmount,
      ]);

      const csvContent =
        "data:text/csv;charset=utf-8," +
        [headers.join(","), ...rows.map((e) => e.join(","))].join("\n");
      const encodedUri = encodeURI(csvContent);
      const link = document.createElement("a");
      link.setAttribute("href", encodedUri);
      link.setAttribute(
        "download",
        `SKU_GST_Tax_Catalog_${new Date().toISOString().split("T")[0]}.csv`
      );
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
    }
  };

  return (
    <RouteGuard requiredPermission="tax.view" moduleName="Tax on Sales">
      <div className="space-y-6 select-none animate-in fade-in duration-300">
      {/* Top Header */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2.5">
            <div className="p-2.5 rounded-xl bg-gradient-to-br from-indigo-500/20 to-purple-600/20 border border-indigo-500/30 text-indigo-400">
              <Receipt size={22} />
            </div>
            <div>
              <h2 className="text-xl sm:text-2xl font-black text-[var(--text-primary)] tracking-tight flex items-center gap-2">
                Tax on Sales &amp; GST Route Engine
                <span className="badge badge-purple text-[10px]">CGST + SGST + IGST</span>
              </h2>
              <p className="text-xs text-[var(--text-muted)] mt-0.5">
                Automatically resolves Shipping Origin vs Destination State to calculate Intra-State (CGST + SGST) and Inter-State (IGST) sales taxes.
              </p>
            </div>
          </div>
        </div>

        {/* Origin Warehouse Selector & Actions */}
        <div className="flex flex-wrap items-center gap-2.5">
          {/* Shipping Origin Selector */}
          <div className="flex items-center gap-2 px-3 py-1.5 rounded-xl bg-[var(--bg-secondary)] border border-[var(--border)] text-xs shadow-sm">
            <Building2 size={15} className="text-indigo-500" />
            <span className="font-bold text-[var(--text-secondary)] text-[11px] uppercase">
              Shipping From:
            </span>
            <select
              value={originState}
              onChange={(e) => setOriginState(e.target.value)}
              className="bg-transparent font-bold text-indigo-600 dark:text-indigo-400 focus:outline-none cursor-pointer"
            >
              <option value="KERALA">🏢 Kerala (KL - 32) [Warehouse Pin 680519]</option>
              <option value="KARNATAKA">🏢 Karnataka (KA - 29)</option>
              <option value="MAHARASHTRA">🏢 Maharashtra (MH - 27)</option>
              <option value="TAMIL_NADU">🏢 Tamil Nadu (TN - 33)</option>
              <option value="DELHI">🏢 Delhi (DL - 07)</option>
              <option value="GUJARAT">🏢 Gujarat (GJ - 24)</option>
              <option value="UTTAR_PRADESH">🏢 Uttar Pradesh (UP - 09)</option>
              <option value="TELANGANA">🏢 Telangana (TS - 36)</option>
              <option value="HARYANA">🏢 Haryana (HR - 06)</option>
              <option value="WEST_BENGAL">🏢 West Bengal (WB - 19)</option>
            </select>
          </div>

          <button
            id="btn-fetch-shopify-products"
            onClick={handleFetchFromShopify}
            disabled={syncingShopify || refreshing}
            className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-white text-xs font-bold shadow-md shadow-emerald-600/20 transition-all cursor-pointer disabled:opacity-50"
          >
            <RefreshCw size={13} className={syncingShopify ? "animate-spin" : ""} />
            <span>{syncingShopify ? "Fetching..." : "FETCH FROM SHOPIFY"}</span>
          </button>

          <button
            onClick={fetchTaxData}
            disabled={refreshing}
            className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-[var(--bg-secondary)] border border-[var(--border)] text-[var(--text-secondary)] hover:text-[var(--text-primary)] text-xs font-bold transition-all disabled:opacity-50"
          >
            <RefreshCw size={13} className={refreshing ? "animate-spin text-indigo-500" : ""} />
            <span>{refreshing ? "Calculating..." : "Recalculate"}</span>
          </button>

          <button
            onClick={handleExportCsv}
            className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold shadow-md shadow-emerald-600/20 transition-all cursor-pointer"
          >
            <FileSpreadsheet size={14} />
            <span>Export GST CSV</span>
          </button>
        </div>
      </div>

      {/* KPI Cards Grid */}
      {loading ? (
        <CardGridSkeleton count={5} />
      ) : (
        <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
          {/* 1. Total Output GST */}
          <div className="glass-panel p-4 border border-indigo-500/20 bg-indigo-500/5 space-y-1">
            <span className="text-[10px] font-bold uppercase text-indigo-600 dark:text-indigo-400 block">
              Realized Sales Output GST
            </span>
            <p className="text-2xl font-black text-indigo-600 dark:text-indigo-400 font-mono">
              ₹{Math.round(summary?.actualSalesMetrics.totalTaxCollected ?? 0).toLocaleString()}
            </p>
            <span className="text-[10px] text-[var(--text-muted)]">
              On ₹{Math.round(summary?.actualSalesMetrics.totalGrossSales ?? 0).toLocaleString()} Delivered Sales (In-transit &amp; RTO excluded)
            </span>
          </div>

          {/* 2. Intra-State GST (CGST + SGST) */}
          <div className="glass-panel p-4 border border-emerald-500/20 bg-emerald-500/5 space-y-1">
            <span className="text-[10px] font-bold uppercase text-emerald-600 dark:text-emerald-400 block flex items-center justify-between">
              <span>Intra-State GST (Same State)</span>
              <span className="badge badge-success text-[8px]">CGST + SGST</span>
            </span>
            <p className="text-2xl font-black text-emerald-600 dark:text-emerald-400 font-mono">
              ₹{Math.round(summary?.actualSalesMetrics.intraState.totalTax ?? 0).toLocaleString()}
            </p>
            <span className="text-[10px] text-emerald-700 dark:text-emerald-500 font-mono">
              CGST: ₹{Math.round(summary?.actualSalesMetrics.totalCgst ?? 0).toLocaleString()} • SGST: ₹{Math.round(summary?.actualSalesMetrics.totalSgst ?? 0).toLocaleString()}
            </span>
          </div>

          {/* 3. Inter-State GST (IGST) */}
          <div className="glass-panel p-4 border border-cyan-500/20 bg-cyan-500/5 space-y-1">
            <span className="text-[10px] font-bold uppercase text-cyan-600 dark:text-cyan-400 block flex items-center justify-between">
              <span>Inter-State GST (Out of State)</span>
              <span className="badge badge-cyan text-[8px]">IGST</span>
            </span>
            <p className="text-2xl font-black text-cyan-600 dark:text-cyan-400 font-mono">
              ₹{Math.round(summary?.actualSalesMetrics.totalIgst ?? 0).toLocaleString()}
            </p>
            <span className="text-[10px] text-cyan-700 dark:text-cyan-500">
              {summary?.actualSalesMetrics.interState.orderCount ?? 0} Out-of-State Orders
            </span>
          </div>

          {/* 4. Single Products Inventory Units */}
          <div className="glass-panel p-4 border border-[var(--border)] space-y-1">
            <span className="text-[10px] font-bold uppercase text-[var(--text-muted)] block">
              Physical Stock Units
            </span>
            <p className="text-2xl font-black text-[var(--text-primary)] font-mono">
              {summary?.totalStockUnits?.toLocaleString() ?? 0}
            </p>
            <span className="text-[10px] text-[var(--text-muted)]">
              Across {summary?.totalSkus ?? 0} Single SKUs
            </span>
          </div>

          {/* 5. Inventory Stock Tax Value */}
          <div className="glass-panel p-4 border border-amber-500/20 bg-amber-500/5 space-y-1">
            <span className="text-[10px] font-bold uppercase text-amber-600 dark:text-amber-400 block">
              Inventory Tax Value
            </span>
            <p className="text-2xl font-black text-amber-600 dark:text-amber-400 font-mono">
              ₹{Math.round(summary?.totalStockTaxLiability ?? 0).toLocaleString()}
            </p>
            <span className="text-[10px] text-amber-700 dark:text-amber-500">
              Stock Value: ₹{Math.round(summary?.totalStockValueInclTax ?? 0).toLocaleString()}
            </span>
          </div>
        </div>
      )}

      {/* Main Tabs Navigation */}
      <div className="flex items-center justify-between border-b border-[var(--border)] pb-2">
        <div className="flex items-center gap-2 overflow-x-auto">
          {/* Tab 1: Single Product SKU Catalog */}
          <button
            onClick={() => setActiveTab("catalog")}
            className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold transition-all whitespace-nowrap ${
              activeTab === "catalog"
                ? "bg-indigo-600 text-white shadow-md shadow-indigo-600/20"
                : "bg-[var(--bg-secondary)] border border-[var(--border)] text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
            }`}
          >
            <Boxes size={14} />
            <span>Sales Tax &amp; Pricing Catalog</span>
            <span className="px-1.5 py-0.5 rounded-full text-[10px] bg-white/20">
              {items.length}
            </span>
          </button>

          {/* Tab 2: Sales Order Route Ledger */}
          <button
            onClick={() => setActiveTab("sales")}
            className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold transition-all whitespace-nowrap ${
              activeTab === "sales"
                ? "bg-indigo-600 text-white shadow-md shadow-indigo-600/20"
                : "bg-[var(--bg-secondary)] border border-[var(--border)] text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
            }`}
          >
            <TrendingUp size={14} />
            <span>Shipping Route Sales Ledger (CGST / SGST / IGST)</span>
            <span className="px-1.5 py-0.5 rounded-full text-[10px] bg-emerald-500/20 text-emerald-400 font-mono">
              ₹{Math.round(summary?.actualSalesMetrics.totalTaxCollected ?? 0).toLocaleString()}
            </span>
          </button>

          {/* Tab 3: State-wise GSTR-1 Distribution */}
          <button
            onClick={() => setActiveTab("stateBreakdown")}
            className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold transition-all whitespace-nowrap ${
              activeTab === "stateBreakdown"
                ? "bg-indigo-600 text-white shadow-md shadow-indigo-600/20"
                : "bg-[var(--bg-secondary)] border border-[var(--border)] text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
            }`}
          >
            <MapPin size={14} />
            <span>State-Wise Tax Summary ({summary?.stateDistribution?.length || 0} States)</span>
          </button>
        </div>

        {selectedSkus.length > 0 && activeTab === "catalog" && (
          <div className="flex items-center gap-2">
            <span className="text-xs text-indigo-400 font-bold">
              {selectedSkus.length} SKU{selectedSkus.length > 1 ? "s" : ""} selected
            </span>
            <button
              onClick={() => setBulkModalOpen(true)}
              className="px-3 py-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-bold shadow-md shadow-indigo-600/20 transition-all cursor-pointer"
            >
              Bulk Set Tax %
            </button>
          </div>
        )}
      </div>

      {/* Filter Bar */}
      <div className="glass-panel p-4 flex flex-wrap gap-3 items-center justify-between">
        {/* Left: Search, Type Filter & Slabs */}
        <div className="flex flex-wrap items-center gap-2 flex-1">
          <form onSubmit={handleSearchSubmit} className="w-56 sm:w-64">
            <SearchInput
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              onClear={() => {
                setSearch("");
              }}
              placeholder="Search SKU, Product, HSN..."
              className="py-1.5 text-xs font-mono"
            />
          </form>

          {/* Type Filter: [ All ] [ Single ] [ Combos ] */}
          {activeTab === "catalog" && (
            <div className="flex items-center gap-1 bg-[var(--bg-secondary)] p-1 rounded-xl border border-[var(--border)]">
              {[
                { id: "ALL", label: "All" },
                { id: "SINGLE", label: "Single" },
                { id: "COMBO", label: "Combos" },
              ].map((t) => (
                <button
                  key={t.id}
                  type="button"
                  onClick={() => setTypeFilter(t.id as any)}
                  className={`px-2.5 py-1 rounded-lg text-xs font-bold transition-all ${
                    typeFilter === t.id
                      ? t.id === "COMBO"
                        ? "bg-purple-500/20 text-purple-600 dark:text-purple-400 border border-purple-500/40 shadow-sm"
                        : t.id === "SINGLE"
                        ? "bg-cyan-500/20 text-cyan-600 dark:text-cyan-400 border border-cyan-500/40 shadow-sm"
                        : "bg-[var(--surface)] text-[var(--text-primary)] border border-[var(--border)] shadow-sm"
                      : "text-[var(--text-muted)] hover:text-[var(--text-primary)]"
                  }`}
                >
                  {t.label}
                </button>
              ))}
            </div>
          )}

          {/* Tax Slab Filter (for Catalog tab) */}
          {activeTab === "catalog" && (
            <div className="flex items-center gap-1 overflow-x-auto">
              {[
                { id: "ALL", label: "All Slabs" },
                { id: "18", label: "18% GST" },
                { id: "12", label: "12% GST" },
                { id: "5", label: "5% GST" },
                { id: "28", label: "28% GST" },
                { id: "0", label: "0% Exempt" },
              ].map((t) => (
                <button
                  key={t.id}
                  onClick={() => setTaxFilter(t.id)}
                  className={`px-2.5 py-1 rounded-lg text-xs font-semibold whitespace-nowrap transition-all ${
                    taxFilter === t.id
                      ? "bg-indigo-500/20 text-indigo-400 border border-indigo-500/40 font-bold"
                      : "bg-[var(--bg-secondary)] border border-[var(--border)] text-[var(--text-muted)] hover:text-[var(--text-primary)]"
                  }`}
                >
                  {t.label}
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Right: Sales Date Filter & Tax Realization Basis */}
        {(activeTab === "sales" || activeTab === "stateBreakdown") && (
          <div className="flex flex-wrap items-center gap-2">
            {/* Realization Basis Switcher */}
            <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-[var(--surface)] border border-[var(--border)] text-xs shadow-sm">
              <ShieldCheck size={13} className="text-emerald-500" />
              <span className="font-bold text-[var(--text-secondary)] text-[10px] uppercase">
                Tax Basis:
              </span>
              <select
                value={taxBasis}
                onChange={(e) => setTaxBasis(e.target.value)}
                className="bg-transparent font-bold text-emerald-600 dark:text-emerald-400 focus:outline-none cursor-pointer"
              >
                <option value="DELIVERED">📦 Delivered Goods Only (Realized GST)</option>
                <option value="ORDER_DATE">🧾 Order / Invoice Date</option>
              </select>
            </div>

            <span className="text-[10px] uppercase font-bold text-[var(--text-secondary)] flex items-center gap-1">
              <Calendar size={12} /> Date Range:
            </span>
            <select
              value={dateRangePreset}
              onChange={(e) => setDateRangePreset(e.target.value)}
              className="bg-[var(--surface)] border border-[var(--border)] rounded-lg px-2.5 py-1 text-xs text-[var(--text-primary)] focus:outline-none focus:border-[var(--accent)] font-mono"
            >
              <option value="ALL">All Time Orders</option>
              <option value="TODAY">Today</option>
              <option value="YESTERDAY">Yesterday</option>
              <option value="7DAYS">Last 7 Days</option>
              <option value="30DAYS">Last 30 Days</option>
              <option value="CUSTOM">Custom Range</option>
            </select>

            {dateRangePreset === "CUSTOM" && (
              <div className="flex items-center gap-1">
                <input
                  type="date"
                  value={customStartDate}
                  onChange={(e) => setCustomStartDate(e.target.value)}
                  className="bg-[var(--surface)] border border-[var(--border)] rounded-lg px-2 py-1 text-xs text-[var(--text-primary)] font-mono"
                />
                <span className="text-[var(--text-secondary)] text-xs">-</span>
                <input
                  type="date"
                  value={customEndDate}
                  onChange={(e) => setCustomEndDate(e.target.value)}
                  className="bg-[var(--surface)] border border-[var(--border)] rounded-lg px-2 py-1 text-xs text-[var(--text-primary)] font-mono"
                />
              </div>
            )}
          </div>
        )}
      </div>

      {/* Main Table Content */}
      {loading ? (
        <TableSkeleton rows={8} cols={9} />
      ) : activeTab === "catalog" ? (
        /* TAB 1: SALES TAX & PRICING CATALOG (SINGLE & COMBO) */
        <div className="glass-panel overflow-hidden border border-[var(--border)] rounded-2xl shadow-xl">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs border-collapse">
              <thead>
                <tr className="bg-[var(--bg-secondary)] text-[var(--text-secondary)] font-bold uppercase text-[10px] tracking-wider border-b border-[var(--border)]">
                  <th className="p-3 w-8 text-center">
                    <input
                      type="checkbox"
                      checked={items.length > 0 && selectedSkus.length === items.length}
                      onChange={toggleSelectAll}
                      className="rounded text-indigo-600 focus:ring-0 cursor-pointer"
                    />
                  </th>
                  <th className="p-3 text-center w-20">TYPE</th>
                  <th className="p-3">SKU CODE</th>
                  <th className="p-3">PRODUCT / COMBO NAME</th>
                  <th className="p-3 text-center">STOCK COUNT</th>
                  <th className="p-3 text-center">QTY SOLD</th>
                  <th className="p-3 text-right">TAX COLLECTED</th>
                  <th className="p-3 text-center">HSN</th>
                  <th className="p-3 text-center">GST RATE %</th>
                  <th className="p-3 text-center">TAX MODE</th>
                  <th className="p-3 text-right">BASE PRICE (EXCL. TAX)</th>
                  <th className="p-3 text-right">GST AMOUNT</th>
                  <th className="p-3 text-right">PRICE (INCL. TAX / MRP)</th>
                  <th className="p-3 text-right">STOCK VALUATION</th>
                  <th className="p-3 text-right">ACTIONS</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--border)] font-medium">
                {items.length === 0 ? (
                  <tr>
                    <td colSpan={15} className="p-8 text-center text-[var(--text-muted)]">
                      No products or combos found matching your search.
                    </td>
                  </tr>
                ) : (
                  items.map((item) => {
                    const inline = inlineValues[item.sku] || {
                      taxRate: item.taxRate,
                      overridePrice: item.price,
                      isTaxInclusive: item.isTaxInclusive,
                    };
                    const isRowSaving = savingSku === item.sku;

                    // Real-time live row calculations based on inline values
                    const isInclusive = inline.isTaxInclusive ?? true;
                    const taxRate = inline.taxRate ?? 18;
                    const rawPrice = inline.overridePrice ?? 0;

                    let rowPriceExcl = 0;
                    let rowTaxAmt = 0;
                    let rowPriceIncl = 0;

                    if (isInclusive) {
                      rowPriceIncl = rawPrice;
                      rowPriceExcl = taxRate > 0 ? rawPrice / (1 + taxRate / 100) : rawPrice;
                      rowTaxAmt = rowPriceIncl - rowPriceExcl;
                    } else {
                      rowPriceExcl = rawPrice;
                      rowTaxAmt = rawPrice * (taxRate / 100);
                      rowPriceIncl = rowPriceExcl + rowTaxAmt;
                    }

                    const isCombo = item.type === "COMBO";
                    const rowValuation = isCombo && item.recipeCost && item.recipeCost > 0
                      ? item.stockCount * item.recipeCost
                      : item.stockCount * rowPriceIncl;

                    return (
                      <tr
                        key={item.shopifyVariantId || item.sku}
                        className={`hover:bg-slate-50/80 dark:hover:bg-[var(--surface-hover)]/50 transition-colors ${
                          selectedSkus.includes(item.sku) ? "bg-indigo-500/5 dark:bg-indigo-950/20" : ""
                        }`}
                      >
                        <td className="p-3 text-center">
                          <input
                            type="checkbox"
                            checked={selectedSkus.includes(item.sku)}
                            onChange={() => toggleSelectSku(item.sku)}
                            className="rounded text-indigo-600 focus:ring-0 cursor-pointer"
                          />
                        </td>

                        {/* TYPE */}
                        <td className="p-3 text-center">
                          {isCombo ? (
                            <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-black bg-purple-500/15 text-purple-600 dark:text-purple-400 border border-purple-500/30">
                              COMBO
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-black bg-cyan-500/15 text-cyan-600 dark:text-cyan-400 border border-cyan-500/30">
                              SINGLE
                            </span>
                          )}
                        </td>

                        {/* SKU CODE */}
                        <td className="p-3">
                          <div className="flex flex-col items-start">
                            <span className="font-mono text-cyan-600 dark:text-cyan-400 text-xs font-bold">
                              {item.sku || "NO_SKU"}
                            </span>
                            {item.shopifyVariantId && (
                              <span className="badge badge-purple text-[8.5px] mt-0.5">
                                Var #{item.shopifyVariantId}
                              </span>
                            )}
                            {isCombo && (
                              <div className="flex flex-col gap-1 mt-1.5">
                                <button
                                  type="button"
                                  onClick={() => handleOpenComboInvoiceSetup(item)}
                                  className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-bold transition-all cursor-pointer ${
                                    item.requiresReview
                                      ? "bg-rose-500/15 text-rose-600 dark:text-rose-400 border border-rose-500/30 animate-pulse"
                                      : item.isComboBalanced
                                      ? "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border border-emerald-500/30"
                                      : "bg-amber-500/15 text-amber-600 dark:text-amber-400 border border-amber-500/30"
                                  }`}
                                  title="Configure Custom Invoice Breakdown (Selling Price & Tax per Recipe Component)"
                                >
                                  <Sliders size={10} />
                                  {item.requiresReview
                                    ? "⚠ Setup Needed"
                                    : item.isComboBalanced
                                    ? "✓ Invoice Setup"
                                    : "⚠ Balance Setup"}
                                </button>
                                {item.comboComponents && item.comboComponents.length > 0 && (
                                  <button
                                    type="button"
                                    onClick={() => setRecipeModalCombo(item)}
                                    className="inline-flex items-center gap-1 text-[10px] font-bold text-indigo-600 dark:text-indigo-400 hover:underline cursor-pointer"
                                  >
                                    <Layers size={10} /> View Recipe
                                  </button>
                                )}
                              </div>
                            )}
                          </div>
                        </td>

                        {/* PRODUCT / COMBO NAME */}
                        <td className="p-3">
                          <div className="flex flex-col">
                            <span className="font-bold text-[var(--text-primary)] leading-tight">
                              {item.title}
                            </span>
                            {item.productName && item.productName !== item.title && (
                              <span className="text-[10.5px] text-[var(--text-secondary)] mt-0.5">
                                {item.productName}
                              </span>
                            )}
                          </div>
                        </td>

                        {/* STOCK COUNT */}
                        <td className="p-3 text-center">
                          <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-cyan-500/10 text-cyan-600 dark:text-cyan-400 font-mono font-bold text-xs border border-cyan-500/20">
                            {item.stockCount} {item.unit}
                          </span>
                          {isCombo && (
                            <span className="text-[9px] text-[var(--text-muted)] block mt-0.5 font-medium">
                              Buildable Kits
                            </span>
                          )}
                        </td>

                        {/* HSN */}
                        <td className="p-3 text-center font-mono text-[var(--text-muted)] text-[11px]">
                          {item.hsnCode || "—"}
                        </td>

                        {/* GST RATE % */}
                        <td className="p-3 text-center">
                          {isCombo ? (
                            <div className="flex flex-col items-center gap-1">
                              <button
                                type="button"
                                onClick={() => handleOpenComboInvoiceSetup(item)}
                                className={`px-2 py-1 rounded-lg border text-[11px] font-black focus:outline-none cursor-pointer transition-all shadow-sm ${
                                  item.mixedGstLabel && item.mixedGstLabel.includes("Mixed")
                                    ? "bg-amber-500/15 hover:bg-amber-500/25 border-amber-500/30 text-amber-600 dark:text-amber-400"
                                    : "bg-purple-500/15 hover:bg-purple-500/25 border-purple-500/30 text-purple-600 dark:text-purple-400"
                                }`}
                                title="Click to view & edit component GST rates"
                              >
                                {item.mixedGstLabel || `${inline.taxRate}% GST`}
                              </button>
                              <span className="text-[9px] text-[var(--text-muted)] font-mono">
                                {item.comboInvoiceComponents && item.comboInvoiceComponents.length > 0
                                  ? `${item.comboInvoiceComponents.length} components`
                                  : "Per Recipe Setup"}
                              </span>
                            </div>
                          ) : (
                            <select
                              value={inline.taxRate}
                              onChange={(e) => {
                                const newRate = parseFloat(e.target.value);
                                setInlineValues({
                                  ...inlineValues,
                                  [item.sku]: { ...inline, taxRate: newRate },
                                });
                              }}
                              className="px-2 py-1 rounded-lg bg-[var(--bg-secondary)] border border-[var(--border)] text-xs font-bold text-indigo-600 dark:text-indigo-400 focus:outline-none cursor-pointer"
                            >
                              <option value={18}>18% GST</option>
                              <option value={12}>12% GST</option>
                              <option value={5}>5% GST</option>
                              <option value={28}>28% GST</option>
                              <option value={0}>0% Exempt</option>
                            </select>
                          )}
                        </td>

                        {/* TAX MODE */}
                        <td className="p-3 text-center">
                          {isCombo ? (
                            <button
                              type="button"
                              onClick={() => handleOpenComboInvoiceSetup(item)}
                              className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg font-mono font-bold text-[10.5px] bg-purple-500/15 border border-purple-500/30 text-purple-600 dark:text-purple-400 hover:bg-purple-500/25 cursor-pointer shadow-sm"
                              title="Configured per component in Combo Invoice Setup"
                            >
                              Per Component ⚙
                            </button>
                          ) : (
                            <button
                              type="button"
                              onClick={() => {
                                const nextInclusive = !(inline.isTaxInclusive ?? true);
                                setInlineValues({
                                  ...inlineValues,
                                  [item.sku]: { ...inline, isTaxInclusive: nextInclusive },
                                });
                              }}
                              className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-lg font-mono font-bold text-[11px] transition-all cursor-pointer border ${
                                isInclusive
                                  ? "bg-emerald-500/15 border-emerald-500/30 text-emerald-400 hover:bg-emerald-500/25 shadow-sm"
                                  : "bg-cyan-500/15 border-cyan-500/30 text-cyan-400 hover:bg-cyan-500/25 shadow-sm"
                              }`}
                              title="Click to toggle between Tax Inclusive (MRP) and Tax Exclusive (+ Tax)"
                            >
                              {isInclusive ? "✓ Incl. Tax" : "+ Excl. Tax"}
                            </button>
                          )}
                        </td>

                        {/* BASE PRICE (EXCL. TAX) */}
                        <td className="p-3 text-right font-mono font-semibold text-[var(--text-secondary)]">
                          ₹{rowPriceExcl.toFixed(2)}
                        </td>

                        {/* GST AMOUNT */}
                        <td className="p-3 text-right font-mono font-bold text-amber-600 dark:text-amber-400">
                          ₹{rowTaxAmt.toFixed(2)}
                        </td>

                        {/* PRICE (INCL. TAX / MRP) */}
                        <td className="p-3 text-right font-mono font-black text-[var(--text-primary)]">
                          <div className="flex items-center justify-end gap-1">
                            <span>₹</span>
                            <input
                              type="number"
                              step="any"
                              value={inline.overridePrice}
                              onChange={(e) => {
                                const newPrice = parseFloat(e.target.value) || 0;
                                setInlineValues({
                                  ...inlineValues,
                                  [item.sku]: { ...inline, overridePrice: newPrice },
                                });
                              }}
                              className="w-20 px-1.5 py-0.5 text-right font-mono font-black bg-[var(--bg-secondary)] border border-[var(--border)] rounded-lg text-[var(--text-primary)] focus:outline-none focus:border-[var(--accent)] text-xs"
                            />
                          </div>
                        </td>

                        {/* STOCK VALUATION */}
                        <td className="p-3 text-right font-mono">
                          <span className="block font-bold text-emerald-600 dark:text-emerald-400">
                            ₹{Math.round(rowValuation).toLocaleString()}
                          </span>
                          {isCombo && item.recipeCost && item.recipeCost > 0 && (
                            <span className="block text-[9px] text-[var(--text-muted)] font-mono">
                              BOM: ₹{item.recipeCost.toFixed(2)}/kit
                            </span>
                          )}
                        </td>

                        {/* ACTIONS */}
                        <td className="p-3 text-right">
                          <div className="flex items-center justify-end gap-1.5">
                            <button
                              onClick={() => handleSaveInline(item)}
                              disabled={isRowSaving}
                              className="p-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white transition-colors cursor-pointer"
                              title="Save Tax & Price"
                            >
                              <Check size={12} />
                            </button>
                            <button
                              onClick={() => handleOpenEdit(item)}
                              className="p-1.5 rounded-lg bg-slate-100 dark:bg-[var(--surface-hover)] text-[var(--text-secondary)] hover:text-[var(--text-primary)] transition-colors cursor-pointer"
                              title="Full Edit Modal"
                            >
                              <Edit2 size={12} />
                            </button>
                            {isCombo && (
                              <>
                                <button
                                  onClick={() => handleOpenComboInvoiceSetup(item)}
                                  className="p-1.5 rounded-lg bg-indigo-500/15 text-indigo-600 dark:text-indigo-400 hover:bg-indigo-500/25 transition-colors cursor-pointer"
                                  title="Configure Custom Invoice Breakdown"
                                >
                                  <Sliders size={12} />
                                </button>
                                <button
                                  onClick={() => setRecipeModalCombo(item)}
                                  className="p-1.5 rounded-lg bg-purple-500/15 text-purple-600 dark:text-purple-400 hover:bg-purple-500/25 transition-colors cursor-pointer"
                                  title="View Inventory Recipe (BOM)"
                                >
                                  <Layers size={12} />
                                </button>
                              </>
                            )}
                          </div>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>
      ) : activeTab === "sales" ? (
        /* TAB 2: SHIPPING ROUTE SALES LEDGER (CGST / SGST / IGST) */
        <div className="glass-panel overflow-hidden border border-[var(--border)] rounded-2xl shadow-xl space-y-3 p-4 sm:p-5">
          <div className="flex items-center justify-between pb-2 border-b border-[var(--border)]">
            <div>
              <h3 className="text-sm sm:text-base font-bold text-[var(--text-primary)] flex items-center gap-2">
                <Truck size={17} className="text-indigo-500" />
                Shipping Route Order Ledger ({salesOrders.length} Orders)
              </h3>
              <p className="text-xs text-[var(--text-muted)] mt-0.5">
                Shipping From: <strong className="text-indigo-400">{summary?.originState.name} ({summary?.originState.code})</strong>.{" "}
                {taxBasis === "DELIVERED"
                  ? "Realized Delivered Goods: Orders dispatched on Feb 27 & delivered on March 5 are attributed to March GST liabilities. Undelivered/RTO orders excluded."
                  : "Order Date Basis: Taxes calculated on order placement date."}
              </p>
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs border-collapse">
              <thead>
                <tr className="bg-[var(--bg-secondary)] text-[var(--text-secondary)] font-bold uppercase text-[10px] tracking-wider border-b border-[var(--border)]">
                  <th className="p-3">Order Number</th>
                  <th className="p-3">Customer &amp; Destination</th>
                  <th className="p-3 text-center">Shipping Route</th>
                  <th className="p-3 text-center">Delivered Date</th>
                  <th className="p-3 text-center">GST Classification</th>
                  <th className="p-3 text-right">Taxable Net Amount</th>
                  <th className="p-3 text-right">CGST (₹)</th>
                  <th className="p-3 text-right">SGST (₹)</th>
                  <th className="p-3 text-right">IGST (₹)</th>
                  <th className="p-3 text-right">Total Tax (₹)</th>
                  <th className="p-3 text-right">Gross Order Total</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--border)] font-medium">
                {salesOrders.length === 0 ? (
                  <tr>
                    <td colSpan={11} className="p-8 text-center text-[var(--text-muted)]">
                      No realized sales orders found for the selected date range.
                    </td>
                  </tr>
                ) : (
                  salesOrders.map((order) => (
                    <tr key={order.orderId} className="hover:bg-slate-50/80 dark:hover:bg-[var(--surface-hover)]/50">
                      {/* Order Number */}
                      <td className="p-3">
                        <span className="font-mono font-bold text-indigo-600 dark:text-indigo-400">
                          #{order.orderNumber}
                        </span>
                        <span className="text-[10px] text-[var(--text-secondary)] block">
                          Ordered: {new Date(order.orderDate).toLocaleDateString()}
                        </span>
                      </td>

                      {/* Customer */}
                      <td className="p-3">
                        <span className="font-bold text-[var(--text-primary)] block">
                          {order.customerName}
                        </span>
                        <span className="text-[11px] text-[var(--text-secondary)] font-mono">
                          {order.shippingTo.city ? `${order.shippingTo.city}, ` : ""}{order.shippingTo.zip}
                        </span>
                      </td>

                      {/* Shipping Route */}
                      <td className="p-3 text-center">
                        <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-[var(--bg-secondary)] border border-[var(--border)] font-mono text-xs">
                          <span className="text-[var(--text-muted)] font-bold">{order.shippingFrom.shortCode}</span>
                          <ArrowRight size={11} className="text-indigo-500" />
                          <span className="text-cyan-500 font-bold">{order.shippingTo.shortCode || order.shippingTo.name}</span>
                        </div>
                      </td>

                      {/* Delivery Date & Status */}
                      <td className="p-3 text-center">
                        {order.deliveryDate ? (
                          <div className="flex flex-col items-center">
                            <span className="badge badge-success text-[9px] font-bold">
                              ✓ {order.deliveryStatus}
                            </span>
                            <span className="text-[10px] font-mono text-[var(--text-secondary)] mt-0.5">
                              {new Date(order.deliveryDate).toLocaleDateString()}
                            </span>
                          </div>
                        ) : (
                          <span className="badge badge-neutral text-[9px]">
                            {order.deliveryStatus}
                          </span>
                        )}
                      </td>

                      {/* Classification Badge */}
                      <td className="p-3 text-center">
                        {order.taxType === "INTRA_STATE" ? (
                          <span className="badge badge-success text-[9px] font-bold">
                            Intra-State (CGST + SGST)
                          </span>
                        ) : (
                          <span className="badge badge-cyan text-[9px] font-bold">
                            Inter-State (IGST)
                          </span>
                        )}
                      </td>

                      {/* Net Amount */}
                      <td className="p-3 text-right font-mono font-semibold text-[var(--text-secondary)]">
                        ₹{order.netAmount.toFixed(2)}
                      </td>

                      {/* CGST */}
                      <td className="p-3 text-right font-mono font-bold text-emerald-600 dark:text-emerald-400">
                        {order.cgst > 0 ? `₹${order.cgst.toFixed(2)}` : "—"}
                      </td>

                      {/* SGST */}
                      <td className="p-3 text-right font-mono font-bold text-emerald-600 dark:text-emerald-400">
                        {order.sgst > 0 ? `₹${order.sgst.toFixed(2)}` : "—"}
                      </td>

                      {/* IGST */}
                      <td className="p-3 text-right font-mono font-bold text-cyan-600 dark:text-cyan-400">
                        {order.igst > 0 ? `₹${order.igst.toFixed(2)}` : "—"}
                      </td>

                      {/* Total Tax */}
                      <td className="p-3 text-right font-mono font-bold text-amber-600 dark:text-amber-400">
                        ₹{order.taxAmount.toFixed(2)}
                      </td>

                      {/* Gross Amount */}
                      <td className="p-3 text-right font-mono font-black text-[var(--text-primary)]">
                        ₹{order.grossAmount.toFixed(2)}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      ) : (
        /* TAB 3: STATE-WISE GSTR-1 DISTRIBUTION SUMMARY */
        <div className="glass-panel overflow-hidden border border-[var(--border)] rounded-2xl shadow-xl space-y-3 p-4 sm:p-5">
          <div className="flex items-center justify-between pb-2 border-b border-[var(--border)]">
            <div>
              <h3 className="text-sm sm:text-base font-bold text-[var(--text-primary)] flex items-center gap-2">
                <MapPin size={17} className="text-indigo-500" />
                State-Wise GST Summary Report (GSTR-1 Ready)
              </h3>
              <p className="text-xs text-[var(--text-muted)] mt-0.5">
                Aggregated sales and tax distribution by destination state from shipping origin: <strong>{summary?.originState.name} ({summary?.originState.code})</strong>.
              </p>
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs border-collapse">
              <thead>
                <tr className="bg-[var(--bg-secondary)] text-[var(--text-secondary)] font-bold uppercase text-[10px] tracking-wider border-b border-[var(--border)]">
                  <th className="p-3.5">Destination State</th>
                  <th className="p-3.5 text-center">GST State Code</th>
                  <th className="p-3.5 text-center">Classification</th>
                  <th className="p-3.5 text-center">Orders Count</th>
                  <th className="p-3.5 text-right">Taxable Net Sales (₹)</th>
                  <th className="p-3.5 text-right">CGST (₹)</th>
                  <th className="p-3.5 text-right">SGST (₹)</th>
                  <th className="p-3.5 text-right">IGST (₹)</th>
                  <th className="p-3.5 text-right">Total GST Output (₹)</th>
                  <th className="p-3.5 text-right">Gross Sales (₹)</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--border)] font-medium">
                {summary?.stateDistribution?.map((state) => (
                  <tr key={state.stateName} className="hover:bg-slate-50/80 dark:hover:bg-[var(--surface-hover)]/50">
                    <td className="p-3.5 font-bold text-[var(--text-primary)]">
                      {state.stateName}
                      {state.isSameState && (
                        <span className="badge badge-success text-[8px] ml-2">Origin State</span>
                      )}
                    </td>
                    <td className="p-3.5 text-center font-mono font-bold text-cyan-500">
                      {state.stateCode}
                    </td>
                    <td className="p-3.5 text-center">
                      <span className={`badge ${state.isSameState ? "badge-success" : "badge-cyan"} text-[9px]`}>
                        {state.isSameState ? "Intra-State (CGST+SGST)" : "Inter-State (IGST)"}
                      </span>
                    </td>
                    <td className="p-3.5 text-center font-mono font-bold text-[var(--text-secondary)]">
                      {state.orderCount}
                    </td>
                    <td className="p-3.5 text-right font-mono font-semibold text-[var(--text-secondary)]">
                      ₹{state.netSales.toLocaleString()}
                    </td>
                    <td className="p-3.5 text-right font-mono font-bold text-emerald-600 dark:text-emerald-400">
                      {state.cgst > 0 ? `₹${state.cgst.toLocaleString()}` : "—"}
                    </td>
                    <td className="p-3.5 text-right font-mono font-bold text-emerald-600 dark:text-emerald-400">
                      {state.sgst > 0 ? `₹${state.sgst.toLocaleString()}` : "—"}
                    </td>
                    <td className="p-3.5 text-right font-mono font-bold text-cyan-600 dark:text-cyan-400">
                      {state.igst > 0 ? `₹${state.igst.toLocaleString()}` : "—"}
                    </td>
                    <td className="p-3.5 text-right font-mono font-bold text-amber-600 dark:text-amber-400">
                      ₹{state.totalTax.toLocaleString()}
                    </td>
                    <td className="p-3.5 text-right font-mono font-black text-[var(--text-primary)]">
                      ₹{state.grossSales.toLocaleString()}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Edit Single SKU Modal */}
      {editingItem && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-[var(--surface)] backdrop-blur-sm animate-in fade-in">
          <div className="glass-panel border border-[var(--border)] rounded-2xl w-full max-w-md p-6 space-y-4 shadow-2xl bg-[var(--surface)] animate-in zoom-in-95">
            <div className="flex items-center justify-between border-b border-[var(--border)] pb-3">
              <div>
                <h3 className="font-bold text-base text-[var(--text-primary)] flex items-center gap-2">
                  <Percent className="text-indigo-500" size={18} />
                  Edit SKU Tax &amp; Price
                </h3>
                <span className="font-mono text-cyan-500 text-xs font-bold">{editingItem.sku}</span>
              </div>
              <button
                onClick={() => setEditingItem(null)}
                className="p-1 rounded-lg text-[var(--text-secondary)] hover:text-slate-200 hover:bg-[var(--surface-hover)]"
              >
                <X size={18} />
              </button>
            </div>

            <form onSubmit={handleSaveModal} className="space-y-3.5 text-xs">
              {/* Product Title */}
              <div>
                <label className="block text-[var(--text-secondary)] font-bold uppercase text-[10px] mb-1">
                  Product Title
                </label>
                <input
                  type="text"
                  value={editForm.title}
                  onChange={(e) => setEditForm({ ...editForm, title: e.target.value })}
                  className="w-full px-3 py-2 bg-[var(--bg-secondary)] border border-[var(--border)] rounded-xl text-[var(--text-primary)] font-medium focus:border-[var(--accent)] focus:outline-none"
                />
              </div>

              {/* Tax Slab */}
              <div>
                <label className="block text-[var(--text-secondary)] font-bold uppercase text-[10px] mb-1">
                  GST Tax Rate (%)
                </label>
                <select
                  value={editForm.taxRate}
                  onChange={(e) => setEditForm({ ...editForm, taxRate: parseFloat(e.target.value) })}
                  className="w-full px-3 py-2 bg-[var(--bg-secondary)] border border-[var(--border)] rounded-xl text-[var(--text-primary)] font-bold focus:border-[var(--accent)] focus:outline-none"
                >
                  <option value={18}>18% GST (9% CGST + 9% SGST / 18% IGST)</option>
                  <option value={12}>12% GST (6% CGST + 6% SGST / 12% IGST)</option>
                  <option value={5}>5% GST (2.5% CGST + 2.5% SGST / 5% IGST)</option>
                  <option value={28}>28% GST (14% CGST + 14% SGST / 28% IGST)</option>
                  <option value={0}>0% (Exempt)</option>
                </select>
              </div>

              {/* Tax Mode: Inclusive vs Exclusive */}
              <div>
                <label className="block text-[var(--text-secondary)] font-bold uppercase text-[10px] mb-1">
                  Tax Calculation Mode
                </label>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => setEditForm({ ...editForm, isTaxInclusive: true })}
                    className={`py-2 px-3 rounded-xl text-xs font-bold transition-all border text-center cursor-pointer ${
                      editForm.isTaxInclusive
                        ? "bg-emerald-500/20 border-emerald-500/50 text-emerald-400 font-black shadow-sm"
                        : "bg-[var(--bg-secondary)] border-[var(--border)] text-[var(--text-muted)] hover:text-slate-700 dark:hover:text-[var(--text-secondary)]"
                    }`}
                  >
                    ✓ Tax-Inclusive (MRP)
                  </button>
                  <button
                    type="button"
                    onClick={() => setEditForm({ ...editForm, isTaxInclusive: false })}
                    className={`py-2 px-3 rounded-xl text-xs font-bold transition-all border text-center cursor-pointer ${
                      !editForm.isTaxInclusive
                        ? "bg-cyan-500/20 border-cyan-500/50 text-cyan-400 font-black shadow-sm"
                        : "bg-[var(--bg-secondary)] border-[var(--border)] text-[var(--text-muted)] hover:text-slate-700 dark:hover:text-[var(--text-secondary)]"
                    }`}
                  >
                    + Tax-Exclusive (+ GST)
                  </button>
                </div>
                <p className="text-[10px] text-[var(--text-muted)] mt-1">
                  {editForm.isTaxInclusive
                    ? "Entered price is MRP. Base price and tax are calculated backwards."
                    : "Entered price is base price. Tax will be added on top."}
                </p>
              </div>

              {/* Price */}
              <div>
                <label className="block text-[var(--text-secondary)] font-bold uppercase text-[10px] mb-1">
                  Product Selling Price (₹)
                </label>
                <input
                  type="number"
                  step="any"
                  placeholder="e.g. 999.00"
                  value={editForm.overridePrice}
                  onChange={(e) => setEditForm({ ...editForm, overridePrice: e.target.value })}
                  className="w-full px-3 py-2 bg-[var(--bg-secondary)] border border-[var(--border)] rounded-xl text-[var(--text-primary)] font-mono font-bold focus:border-[var(--accent)] focus:outline-none"
                />
              </div>

              {/* HSN Code */}
              <div>
                <label className="block text-[var(--text-secondary)] font-bold uppercase text-[10px] mb-1">
                  HSN / SAC Code
                </label>
                <input
                  type="text"
                  placeholder="e.g. 3402, 6109"
                  value={editForm.hsnCode}
                  onChange={(e) => setEditForm({ ...editForm, hsnCode: e.target.value })}
                  className="w-full px-3 py-2 bg-[var(--bg-secondary)] border border-[var(--border)] rounded-xl text-[var(--text-primary)] font-mono focus:border-[var(--accent)] focus:outline-none"
                />
              </div>

              {saveSuccess && (
                <div className="p-3 rounded-xl bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 text-xs flex items-center gap-2">
                  <CheckCircle2 size={14} />
                  <span>Tax configuration saved successfully!</span>
                </div>
              )}

              <div className="flex items-center justify-end gap-2 pt-2 border-t border-[var(--border)]">
                <button
                  type="button"
                  onClick={() => setEditingItem(null)}
                  className="px-4 py-2 rounded-xl bg-slate-100 dark:bg-[var(--surface-hover)] text-[var(--text-secondary)] text-xs font-bold hover:bg-[var(--surface-hover)] transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={saving}
                  className="px-4 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-bold shadow-md shadow-indigo-600/20 transition-all disabled:opacity-50"
                >
                  {saving ? "Saving..." : "Save Config"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Bulk Edit Modal */}
      {bulkModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-[var(--surface)] backdrop-blur-sm animate-in fade-in">
          <div className="glass-panel border border-[var(--border)] rounded-2xl w-full max-w-md p-6 space-y-4 shadow-2xl bg-[var(--surface)] animate-in zoom-in-95">
            <div className="flex items-center justify-between border-b border-[var(--border)] pb-3">
              <div>
                <h3 className="font-bold text-base text-[var(--text-primary)]">
                  Bulk Update Tax Slabs
                </h3>
                <span className="text-xs text-indigo-400 font-bold">
                  Applying to {selectedSkus.length} selected SKUs
                </span>
              </div>
              <button
                onClick={() => setBulkModalOpen(false)}
                className="p-1 rounded-lg text-[var(--text-secondary)] hover:text-slate-200 hover:bg-[var(--surface-hover)]"
              >
                <X size={18} />
              </button>
            </div>

            <div className="space-y-3.5 text-xs">
              <div>
                <label className="block text-[var(--text-secondary)] font-bold uppercase text-[10px] mb-1">
                  Assign GST Rate %
                </label>
                <select
                  value={bulkTaxRate}
                  onChange={(e) => setBulkTaxRate(parseFloat(e.target.value))}
                  className="w-full px-3 py-2 bg-[var(--bg-secondary)] border border-[var(--border)] rounded-xl text-[var(--text-primary)] font-bold focus:border-[var(--accent)] focus:outline-none"
                >
                  <option value={18}>18% GST (Standard)</option>
                  <option value={12}>12% GST</option>
                  <option value={5}>5% GST (Reduced)</option>
                  <option value={28}>28% GST (Luxury)</option>
                  <option value={0}>0% Exempt</option>
                </select>
              </div>

              {/* Bulk Tax Mode */}
              <div>
                <label className="block text-[var(--text-secondary)] font-bold uppercase text-[10px] mb-1">
                  Tax Calculation Mode
                </label>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => setBulkInclusive(true)}
                    className={`py-2 px-3 rounded-xl text-xs font-bold transition-all border text-center cursor-pointer ${
                      bulkInclusive
                        ? "bg-emerald-500/20 border-emerald-500/50 text-emerald-400 font-black shadow-sm"
                        : "bg-[var(--bg-secondary)] border-[var(--border)] text-[var(--text-muted)]"
                    }`}
                  >
                    ✓ Tax-Inclusive (MRP)
                  </button>
                  <button
                    type="button"
                    onClick={() => setBulkInclusive(false)}
                    className={`py-2 px-3 rounded-xl text-xs font-bold transition-all border text-center cursor-pointer ${
                      !bulkInclusive
                        ? "bg-cyan-500/20 border-cyan-500/50 text-cyan-400 font-black shadow-sm"
                        : "bg-[var(--bg-secondary)] border-[var(--border)] text-[var(--text-muted)]"
                    }`}
                  >
                    + Tax-Exclusive (+ GST)
                  </button>
                </div>
              </div>

              <div>
                <label className="block text-[var(--text-secondary)] font-bold uppercase text-[10px] mb-1">
                  Assign HSN Code (Optional)
                </label>
                <input
                  type="text"
                  placeholder="e.g. 3402"
                  value={bulkHsn}
                  onChange={(e) => setBulkHsn(e.target.value)}
                  className="w-full px-3 py-2 bg-[var(--bg-secondary)] border border-[var(--border)] rounded-xl text-[var(--text-primary)] font-mono focus:border-[var(--accent)] focus:outline-none"
                />
              </div>

              <div className="flex items-center justify-end gap-2 pt-2 border-t border-[var(--border)]">
                <button
                  type="button"
                  onClick={() => setBulkModalOpen(false)}
                  className="px-4 py-2 rounded-xl bg-slate-100 dark:bg-[var(--surface-hover)] text-[var(--text-secondary)] text-xs font-bold"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={handleBulkUpdate}
                  disabled={bulkSaving}
                  className="px-4 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-bold shadow-md shadow-indigo-600/20 disabled:opacity-50"
                >
                  {bulkSaving ? "Updating..." : "Apply to All Selected"}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Shopify Products Sync Progress & Results Modal */}
      {syncModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-fade-in">
          <div className="glass-card w-full max-w-md p-6 border border-[var(--border)] shadow-2xl rounded-2xl bg-[var(--surface)] space-y-4">
            <div className="flex items-center justify-between pb-3 border-b border-[var(--border)]">
              <div className="flex items-center gap-2">
                <RefreshCw
                  size={18}
                  className={syncingShopify ? "animate-spin text-emerald-500" : "text-emerald-500"}
                />
                <h3 className="text-base font-bold text-[var(--text-primary)]">
                  Shopify Catalog Sync
                </h3>
              </div>
              {!syncingShopify && (
                <button
                  onClick={() => setSyncModalOpen(false)}
                  className="p-1 rounded-lg hover:bg-[var(--surface-hover)] text-[var(--text-secondary)] hover:text-slate-600 dark:hover:text-slate-200 cursor-pointer"
                >
                  <X size={16} />
                </button>
              )}
            </div>

            {/* Live Progress Stepper */}
            <div className="space-y-2">
              <div className="flex items-center gap-2 text-xs font-semibold">
                {syncingShopify ? (
                  <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 animate-pulse" />
                ) : syncError ? (
                  <AlertCircle size={16} className="text-rose-500" />
                ) : (
                  <CheckCircle2 size={16} className="text-emerald-500" />
                )}
                <span className={syncError ? "text-rose-500" : "text-[var(--text-primary)] font-mono"}>
                  {syncError || syncFeedbackStep || "Sync in progress..."}
                </span>
              </div>

              {/* Progress Steps List */}
              <div className="p-3 bg-[var(--bg-secondary)]/60 rounded-xl border border-[var(--border)]/60 text-[11px] font-mono space-y-1.5">
                {[
                  "Fetching Shopify products...",
                  "Fetching variants...",
                  "Updating products...",
                  "Updating tax catalog...",
                  "Sync complete.",
                ].map((step, idx) => {
                  const stepOrder = [
                    "Fetching Shopify products...",
                    "Fetching variants...",
                    "Updating products...",
                    "Updating tax catalog...",
                    "Sync complete.",
                  ];
                  const currentIdx = stepOrder.indexOf(syncFeedbackStep);
                  const isDone = currentIdx > idx || syncFeedbackStep === "Sync complete.";
                  const isCurrent = currentIdx === idx && syncingShopify;

                  return (
                    <div
                      key={step}
                      className={`flex items-center gap-2 ${
                        isDone
                          ? "text-emerald-500 font-bold"
                          : isCurrent
                          ? "text-cyan-400 font-bold animate-pulse"
                          : "text-[var(--text-secondary)] dark:text-slate-600"
                      }`}
                    >
                      {isDone ? (
                        <Check size={12} className="text-emerald-500" />
                      ) : isCurrent ? (
                        <RefreshCw size={11} className="animate-spin text-cyan-400" />
                      ) : (
                        <span className="w-2.5 h-2.5 text-center text-[10px] leading-none">•</span>
                      )}
                      <span>{step}</span>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Results Breakdown Card */}
            {syncResultStats && (
              <div className="p-3.5 bg-emerald-500/5 dark:bg-emerald-950/20 border border-emerald-500/20 rounded-xl space-y-2">
                <span className="text-[10px] uppercase font-bold text-emerald-600 dark:text-emerald-400 tracking-wider">
                  Sync Summary Metrics
                </span>
                <div className="grid grid-cols-3 gap-2 text-xs font-mono">
                  <div className="p-2 rounded-lg bg-[var(--bg-secondary)] border border-[var(--border)]">
                    <span className="text-[10px] text-[var(--text-muted)] block">Products</span>
                    <span className="text-base font-bold text-[var(--text-primary)]">
                      {syncResultStats.productsFetched}
                    </span>
                  </div>
                  <div className="p-2 rounded-lg bg-[var(--bg-secondary)] border border-[var(--border)]">
                    <span className="text-[10px] text-[var(--text-muted)] block">Variants</span>
                    <span className="text-base font-bold text-[var(--text-primary)]">
                      {syncResultStats.variantsFetched}
                    </span>
                  </div>
                  <div className="p-2 rounded-lg bg-emerald-500/10 border border-emerald-500/20">
                    <span className="text-[10px] text-emerald-500 block">New</span>
                    <span className="text-base font-bold text-emerald-500">
                      {syncResultStats.newCount}
                    </span>
                  </div>
                  <div className="p-2 rounded-lg bg-cyan-500/10 border border-cyan-500/20">
                    <span className="text-[10px] text-cyan-500 block">Updated</span>
                    <span className="text-base font-bold text-cyan-500">
                      {syncResultStats.updatedCount}
                    </span>
                  </div>
                  <div className="p-2 rounded-lg bg-[var(--bg-secondary)] border border-[var(--border)]">
                    <span className="text-[10px] text-[var(--text-muted)] block">Unchanged</span>
                    <span className="text-base font-bold text-[var(--text-secondary)]">
                      {syncResultStats.unchangedCount}
                    </span>
                  </div>
                  <div className="p-2 rounded-lg bg-rose-500/10 border border-rose-500/20">
                    <span className="text-[10px] text-rose-500 block">Failed</span>
                    <span className="text-base font-bold text-rose-500">
                      {syncResultStats.failedCount}
                    </span>
                  </div>
                </div>
              </div>
            )}

            {/* Close Button */}
            {!syncingShopify && (
              <div className="flex justify-end pt-2">
                <button
                  onClick={() => setSyncModalOpen(false)}
                  className="px-4 py-2 rounded-xl bg-slate-900 dark:bg-white text-white dark:text-slate-900 text-xs font-bold shadow-md cursor-pointer hover:opacity-90 transition-all"
                >
                  Done
                </button>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Informational Recipe Modal for Combo SKUs */}
      {recipeModalCombo && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-fade-in">
          <div className="glass-card w-full max-w-lg p-5 space-y-4 shadow-2xl rounded-2xl bg-[var(--surface)] border border-[var(--border)] animate-in zoom-in-95">
            <div className="flex items-center justify-between border-b border-[var(--border)] pb-3">
              <div>
                <span className="text-[10px] font-mono font-bold uppercase tracking-wider text-purple-600 dark:text-purple-400">
                  Inventory Recipe / BOM (Informational)
                </span>
                <h3 className="font-bold text-base text-[var(--text-primary)]">{recipeModalCombo.title}</h3>
                <span className="font-mono text-cyan-600 dark:text-cyan-400 text-xs font-bold">{recipeModalCombo.sku}</span>
              </div>
              <button
                onClick={() => setRecipeModalCombo(null)}
                className="p-1 rounded-lg text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--surface-hover)] cursor-pointer"
              >
                <X size={18} />
              </button>
            </div>
            <div className="p-3 rounded-xl bg-indigo-500/10 border border-indigo-500/20 text-xs text-[var(--text-secondary)] space-y-1">
              <p className="font-bold text-indigo-600 dark:text-indigo-400">Physical Inventory Composition:</p>
              <p className="text-[11px]">This recipe determines physical component deductions upon fulfillment. Sales tax and pricing are configured independently in the Sales Tax &amp; Pricing Catalog.</p>
            </div>
            <div className="border border-[var(--border)] rounded-xl overflow-hidden">
              <table className="w-full text-left text-xs">
                <thead className="bg-[var(--bg-secondary)] text-[var(--text-secondary)] font-bold text-[10px] uppercase border-b border-[var(--border)]">
                  <tr>
                    <th className="p-2.5">Component SKU</th>
                    <th className="p-2.5">Component Name</th>
                    <th className="p-2.5 text-center">Qty</th>
                    <th className="p-2.5 text-right">Unit Cost</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[var(--border)] font-medium">
                  {recipeModalCombo.comboComponents && recipeModalCombo.comboComponents.length > 0 ? (
                    recipeModalCombo.comboComponents.map((comp: any, idx: number) => (
                      <tr key={idx} className="hover:bg-[var(--surface-hover)]/30">
                        <td className="p-2.5 font-mono text-cyan-600 dark:text-cyan-400 font-bold">{comp.componentSku}</td>
                        <td className="p-2.5 text-[var(--text-primary)]">{comp.name}</td>
                        <td className="p-2.5 text-center font-bold text-purple-600 dark:text-purple-400">× {comp.quantity}</td>
                        <td className="p-2.5 text-right font-mono text-[var(--text-secondary)]">₹{Number(comp.unitCost || 0).toFixed(2)}</td>
                      </tr>
                    ))
                  ) : (
                    <tr>
                      <td colSpan={4} className="p-4 text-center text-[var(--text-muted)]">No recipe components registered yet for this Combo SKU.</td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
            <div className="flex items-center justify-between text-xs pt-2 border-t border-[var(--border)]">
              <span className="text-[var(--text-muted)] font-mono">
                Total Recipe Unit Cost: <strong className="text-[var(--text-primary)]">₹{Number(recipeModalCombo.recipeCost || 0).toFixed(2)}</strong>
              </span>
              <button
                onClick={() => setRecipeModalCombo(null)}
                className="px-4 py-1.5 rounded-xl bg-[var(--surface-hover)] text-[var(--text-primary)] text-xs font-bold hover:opacity-80 transition-all cursor-pointer"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Dedicated Combo Custom Invoice Breakdown Configuration Modal */}
      {comboModalOpen && comboModalItem && (() => {
        const sellingPriceNum = parseFloat(String(comboSellingPrice)) || 0;
        const sellingPricePaise = Math.round(sellingPriceNum * 100);

        let totalAllocatedPaise = 0;
        let totalTaxablePaise = 0;
        let totalTaxPaise = 0;

        comboComponentsForm.forEach((comp) => {
          const compVal = parseFloat(String(comp.allocatedValue)) || 0;
          const compPaise = Math.round(compVal * 100);
          totalAllocatedPaise += compPaise;

          const isInc = comp.taxMode === "INCLUSIVE";
          const rate = comp.gstRate || 0;
          const taxableP = isInc
            ? rate > 0 ? Math.round(compPaise / (1 + rate / 100)) : compPaise
            : compPaise;
          const taxP = isInc
            ? compPaise - taxableP
            : rate > 0 ? Math.round(taxableP * (rate / 100)) : 0;

          totalTaxablePaise += taxableP;
          totalTaxPaise += taxP;
        });

        const diffPaise = sellingPricePaise - totalAllocatedPaise;
        const isBalanced = diffPaise === 0 && comboComponentsForm.length > 0;
        const diffVal = Number((diffPaise / 100).toFixed(2));
        const distinctRates = Array.from(new Set(comboComponentsForm.map((c) => c.gstRate))).sort((a, b) => a - b);
        const mixedLabel = distinctRates.length > 1
          ? `Mixed GST (${distinctRates.map((r) => `${r}%`).join(" + ")})`
          : `${distinctRates[0] || 18}% GST`;

        return (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-black/70 backdrop-blur-sm animate-fade-in overflow-y-auto">
            <div className="glass-card w-full max-w-4xl p-5 sm:p-6 space-y-4 shadow-2xl rounded-2xl bg-[var(--surface)] border border-[var(--border)] max-h-[92vh] flex flex-col my-auto">
              {/* Modal Header */}
              <div className="flex items-start justify-between border-b border-[var(--border)] pb-3">
                <div>
                  <div className="flex items-center gap-2">
                    <span className="text-[10px] font-mono font-black uppercase tracking-wider px-2 py-0.5 rounded-full bg-purple-500/15 text-purple-600 dark:text-purple-400 border border-purple-500/30">
                      Combo Invoice Tax Setup
                    </span>
                    {isBalanced ? (
                      <span className="text-[10px] font-mono font-bold px-2 py-0.5 rounded-full bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border border-emerald-500/30 flex items-center gap-1">
                        <CheckCircle2 size={11} /> Ready For Invoicing
                      </span>
                    ) : (
                      <span className="text-[10px] font-mono font-bold px-2 py-0.5 rounded-full bg-rose-500/15 text-rose-600 dark:text-rose-400 border border-rose-500/30 flex items-center gap-1">
                        <AlertCircle size={11} /> Allocation Mismatch
                      </span>
                    )}
                  </div>
                  <h3 className="font-bold text-base sm:text-lg text-[var(--text-primary)] mt-1">
                    {comboModalItem.title}
                  </h3>
                  <div className="flex items-center gap-2 mt-0.5">
                    <span className="font-mono text-cyan-600 dark:text-cyan-400 text-xs font-bold">
                      SKU: {comboModalItem.sku}
                    </span>
                    <span className="text-[var(--text-muted)] text-xs">•</span>
                    <span className="text-xs font-semibold text-[var(--text-secondary)]">
                      {comboComponentsForm.length} Recipe Components
                    </span>
                  </div>
                </div>
                <button
                  onClick={() => setComboModalOpen(false)}
                  className="p-1.5 rounded-xl text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--surface-hover)] cursor-pointer transition-colors"
                >
                  <X size={20} />
                </button>
              </div>

              {/* Live Reconciled Financial Banner */}
              <div className="grid grid-cols-1 sm:grid-cols-4 gap-3">
                {/* Combo Selling Price */}
                <div className="p-3 rounded-xl bg-[var(--bg-secondary)] border border-[var(--border)]">
                  <label className="text-[10px] uppercase font-bold text-[var(--text-secondary)] block mb-1">
                    Combo Selling Price (₹)
                  </label>
                  <div className="flex items-center gap-1">
                    <span className="font-bold text-[var(--text-primary)] text-sm">₹</span>
                    <input
                      type="number"
                      step="any"
                      value={comboSellingPrice}
                      onChange={(e) => setComboSellingPrice(e.target.value)}
                      className="w-full bg-[var(--surface)] border border-[var(--border)] rounded-lg px-2 py-1 text-sm font-black font-mono text-[var(--text-primary)] focus:outline-none focus:border-indigo-500"
                    />
                  </div>
                  <span className="text-[9.5px] text-[var(--text-muted)] mt-1 block">
                    Total invoice value to distribute
                  </span>
                </div>

                {/* Total Allocated */}
                <div className="p-3 rounded-xl bg-[var(--bg-secondary)] border border-[var(--border)]">
                  <label className="text-[10px] uppercase font-bold text-[var(--text-secondary)] block mb-1">
                    Total Allocated (₹)
                  </label>
                  <div className="text-sm sm:text-base font-black font-mono text-[var(--text-primary)]">
                    ₹{(totalAllocatedPaise / 100).toFixed(2)}
                  </div>
                  <span className="text-[9.5px] text-[var(--text-muted)] mt-1 block">
                    Sum of component invoice values
                  </span>
                </div>

                {/* Allocation Balance Status */}
                <div
                  className={`p-3 rounded-xl border flex flex-col justify-between ${
                    isBalanced
                      ? "bg-emerald-500/10 border-emerald-500/30 text-emerald-700 dark:text-emerald-300"
                      : "bg-rose-500/10 border-rose-500/30 text-rose-700 dark:text-rose-300"
                  }`}
                >
                  <div>
                    <span className="text-[10px] uppercase font-black tracking-wider block">
                      {isBalanced ? "✓ Allocation Balanced" : "⚠ Allocation Mismatch"}
                    </span>
                    <div className="text-sm font-black font-mono mt-0.5">
                      {isBalanced ? (
                        "Zero Drift (₹0.00)"
                      ) : (
                        <span>
                          Diff: {diffVal > 0 ? `+₹${diffVal.toFixed(2)}` : `-₹${Math.abs(diffVal).toFixed(2)}`}
                        </span>
                      )}
                    </div>
                  </div>
                  {!isBalanced && (
                    <button
                      type="button"
                      onClick={handleProportionalAutoFill}
                      className="mt-1.5 px-2 py-1 bg-rose-600 hover:bg-rose-500 text-white rounded-lg text-[10px] font-bold shadow cursor-pointer transition-all flex items-center justify-center gap-1"
                      title="Distribute difference across components to balance invoice"
                    >
                      <Sparkles size={11} /> Auto-Balance
                    </button>
                  )}
                </div>

                {/* Live Tax Preview */}
                <div className="p-3 rounded-xl bg-indigo-500/10 border border-indigo-500/20">
                  <span className="text-[10px] uppercase font-bold text-indigo-600 dark:text-indigo-400 block">
                    Live Tax Liability
                  </span>
                  <div className="text-sm font-black font-mono text-indigo-700 dark:text-indigo-300 mt-0.5">
                    ₹{(totalTaxPaise / 100).toFixed(2)} GST
                  </div>
                  <div className="text-[9.5px] text-[var(--text-secondary)] mt-1 flex flex-col font-mono">
                    <span>Taxable: ₹{(totalTaxablePaise / 100).toFixed(2)}</span>
                    <span className="truncate">{mixedLabel}</span>
                  </div>
                </div>
              </div>

              {/* Feedback / Error Alerts */}
              {comboError && (
                <div className="p-3 rounded-xl bg-rose-500/15 border border-rose-500/30 text-rose-600 dark:text-rose-400 text-xs font-semibold flex items-center gap-2">
                  <AlertCircle size={16} className="shrink-0" />
                  <span>{comboError}</span>
                </div>
              )}
              {comboSuccess && (
                <div className="p-3 rounded-xl bg-emerald-500/15 border border-emerald-500/30 text-emerald-600 dark:text-emerald-400 text-xs font-semibold flex items-center gap-2">
                  <CheckCircle2 size={16} className="shrink-0" />
                  <span>{comboSuccess}</span>
                </div>
              )}

              {/* Components Table */}
              <div className="border border-[var(--border)] rounded-xl overflow-hidden flex-1 flex flex-col">
                <div className="overflow-x-auto max-h-[380px]">
                  <table className="w-full text-left text-xs border-collapse">
                    <thead className="bg-[var(--bg-secondary)] text-[var(--text-secondary)] font-bold text-[10px] uppercase sticky top-0 z-10 border-b border-[var(--border)]">
                      <tr>
                        <th className="p-2.5">Component SKU &amp; Name</th>
                        <th className="p-2.5 text-center w-16">Recipe Qty</th>
                        <th className="p-2.5 text-right w-28">Allocated Value (₹)</th>
                        <th className="p-2.5 text-center w-28">GST Rate %</th>
                        <th className="p-2.5 text-center w-24">HSN Code</th>
                        <th className="p-2.5 text-center w-28">Tax Mode</th>
                        <th className="p-2.5 text-right w-24">Taxable Net</th>
                        <th className="p-2.5 text-right w-24">GST (₹)</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-[var(--border)] font-medium">
                      {comboLoading ? (
                        <tr>
                          <td colSpan={8} className="p-8 text-center text-[var(--text-muted)]">
                            <RefreshCw size={20} className="animate-spin mx-auto text-indigo-500 mb-2" />
                            Loading recipe components...
                          </td>
                        </tr>
                      ) : comboComponentsForm.length === 0 ? (
                        <tr>
                          <td colSpan={8} className="p-8 text-center text-[var(--text-muted)]">
                            No components found in recipe for this Combo SKU.
                          </td>
                        </tr>
                      ) : (
                        comboComponentsForm.map((comp, idx) => {
                          const compVal = parseFloat(String(comp.allocatedValue)) || 0;
                          const compPaise = Math.round(compVal * 100);
                          const isInc = comp.taxMode === "INCLUSIVE";
                          const rate = comp.gstRate || 0;
                          const taxableP = isInc
                            ? rate > 0 ? Math.round(compPaise / (1 + rate / 100)) : compPaise
                            : compPaise;
                          const taxP = isInc
                            ? compPaise - taxableP
                            : rate > 0 ? Math.round(taxableP * (rate / 100)) : 0;

                          return (
                            <tr key={comp.componentSku} className="hover:bg-[var(--surface-hover)]/40 transition-colors">
                              {/* Component SKU & Title */}
                              <td className="p-2.5">
                                <div className="flex flex-col">
                                  <span className="font-mono text-cyan-600 dark:text-cyan-400 font-bold text-xs">
                                    {comp.componentSku}
                                  </span>
                                  <span className="text-[11px] text-[var(--text-primary)] font-semibold leading-tight mt-0.5">
                                    {comp.name}
                                  </span>
                                </div>
                              </td>

                              {/* Recipe Qty */}
                              <td className="p-2.5 text-center">
                                <span className="inline-block px-2 py-0.5 rounded bg-purple-500/10 text-purple-600 dark:text-purple-400 font-mono font-bold text-xs">
                                  × {comp.quantity}
                                </span>
                              </td>

                              {/* Allocated Value (₹) */}
                              <td className="p-2.5 text-right">
                                <div className="flex items-center justify-end gap-1">
                                  <span className="font-bold text-[var(--text-secondary)]">₹</span>
                                  <input
                                    type="number"
                                    step="any"
                                    value={comp.allocatedValue}
                                    onChange={(e) => {
                                      const next = [...comboComponentsForm];
                                      next[idx].allocatedValue = e.target.value;
                                      setComboComponentsForm(next);
                                    }}
                                    className="w-20 px-2 py-1 text-right font-mono font-bold bg-[var(--bg-secondary)] border border-[var(--border)] rounded-lg text-[var(--text-primary)] focus:outline-none focus:border-indigo-500 text-xs"
                                  />
                                </div>
                              </td>

                              {/* GST Rate */}
                              <td className="p-2.5 text-center">
                                <select
                                  value={comp.gstRate}
                                  onChange={(e) => {
                                    const next = [...comboComponentsForm];
                                    next[idx].gstRate = parseFloat(e.target.value);
                                    setComboComponentsForm(next);
                                  }}
                                  className="px-2 py-1 rounded-lg bg-[var(--bg-secondary)] border border-[var(--border)] text-xs font-bold text-indigo-600 dark:text-indigo-400 focus:outline-none cursor-pointer"
                                >
                                  <option value={18}>18% GST</option>
                                  <option value={12}>12% GST</option>
                                  <option value={5}>5% GST</option>
                                  <option value={28}>28% GST</option>
                                  <option value={0}>0% Exempt</option>
                                </select>
                              </td>

                              {/* HSN Code */}
                              <td className="p-2.5 text-center">
                                <input
                                  type="text"
                                  value={comp.hsnCode}
                                  placeholder="e.g. 3402"
                                  onChange={(e) => {
                                    const next = [...comboComponentsForm];
                                    next[idx].hsnCode = e.target.value;
                                    setComboComponentsForm(next);
                                  }}
                                  className="w-20 px-2 py-1 text-center font-mono bg-[var(--bg-secondary)] border border-[var(--border)] rounded-lg text-[var(--text-primary)] focus:outline-none focus:border-indigo-500 text-xs"
                                />
                              </td>

                              {/* Tax Mode */}
                              <td className="p-2.5 text-center">
                                <button
                                  type="button"
                                  onClick={() => {
                                    const next = [...comboComponentsForm];
                                    next[idx].taxMode = comp.taxMode === "EXCLUSIVE" ? "INCLUSIVE" : "EXCLUSIVE";
                                    setComboComponentsForm(next);
                                  }}
                                  className={`px-2 py-1 rounded-lg font-mono font-bold text-[10px] transition-all cursor-pointer border ${
                                    isInc
                                      ? "bg-emerald-500/15 border-emerald-500/30 text-emerald-500 hover:bg-emerald-500/25"
                                      : "bg-cyan-500/15 border-cyan-500/30 text-cyan-500 hover:bg-cyan-500/25"
                                  }`}
                                >
                                  {isInc ? "✓ Incl. Tax" : "+ Excl. Tax"}
                                </button>
                              </td>

                              {/* Taxable Net */}
                              <td className="p-2.5 text-right font-mono text-[var(--text-secondary)] font-semibold">
                                ₹{(taxableP / 100).toFixed(2)}
                              </td>

                              {/* GST (₹) */}
                              <td className="p-2.5 text-right font-mono font-bold text-amber-600 dark:text-amber-400">
                                ₹{(taxP / 100).toFixed(2)}
                              </td>
                            </tr>
                          );
                        })
                      )}
                    </tbody>
                  </table>
                </div>
              </div>

              {/* Modal Footer */}
              <div className="flex flex-col sm:flex-row items-center justify-between gap-3 pt-3 border-t border-[var(--border)]">
                <div className="text-[11px] text-[var(--text-muted)] flex items-center gap-1.5">
                  <ShieldCheck size={14} className="text-emerald-500 shrink-0" />
                  <span>
                    Component values strictly control invoice lines &amp; GST buckets. Physical warehouse BOM is independent.
                  </span>
                </div>

                <div className="flex items-center gap-2 self-end sm:self-auto">
                  <button
                    type="button"
                    onClick={() => setComboModalOpen(false)}
                    className="px-4 py-2 rounded-xl bg-[var(--bg-secondary)] border border-[var(--border)] text-[var(--text-secondary)] text-xs font-bold hover:bg-[var(--surface-hover)] cursor-pointer transition-colors"
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    onClick={handleSaveComboConfig}
                    disabled={!isBalanced || comboSaving || comboComponentsForm.length === 0}
                    className={`px-5 py-2 rounded-xl text-xs font-bold shadow-md transition-all flex items-center gap-1.5 cursor-pointer ${
                      isBalanced && !comboSaving && comboComponentsForm.length > 0
                        ? "bg-indigo-600 hover:bg-indigo-500 text-white shadow-indigo-600/20"
                        : "bg-slate-300 dark:bg-slate-800 text-slate-500 dark:text-slate-400 cursor-not-allowed opacity-60"
                    }`}
                  >
                    {comboSaving ? (
                      <>
                        <RefreshCw size={13} className="animate-spin" /> Saving...
                      </>
                    ) : (
                      <>
                        <Check size={13} /> Save Breakdown
                      </>
                    )}
                  </button>
                </div>
              </div>
            </div>
          </div>
        );
      })()}
      </div>
    </RouteGuard>
  );
}
