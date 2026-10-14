"use client";

import { useEffect, useState, useMemo } from "react";
import {
  Boxes,
  Package,
  Layers,
  Plus,
  TrendingUp,
  AlertTriangle,
  FileText,
  History,
  Edit2,
  Trash2,
  CheckCircle2,
  PlusCircle,
  RefreshCw,
  Copy,
  Check,
  Puzzle,
  Filter,
  Info,
  Search,
  SlidersHorizontal,
  ArrowUpRight,
  MoreVertical,
  Minus,
  Sparkles,
  ShieldAlert,
  RotateCcw,
} from "lucide-react";
import { formatDate } from "@/lib/utils";
import Link from "next/link";
import { CardGridSkeleton, TableSkeleton } from "@/components/LoadingSkeleton";
import { appFetch } from "@/lib/api";
import { RouteGuard } from "@/components/auth/RouteGuard";
import { SearchInput } from "@/components/ui/Input";

export default function InventoryPage() {
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [activeTab, setActiveTab] = useState<"stock" | "ledger" | "mapping">("stock");
  const [typeFilter, setTypeFilter] = useState<"ALL" | "SINGLE" | "COMBO">("ALL");
  const [searchQuery, setSearchQuery] = useState("");
  const [copiedSku, setCopiedSku] = useState<string | null>(null);

  // Single Item Modal
  const [showItemModal, setShowItemModal] = useState(false);
  const [editingItem, setEditingItem] = useState<any | null>(null);
  const [itemForm, setItemForm] = useState({
    sku: "",
    name: "",
    type: "SINGLE" as "SINGLE" | "COMBO",
    category: "FINISHED_GOODS",
    unit: "pcs",
    currentStock: 0,
    damagedStock: 0,
    minStockLevel: 10,
    reorderLevel: 25,
    avgUnitCost: 180,
    sellingPrice: 0,
    costPrice: 0,
    location: "Main Warehouse",
    notes: "",
  });

  // Combo Recipe Modal
  const [showComboModal, setShowComboModal] = useState(false);
  const [comboForm, setComboForm] = useState({
    sku: "",
    name: "",
    category: "FINISHED_GOODS",
    notes: "",
    components: [{ componentSku: "", quantity: 1 }],
  });

  // Quick GRN Modal
  const [showGrnModal, setShowGrnModal] = useState(false);
  const [grnForm, setGrnForm] = useState({
    sku: "",
    quantityChange: 100,
    unitCost: 180,
    reason: "GRN_PURCHASE",
    notes: "Manual GRN stock receipt",
  });

  // Stock Adjustment Modal
  const [showAdjustModal, setShowAdjustModal] = useState(false);
  const [adjustForm, setAdjustForm] = useState({
    sku: "",
    bucket: "SALEABLE" as "SALEABLE" | "DAMAGED",
    quantityChange: 0,
    unitCost: 0,
    reason: "COUNT_CORRECTION",
    notes: "Physical inventory audit correction",
  });

  // Move Damage to Saleable Modal
  const [showDamageRestoreModal, setShowDamageRestoreModal] = useState(false);
  const [damageRestoreForm, setDamageRestoreForm] = useState({
    sku: "",
    maxDamaged: 0,
    quantity: 1,
    notes: "Restored to saleable stock after repair & inspection",
  });

  const loadData = async () => {
    setLoading(true);
    try {
      const res = await appFetch("/api/inventory");
      const json = await res.json();
      setData(json);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  const handleCopySku = (sku: string) => {
    navigator.clipboard.writeText(sku);
    setCopiedSku(sku);
    setTimeout(() => setCopiedSku(null), 2000);
  };

  const handleSyncSkusFromShopify = async () => {
    setSyncing(true);
    try {
      const res = await appFetch("/api/inventory", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "IMPORT_SHOPIFY_SKUS" }),
      });
      const json = await res.json();
      if (json.success) {
        alert(`Successfully imported/synced ${json.importedCount} SKUs from Shopify into VOOP Inventory!`);
        await loadData();
      } else {
        alert(`SKU Sync Failed: ${json.error || "Unknown error"}`);
      }
    } catch (e: any) {
      alert(`Error importing SKUs: ${e.message}`);
    } finally {
      setSyncing(false);
    }
  };

  const handleOpenCreateSingle = () => {
    setEditingItem(null);
    setItemForm({
      sku: "",
      name: "",
      type: "SINGLE",
      category: "FINISHED_GOODS",
      unit: "pcs",
      currentStock: 0,
      damagedStock: 0,
      minStockLevel: 10,
      reorderLevel: 25,
      avgUnitCost: 180,
      sellingPrice: 0,
      costPrice: 0,
      location: "Main Warehouse",
      notes: "",
    });
    setShowItemModal(true);
  };

  const handleOpenCreateCombo = () => {
    setComboForm({
      sku: "",
      name: "",
      category: "FINISHED_GOODS",
      notes: "",
      components: [
        { componentSku: "", quantity: 1 },
        { componentSku: "", quantity: 1 },
      ],
    });
    setShowComboModal(true);
  };

  const handleOpenEditItem = (item: any) => {
    if (item.type === "COMBO") {
      const components =
        item.comboComponents && item.comboComponents.length > 0
          ? item.comboComponents.map((c: any) => ({ componentSku: c.componentSku, quantity: c.quantity }))
          : [{ componentSku: "", quantity: 1 }];

      setComboForm({
        sku: item.sku,
        name: item.name,
        category: item.category || "FINISHED_GOODS",
        notes: item.notes || "",
        components,
      });
      setShowComboModal(true);
    } else {
      setEditingItem(item);
      setItemForm({
        sku: item.sku,
        name: item.name,
        type: "SINGLE",
        category: item.category || "FINISHED_GOODS",
        unit: item.unit || "pcs",
        currentStock: item.currentStock,
        damagedStock: item.damagedStock || 0,
        minStockLevel: item.minStockLevel || 10,
        reorderLevel: item.reorderLevel || 25,
        avgUnitCost: item.costPrice || item.avgUnitCost || 0,
        sellingPrice: item.sellingPrice || item.avgUnitCost || 0,
        costPrice: item.costPrice || item.avgUnitCost || 0,
        location: item.location || "Main Warehouse",
        notes: item.notes || "",
      });
      setShowItemModal(true);
    }
  };

  const handleSaveSingleItem = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const res = await appFetch("/api/inventory", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(itemForm),
      });
      const json = await res.json();
      if (json.success) {
        setShowItemModal(false);
        await loadData();
      } else {
        alert(`Failed to save stock item: ${json.error}`);
      }
    } catch (e: any) {
      alert(`Error saving stock item: ${e.message}`);
    }
  };

  const handleSaveCombo = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const validComponents = comboForm.components.filter((c) => c.componentSku.trim() !== "");
      if (validComponents.length === 0) {
        alert("Please add at least one component to this combo.");
        return;
      }

      const res = await appFetch("/api/inventory", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          sku: comboForm.sku,
          name: comboForm.name,
          type: "COMBO",
          category: comboForm.category,
          notes: comboForm.notes,
          components: validComponents,
        }),
      });
      const json = await res.json();
      if (json.success) {
        setShowComboModal(false);
        await loadData();
      } else {
        alert(`Failed to save combo: ${json.error}`);
      }
    } catch (e: any) {
      alert(`Error saving combo: ${e.message}`);
    }
  };

  const handleOpenGrn = (sku: string, cost?: number) => {
    setGrnForm({
      sku,
      quantityChange: 100,
      unitCost: cost || 180,
      reason: "GRN_PURCHASE",
      notes: "Manual GRN stock receipt",
    });
    setShowGrnModal(true);
  };

  const handleOpenAdjust = (sku: string, cost?: number) => {
    setAdjustForm({
      sku,
      bucket: "SALEABLE",
      quantityChange: 0,
      unitCost: cost || 0,
      reason: "COUNT_CORRECTION",
      notes: "Physical inventory audit correction",
    });
    setShowAdjustModal(true);
  };

  const handleOpenDamageRestore = (item: any) => {
    setDamageRestoreForm({
      sku: item.sku,
      maxDamaged: item.damagedStock || 0,
      quantity: Math.min(1, item.damagedStock || 0),
      notes: "Restored to saleable stock after repair & inspection",
    });
    setShowDamageRestoreModal(true);
  };

  const handleSaveGrn = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const res = await appFetch("/api/inventory", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(grnForm),
      });
      const json = await res.json();
      if (json.success) {
        setShowGrnModal(false);
        await loadData();
      } else {
        alert(`GRN failed: ${json.error}`);
      }
    } catch (e: any) {
      alert(`Error recording GRN: ${e.message}`);
    }
  };

  const handleSaveAdjust = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const res = await appFetch("/api/inventory", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(adjustForm),
      });
      const json = await res.json();
      if (json.success) {
        setShowAdjustModal(false);
        await loadData();
      } else {
        alert(`Adjustment failed: ${json.error}`);
      }
    } catch (e: any) {
      alert(`Error recording adjustment: ${e.message}`);
    }
  };

  const handleSaveDamageRestore = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const res = await appFetch("/api/inventory", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "DAMAGE_TO_SALEABLE",
          sku: damageRestoreForm.sku,
          quantity: damageRestoreForm.quantity,
          notes: damageRestoreForm.notes,
        }),
      });
      const json = await res.json();
      if (json.success) {
        setShowDamageRestoreModal(false);
        await loadData();
      } else {
        alert(`Restoral failed: ${json.error}`);
      }
    } catch (e: any) {
      alert(`Error restoring damaged stock: ${e.message}`);
    }
  };

  const handleDeleteItem = async (sku: string, id?: string) => {
    if (!confirm(`Are you sure you want to delete product "${sku}" from Physical Inventory?`)) return;
    try {
      const url = id
        ? `/api/inventory?id=${encodeURIComponent(id)}&sku=${encodeURIComponent(sku)}`
        : `/api/inventory?sku=${encodeURIComponent(sku)}`;
      const res = await appFetch(url, {
        method: "DELETE",
      });
      const json = await res.json();
      if (json.success) {
        await loadData();
      } else {
        alert(`Failed to delete: ${json.error || "Unknown error"}`);
      }
    } catch (e: any) {
      alert(`Error deleting item: ${e.message}`);
    }
  };

  const handlePurgeOrphaned = async () => {
    if (!confirm("This will delete all products from Physical Inventory that do not exist in your Shopify Products & Variants catalog. Continue?")) return;
    setSyncing(true);
    try {
      const res = await appFetch("/api/inventory", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "PURGE_UNMATCHED" }),
      });
      const json = await res.json();
      if (json.success) {
        alert(`Cleaned up ${json.purgedCount} item(s) not in Products & Variants. ${json.remainingCount} catalog items remaining.`);
        await loadData();
      } else {
        alert(`Cleanup failed: ${json.error || "Unknown error"}`);
      }
    } catch (e: any) {
      alert(`Error cleaning up: ${e.message}`);
    } finally {
      setSyncing(false);
    }
  };

  const summary = data?.summary || {};
  const allStockItems = data?.stockItems || [];
  const allSingleItems = useMemo(
    () => allStockItems.filter((s: any) => s.type === "SINGLE" || !s.type),
    [allStockItems]
  );

  const filteredStockItems = useMemo(() => {
    return allStockItems.filter((s: any) => {
      const matchesType =
        typeFilter === "ALL"
          ? true
          : typeFilter === "SINGLE"
          ? s.type === "SINGLE" || !s.type
          : s.type === "COMBO";

      if (!matchesType) return false;

      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        const skuMatch = s.sku.toLowerCase().includes(q);
        const nameMatch = s.name.toLowerCase().includes(q);
        return skuMatch || nameMatch;
      }
      return true;
    });
  }, [allStockItems, typeFilter, searchQuery]);

  const recentLedger = data?.recentLedger || [];
  const mappedVariants = data?.mappedVariants || [];

  return (
    <RouteGuard requiredPermission="inventory.view" moduleName="Physical Inventory">
      <div className="space-y-5 pb-16">
      {/* 1. Header Bar */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-[var(--border)]/80 pb-4">
        <div>
          <h1 className="text-xl font-bold text-[var(--text-primary)] tracking-tight flex items-center gap-2.5">
            <Boxes className="text-cyan-400" size={22} />
            <span>Physical Inventory Master</span>
          </h1>
          <p className="text-xs text-[var(--text-secondary)] mt-0.5">
            Audit-grade inventory lifecycle. Single items maintain Saleable &amp; Damaged buckets; Combos derive availability from components.
          </p>
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          <button
            onClick={handleSyncSkusFromShopify}
            disabled={syncing}
            className="px-3 py-1.5 rounded-lg bg-slate-900 hover:bg-[var(--surface-hover)] text-[var(--text-secondary)] hover:text-white border border-[var(--border)]/70 text-xs font-medium flex items-center gap-1.5 transition-colors disabled:opacity-50 cursor-pointer"
            title="Import all variants from Products & Variants catalog into Physical Inventory"
          >
            <RefreshCw size={13} className={syncing ? "animate-spin text-cyan-400" : "text-[var(--text-secondary)]"} />
            <span>{syncing ? "Fetching..." : "Fetch SKUs"}</span>
          </button>

          <button
            onClick={handlePurgeOrphaned}
            disabled={syncing}
            className="px-3 py-1.5 rounded-lg bg-red-500/10 hover:bg-red-500/20 text-red-600 dark:text-red-400 border border-red-500/30 text-xs font-medium flex items-center gap-1.5 transition-colors disabled:opacity-50 cursor-pointer"
            title="Remove products from Physical Inventory that do not exist in Products & Variants"
          >
            <Trash2 size={13} />
            <span>Clean Unmatched</span>
          </button>

          <Link
            href="/purchases"
            className="px-3 py-1.5 rounded-lg bg-[var(--surface)] hover:bg-[var(--surface-hover)] text-[var(--text-primary)] border border-[var(--border)]/70 text-xs font-medium flex items-center gap-1.5 transition-colors"
          >
            <FileText size={13} className="text-indigo-600 dark:text-indigo-400" />
            <span>Purchase Bills</span>
          </Link>

          <button
            onClick={handleOpenCreateSingle}
            className="px-3.5 py-1.5 rounded-lg bg-cyan-500 hover:bg-cyan-400 text-slate-950 text-xs font-bold flex items-center gap-1.5 transition-all shadow-sm"
          >
            <Plus size={14} />
            <span>Add Single SKU</span>
          </button>

          <button
            onClick={handleOpenCreateCombo}
            className="px-3.5 py-1.5 rounded-lg bg-purple-600 hover:bg-purple-500 text-white text-xs font-bold flex items-center gap-1.5 transition-all shadow-sm"
          >
            <Puzzle size={14} />
            <span>Create Combo</span>
          </button>
        </div>
      </div>

      {/* 2. Sleek KPI Metrics */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
        <div className="bg-[var(--surface)] border border-[var(--border)]/80 rounded-xl p-3.5 space-y-1">
          <div className="flex items-center justify-between text-[var(--text-secondary)] text-[11px] font-semibold uppercase tracking-wider">
            <span>Saleable Stock</span>
            <Package size={13} className="text-emerald-600 dark:text-emerald-400" />
          </div>
          <p className="text-xl font-bold text-emerald-700 dark:text-emerald-400">
            {summary.totalPhysicalUnits ?? 0} <span className="text-xs font-normal text-[var(--text-secondary)]">pcs</span>
          </p>
          <p className="text-[10px] text-[var(--text-muted)]">Available to fulfill orders</p>
        </div>

        <div className="bg-[var(--surface)] border border-[var(--border)]/80 rounded-xl p-3.5 space-y-1">
          <div className="flex items-center justify-between text-[var(--text-secondary)] text-[11px] font-semibold uppercase tracking-wider">
            <span>Damaged Stock</span>
            <ShieldAlert size={13} className="text-rose-600 dark:text-rose-400" />
          </div>
          <p className="text-xl font-bold text-rose-700 dark:text-rose-400">
            {summary.totalDamagedUnits ?? 0} <span className="text-xs font-normal text-[var(--text-secondary)]">pcs</span>
          </p>
          <p className="text-[10px] text-[var(--text-muted)]">RTO damage quarantine</p>
        </div>

        <div className="bg-[var(--surface)] border border-[var(--border)]/80 rounded-xl p-3.5 space-y-1">
          <div className="flex items-center justify-between text-[var(--text-secondary)] text-[11px] font-semibold uppercase tracking-wider">
            <span>Single SKUs</span>
            <Boxes size={13} className="text-cyan-600 dark:text-cyan-400" />
          </div>
          <p className="text-xl font-bold text-[var(--text-primary)]">{summary.singleItemsCount ?? 0}</p>
          <p className="text-[10px] text-[var(--text-muted)]">Physical stock items</p>
        </div>

        <div className="bg-[var(--surface)] border border-[var(--border)]/80 rounded-xl p-3.5 space-y-1">
          <div className="flex items-center justify-between text-[var(--text-secondary)] text-[11px] font-semibold uppercase tracking-wider">
            <span>Combo SKUs</span>
            <Puzzle size={13} className="text-purple-600 dark:text-purple-400" />
          </div>
          <p className="text-xl font-bold text-purple-700 dark:text-purple-300">{summary.combosCount ?? 0}</p>
          <p className="text-[10px] text-[var(--text-muted)]">Derived component recipes</p>
        </div>

        <div className="bg-[var(--surface)] border border-[var(--border)]/80 rounded-xl p-3.5 space-y-1">
          <div className="flex items-center justify-between text-[var(--text-secondary)] text-[11px] font-semibold uppercase tracking-wider">
            <span>Stock Valuation</span>
            <TrendingUp size={13} className="text-sky-600 dark:text-sky-400" />
          </div>
          <p className="text-xl font-bold text-[var(--text-primary)]">
            ₹{(summary.totalPhysicalValue ?? 0).toLocaleString("en-IN", { minimumFractionDigits: 2 })}
          </p>
          <p className="text-[10px] text-[var(--text-muted)]">Saleable warehouse valuation</p>
        </div>
      </div>

      {/* 3. Navigation Bar & Filter Controls */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pt-1">
        <div className="flex items-center gap-1 bg-[var(--surface)] p-1 rounded-lg border border-[var(--border)]/80 w-fit">
          <button
            onClick={() => setActiveTab("stock")}
            className={`px-3 py-1.5 rounded-md text-xs font-medium transition-all ${
              activeTab === "stock"
                ? "bg-[var(--accent)] text-white shadow-xs font-semibold"
                : "text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--surface-hover)]"
            }`}
          >
            Stock Master ({allStockItems.length})
          </button>
          <button
            onClick={() => setActiveTab("ledger")}
            className={`px-3 py-1.5 rounded-md text-xs font-medium transition-all ${
              activeTab === "ledger"
                ? "bg-[var(--accent)] text-white shadow-xs font-semibold"
                : "text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--surface-hover)]"
            }`}
          >
            Ledger History ({recentLedger.length})
          </button>
          <button
            onClick={() => setActiveTab("mapping")}
            className={`px-3 py-1.5 rounded-md text-xs font-medium transition-all ${
              activeTab === "mapping"
                ? "bg-[var(--accent)] text-white shadow-xs font-semibold"
                : "text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--surface-hover)]"
            }`}
          >
            Shopify Catalog ({mappedVariants.length})
          </button>
        </div>

        {activeTab === "stock" && (
          <div className="flex items-center gap-2.5">
            <div className="w-48 sm:w-60">
              <SearchInput
                placeholder="Search SKU or item..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                onClear={() => setSearchQuery("")}
                className="py-1.5 text-xs"
              />
            </div>

            <div className="flex items-center bg-[var(--surface)] p-1 rounded-lg border border-[var(--border)] text-xs">
              <button
                onClick={() => setTypeFilter("ALL")}
                className={`px-2.5 py-0.5 rounded text-[11px] font-medium transition-all ${
                  typeFilter === "ALL" ? "bg-[var(--accent)] text-white font-semibold" : "text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
                }`}
              >
                All
              </button>
              <button
                onClick={() => setTypeFilter("SINGLE")}
                className={`px-2.5 py-0.5 rounded text-[11px] font-medium transition-all ${
                  typeFilter === "SINGLE" ? "bg-cyan-500/20 text-cyan-700 dark:text-cyan-400 font-semibold" : "text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
                }`}
              >
                Single ({summary.singleItemsCount || 0})
              </button>
              <button
                onClick={() => setTypeFilter("COMBO")}
                className={`px-2.5 py-0.5 rounded text-[11px] font-medium transition-all ${
                  typeFilter === "COMBO" ? "bg-purple-500/20 text-purple-700 dark:text-purple-300 font-semibold" : "text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
                }`}
              >
                Combos ({summary.combosCount || 0})
              </button>
            </div>
          </div>
        )}
      </div>

      {/* 4. TAB 1: Stock Master Table */}
      {activeTab === "stock" && (
        <div className="glass-panel overflow-hidden">
          {loading ? (
            <TableSkeleton rows={8} cols={8} />
          ) : (
            <>
              {/* Desktop Stock Master Table (>= 768px) */}
              <div className="hidden md:block overflow-x-auto animate-fade-in">
                <table className="w-full text-left text-sm border-collapse">
                <thead>
                  <tr className="border-b border-[var(--border)] bg-[var(--bg-secondary)]/80 text-[var(--text-secondary)] text-xs font-semibold uppercase tracking-wider">
                    <th className="py-3.5 px-4 w-24">Type</th>
                    <th className="py-3.5 px-4 w-56">SKU Code</th>
                    <th className="py-3.5 px-4 min-w-[260px]">Item Description &amp; Recipe</th>
                    <th className="py-3.5 px-4 w-40">Saleable Stock</th>
                    <th className="py-3.5 px-4 w-32">Damaged Stock</th>
                    <th className="py-3.5 px-4 w-28">Selling Price</th>
                    <th className="py-3.5 px-4 w-36">Unit Cost (Without Profit)</th>
                    <th className="py-3.5 px-4 w-28">Valuation</th>
                    <th className="py-3.5 px-4 text-right w-44">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[var(--border)]">
                  {filteredStockItems.length === 0 ? (
                    <tr>
                      <td colSpan={9} className="text-center py-12 text-[var(--text-muted)] text-sm">
                        No items match the selected filter.
                      </td>
                    </tr>
                  ) : (
                    filteredStockItems.map((item: any) => {
                  const isCombo = item.type === "COMBO";
                  const isLowStock = !isCombo && item.currentStock <= item.reorderLevel;

                  return (
                    <tr key={item.id} className="hover:bg-[var(--surface-hover)]/20 transition-colors">
                      {/* 1. Type Badge */}
                      <td className="py-3.5 px-4 align-middle">
                        {isCombo ? (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-bold bg-purple-500/10 text-purple-700 dark:text-purple-300 border border-purple-500/20">
                            COMBO
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-bold bg-cyan-500/10 text-cyan-700 dark:text-cyan-400 border border-cyan-500/20">
                            SINGLE
                          </span>
                        )}
                      </td>

                      {/* 2. SKU Code */}
                      <td className="py-3.5 px-4 align-middle font-mono">
                        <div className="flex items-center gap-1.5">
                          <span className="font-bold text-[var(--text-primary)] select-all">{item.sku}</span>
                          <button
                            onClick={() => handleCopySku(item.sku)}
                            className="p-1 text-[var(--text-muted)] hover:text-[var(--text-secondary)] transition-colors"
                            title="Copy SKU"
                          >
                            {copiedSku === item.sku ? (
                              <Check size={12} className="text-emerald-600 dark:text-emerald-400" />
                            ) : (
                              <Copy size={12} />
                            )}
                          </button>
                        </div>
                      </td>

                      {/* 3. Description & Recipe Breakdown */}
                      <td className="py-3.5 px-4 align-middle">
                        <div className="space-y-1">
                          <p className="text-[var(--text-primary)] font-medium leading-snug">{item.name}</p>
                          {isCombo && item.comboComponents && item.comboComponents.length > 0 ? (
                            <div className="flex items-center gap-1.5 flex-wrap pt-0.5">
                              <span className="text-[10px] text-[var(--text-muted)] font-medium">BOM:</span>
                              {item.comboComponents.map((c: any, i: number) => (
                                <span
                                  key={i}
                                  className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-purple-500/10 text-purple-700 dark:text-purple-300 border border-purple-500/30"
                                >
                                  {c.componentSku} <span className="text-[var(--text-muted)] font-sans">×{c.quantity}</span>
                                </span>
                              ))}
                            </div>
                          ) : null}
                        </div>
                      </td>

                      {/* 4. Saleable Stock / Derived Availability */}
                      <td className="py-3.5 px-4 align-middle">
                        {isCombo ? (
                          <div className="space-y-0.5">
                            <span
                              className={`inline-flex items-center px-2 py-0.5 rounded text-[11px] font-semibold font-mono ${
                                item.derivedStock > 0
                                  ? "bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 border border-emerald-500/20"
                                  : "bg-[var(--surface-hover)] text-[var(--text-secondary)] border border-[var(--border)]/60"
                              }`}
                            >
                              {item.derivedStock} Available
                            </span>
                            <p className="text-[10px] text-[var(--text-muted)] font-sans">Derived from parts</p>
                          </div>
                        ) : (
                          <div className="space-y-0.5">
                            <span
                              className={`font-mono text-xs font-bold ${
                                isLowStock ? "text-amber-600 dark:text-amber-400" : "text-[var(--text-primary)]"
                              }`}
                            >
                              {item.currentStock} {item.unit || "pcs"}
                            </span>
                            <p className="text-[10px] text-[var(--text-muted)] font-sans">Saleable on hand</p>
                          </div>
                        )}
                      </td>

                      {/* 5. Damaged Stock Bucket */}
                      <td className="py-3.5 px-4 align-middle">
                        {isCombo ? (
                          <span className="text-[var(--text-muted)] font-mono text-xs">—</span>
                        ) : (
                          <div className="flex items-center gap-1.5">
                            <span
                              className={`font-mono text-xs font-semibold ${
                                (item.damagedStock || 0) > 0 ? "text-rose-700 dark:text-rose-400 font-bold" : "text-[var(--text-muted)]"
                              }`}
                            >
                              {item.damagedStock || 0} {item.unit || "pcs"}
                            </span>
                            {(item.damagedStock || 0) > 0 && (
                              <button
                                onClick={() => handleOpenDamageRestore(item)}
                                className="p-1 rounded bg-rose-500/10 hover:bg-rose-500/20 text-rose-700 dark:text-rose-300 border border-rose-500/30 text-[10px]"
                                title="Restore repaired item to saleable stock"
                              >
                                <RotateCcw size={10} />
                              </button>
                            )}
                          </div>
                        )}
                      </td>

                      {/* 6. Selling Price */}
                      <td className="py-3.5 px-4 align-middle font-mono font-semibold text-[var(--text-primary)]">
                        ₹{(item.sellingPrice || item.avgUnitCost || 0)?.toFixed(2)}
                        {isCombo && <span className="text-[10px] text-[var(--text-muted)] block font-sans">sum of parts</span>}
                      </td>

                      {/* 7. Unit Cost Without Profit */}
                      <td className="py-3.5 px-4 align-middle font-mono text-emerald-700 dark:text-emerald-400 font-bold">
                        ₹{(item.unitCostWithoutProfit || item.costPrice || (isCombo ? item.derivedUnitCost : item.avgUnitCost) || 0)?.toFixed(2)}
                        {isCombo && <span className="text-[10px] text-[var(--text-muted)] block font-sans">sum of parts</span>}
                      </td>

                      {/* 8. Valuation */}
                      <td className="py-3.5 px-4 align-middle font-mono font-semibold text-[var(--text-primary)]">
                        {isCombo ? (
                          <span className="text-[var(--text-muted)] font-normal">—</span>
                        ) : (
                          `₹${(item.currentStock * (item.unitCostWithoutProfit || item.costPrice || item.avgUnitCost || 0)).toFixed(2)}`
                        )}
                      </td>

                      {/* 8. Actions */}
                      <td className="py-3.5 px-4 align-middle text-right">
                        <div className="flex items-center justify-end gap-1.5">
                          {isCombo ? (
                            <button
                              onClick={() => handleOpenEditItem(item)}
                              className="px-2.5 py-1 rounded bg-purple-500/10 hover:bg-purple-500/20 text-purple-700 dark:text-purple-300 border border-purple-500/30 text-xs font-semibold flex items-center gap-1 transition-colors"
                              title="Configure Combo Recipe"
                            >
                              <Puzzle size={12} /> Recipe
                            </button>
                          ) : (
                            <>
                              <button
                                onClick={() => handleOpenGrn(item.sku, item.avgUnitCost)}
                                className="px-2.5 py-1 rounded bg-cyan-500/10 hover:bg-cyan-500/20 text-cyan-700 dark:text-cyan-400 border border-cyan-500/30 text-xs font-semibold flex items-center gap-1 transition-colors"
                                title="Receive stock via GRN"
                              >
                                <PlusCircle size={12} /> GRN
                              </button>

                              <button
                                onClick={() => handleOpenAdjust(item.sku, item.avgUnitCost)}
                                className="px-2 py-1 rounded bg-[var(--surface-hover)] hover:bg-[var(--border)] text-[var(--text-primary)] border border-[var(--border)]/80 text-xs font-medium transition-colors"
                                title="Audit stock count"
                              >
                                Adjust
                              </button>

                              <button
                                onClick={() => handleOpenEditItem(item)}
                                className="p-1 rounded bg-[var(--surface-hover)] hover:bg-[var(--border)] text-[var(--text-primary)] border border-[var(--border)]/80 transition-colors"
                                title="Edit single item"
                              >
                                <Edit2 size={12} />
                              </button>
                            </>
                          )}

                          <button
                            onClick={() => handleDeleteItem(item.sku, item.id)}
                            className="px-2 py-1 rounded bg-[var(--surface-hover)] hover:bg-red-500/20 text-[var(--text-secondary)] hover:text-red-600 dark:hover:text-red-400 border border-[var(--border)]/80 text-xs font-medium transition-colors flex items-center gap-1 cursor-pointer"
                            title="Delete Product from Physical Inventory"
                          >
                            <Trash2 size={12} className="text-red-500" />
                            <span>Delete</span>
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>

        {/* Mobile Android Inventory Cards View (< 768px) */}
        <div className="block md:hidden divide-y divide-slate-800/70 animate-fade-in">
          {filteredStockItems.length === 0 ? (
            <div className="text-center py-12 text-[var(--text-muted)] text-sm p-4">
              No items match the selected filter.
            </div>
          ) : (
            filteredStockItems.map((item: any) => {
              const isCombo = item.type === "COMBO";
              const valuation = !isCombo
                ? `₹${(item.currentStock * (item.avgUnitCost || 0)).toFixed(2)} valuation`
                : "Derived component valuation";

              return (
                <div key={item.id} className="p-4 space-y-3 hover:bg-[var(--surface-hover)]/30 transition-colors">
                  {/* Top Row: SKU + Type Badge */}
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <span className="font-mono font-black text-sm text-[var(--text-primary)] select-all">
                        {item.sku}
                      </span>
                      <button
                        onClick={() => handleCopySku(item.sku)}
                        className="p-1 text-[var(--text-muted)] hover:text-[var(--text-secondary)] transition-colors"
                        title="Copy SKU"
                      >
                        {copiedSku === item.sku ? (
                          <Check size={13} className="text-emerald-600 dark:text-emerald-400" />
                        ) : (
                          <Copy size={13} />
                        )}
                      </button>
                    </div>

                    {isCombo ? (
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-purple-500/15 text-purple-700 dark:text-purple-300 border border-purple-500/30">
                        COMBO
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-cyan-500/15 text-cyan-700 dark:text-cyan-400 border border-cyan-500/30">
                        SINGLE
                      </span>
                    )}
                  </div>

                  {/* Product Name */}
                  <div>
                    <p className="text-sm font-semibold text-[var(--text-primary)] leading-snug">
                      {item.name}
                    </p>
                    {isCombo && item.comboComponents && item.comboComponents.length > 0 && (
                      <div className="flex items-center gap-1.5 flex-wrap pt-1">
                        <span className="text-[10px] text-[var(--text-muted)] font-medium">BOM:</span>
                        {item.comboComponents.map((c: any, i: number) => (
                          <span
                            key={i}
                            className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-purple-500/10 text-purple-700 dark:text-purple-300 border border-purple-500/30"
                          >
                            {c.componentSku} ×{c.quantity}
                          </span>
                        ))}
                      </div>
                    )}
                  </div>

                  {/* Stock & Damaged Row */}
                  <div className="grid grid-cols-2 gap-3 p-2.5 rounded-xl bg-[var(--surface)] border border-[var(--border)]">
                    <div>
                      <span className="text-[10px] font-bold text-[var(--text-secondary)] uppercase tracking-wider block">
                        Saleable Stock
                      </span>
                      <span
                        className={`text-base font-black font-mono ${
                          item.currentStock < 0 ? "text-rose-700 dark:text-rose-400" : "text-emerald-700 dark:text-emerald-400"
                        }`}
                      >
                        {item.currentStock}{" "}
                        <span className="text-xs font-normal text-[var(--text-secondary)]">pcs</span>
                      </span>
                    </div>
                    <div>
                      <span className="text-[10px] font-bold text-[var(--text-secondary)] uppercase tracking-wider block">
                        Damaged
                      </span>
                      <span className="text-base font-black font-mono text-rose-700 dark:text-rose-400">
                        {item.damagedStock || 0}{" "}
                        <span className="text-xs font-normal text-[var(--text-secondary)]">pcs</span>
                      </span>
                    </div>
                  </div>

                  {/* Valuation & Prices */}
                  <div className="flex items-center justify-between text-xs text-[var(--text-secondary)] font-mono">
                    <span>{valuation}</span>
                    {!isCombo && (
                      <span className="text-[11px] text-[var(--text-secondary)]">
                        Sell: ₹{(item.sellingPrice || item.avgUnitCost || 0)?.toFixed(0)} | Cost: ₹{(item.unitCostWithoutProfit || item.costPrice || 0)?.toFixed(0)}
                      </span>
                    )}
                  </div>

                  {/* Touch-Friendly Action Buttons (min 44px) */}
                  <div className="flex items-center gap-2 pt-1">
                    {isCombo ? (
                      <button
                        onClick={() => handleOpenEditItem(item)}
                        className="flex-1 py-2.5 rounded-xl bg-purple-600/20 hover:bg-purple-600/30 text-purple-700 dark:text-purple-300 border border-purple-500/30 text-xs font-bold transition-all min-h-[44px] touch-press flex items-center justify-center gap-1.5"
                      >
                        <Puzzle size={14} />
                        <span>Configure Recipe</span>
                      </button>
                    ) : (
                      <>
                        <button
                          onClick={() => handleOpenAdjust(item.sku, item.avgUnitCost)}
                          className="flex-1 py-2.5 rounded-xl bg-[var(--surface-hover)] hover:bg-[var(--border)] text-[var(--text-primary)] border border-[var(--border)]/80 text-xs font-semibold transition-all min-h-[44px] touch-press flex items-center justify-center gap-1"
                        >
                          <span>Adjust</span>
                        </button>

                        <button
                          onClick={() => handleOpenGrn(item.sku, item.avgUnitCost)}
                          className="flex-1 py-2.5 rounded-xl bg-cyan-500/20 hover:bg-cyan-500/30 text-cyan-700 dark:text-cyan-300 border border-cyan-500/40 text-xs font-bold transition-all min-h-[44px] touch-press flex items-center justify-center gap-1"
                        >
                          <PlusCircle size={14} />
                          <span>GRN</span>
                        </button>

                        <button
                          onClick={() => handleOpenEditItem(item)}
                          className="p-2.5 rounded-xl text-[var(--text-secondary)] hover:text-[var(--text-primary)] active:bg-[var(--surface-hover)] min-w-[44px] min-h-[44px] flex items-center justify-center border border-[var(--border)] touch-press"
                          title="Edit item"
                        >
                          <Edit2 size={14} />
                        </button>
                      </>
                    )}
                  </div>
                </div>
              );
            })
          )}
        </div>
      </>
    )}
  </div>
)}

      {/* 5. TAB 2: Ledger History */}
      {activeTab === "ledger" && (
        <div className="bg-[var(--surface)] border border-[var(--border)]/80 rounded-xl overflow-hidden shadow-sm">
          <table className="w-full text-left text-xs border-collapse">
            <thead>
              <tr className="border-b border-[var(--border)]/80 bg-[var(--surface)] text-[var(--text-secondary)] text-[11px] font-semibold">
                <th className="py-3 px-4">Timestamp</th>
                <th className="py-3 px-4">Stock SKU</th>
                <th className="py-3 px-4">Bucket</th>
                <th className="py-3 px-4">Event Type</th>
                <th className="py-3 px-4">Change</th>
                <th className="py-3 px-4">Unit Cost</th>
                <th className="py-3 px-4">Balance</th>
                <th className="py-3 px-4">Reference</th>
                <th className="py-3 px-4">Notes</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/40">
              {recentLedger.length === 0 ? (
                <tr>
                  <td colSpan={9} className="text-center py-12 text-[var(--text-muted)]">
                    No ledger transactions recorded yet.
                  </td>
                </tr>
              ) : (
                recentLedger.map((entry: any) => {
                  const isPositive = entry.quantity > 0;
                  return (
                    <tr key={entry.id} className="hover:bg-[var(--surface-hover)]/20 transition-colors">
                      <td className="py-3 px-4 text-[var(--text-secondary)] font-mono">{formatDate(entry.createdAt)}</td>
                      <td className="py-3 px-4 font-mono font-bold text-[var(--text-primary)] select-all">{entry.sku}</td>
                      <td className="py-3 px-4">
                        <span
                          className={`px-1.5 py-0.2 rounded text-[10px] font-bold ${
                            entry.inventoryBucket === "DAMAGED"
                              ? "bg-rose-500/15 text-rose-700 dark:text-rose-300 border border-rose-500/30"
                              : "bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 border border-emerald-500/20"
                          }`}
                        >
                          {entry.inventoryBucket || "SALEABLE"}
                        </span>
                      </td>
                      <td className="py-3 px-4">
                        <span
                          className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                            entry.type === "GRN_PURCHASE" || entry.type === "RTO_RETURN"
                              ? "bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 border border-emerald-500/20"
                              : entry.type === "SHOPIFY_FULFILLMENT_REVERSAL"
                              ? "bg-teal-500/10 text-teal-700 dark:text-teal-400 border border-teal-500/20"
                              : entry.type === "SALE_FULFILLMENT" || entry.type === "SHOPIFY_DEDUCTION"
                              ? "bg-sky-500/10 text-sky-700 dark:text-sky-300 border border-sky-500/20"
                              : entry.type === "RTO_DAMAGE"
                              ? "bg-rose-500/15 text-rose-700 dark:text-rose-300 border border-rose-500/30"
                              : entry.type === "DAMAGE_TO_SALEABLE"
                              ? "bg-purple-500/15 text-purple-700 dark:text-purple-300 border border-purple-500/30"
                              : "bg-[var(--surface-hover)] text-[var(--text-secondary)] border border-[var(--border)]"
                          }`}
                        >
                          {entry.type}
                        </span>
                      </td>
                      <td className="py-3 px-4 font-mono font-bold">
                        <span className={isPositive ? "text-emerald-700 dark:text-emerald-400" : "text-rose-700 dark:text-rose-400"}>
                          {isPositive ? `+${entry.quantity}` : entry.quantity}
                        </span>
                      </td>
                      <td className="py-3 px-4 font-mono text-[var(--text-secondary)]">₹{entry.unitCost?.toFixed(2)}</td>
                      <td className="py-3 px-4 font-mono font-bold text-[var(--text-primary)]">{entry.balanceAfter}</td>
                      <td className="py-3 px-4 font-mono text-[var(--text-secondary)]">
                        {entry.referenceId ? `${entry.referenceType || ""}: #${entry.referenceId}` : entry.referenceType || "—"}
                      </td>
                      <td className="py-3 px-4 text-[var(--text-secondary)]">{entry.notes || "—"}</td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      )}

      {/* 6. TAB 3: Shopify Catalog Resolution */}
      {activeTab === "mapping" && (
        <div className="bg-[var(--surface)] border border-[var(--border)]/80 rounded-xl overflow-hidden shadow-sm">
          <table className="w-full text-left text-xs border-collapse">
            <thead>
              <tr className="border-b border-[var(--border)]/80 bg-[var(--surface)] text-[var(--text-secondary)] text-[11px] font-semibold">
                <th className="py-3 px-4">Product Title</th>
                <th className="py-3 px-4">Variant Title</th>
                <th className="py-3 px-4">Shopify SKU</th>
                <th className="py-3 px-4">Inventory Type</th>
                <th className="py-3 px-4">BOM Breakdown</th>
                <th className="py-3 px-4">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[var(--border)]">
              {mappedVariants.length === 0 ? (
                <tr>
                  <td colSpan={6} className="text-center py-12 text-[var(--text-muted)]">
                    No Shopify variants synced. Click <strong>Fetch SKUs</strong>.
                  </td>
                </tr>
              ) : (
                mappedVariants.map((v: any, idx: number) => (
                  <tr key={idx} className="hover:bg-[var(--surface-hover)]/20 transition-colors">
                    <td className="py-3 px-4 font-medium text-[var(--text-primary)]">{v.productTitle}</td>
                    <td className="py-3 px-4 text-[var(--text-secondary)]">{v.variantTitle}</td>
                    <td className="py-3 px-4 font-mono font-bold text-[var(--text-primary)] select-all">{v.sku}</td>
                    <td className="py-3 px-4">
                      {v.isCombo ? (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-bold bg-purple-500/10 text-purple-700 dark:text-purple-300 border border-purple-500/20">
                          COMBO
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-bold bg-cyan-500/10 text-cyan-700 dark:text-cyan-400 border border-cyan-500/20">
                          SINGLE
                        </span>
                      )}
                    </td>
                    <td className="py-3 px-4">
                      <div className="flex items-center gap-1 flex-wrap">
                        {v.components && v.components.length > 0 ? (
                          v.components.map((c: string, ci: number) => (
                            <span key={ci} className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-[var(--surface-hover)] text-[var(--text-primary)] border border-[var(--border)]">
                              {c}
                            </span>
                          ))
                        ) : (
                          <span className="text-[10px] text-[var(--text-muted)]">Single item</span>
                        )}
                      </div>
                    </td>
                    <td className="py-3 px-4">
                      {v.isMapped ? (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-semibold bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 border border-emerald-500/20">
                          <CheckCircle2 size={11} /> Mapped
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-semibold bg-rose-500/10 text-rose-700 dark:text-rose-400 border border-rose-500/20">
                          Unmapped
                        </span>
                      )}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      )}

      {/* MODAL 1: Single SKU Form */}
      {showItemModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4 backdrop-blur-sm">
          <div className="w-full max-w-md p-5 space-y-4 border border-[var(--border)] bg-[var(--surface)] rounded-xl shadow-2xl">
            <div className="flex justify-between items-center border-b border-[var(--border)] pb-3">
              <h3 className="font-bold text-[var(--text-primary)] text-base flex items-center gap-2">
                <Boxes size={18} className="text-cyan-400" />
                <span>{editingItem ? "Edit Single Stock Item" : "Create Single Stock Item"}</span>
              </h3>
              <button onClick={() => setShowItemModal(false)} className="text-[var(--text-secondary)] hover:text-[var(--text-primary)] text-sm cursor-pointer">
                ✕
              </button>
            </div>

            <form onSubmit={handleSaveSingleItem} className="space-y-3 text-xs">
              <div>
                <label className="text-[var(--text-secondary)] font-semibold block mb-1">
                  SKU Code * <span className="text-[10px] text-[var(--text-secondary)]">(e.g. ABC, XYZ, PROD1)</span>
                </label>
                <input
                  type="text"
                  required
                  disabled={!!editingItem}
                  placeholder="e.g. ABC"
                  value={itemForm.sku}
                  onChange={(e) => setItemForm({ ...itemForm, sku: e.target.value.toUpperCase() })}
                  className="w-full bg-[var(--surface)] border border-[var(--border)] rounded-lg px-3 py-2 text-[var(--text-primary)] font-mono uppercase font-bold focus:border-[var(--accent)] focus:outline-none"
                />
              </div>

              <div>
                <label className="text-[var(--text-secondary)] font-semibold block mb-1">Item Description / Name *</label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Foam Sprayer Bottle"
                  value={itemForm.name}
                  onChange={(e) => setItemForm({ ...itemForm, name: e.target.value })}
                  className="w-full bg-[var(--surface)] border border-[var(--border)] rounded-lg px-3 py-2 text-[var(--text-primary)] focus:border-[var(--accent)] focus:outline-none"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-[var(--text-secondary)] font-semibold block mb-1">Saleable Stock</label>
                  <input
                    type="number"
                    min="0"
                    value={itemForm.currentStock}
                    onChange={(e) => setItemForm({ ...itemForm, currentStock: parseFloat(e.target.value) || 0 })}
                    className="w-full bg-[var(--surface)] border border-[var(--border)] rounded-lg px-3 py-2 text-[var(--text-primary)] font-mono font-bold focus:border-[var(--accent)] focus:outline-none"
                  />
                </div>

                <div>
                  <label className="text-[var(--text-secondary)] font-semibold block mb-1">Damaged Stock</label>
                  <input
                    type="number"
                    min="0"
                    value={itemForm.damagedStock}
                    onChange={(e) => setItemForm({ ...itemForm, damagedStock: parseFloat(e.target.value) || 0 })}
                    className="w-full bg-[var(--surface)] border border-[var(--border)] rounded-lg px-3 py-2 text-rose-600 dark:text-rose-400 font-mono font-bold focus:border-rose-500 focus:outline-none"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-[var(--text-secondary)] font-semibold block mb-1">Selling Price (₹)</label>
                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    placeholder="e.g. 799"
                    value={itemForm.sellingPrice}
                    onChange={(e) => setItemForm({ ...itemForm, sellingPrice: parseFloat(e.target.value) || 0 })}
                    className="w-full bg-[var(--surface)] border border-[var(--border)] rounded-lg px-3 py-2 text-[var(--text-primary)] font-mono font-bold focus:border-[var(--accent)] focus:outline-none"
                  />
                </div>

                <div>
                  <label className="text-[var(--text-secondary)] font-semibold block mb-1">Unit Cost (w/o Profit) (₹)</label>
                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    placeholder="e.g. 250"
                    value={itemForm.costPrice}
                    onChange={(e) => {
                      const val = parseFloat(e.target.value) || 0;
                      setItemForm({ ...itemForm, costPrice: val, avgUnitCost: val });
                    }}
                    className="w-full bg-[var(--surface)] border border-[var(--border)] rounded-lg px-3 py-2 text-emerald-600 dark:text-emerald-400 font-mono font-bold focus:border-[var(--accent)] focus:outline-none"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-[var(--text-secondary)] font-semibold block mb-1">Reorder Level</label>
                  <input
                    type="number"
                    min="0"
                    value={itemForm.reorderLevel}
                    onChange={(e) => setItemForm({ ...itemForm, reorderLevel: parseFloat(e.target.value) || 0 })}
                    className="w-full bg-[var(--surface)] border border-[var(--border)] rounded-lg px-3 py-2 text-[var(--text-primary)] font-mono"
                  />
                </div>

                <div>
                  <label className="text-[var(--text-secondary)] font-semibold block mb-1">Min Stock Level</label>
                  <input
                    type="number"
                    min="0"
                    value={itemForm.minStockLevel}
                    onChange={(e) => setItemForm({ ...itemForm, minStockLevel: parseFloat(e.target.value) || 0 })}
                    className="w-full bg-[var(--surface)] border border-[var(--border)] rounded-lg px-3 py-2 text-[var(--text-primary)] font-mono"
                  />
                </div>
              </div>

              <div className="flex justify-between items-center pt-3 border-t border-[var(--border)]">
                {editingItem ? (
                  <button
                    type="button"
                    onClick={async () => {
                      setShowItemModal(false);
                      await handleDeleteItem(itemForm.sku, editingItem?.id);
                    }}
                    className="px-3 py-1.5 rounded-lg bg-red-500/10 hover:bg-red-500/20 text-red-400 border border-red-500/30 text-xs font-semibold flex items-center gap-1.5 transition-colors cursor-pointer"
                  >
                    <Trash2 size={13} />
                    <span>Delete Product</span>
                  </button>
                ) : <div />}
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => setShowItemModal(false)}
                    className="px-3.5 py-1.5 rounded-lg bg-[var(--surface-hover)] hover:bg-slate-700 text-[var(--text-secondary)] text-xs font-semibold cursor-pointer"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    className="px-3.5 py-1.5 rounded-lg bg-cyan-500 hover:bg-cyan-400 text-slate-950 text-xs font-bold cursor-pointer"
                  >
                    {editingItem ? "Update SKU" : "Save Single SKU"}
                  </button>
                </div>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL 2: Combo Recipe Builder */}
      {showComboModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4 backdrop-blur-sm">
          <div className="w-full max-w-lg p-5 space-y-4 border border-purple-500/40 bg-[var(--surface)] rounded-xl shadow-2xl">
            <div className="flex justify-between items-center border-b border-[var(--border)] pb-3">
              <div>
                <h3 className="font-bold text-[var(--text-primary)] text-base flex items-center gap-2">
                  <Puzzle size={18} className="text-purple-400" />
                  <span>Configure Combo SKU Recipe</span>
                </h3>
                <p className="text-[11px] text-[var(--text-secondary)]">
                  Combos do not hold physical stock. When sold, single components are deducted.
                </p>
              </div>
              <button onClick={() => setShowComboModal(false)} className="text-[var(--text-secondary)] hover:text-[var(--text-primary)] text-sm cursor-pointer">
                ✕
              </button>
            </div>

            <form onSubmit={handleSaveCombo} className="space-y-3 text-xs">
              <div>
                <label className="text-[var(--text-secondary)] font-semibold block mb-1">
                  Combo SKU Code * <span className="text-[10px] text-[var(--text-secondary)]">(e.g. ABC-XYZ, PROD1-PROD2)</span>
                </label>
                <input
                  type="text"
                  required
                  placeholder="e.g. ABC-XYZ or PROD1-PROD2"
                  value={comboForm.sku}
                  onChange={(e) => setComboForm({ ...comboForm, sku: e.target.value.toUpperCase() })}
                  className="w-full bg-[var(--surface)] border border-[var(--border)] rounded-lg px-3 py-2 text-purple-600 dark:text-purple-400 font-mono uppercase font-bold focus:border-purple-500 focus:outline-none"
                />
              </div>

              <div>
                <label className="text-[var(--text-secondary)] font-semibold block mb-1">Combo Bundle Name *</label>
                <input
                  type="text"
                  required
                  placeholder="e.g. 3 in 1 Car Wash Kit"
                  value={comboForm.name}
                  onChange={(e) => setComboForm({ ...comboForm, name: e.target.value })}
                  className="w-full bg-[var(--surface)] border border-[var(--border)] rounded-lg px-3 py-2 text-[var(--text-primary)] focus:border-purple-500 focus:outline-none"
                />
              </div>

              {/* Recipe Components */}
              <div className="space-y-2 pt-2 border-t border-[var(--border)]">
                <div className="flex justify-between items-center">
                  <span className="font-bold text-[var(--text-primary)] flex items-center gap-1.5">
                    <Layers size={13} className="text-cyan-400" /> Component Single SKUs &amp; Multipliers:
                  </span>
                  <button
                    type="button"
                    onClick={() =>
                      setComboForm({
                        ...comboForm,
                        components: [...comboForm.components, { componentSku: "", quantity: 1 }],
                      })
                    }
                    className="text-xs text-cyan-400 hover:text-cyan-300 font-semibold flex items-center gap-1 cursor-pointer"
                  >
                    <Plus size={13} /> Add Component
                  </button>
                </div>

                <div className="space-y-2 max-h-56 overflow-y-auto pr-1">
                  {comboForm.components.map((comp, idx) => (
                    <div
                      key={idx}
                      className="grid grid-cols-12 gap-2 bg-[var(--surface)] p-2.5 rounded-lg border border-[var(--border)] items-end"
                    >
                      <div className="col-span-7">
                        <label className="text-[10px] text-[var(--text-secondary)] block mb-0.5">Component Single SKU</label>
                        <select
                          value={comp.componentSku}
                          onChange={(e) => {
                            const next = [...comboForm.components];
                            next[idx].componentSku = e.target.value;
                            setComboForm({ ...comboForm, components: next });
                          }}
                          className="w-full bg-[var(--surface)] border border-[var(--border)] rounded px-2 py-1 text-[var(--text-primary)] font-mono text-xs focus:outline-none"
                        >
                          <option value="">-- Select Single SKU --</option>
                          {allSingleItems.map((s: any) => (
                            <option key={s.id} value={s.sku}>
                              {s.sku} ({s.name}) — Saleable: {s.currentStock}
                            </option>
                          ))}
                        </select>
                      </div>

                      <div className="col-span-3">
                        <label className="text-[10px] text-[var(--text-secondary)] block mb-0.5">Qty / Combo</label>
                        <input
                          type="number"
                          min="1"
                          value={comp.quantity}
                          onChange={(e) => {
                            const next = [...comboForm.components];
                            next[idx].quantity = Math.max(1, parseInt(e.target.value, 10) || 1);
                            setComboForm({ ...comboForm, components: next });
                          }}
                          className="w-full bg-[var(--surface)] border border-[var(--border)] rounded px-2 py-1 text-[var(--text-primary)] font-mono font-bold text-xs"
                        />
                      </div>

                      <div className="col-span-2 flex justify-end">
                        <button
                          type="button"
                          onClick={() => {
                            const next = comboForm.components.filter((_, i) => i !== idx);
                            setComboForm({ ...comboForm, components: next });
                          }}
                          className="p-1 rounded text-[var(--text-muted)] hover:text-red-400"
                          title="Remove component"
                        >
                          <Trash2 size={13} />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              <div className="flex justify-between items-center pt-3 border-t border-[var(--border)]">
                {editingItem ? (
                  <button
                    type="button"
                    onClick={async () => {
                      setShowComboModal(false);
                      await handleDeleteItem(comboForm.sku, editingItem?.id);
                    }}
                    className="px-3 py-1.5 rounded-lg bg-red-500/10 hover:bg-red-500/20 text-red-400 border border-red-500/30 text-xs font-semibold flex items-center gap-1.5 transition-colors cursor-pointer"
                  >
                    <Trash2 size={13} />
                    <span>Delete Combo</span>
                  </button>
                ) : <div />}
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => setShowComboModal(false)}
                    className="px-3.5 py-1.5 rounded-lg bg-[var(--surface-hover)] hover:bg-slate-700 text-[var(--text-secondary)] text-xs font-semibold cursor-pointer"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    className="px-3.5 py-1.5 rounded-lg bg-purple-600 hover:bg-purple-500 text-white text-xs font-bold cursor-pointer"
                  >
                    Save Combo Recipe
                  </button>
                </div>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL 3: Quick GRN Modal */}
      {showGrnModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4 backdrop-blur-sm">
          <div className="w-full max-w-sm p-5 space-y-4 border border-cyan-500/40 bg-[var(--surface)] rounded-xl shadow-2xl">
            <div className="flex justify-between items-center border-b border-[var(--border)] pb-3">
              <h3 className="font-bold text-[var(--text-primary)] text-base flex items-center gap-2">
                <PlusCircle size={18} className="text-cyan-400" />
                <span>Quick GRN Stock Receipt</span>
              </h3>
              <button onClick={() => setShowGrnModal(false)} className="text-[var(--text-secondary)] hover:text-[var(--text-primary)] text-sm cursor-pointer">
                ✕
              </button>
            </div>

            <form onSubmit={handleSaveGrn} className="space-y-3 text-xs">
              <div>
                <label className="text-[var(--text-secondary)] font-semibold block mb-1">Single Stock SKU</label>
                <input
                  type="text"
                  disabled
                  value={grnForm.sku}
                  className="w-full bg-[var(--surface)] border border-[var(--border)] rounded-lg px-3 py-2 text-[var(--text-primary)] font-mono font-bold"
                />
              </div>

              <div>
                <label className="text-[var(--text-secondary)] font-semibold block mb-1">Quantity Received (+)</label>
                <input
                  type="number"
                  required
                  min="1"
                  value={grnForm.quantityChange}
                  onChange={(e) => setGrnForm({ ...grnForm, quantityChange: parseFloat(e.target.value) || 0 })}
                  className="w-full bg-[var(--surface)] border border-[var(--border)] rounded-lg px-3 py-2 text-[var(--text-primary)] font-mono font-bold text-sm focus:border-[var(--accent)] focus:outline-none"
                />
              </div>

              <div>
                <label className="text-[var(--text-secondary)] font-semibold block mb-1">Unit Cost (₹)</label>
                <input
                  type="number"
                  required
                  min="0"
                  step="0.01"
                  value={grnForm.unitCost}
                  onChange={(e) => setGrnForm({ ...grnForm, unitCost: parseFloat(e.target.value) || 0 })}
                  className="w-full bg-[var(--surface)] border border-[var(--border)] rounded-lg px-3 py-2 text-emerald-600 dark:text-emerald-400 font-mono font-bold focus:border-[var(--accent)] focus:outline-none"
                />
              </div>

              <div>
                <label className="text-[var(--text-secondary)] font-semibold block mb-1">Receipt Notes / Batch</label>
                <input
                  type="text"
                  value={grnForm.notes}
                  onChange={(e) => setGrnForm({ ...grnForm, notes: e.target.value })}
                  className="w-full bg-[var(--surface)] border border-[var(--border)] rounded-lg px-3 py-2 text-[var(--text-primary)]"
                />
              </div>

              <div className="flex justify-end gap-2 pt-3 border-t border-[var(--border)]">
                <button
                  type="button"
                  onClick={() => setShowGrnModal(false)}
                  className="px-3.5 py-1.5 rounded-lg bg-[var(--surface-hover)] hover:bg-slate-700 text-[var(--text-secondary)] text-xs font-semibold"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-3.5 py-1.5 rounded-lg bg-cyan-500 hover:bg-cyan-400 text-slate-950 text-xs font-bold"
                >
                  Add Stock
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL 4: Adjustment Modal */}
      {showAdjustModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4 backdrop-blur-sm">
          <div className="w-full max-w-sm p-5 space-y-4 border border-amber-500/40 bg-[var(--surface)] rounded-xl shadow-2xl">
            <div className="flex justify-between items-center border-b border-[var(--border)] pb-3">
              <h3 className="font-bold text-[var(--text-primary)] text-base flex items-center gap-2">
                <AlertTriangle size={18} className="text-amber-400" />
                <span>Manual Stock Adjustment</span>
              </h3>
              <button onClick={() => setShowAdjustModal(false)} className="text-[var(--text-secondary)] hover:text-[var(--text-primary)] text-sm cursor-pointer">
                ✕
              </button>
            </div>

            <form onSubmit={handleSaveAdjust} className="space-y-3 text-xs">
              <div>
                <label className="text-[var(--text-secondary)] font-semibold block mb-1">Single Stock SKU</label>
                <input
                  type="text"
                  disabled
                  value={adjustForm.sku}
                  className="w-full bg-[var(--surface)] border border-[var(--border)] rounded-lg px-3 py-2 text-[var(--text-primary)] font-mono font-bold"
                />
              </div>

              <div>
                <label className="text-[var(--text-secondary)] font-semibold block mb-1">Inventory Bucket</label>
                <select
                  value={adjustForm.bucket}
                  onChange={(e) => setAdjustForm({ ...adjustForm, bucket: e.target.value as any })}
                  className="w-full bg-[var(--surface)] border border-[var(--border)] rounded-lg px-3 py-2 text-[var(--text-primary)] focus:outline-none"
                >
                  <option value="SALEABLE">Saleable Physical Stock</option>
                  <option value="DAMAGED">Damaged Quarantine Stock</option>
                </select>
              </div>

              <div>
                <label className="text-[var(--text-secondary)] font-semibold block mb-1">Quantity Adjustment (+ or -)</label>
                <input
                  type="number"
                  required
                  value={adjustForm.quantityChange}
                  onChange={(e) => setAdjustForm({ ...adjustForm, quantityChange: parseFloat(e.target.value) || 0 })}
                  className="w-full bg-[var(--surface)] border border-[var(--border)] rounded-lg px-3 py-2 text-[var(--text-primary)] font-mono font-bold text-sm focus:border-amber-500 focus:outline-none"
                />
              </div>

              <div>
                <label className="text-[var(--text-secondary)] font-semibold block mb-1">Adjustment Reason</label>
                <select
                  value={adjustForm.reason}
                  onChange={(e) => setAdjustForm({ ...adjustForm, reason: e.target.value })}
                  className="w-full bg-[var(--surface)] border border-[var(--border)] rounded-lg px-3 py-2 text-[var(--text-primary)]"
                >
                  <option value="COUNT_CORRECTION">Count Correction / Audit</option>
                  <option value="DAMAGE_ADJUSTMENT">Damage Inspection</option>
                  <option value="DAMAGE">Damaged / Broken</option>
                  <option value="RETURN">Customer Return</option>
                  <option value="WRITE_OFF">Write-Off</option>
                </select>
              </div>

              <div>
                <label className="text-[var(--text-secondary)] font-semibold block mb-1">Notes</label>
                <input
                  type="text"
                  value={adjustForm.notes}
                  onChange={(e) => setAdjustForm({ ...adjustForm, notes: e.target.value })}
                  className="w-full bg-[var(--surface)] border border-[var(--border)] rounded-lg px-3 py-2 text-[var(--text-primary)]"
                />
              </div>

              <div className="flex justify-end gap-2 pt-3 border-t border-[var(--border)]">
                <button
                  type="button"
                  onClick={() => setShowAdjustModal(false)}
                  className="px-3.5 py-1.5 rounded-lg bg-[var(--surface-hover)] hover:bg-slate-700 text-[var(--text-secondary)] text-xs font-semibold"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-3.5 py-1.5 rounded-lg bg-amber-500 hover:bg-amber-400 text-slate-950 text-xs font-bold"
                >
                  Save Adjustment
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL 5: Move Damage to Saleable Modal */}
      {showDamageRestoreModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4 backdrop-blur-sm">
          <div className="w-full max-w-sm p-5 space-y-4 border border-rose-500/40 bg-[var(--surface)] rounded-xl shadow-2xl">
            <div className="flex justify-between items-center border-b border-[var(--border)] pb-3">
              <h3 className="font-bold text-[var(--text-primary)] text-base flex items-center gap-2">
                <RotateCcw size={18} className="text-rose-400" />
                <span>Restore Damaged Stock to Saleable</span>
              </h3>
              <button onClick={() => setShowDamageRestoreModal(false)} className="text-[var(--text-secondary)] hover:text-[var(--text-primary)] text-sm cursor-pointer">
                ✕
              </button>
            </div>

            <form onSubmit={handleSaveDamageRestore} className="space-y-3 text-xs">
              <div>
                <label className="text-[var(--text-secondary)] font-semibold block mb-1">Single Stock SKU</label>
                <input
                  type="text"
                  disabled
                  value={damageRestoreForm.sku}
                  className="w-full bg-[var(--surface)] border border-[var(--border)] rounded-lg px-3 py-2 text-[var(--text-primary)] font-mono font-bold"
                />
              </div>

              <div>
                <label className="text-[var(--text-secondary)] font-semibold block mb-1">
                  Quantity to Restore (Max: {damageRestoreForm.maxDamaged})
                </label>
                <input
                  type="number"
                  required
                  min="1"
                  max={damageRestoreForm.maxDamaged}
                  value={damageRestoreForm.quantity}
                  onChange={(e) => setDamageRestoreForm({ ...damageRestoreForm, quantity: Math.min(damageRestoreForm.maxDamaged, parseInt(e.target.value, 10) || 1) })}
                  className="w-full bg-[var(--surface)] border border-[var(--border)] rounded-lg px-3 py-2 text-[var(--text-primary)] font-mono font-bold text-sm focus:border-rose-500 focus:outline-none"
                />
              </div>

              <div>
                <label className="text-[var(--text-secondary)] font-semibold block mb-1">Inspection Notes</label>
                <input
                  type="text"
                  value={damageRestoreForm.notes}
                  onChange={(e) => setDamageRestoreForm({ ...damageRestoreForm, notes: e.target.value })}
                  className="w-full bg-[var(--surface)] border border-[var(--border)] rounded-lg px-3 py-2 text-[var(--text-primary)]"
                />
              </div>

              <div className="flex justify-end gap-2 pt-3 border-t border-[var(--border)]">
                <button
                  type="button"
                  onClick={() => setShowDamageRestoreModal(false)}
                  className="px-3.5 py-1.5 rounded-lg bg-[var(--surface-hover)] hover:bg-slate-700 text-[var(--text-secondary)] text-xs font-semibold"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-3.5 py-1.5 rounded-lg bg-rose-600 hover:bg-rose-500 text-white text-xs font-bold cursor-pointer"
                >
                  Confirm Restoral
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
