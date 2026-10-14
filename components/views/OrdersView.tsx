"use client";

import { useEffect, useState } from "react";
import {
  ShoppingCart,
  Search,
  Filter,
  Eye,
  X,
  Package,
  Calendar,
  CreditCard,
  Truck,
  Hash,
  Layers,
  ArrowRight,
  ExternalLink,
  Download,
  CheckSquare,
  Square,
  RefreshCw,
  Clock,
  Sparkles,
  ShieldCheck,
  AlertTriangle,
  CheckCircle2,
  XCircle,
  Trash2,
  RotateCcw,
  AlertOctagon,
  User,
  MapPin,
  Mail,
  Phone,
  Receipt,
  Printer,
  Building2,
  FileText,
  AlertCircle,
} from "lucide-react";
import { formatDate } from "@/lib/utils";
import { appFetch } from "@/lib/api";
import { CourierService } from "@/lib/services/CourierService";
import { OrderShipmentInfo } from "./OrderShipmentInfo";
import { TableSkeleton } from "@/components/LoadingSkeleton";
import { RouteGuard } from "@/components/auth/RouteGuard";
import { SearchInput } from "@/components/ui/Input";
import { Drawer, Select } from "@/components/ui";

import Link from "next/link";

// Helper to safely parse shipping address
function parseShippingAddress(raw: any) {
  if (!raw) return null;
  if (typeof raw === "object" && raw !== null) {
    return {
      name: raw.name || [raw.firstName, raw.lastName].filter(Boolean).join(" ") || null,
      address1: raw.address1 || null,
      address2: raw.address2 || null,
      city: raw.city || null,
      province: raw.province || raw.provinceCode || null,
      zip: raw.zip || null,
      country: raw.country || raw.countryCode || null,
      phone: raw.phone || null,
    };
  }
  if (typeof raw === "string") {
    try {
      const parsed = JSON.parse(raw);
      if (typeof parsed === "object" && parsed !== null) {
        return parseShippingAddress(parsed);
      }
    } catch (e) {}
    return { address1: raw };
  }
  return null;
}

export default function OrdersPage() {
  const [orders, setOrders] = useState<any[]>([]);
  const [total, setTotal] = useState(0);
  const [trashCount, setTrashCount] = useState(0);
  const [totalPages, setTotalPages] = useState(1);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [syncingFulfillments, setSyncingFulfillments] = useState(false);
  const [actionLoading, setActionLoading] = useState(false);

  // View mode: Active Orders vs Trash
  const [isTrashView, setIsTrashView] = useState(false);

  // Filters
  const [search, setSearch] = useState("");
  const [financialStatus, setFinancialStatus] = useState("ALL");
  const [fulfillmentStatus, setFulfillmentStatus] = useState("ALL");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [datePreset, setDatePreset] = useState("ALL");

  // Selection for bulk actions
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [selectedOrder, setSelectedOrder] = useState<any | null>(null);

  // Invoice Modal State
  const [invoiceOrder, setInvoiceOrder] = useState<any | null>(null);
  const [invoiceData, setInvoiceData] = useState<any | null>(null);
  const [invoiceLoading, setInvoiceLoading] = useState(false);
  const [invoiceError, setInvoiceError] = useState<string>("");

  useEffect(() => {
    if (invoiceOrder) {
      setInvoiceLoading(true);
      setInvoiceError("");
      appFetch(`/api/orders/${invoiceOrder.id}/invoice`)
        .then((res) => res.json())
        .then((data) => {
          if (data.success && data.invoice) {
            setInvoiceData(data.invoice);
          } else {
            setInvoiceData(null);
            setInvoiceError(data.error || "Failed to load invoice details.");
          }
        })
        .catch((err) => {
          console.error("Error fetching invoice:", err);
          setInvoiceError(err.message || "Failed to load invoice details.");
        })
        .finally(() => setInvoiceLoading(false));
    } else {
      setInvoiceData(null);
      setInvoiceError("");
    }
  }, [invoiceOrder]);

  const fetchOrders = async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({
        page: String(page),
        limit: "50",
        search,
        financial_status: financialStatus,
        fulfillment_status: fulfillmentStatus,
        startDate,
        endDate,
        trash: isTrashView ? "true" : "false",
      });
      const res = await appFetch(`/api/orders?${params.toString()}`);
      const json = await res.json();
      setOrders(json.orders || []);
      setTotal(json.total || 0);
      setTrashCount(json.trashCount || 0);
      setTotalPages(json.totalPages || 1);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchOrders();
  }, [page, financialStatus, fulfillmentStatus, startDate, endDate, isTrashView]);

  const handleSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setPage(1);
    fetchOrders();
  };

  const handleSyncAllOrders = async () => {
    setSyncing(true);
    try {
      await appFetch("/api/shopify/sync", {
        method: "POST",
        body: JSON.stringify({ type: "orders" }),
      });
      await fetchOrders();
    } catch (e) {
      console.error(e);
    } finally {
      setSyncing(false);
    }
  };

  const handleSyncFulfillments = async () => {
    setSyncingFulfillments(true);
    try {
      const res = await appFetch("/api/sync/fulfillments", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ fetchFromShopifyApi: true }),
      });
      const json = await res.json();
      if (json.success) {
        await fetchOrders();
      } else {
        alert(json.error || "Failed to sync couriers and tracking.");
      }
    } catch (e: any) {
      console.error(e);
      alert(e.message || "Failed to sync couriers and tracking.");
    } finally {
      setSyncingFulfillments(false);
    }
  };

  // Trash & Delete Handlers
  const handleOrderAction = async (
    target: string | string[],
    action: "TRASH" | "RESTORE" | "PERMANENT_DELETE" | "EMPTY_TRASH"
  ) => {
    if (action === "PERMANENT_DELETE" || action === "EMPTY_TRASH") {
      const confirmed = window.confirm(
        action === "EMPTY_TRASH"
          ? "Are you sure you want to permanently delete all items in Trash? This cannot be undone."
          : "Are you sure you want to permanently delete this order?"
      );
      if (!confirmed) return;
    }

    setActionLoading(true);
    try {
      const payload: any = { action };
      if (Array.isArray(target)) {
        payload.ids = target;
      } else if (target) {
        payload.id = target;
      }

      const res = await appFetch("/api/orders", {
        method: "DELETE",
        body: JSON.stringify(payload),
      });
      const json = await res.json();
      if (json.success) {
        setSelectedIds([]);
        if (selectedOrder && (action === "TRASH" || action === "PERMANENT_DELETE")) {
          setSelectedOrder(null);
        }
        await fetchOrders();
      } else {
        alert(json.error || "Action failed");
      }
    } catch (e: any) {
      alert(e.message);
    } finally {
      setActionLoading(false);
    }
  };

  // Date Preset Handlers
  const handlePreset = (preset: string) => {
    setDatePreset(preset);
    const now = new Date();
    const pad = (n: number) => String(n).padStart(2, "0");
    const fmt = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;

    if (preset === "TODAY") {
      const todayStr = fmt(now);
      setStartDate(todayStr);
      setEndDate(todayStr);
    } else if (preset === "YESTERDAY") {
      const y = new Date(now);
      y.setDate(y.getDate() - 1);
      const yStr = fmt(y);
      setStartDate(yStr);
      setEndDate(yStr);
    } else if (preset === "7DAYS") {
      const d = new Date(now);
      d.setDate(d.getDate() - 7);
      setStartDate(fmt(d));
      setEndDate(fmt(now));
    } else if (preset === "30DAYS") {
      const d = new Date(now);
      d.setDate(d.getDate() - 30);
      setStartDate(fmt(d));
      setEndDate(fmt(now));
    } else if (preset === "THIS_MONTH") {
      const start = new Date(now.getFullYear(), now.getMonth(), 1);
      setStartDate(fmt(start));
      setEndDate(fmt(now));
    } else {
      setStartDate("");
      setEndDate("");
    }
    setPage(1);
  };

  // Checkbox selection
  const handleToggleSelectAll = () => {
    if (selectedIds.length === orders.length && orders.length > 0) {
      setSelectedIds([]);
    } else {
      setSelectedIds(orders.map((o) => o.id));
    }
  };

  const handleToggleSelect = (id: string) => {
    setSelectedIds((prev) =>
      prev.includes(id) ? prev.filter((item) => item !== id) : [...prev, id]
    );
  };

  // Bulk CSV Export
  const handleDownloadCsv = (exportOnlySelected: boolean = false) => {
    const params = new URLSearchParams({
      export: "csv",
      search,
      financial_status: financialStatus,
      fulfillment_status: fulfillmentStatus,
      startDate,
      endDate,
    });

    if (exportOnlySelected && selectedIds.length > 0) {
      params.set("ids", selectedIds.join(","));
    }

    const downloadUrl = `/api/orders?${params.toString()}`;
    const link = document.createElement("a");
    link.href = downloadUrl;
    link.setAttribute("download", `shopify-orders-${new Date().toISOString().slice(0, 10)}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const getDaysLeftInTrash = (deletedAt: string | null) => {
    if (!deletedAt) return 30;
    const deletedTime = new Date(deletedAt).getTime();
    const expiryTime = deletedTime + 30 * 24 * 60 * 60 * 1000;
    const msLeft = expiryTime - Date.now();
    const daysLeft = Math.max(1, Math.ceil(msLeft / (24 * 60 * 60 * 1000)));
    return daysLeft;
  };

  const drawerParsedAddr = selectedOrder ? parseShippingAddress(selectedOrder.shippingAddress) : null;
  const drawerCustomerName =
    selectedOrder?.customerName ||
    drawerParsedAddr?.name ||
    (selectedOrder?.name && !selectedOrder.name.startsWith("#") ? selectedOrder.name : null) ||
    "Customer";

  return (
    <RouteGuard requiredPermission="orders.view" moduleName="Orders & Line Items">
      <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-2xl font-bold text-[var(--text-primary)] tracking-tight flex items-center gap-2">
            <ShoppingCart className="text-cyan-400" size={24} /> {isTrashView ? "Orders Trash (30 Days Retention)" : "Orders & Logistics Hub"}
          </h2>
          <p className="text-xs text-[var(--text-secondary)] mt-1">
            {isTrashView
              ? "Deleted orders are safely retained for 30 days before permanent removal. You can restore them anytime."
              : "Real synced Shopify customer orders with verbatim SKUs, Multi-Carrier tracking, ETD, and Outward / RTO Inward verification tags."}
          </p>
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          {/* Active View vs Trash Tab Switcher */}
          <div className="flex items-center p-1 bg-[var(--surface)] border border-[var(--border)] rounded-xl">
            <button
              onClick={() => { setIsTrashView(false); setPage(1); }}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${
                !isTrashView
                  ? "bg-cyan-500 text-slate-950 shadow-md shadow-cyan-500/20"
                  : "text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
              }`}
            >
              Active Orders ({!isTrashView ? total : ""})
            </button>
            <button
              onClick={() => { setIsTrashView(true); setPage(1); }}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${
                isTrashView
                  ? "bg-red-500 text-white shadow-md shadow-red-500/20"
                  : "text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
              }`}
            >
              <Trash2 size={13} />
              <span>Trash ({trashCount})</span>
            </button>
          </div>

          {!isTrashView ? (
            <>
              <button
                onClick={() => handleDownloadCsv(false)}
                className="flex items-center gap-1.5 px-3 py-2 rounded-lg bg-[var(--surface)] hover:bg-[var(--surface-hover)] text-[var(--text-primary)] border border-[var(--border)] text-xs font-semibold transition-all"
                title="Download all orders matching current filters"
              >
                <Download size={14} className="text-cyan-400" />
                <span>Export CSV</span>
              </button>

              <button
                onClick={handleSyncAllOrders}
                disabled={syncing || syncingFulfillments}
                className="flex items-center gap-1.5 px-3.5 py-2 rounded-lg bg-gradient-to-r from-emerald-500 to-teal-500 hover:from-emerald-400 hover:to-teal-400 text-slate-950 text-xs font-bold shadow-md shadow-emerald-500/20 transition-all cursor-pointer disabled:opacity-50"
              >
                <RefreshCw size={13} className={syncing ? "animate-spin" : ""} />
                <span>{syncing ? "Syncing Orders..." : "Sync All Orders"}</span>
              </button>

              <button
                onClick={handleSyncFulfillments}
                disabled={syncing || syncingFulfillments}
                className="flex items-center gap-1.5 px-3.5 py-2 rounded-lg bg-gradient-to-r from-indigo-600 to-violet-600 hover:from-indigo-500 hover:to-violet-500 text-white text-xs font-bold shadow-md shadow-indigo-600/20 transition-all cursor-pointer disabled:opacity-50"
                title="Fetch latest courier partners & tracking details from Shopify"
              >
                <Truck size={13} className={syncingFulfillments ? "animate-bounce" : ""} />
                <span>{syncingFulfillments ? "Syncing Couriers..." : "Sync Couriers"}</span>
              </button>
            </>
          ) : (
            trashCount > 0 && (
              <button
                onClick={() => handleOrderAction([], "EMPTY_TRASH")}
                disabled={actionLoading}
                className="flex items-center gap-1.5 px-3.5 py-2 rounded-lg bg-red-600 hover:bg-red-500 text-white text-xs font-bold shadow-md shadow-red-600/20 transition-all"
              >
                <Trash2 size={13} />
                <span>Empty Trash</span>
              </button>
            )
          )}
        </div>
      </div>

      {/* Trash Notice Banner */}
      {isTrashView && (
        <div className="p-4 rounded-xl bg-red-950/20 border border-red-500/30 text-xs text-red-300 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <AlertOctagon size={16} className="text-red-400 shrink-0" />
            <span>
              Orders in Trash are kept for <strong>30 days</strong> from the delete date before being permanently purged.
            </span>
          </div>
          <span className="font-mono font-bold text-white bg-red-900/60 px-2.5 py-1 rounded-md border border-red-500/30">
            {total} items in Trash
          </span>
        </div>
      )}

      {/* Date Filter & Presets Bar */}
      {!isTrashView && (
        <div className="glass-panel p-4 space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-3">
            {/* Quick Date Presets */}
            <div className="flex items-center gap-1.5 overflow-x-auto text-xs">
              <span className="text-[var(--text-secondary)] font-medium mr-1 flex items-center gap-1">
                <Calendar size={13} /> Date Range:
              </span>
              {[
                { id: "ALL", label: "All Time" },
                { id: "TODAY", label: "Today" },
                { id: "YESTERDAY", label: "Yesterday" },
                { id: "7DAYS", label: "Last 7 Days" },
                { id: "30DAYS", label: "Last 30 Days" },
                { id: "CUSTOM", label: "Custom Range" },
              ].map((p) => (
                <button
                  key={p.id}
                  onClick={() => handlePreset(p.id)}
                  className={`h-8 px-2.5 rounded-md text-xs font-medium transition-all inline-flex items-center justify-center ${
                    datePreset === p.id
                      ? "bg-[var(--accent-soft)] text-[var(--accent)] border border-[var(--accent-border)] font-semibold shadow-2xs"
                      : "bg-[var(--surface)] text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--surface-hover)] border border-[var(--border)]"
                  }`}
                >
                  {p.label}
                </button>
              ))}
            </div>

            {/* Custom Date Pickers */}
            <div className="flex items-center gap-2 text-xs">
              <input
                type="date"
                value={startDate}
                onChange={(e) => {
                  setStartDate(e.target.value);
                  setDatePreset("CUSTOM");
                }}
                className="h-8 bg-[var(--input-bg)] border border-[var(--input-border)] rounded-md px-2.5 py-1 text-xs text-[var(--input-text)] focus:border-[var(--input-focus)] focus:ring-1 focus:ring-[var(--input-focus)] focus:outline-none transition-all shadow-2xs"
              />
              <span className="text-[var(--text-muted)] text-xs font-medium">to</span>
              <input
                type="date"
                value={endDate}
                onChange={(e) => {
                  setEndDate(e.target.value);
                  setDatePreset("CUSTOM");
                }}
                className="h-8 bg-[var(--input-bg)] border border-[var(--input-border)] rounded-md px-2.5 py-1 text-xs text-[var(--input-text)] focus:border-[var(--input-focus)] focus:ring-1 focus:ring-[var(--input-focus)] focus:outline-none transition-all shadow-2xs"
              />
              {(startDate || endDate) && (
                <button
                  onClick={() => {
                    setStartDate("");
                    setEndDate("");
                    setDatePreset("ALL");
                  }}
                  className="h-8 w-8 inline-flex items-center justify-center rounded-md text-[var(--text-muted)] hover:text-[var(--text-primary)] hover:bg-[var(--surface-hover)] border border-transparent hover:border-[var(--border)] transition-all ml-0.5"
                  title="Clear custom date filter"
                >
                  <X size={14} />
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Filter and Search Bar */}
      <div className="flex flex-col md:flex-row gap-3 items-center justify-between">
        <div className="flex flex-wrap items-center gap-2 w-full md:w-auto">
          {/* Payment / Voided Status */}
          <Select
            value={financialStatus}
            onChange={(val) => {
              setFinancialStatus(val);
              setPage(1);
            }}
            options={[
              { value: "ALL", label: "All Payment Status" },
              { value: "PAID", label: "Paid" },
              { value: "PENDING", label: "Pending (COD / Unpaid)" },
              { value: "AUTHORIZED", label: "Authorized (Card Hold)" },
              { value: "PARTIALLY_PAID", label: "Partially Paid" },
              { value: "PARTIALLY_REFUNDED", label: "Partially Refunded" },
              { value: "REFUNDED", label: "Refunded" },
              { value: "VOIDED", label: "Voided / Cancelled" },
            ]}
            ariaLabel="Payment Status"
            className="min-w-[170px]"
          />

          {/* Fulfillment Status */}
          <select
            value={fulfillmentStatus}
            onChange={(e) => {
              setFulfillmentStatus(e.target.value);
              setPage(1);
            }}
            className="bg-[var(--surface)] border border-[var(--border)] rounded-lg px-3 py-2 text-xs font-medium text-[var(--text-primary)] hover:border-[var(--border-strong)] focus:outline-none focus:border-[var(--accent)] focus:ring-1 focus:ring-[var(--accent)] h-9 transition-all cursor-pointer"
          >
            <option value="ALL">All Fulfillment</option>
            <option value="UNFULFILLED">Unfulfilled (Pending Packing)</option>
            <option value="IN_PROGRESS">In Progress (Being Packed)</option>
            <option value="PARTIALLY_FULFILLED">Partially Fulfilled</option>
            <option value="FULFILLED">Fulfilled (With Tracking)</option>
            <option value="ON_HOLD">On Hold</option>
            <option value="SCHEDULED">Scheduled</option>
            <option value="RETURNED">Returned</option>
            <option value="CANCELLED">Cancelled / Voided</option>
          </select>
        </div>

        {/* Search Bar */}
        <form onSubmit={handleSearchSubmit} className="w-full md:w-80">
          <SearchInput
            placeholder="Search order #, customer, SKU, AWB, address..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            onClear={() => {
              setSearch("");
              setPage(1);
            }}
            className="py-2 text-xs"
          />
        </form>
      </div>

      {/* Floating Bulk Actions Bar */}
      {selectedIds.length > 0 && (
        <div className="p-3 bg-cyan-950/80 border border-cyan-500/40 rounded-xl flex items-center justify-between gap-3 text-xs shadow-lg animate-in fade-in slide-in-from-top-2">
          <div className="flex items-center gap-2 text-cyan-300 font-semibold">
            <CheckSquare size={16} className="text-cyan-400" />
            <span>
              {selectedIds.length} order{selectedIds.length > 1 ? "s" : ""} selected
            </span>
          </div>

          <div className="flex items-center gap-2">
            {!isTrashView ? (
              <>
                <button
                  onClick={() => {
                    if (selectedIds.length > 0) {
                      window.open(`/orders/invoices/bulk?ids=${selectedIds.join(",")}`, "_blank");
                    }
                  }}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-bold transition-all shadow-sm cursor-pointer"
                >
                  <Receipt size={13} />
                  <span>Print All Selected Invoices ({selectedIds.length})</span>
                </button>
                <button
                  onClick={() => handleDownloadCsv(true)}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-cyan-500 hover:bg-cyan-400 text-slate-950 text-xs font-bold transition-all shadow-sm cursor-pointer"
                >
                  <Download size={13} />
                  <span>Download Selected CSV</span>
                </button>
                <button
                  onClick={() => handleOrderAction(selectedIds, "TRASH")}
                  disabled={actionLoading}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-red-500/20 hover:bg-red-500/30 text-red-300 border border-red-500/40 text-xs font-bold transition-all cursor-pointer"
                >
                  <Trash2 size={13} />
                  <span>Move to Trash ({selectedIds.length})</span>
                </button>
              </>
            ) : (
              <>
                <button
                  onClick={() => handleOrderAction(selectedIds, "RESTORE")}
                  disabled={actionLoading}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-emerald-500 hover:bg-emerald-400 text-slate-950 text-xs font-bold transition-all"
                >
                  <RotateCcw size={13} />
                  <span>Restore Selected ({selectedIds.length})</span>
                </button>
                <button
                  onClick={() => handleOrderAction(selectedIds, "PERMANENT_DELETE")}
                  disabled={actionLoading}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-red-600 hover:bg-red-500 text-white text-xs font-bold transition-all"
                >
                  <Trash2 size={13} />
                  <span>Delete Forever ({selectedIds.length})</span>
                </button>
              </>
            )}
            <button
              onClick={() => setSelectedIds([])}
              className="text-xs text-[var(--text-muted)] hover:text-[var(--text-primary)] px-2 py-1"
            >
              Clear Selection
            </button>
          </div>
        </div>
      )}

      {/* Orders Table */}
      <div className="glass-panel overflow-hidden">
        {loading ? (
          <TableSkeleton rows={8} cols={8} />
        ) : (
          <>
            {/* Desktop Orders Table (>= 768px) */}
            <div className="hidden md:block overflow-x-auto animate-fade-in">
              <table className="w-full text-left text-sm">
              <thead>
                <tr className="border-b border-[var(--border)] bg-[var(--surface-secondary)] text-[var(--text-secondary)] font-semibold uppercase tracking-wider text-xs">
                  <th className="py-3.5 px-4 w-10">
                    <button onClick={handleToggleSelectAll} className="text-[var(--text-muted)] hover:text-[var(--text-primary)]">
                      {selectedIds.length === orders.length && orders.length > 0 ? (
                        <CheckSquare size={16} className="text-cyan-600 dark:text-cyan-400" />
                      ) : (
                        <Square size={16} />
                      )}
                    </button>
                  </th>
                  <th className="py-3.5 px-4">Order #</th>
                  <th className="py-3.5 px-4">Order Date</th>
                  <th className="py-3.5 px-4">Customer &amp; City</th>
                  <th className="py-3.5 px-4">Items &amp; Value</th>
                  <th className="py-3.5 px-4">Payment / Status</th>
                  <th className="py-3.5 px-4">Fulfillment &amp; Courier</th>
                  <th className="py-3.5 px-4 text-right">{isTrashView ? "Trash Retention" : "Actions"}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--border)]">
                {orders.length === 0 ? (
                <tr>
                  <td colSpan={8} className="py-12 text-center text-[var(--text-secondary)]">
                    <ShoppingCart size={32} className="mx-auto text-slate-600 mb-2" />
                    <p className="text-sm font-semibold text-[var(--text-secondary)]">
                      {isTrashView ? "Trash is empty" : "No orders found"}
                    </p>
                    <p className="text-xs text-[var(--text-muted)] mt-0.5">
                      {isTrashView
                        ? "Deleted orders will appear here for 30 days before permanent deletion."
                        : "Try adjusting your search or date filters"}
                    </p>
                  </td>
                </tr>
              ) : (
                orders.map((order) => {
                  const isSelected = selectedIds.includes(order.id);
                  const isCancelled = order.cancelledAt !== null || order.financialStatus === "VOIDED";

                  const trackingList = order.fulfillments?.flatMap((f: any) =>
                    f.trackingNumber
                      ? [{
                          number: f.trackingNumber,
                          company: f.trackingCompany,
                          url: f.trackingUrl,
                          deliveryStatus: f.deliveryStatus,
                          pickupDate: f.pickupDate,
                          etdDate: f.etdDate,
                        }]
                      : []
                  ) || [];

                  const hasRtoDiscrepancy =
                    (order.deliveryStatus === "RTO_DELIVERED" || trackingList.some((t: any) => t.deliveryStatus === "RTO_DELIVERED")) &&
                    !order.rtoInwardScanned;

                  const daysLeft = getDaysLeftInTrash(order.deletedAt);
                  const parsedAddr = parseShippingAddress(order.shippingAddress);
                  const cleanCustomerName =
                    order.customerName ||
                    parsedAddr?.name ||
                    (order.name && !order.name.startsWith("#") ? order.name : null) ||
                    "Customer";

                  const displayOrderNumber =
                    order.shopifyOrderName ||
                    (order.shopifyOrderNumber ? `#${order.shopifyOrderNumber}` : (order.orderNumber ? `#${order.orderNumber.replace(/^#+/, "")}` : (order.name || "—")));

                  return (
                    <tr
                      key={order.id}
                      className={`table-row-hover transition-colors ${
                        isSelected ? "bg-cyan-500/5" : isCancelled ? "bg-red-500/5 opacity-80" : ""
                      }`}
                    >
                      {/* Checkbox */}
                      <td className="py-3 px-4">
                        <button
                          onClick={() => handleToggleSelect(order.id)}
                          className="text-[var(--text-muted)] hover:text-[var(--text-primary)]"
                        >
                          {isSelected ? (
                            <CheckSquare size={15} className="text-cyan-400" />
                          ) : (
                            <Square size={15} />
                          )}
                        </button>
                      </td>

                      {/* Order Number */}
                      <td className="py-3 px-3">
                        <span className={`font-bold font-mono ${isCancelled ? "text-red-500 line-through" : "text-[var(--text-primary)]"}`}>
                          {displayOrderNumber}
                        </span>
                      </td>

                      {/* Date */}
                      <td className="py-3 px-3 text-[var(--text-secondary)] whitespace-nowrap">
                        {formatDate(order.shopifyOrderCreatedAt || order.createdAt)}
                      </td>

                      {/* Customer & Location */}
                      <td className="py-3 px-4">
                        <div className="font-semibold text-[var(--text-primary)] truncate max-w-[170px] flex items-center gap-1.5">
                          <User size={12} className="text-[var(--text-secondary)] shrink-0" />
                          <span className="truncate">{cleanCustomerName}</span>
                        </div>
                        <div className="text-[11px] text-[var(--text-secondary)] truncate max-w-[170px] flex items-center gap-1 mt-0.5">
                          {parsedAddr?.city ? (
                            <span className="text-cyan-300 font-medium">
                              {parsedAddr.city}, {parsedAddr.province || ""}
                            </span>
                          ) : (
                            <span>{order.phone || order.email || "—"}</span>
                          )}
                        </div>
                      </td>

                      {/* Items & Value */}
                      <td className="py-3 px-3">
                        <div className="font-bold text-[var(--text-primary)] font-mono">
                          ₹{order.totalPrice.toFixed(2)}
                        </div>
                        <div className="text-[11px] text-[var(--text-secondary)]">
                          {order.items.length} line item{order.items.length > 1 ? "s" : ""}
                        </div>
                      </td>

                      {/* Payment & Cancelled Status */}
                      <td className="py-3 px-3">
                        <div className="space-y-1">
                          {isCancelled ? (
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-black bg-red-500/20 text-red-400 border border-red-500/40 animate-pulse">
                              <XCircle size={11} /> CANCELLED
                            </span>
                          ) : (
                            <span
                              className={`inline-block px-2 py-0.5 rounded text-[10px] font-bold ${
                                order.financialStatus === "PAID"
                                  ? "bg-emerald-500/10 text-emerald-400 border border-emerald-500/20"
                                  : order.financialStatus === "PENDING"
                                  ? "bg-amber-500/10 text-amber-400 border border-amber-500/20"
                                  : order.financialStatus === "AUTHORIZED"
                                  ? "bg-cyan-500/10 text-cyan-400 border border-cyan-500/20"
                                  : order.financialStatus === "PARTIALLY_PAID"
                                  ? "bg-orange-500/10 text-orange-400 border border-orange-500/20"
                                  : order.financialStatus === "PARTIALLY_REFUNDED"
                                  ? "bg-yellow-500/10 text-yellow-400 border border-yellow-500/20"
                                  : order.financialStatus === "REFUNDED"
                                  ? "bg-rose-500/10 text-rose-400 border border-rose-500/20"
                                  : order.financialStatus === "VOIDED"
                                  ? "bg-red-500/10 text-red-400 border border-red-500/20"
                                  : "bg-blue-500/10 text-blue-400 border border-blue-500/20"
                              }`}
                            >
                              {( {
                                PAID: "Paid",
                                PENDING: "Pending (COD)",
                                AUTHORIZED: "Authorized",
                                PARTIALLY_PAID: "Partially Paid",
                                PARTIALLY_REFUNDED: "Part. Refunded",
                                REFUNDED: "Refunded",
                                VOIDED: "Voided",
                              } as Record<string, string> )[order.financialStatus] ?? order.financialStatus}
                            </span>
                          )}
                        </div>
                      </td>

                      {/* Unified Fulfillment, Courier & Warehouse Verification */}
                      <td className="py-3 px-4 align-top">
                        <OrderShipmentInfo
                          fulfillmentStatus={order.fulfillmentStatus}
                          deliveryStatus={order.deliveryStatus}
                          trackingList={trackingList}
                          pickupDate={order.pickupDate}
                          deliveryDate={order.deliveryDate}
                          etdDate={order.etdDate}
                          rtoDate={order.rtoDate}
                          rtoDeliveredDate={order.rtoDeliveredDate}
                          outwardScanned={order.outwardScanned}
                          rtoInwardScanned={order.rtoInwardScanned}
                          hasRtoDiscrepancy={hasRtoDiscrepancy}
                        />
                      </td>

                      {/* Actions / Trash Controls */}
                      <td className="py-3 px-4 text-right">
                        {!isTrashView ? (
                          <div className="flex items-center justify-end gap-1.5">
                            <button
                              onClick={() => setInvoiceOrder(order)}
                              className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md bg-indigo-500/15 hover:bg-indigo-500/25 text-indigo-600 dark:text-indigo-400 border border-indigo-500/30 text-xs font-bold transition-all shadow-sm cursor-pointer"
                              title="View & Download GST Tax Invoice"
                            >
                              <Receipt size={12} />
                              <span>Invoice</span>
                            </button>
                            <button
                              onClick={() => setSelectedOrder(order)}
                              className="inline-flex items-center gap-1 px-2 py-1 rounded-md bg-cyan-500/10 hover:bg-cyan-500/20 text-cyan-400 border border-cyan-500/30 text-xs font-semibold transition-all cursor-pointer"
                            >
                              <Eye size={12} />
                              <span>Details</span>
                            </button>
                            <button
                              onClick={() => handleOrderAction(order.id, "TRASH")}
                              disabled={actionLoading}
                              title="Move Order to 30-Day Trash"
                              className="p-1.5 rounded-md text-[var(--text-muted)] hover:text-red-400 hover:bg-red-500/10 transition-all cursor-pointer"
                            >
                              <Trash2 size={13} />
                            </button>
                          </div>
                        ) : (
                          <div className="flex items-center justify-end gap-1.5">
                            <span className="text-[10px] font-mono text-amber-400 mr-2 bg-amber-950/40 px-2 py-0.5 rounded border border-amber-500/30">
                              {daysLeft}d left
                            </span>
                            <button
                              onClick={() => handleOrderAction(order.id, "RESTORE")}
                              disabled={actionLoading}
                              title="Restore Order"
                              className="px-2 py-1 rounded-md bg-emerald-500/15 hover:bg-emerald-500/25 text-emerald-400 border border-emerald-500/30 text-[11px] font-bold transition-all flex items-center gap-1"
                            >
                              <RotateCcw size={11} /> Restore
                            </button>
                            <button
                              onClick={() => handleOrderAction(order.id, "PERMANENT_DELETE")}
                              disabled={actionLoading}
                              title="Delete Permanently"
                              className="px-2 py-1 rounded-md bg-red-500/15 hover:bg-red-500/25 text-red-400 border border-red-500/30 text-[11px] font-bold transition-all flex items-center gap-1"
                            >
                              <X size={11} /> Delete
                            </button>
                          </div>
                        )}
                      </td>
                    </tr>
                  );
                })
              )}
                </tbody>
              </table>
            </div>

            {/* Mobile Android Orders Card View (< 768px) */}
            <div className="block md:hidden divide-y divide-slate-800/70 animate-fade-in">
              {orders.length === 0 ? (
                <div className="py-12 text-center text-[var(--text-secondary)] p-4">
                  <ShoppingCart size={32} className="mx-auto text-slate-600 mb-2" />
                  <p className="text-sm font-semibold text-[var(--text-secondary)]">
                    {isTrashView ? "Trash is empty" : "No orders found"}
                  </p>
                  <p className="text-xs text-[var(--text-muted)] mt-0.5">
                    {isTrashView
                      ? "Deleted orders will appear here for 30 days before permanent deletion."
                      : "Try adjusting your search or date filters"}
                  </p>
                </div>
              ) : (
                orders.map((order) => {
                  const isSelected = selectedIds.includes(order.id);
                  const isCancelled = order.cancelledAt !== null || order.financialStatus === "VOIDED";
                  const daysLeft = getDaysLeftInTrash(order.deletedAt);
                  const parsedAddr = parseShippingAddress(order.shippingAddress);
                  const cleanCustomerName =
                    order.customerName ||
                    parsedAddr?.name ||
                    (order.name && !order.name.startsWith("#") ? order.name : null) ||
                    "Customer";
                  const displayOrderNumber =
                    order.shopifyOrderName ||
                    (order.shopifyOrderNumber ? `#${order.shopifyOrderNumber}` : (order.orderNumber ? `#${order.orderNumber.replace(/^#+/, "")}` : (order.name || "—")));
                  const location = [parsedAddr?.city, parsedAddr?.province].filter(Boolean).join(", ") || "Location not provided";
                  const totalFormatted = `₹${parseFloat(order.totalPrice || 0).toLocaleString("en-IN")}`;

                  const trackingList = order.fulfillments?.flatMap((f: any) =>
                    f.trackingNumber
                      ? [{
                          number: f.trackingNumber,
                          company: f.trackingCompany,
                          url: f.trackingUrl,
                          deliveryStatus: f.deliveryStatus,
                          pickupDate: f.pickupDate,
                          etdDate: f.etdDate,
                        }]
                      : []
                  ) || [];

                  const hasRtoDiscrepancy =
                    (order.deliveryStatus === "RTO_DELIVERED" || trackingList.some((t: any) => t.deliveryStatus === "RTO_DELIVERED")) &&
                    !order.rtoInwardScanned;

                  return (
                    <div
                      key={order.id}
                      className={`p-4 transition-colors ${
                        isSelected ? "bg-theme-tint" : isCancelled ? "bg-red-500/5 opacity-80" : "hover:bg-[var(--bg-secondary)]"
                      }`}
                    >
                      {/* Top Row: #Order & Total Value */}
                      <div className="flex items-center justify-between mb-1.5">
                        <div className="flex items-center gap-2">
                          <button
                            onClick={() => handleToggleSelect(order.id)}
                            className="text-[var(--text-muted)] hover:text-[var(--text-primary)] p-1"
                            aria-label="Select order"
                          >
                            {isSelected ? (
                              <CheckSquare size={16} className="text-theme-primary" />
                            ) : (
                              <Square size={16} />
                            )}
                          </button>
                          <span className={`font-mono font-black text-sm ${isCancelled ? "text-red-500 line-through" : "text-[var(--text-primary)]"}`}>
                            {displayOrderNumber}
                          </span>
                        </div>
                        <span className="font-mono font-black text-sm text-[var(--text-primary)]">{totalFormatted}</span>
                      </div>

                      {/* Customer & Location */}
                      <div className="pl-7 mb-2.5">
                        <p className="text-sm font-semibold text-slate-200 leading-tight">{cleanCustomerName}</p>
                        <p className="text-xs text-[var(--text-secondary)] mt-0.5">{location}</p>
                      </div>

                      {/* Status & Shipment Info */}
                      <div className="pl-7 mb-3 space-y-2">
                        <div>
                          {/* Payment status badge */}
                          <span
                            className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[10px] font-bold ${
                              order.financialStatus === "PAID"
                                ? "bg-emerald-500/15 text-emerald-400 border border-emerald-500/30"
                                : order.financialStatus === "PENDING"
                                ? "bg-amber-500/15 text-amber-400 border border-amber-500/30"
                                : "bg-[var(--surface-hover)] text-[var(--text-secondary)] border border-[var(--border)]"
                            }`}
                          >
                            <span
                              className={`w-1.5 h-1.5 rounded-full ${
                                order.financialStatus === "PAID"
                                  ? "bg-emerald-400"
                                  : order.financialStatus === "PENDING"
                                  ? "bg-amber-400"
                                  : "bg-slate-400"
                              }`}
                            />
                            <span>
                              {order.financialStatus === "PENDING"
                                ? (order.paymentGateway === "cash_on_delivery" || (order.tags && order.tags.includes("COD"))
                                    ? "Pending COD"
                                    : "Payment Pending")
                                : order.financialStatus || "Unpaid"}
                            </span>
                          </span>
                        </div>

                        <OrderShipmentInfo
                          fulfillmentStatus={order.fulfillmentStatus}
                          deliveryStatus={order.deliveryStatus}
                          trackingList={trackingList}
                          pickupDate={order.pickupDate}
                          deliveryDate={order.deliveryDate}
                          etdDate={order.etdDate}
                          rtoDate={order.rtoDate}
                          rtoDeliveredDate={order.rtoDeliveredDate}
                          outwardScanned={order.outwardScanned}
                          rtoInwardScanned={order.rtoInwardScanned}
                          hasRtoDiscrepancy={hasRtoDiscrepancy}
                        />
                      </div>

                      {/* Touch-Friendly Action Buttons (min 44px) */}
                      <div className="pl-7 flex items-center justify-between gap-2 pt-1">
                        {!isTrashView ? (
                          <>
                            <div className="flex items-center gap-2 flex-1">
                              <button
                                onClick={() => setInvoiceOrder(order)}
                                className="flex-1 inline-flex items-center justify-center gap-1.5 px-3 py-2 rounded-xl bg-indigo-600/20 hover:bg-indigo-600/30 text-indigo-300 border border-indigo-500/40 text-xs font-bold transition-all min-h-[44px] touch-press"
                              >
                                <Receipt size={14} />
                                <span>Invoice</span>
                              </button>

                              <button
                                onClick={() => setSelectedOrder(order)}
                                className="flex-1 inline-flex items-center justify-center gap-1.5 px-3 py-2 rounded-xl bg-slate-900 hover:bg-[var(--surface-hover)] text-slate-200 border border-[var(--border)]/80 text-xs font-semibold transition-all min-h-[44px] touch-press"
                              >
                                <Eye size={14} />
                                <span>Details</span>
                              </button>
                            </div>

                            <button
                              onClick={() => handleOrderAction(order.id, "TRASH")}
                              disabled={actionLoading}
                              className="p-2.5 rounded-xl text-[var(--text-secondary)] hover:text-red-400 active:bg-red-500/10 transition-all min-w-[44px] min-h-[44px] flex items-center justify-center touch-press"
                              title="Move to Trash"
                              aria-label="Trash"
                            >
                              <Trash2 size={16} />
                            </button>
                          </>
                        ) : (
                          <div className="flex items-center justify-between w-full">
                            <span className="text-xs font-mono text-amber-400 bg-amber-950/40 px-2 py-1 rounded border border-amber-500/30">
                              {daysLeft}d left
                            </span>
                            <div className="flex items-center gap-2">
                              <button
                                onClick={() => handleOrderAction(order.id, "RESTORE")}
                                disabled={actionLoading}
                                className="px-3 py-2 rounded-xl bg-emerald-500/20 text-emerald-300 border border-emerald-500/40 text-xs font-bold min-h-[44px] touch-press flex items-center gap-1"
                              >
                                <RotateCcw size={13} />
                                <span>Restore</span>
                              </button>
                              <button
                                onClick={() => handleOrderAction(order.id, "PERMANENT_DELETE")}
                                disabled={actionLoading}
                                className="px-3 py-2 rounded-xl bg-red-500/20 text-red-300 border border-red-500/40 text-xs font-bold min-h-[44px] touch-press flex items-center gap-1"
                              >
                                <X size={13} />
                                <span>Delete</span>
                              </button>
                            </div>
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </>
        )}

        {/* Pagination Footer */}
        <div className="p-4 border-t border-[var(--border)] flex items-center justify-between text-xs text-[var(--text-secondary)]">
          <div>
            Showing Page <strong className="text-[var(--text-primary)]">{page}</strong> of{" "}
            <strong className="text-[var(--text-primary)]">{totalPages}</strong> ({total} total {isTrashView ? "in trash" : "orders"})
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              disabled={page <= 1}
              className="px-3 py-1.5 rounded-lg bg-[var(--surface-hover)] text-[var(--text-secondary)] disabled:opacity-40 hover:bg-slate-700 transition-colors"
            >
              Previous
            </button>
            <button
              onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
              disabled={page >= totalPages}
              className="px-3 py-1.5 rounded-lg bg-[var(--surface-hover)] text-[var(--text-secondary)] disabled:opacity-40 hover:bg-slate-700 transition-colors"
            >
              Next
            </button>
          </div>
        </div>
      </div>

      {/* Order Details Drawer */}
      <Drawer
        isOpen={Boolean(selectedOrder)}
        onClose={() => setSelectedOrder(null)}
        width="max-w-lg"
        ariaLabel="Order Details"
        customLayout
      >
        {selectedOrder && (
          <div className="flex flex-col h-full overflow-hidden">
            <div className="p-4 sm:p-6 border-b border-[var(--border)] bg-[var(--surface)] flex items-start justify-between shrink-0">
                <div>
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-bold text-cyan-400 font-mono uppercase tracking-wider">
                      Shopify Order
                    </span>
                    <span className="text-[var(--text-muted)]">•</span>
                    <span className="text-xs text-[var(--text-secondary)] font-mono">
                      {formatDate(selectedOrder.shopifyOrderCreatedAt || selectedOrder.createdAt)}
                    </span>
                  </div>
                  <h3 className="text-lg sm:text-xl font-bold text-[var(--text-primary)] font-mono mt-1">
                    {selectedOrder.shopifyOrderName || (selectedOrder.shopifyOrderNumber ? `#${selectedOrder.shopifyOrderNumber}` : (selectedOrder.orderNumber ? `#${selectedOrder.orderNumber.replace(/^#+/, "")}` : (selectedOrder.name || "—")))}
                  </h3>
                </div>
                <button
                  onClick={() => setSelectedOrder(null)}
                  className="p-2 rounded-lg text-[var(--text-muted)] hover:text-[var(--text-primary)] hover:bg-[var(--surface-hover)] transition-colors"
                >
                  <X size={18} />
                </button>
              </div>

              <div className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-5 text-xs overscroll-contain">
                {/* Status Banners */}
                <div className="grid grid-cols-2 gap-3">
                  <div className="p-3 rounded-xl bg-[var(--surface)] border border-[var(--border)]">
                    <span className="text-[var(--text-muted)] text-[10px] uppercase font-bold block mb-1">
                      Financial Status
                    </span>
                    <span className="font-bold text-[var(--text-primary)] text-sm">
                      {selectedOrder.financialStatus}
                    </span>
                  </div>
                  <div className="p-3 rounded-xl bg-[var(--surface)] border border-[var(--border)]">
                    <span className="text-[var(--text-muted)] text-[10px] uppercase font-bold block mb-1">
                      Fulfillment Status
                    </span>
                    <span className="font-bold text-[var(--text-primary)] text-sm">
                      {selectedOrder.fulfillmentStatus}
                    </span>
                  </div>
                </div>

                {/* Customer & Clean Shipping Destination */}
                <div className="p-4 rounded-xl bg-[var(--surface)] border border-[var(--border)] space-y-3">
                  <div className="flex items-center justify-between border-b border-[var(--border)]/80 pb-2">
                    <span className="text-[10px] font-bold text-[var(--text-secondary)] uppercase tracking-wider flex items-center gap-1.5">
                      <User size={13} className="text-cyan-400" /> Customer &amp; Shipping
                    </span>
                    <span className="text-[10px] text-cyan-400 font-mono">
                      {drawerParsedAddr?.country || "India"}
                    </span>
                  </div>

                  {/* Real Customer Name */}
                  <div className="font-bold text-[var(--text-primary)] text-base">
                    {drawerCustomerName}
                  </div>

                  {/* Contact Info */}
                  <div className="grid grid-cols-2 gap-2 text-xs">
                    {selectedOrder.email && (
                      <div className="text-[var(--text-secondary)] flex items-center gap-1.5 truncate">
                        <Mail size={12} className="text-[var(--text-muted)] shrink-0" />
                        <span className="truncate">{selectedOrder.email}</span>
                      </div>
                    )}
                    {(selectedOrder.phone || drawerParsedAddr?.phone) && (
                      <div className="text-[var(--text-secondary)] font-mono flex items-center gap-1.5 truncate">
                        <Phone size={12} className="text-[var(--text-muted)] shrink-0" />
                        <span>{selectedOrder.phone || drawerParsedAddr?.phone}</span>
                      </div>
                    )}
                  </div>

                  {/* Clean Formatted Address */}
                  {drawerParsedAddr && (drawerParsedAddr.address1 || drawerParsedAddr.city || drawerParsedAddr.zip) && (
                    <div className="pt-2.5 border-t border-[var(--border)]/80 text-[var(--text-secondary)] text-xs space-y-1">
                      <div className="text-[10px] font-bold uppercase text-[var(--text-muted)] flex items-center gap-1 mb-1">
                        <MapPin size={12} className="text-cyan-400" /> Delivery Address
                      </div>
                      {drawerParsedAddr.address1 && <p className="font-medium text-[var(--text-primary)]">{drawerParsedAddr.address1}</p>}
                      {drawerParsedAddr.address2 && <p className="text-[var(--text-secondary)]">{drawerParsedAddr.address2}</p>}
                      <p className="text-[var(--text-primary)] font-semibold">
                        {[drawerParsedAddr.city, drawerParsedAddr.province].filter(Boolean).join(", ")}
                        {drawerParsedAddr.zip ? ` - ${drawerParsedAddr.zip}` : ""}
                      </p>
                    </div>
                  )}
                </div>

                {/* Dedicated Courier Partner & Logistics Hub Card */}
                {selectedOrder.fulfillments && selectedOrder.fulfillments.length > 0 && selectedOrder.fulfillments.some((f: any) => f.trackingNumber) && (
                  <div className="p-4 rounded-xl bg-[var(--surface)] border border-[var(--border)] space-y-3">
                    <div className="flex items-center justify-between border-b border-[var(--border)]/80 pb-2">
                      <span className="text-[10px] font-bold text-[var(--text-secondary)] uppercase tracking-wider flex items-center gap-1.5">
                        <Truck size={13} className="text-cyan-400" /> Courier Partner &amp; Logistics
                      </span>
                      <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 font-bold flex items-center gap-1">
                        <CheckCircle2 size={10} /> Fulfilled in Shopify
                      </span>
                    </div>

                    <div className="space-y-2">
                      {selectedOrder.fulfillments.filter((f: any) => f.trackingNumber).map((f: any, fIdx: number) => {
                        const courier = CourierService.detectCourier(f.trackingCompany, f.trackingNumber);
                        const url = CourierService.getTrackingUrl(f.trackingNumber, f.trackingCompany, f.trackingUrl);
                        return (
                          <div key={fIdx} className="p-3 rounded-lg bg-[var(--bg-secondary)] border border-[var(--border)]/80 flex items-center justify-between gap-3">
                            <div className="min-w-0 flex items-center gap-3">
                              <div className={`p-2 rounded-lg border ${courier.badgeClass}`}>
                                <Truck size={16} className={courier.iconColor} />
                              </div>
                              <div>
                                <div className="text-xs font-bold text-[var(--text-primary)] flex items-center gap-2">
                                  <span>{courier.displayName}</span>
                                  {f.deliveryStatus && (
                                    <span className="text-[9px] px-1.5 py-0.5 rounded bg-cyan-500/10 text-cyan-300 font-mono font-semibold">
                                      {f.deliveryStatus}
                                    </span>
                                  )}
                                </div>
                                <div className="text-[11px] font-mono text-[var(--text-secondary)] mt-0.5">
                                  AWB: <strong className="text-[var(--text-primary)] font-semibold">{f.trackingNumber}</strong>
                                </div>
                              </div>
                            </div>

                            <div className="flex items-center gap-2 shrink-0">
                              <a
                                href={url}
                                target="_blank"
                                rel="noopener noreferrer"
                                className={`inline-flex items-center gap-1 px-2.5 py-1 rounded text-xs font-semibold border ${courier.badgeClass} hover:opacity-80 transition-opacity`}
                              >
                                <span>Track</span>
                                <ExternalLink size={10} />
                              </a>
                              <Link
                                href={`/shipments?search=${encodeURIComponent(f.trackingNumber)}`}
                                className="inline-flex items-center gap-1 px-2.5 py-1 rounded text-xs font-semibold bg-[var(--surface)] hover:bg-[var(--surface-hover)] text-[var(--text-primary)] border border-[var(--border)] transition-colors"
                                title="Open in Shipments & Couriers"
                              >
                                <span>Shipment Hub</span>
                                <ArrowRight size={10} />
                              </Link>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}

                {/* Line Items List */}
                <div className="space-y-3">
                  <span className="text-[10px] font-bold text-[var(--text-secondary)] uppercase tracking-wider block">
                    Order Items ({selectedOrder.items.length})
                  </span>
                  <div className="divide-y divide-[var(--border)] rounded-xl bg-[var(--surface)] border border-[var(--border)] overflow-hidden">
                    {selectedOrder.items.map((item: any) => {
                      const isComboSku = item.sku && (item.sku.includes("-") || item.sku.includes("+"));
                      const comboParts = isComboSku ? item.sku.split(/[-+]/).map((s: string) => s.trim()).filter(Boolean) : [];

                      const itemFulfillment = selectedOrder.fulfillments?.find((f: any) => {
                        if (!f.trackingNumber) return false;
                        if (f.lineItemIds) {
                          try {
                            const ids = JSON.parse(f.lineItemIds);
                            if (Array.isArray(ids) && ids.includes(item.shopifyLineItemId)) return true;
                          } catch (_) {}
                        }
                        return false;
                      }) || (selectedOrder.fulfillments?.length === 1 && selectedOrder.fulfillments[0].trackingNumber ? selectedOrder.fulfillments[0] : null);

                      const itemCourier = itemFulfillment
                        ? CourierService.detectCourier(itemFulfillment.trackingCompany, itemFulfillment.trackingNumber)
                        : null;
                      const itemTrackingUrl = itemFulfillment && itemCourier
                        ? CourierService.getTrackingUrl(itemFulfillment.trackingNumber, itemFulfillment.trackingCompany, itemFulfillment.trackingUrl)
                        : null;

                      return (
                        <div key={item.id} className="p-3 space-y-2">
                          <div className="flex items-center justify-between gap-3">
                            <div className="min-w-0">
                              <div className="font-bold text-[var(--text-primary)] truncate">
                                {item.productTitle}
                              </div>
                              {item.variantTitle && (
                                <div className="text-[11px] text-[var(--text-secondary)]">
                                  Variant: {item.variantTitle}
                                </div>
                              )}
                              <div className="flex items-center gap-2 mt-1 flex-wrap">
                                <span className="px-1.5 py-0.5 rounded bg-[var(--surface-hover)] text-cyan-400 font-mono font-bold text-[10px]">
                                  SKU: {item.sku || "NO-SKU"}
                                </span>
                                <span className="text-[var(--text-muted)] font-mono text-[11px]">Qty: {item.quantity}</span>

                                {itemFulfillment && itemCourier ? (
                                  <a
                                    href={itemTrackingUrl || "#"}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-[9.5px] font-mono border ${itemCourier.badgeClass} hover:opacity-85 transition-opacity`}
                                    title={`Open ${itemCourier.displayName} Tracking (${itemFulfillment.trackingNumber})`}
                                  >
                                    <Truck size={9} className={itemCourier.iconColor} />
                                    <span>{itemCourier.displayName}: <strong>{itemFulfillment.trackingNumber}</strong></span>
                                    <ExternalLink size={8} />
                                  </a>
                                ) : selectedOrder.fulfillmentStatus === "FULFILLED" ? (
                                  <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[9px] font-bold bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                                    <CheckCircle2 size={9} /> Fulfilled
                                  </span>
                                ) : (
                                  <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[9px] font-semibold bg-amber-500/10 text-amber-400 border border-amber-500/20">
                                    <Clock size={9} /> Pending Dispatch
                                  </span>
                                )}
                              </div>
                            </div>
                            <div className="text-right shrink-0">
                              <div className="font-mono font-bold text-[var(--text-primary)]">
                                ₹{item.totalPrice.toFixed(2)}
                              </div>
                              <div className="text-[10px] text-[var(--text-muted)] font-mono">
                                ₹{item.unitPrice.toFixed(2)} each
                              </div>
                            </div>
                          </div>

                          {/* Combo SKU Component Decomposition */}
                          {comboParts.length > 1 && (
                            <div className="p-2 rounded-lg bg-indigo-500/10 border border-indigo-500/20 space-y-1.5">
                              <div className="text-[10px] font-bold text-indigo-400 uppercase tracking-wider flex items-center gap-1">
                                <Package size={12} /> Bundle Component Breakdown ({comboParts.length} Products):
                              </div>
                              <div className="grid grid-cols-1 sm:grid-cols-2 gap-1 font-mono text-[10.5px]">
                                {comboParts.map((partSku: string, pIdx: number) => (
                                  <div key={pIdx} className="flex items-center gap-1.5 bg-[var(--surface)] px-2 py-1 rounded border border-[var(--border)]">
                                    <span className="text-cyan-400 font-black">•</span>
                                    <span className="font-bold text-[var(--text-primary)]">{partSku}</span>
                                    <span className="text-[var(--text-secondary)] text-[10px]">× {item.quantity} pc</span>
                                  </div>
                                ))}
                              </div>
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>

                {/* Financial Summary */}
                <div className="p-4 rounded-xl bg-[var(--surface)] border border-[var(--border)] space-y-2">
                  <div className="flex justify-between text-[var(--text-secondary)]">
                    <span>Subtotal</span>
                    <span className="font-mono text-[var(--text-primary)] font-semibold">
                      ₹{selectedOrder.subtotalPrice.toFixed(2)}
                    </span>
                  </div>
                  {selectedOrder.totalDiscounts > 0 && (
                    <div className="flex justify-between text-emerald-400">
                      <span>Discounts</span>
                      <span className="font-mono">-₹{selectedOrder.totalDiscounts.toFixed(2)}</span>
                    </div>
                  )}
                  {selectedOrder.totalTax > 0 && (
                    <div className="flex justify-between text-[var(--text-secondary)]">
                      <span>Tax</span>
                      <span className="font-mono text-[var(--text-primary)] font-semibold">
                        ₹{selectedOrder.totalTax.toFixed(2)}
                      </span>
                    </div>
                  )}
                  <div className="pt-2 border-t border-[var(--border)] flex justify-between font-bold text-sm text-[var(--text-primary)]">
                    <span>Total Amount</span>
                    <span className="font-mono text-cyan-400">
                      ₹{selectedOrder.totalPrice.toFixed(2)}
                    </span>
                  </div>
                </div>
              </div>

              <div className="p-4 border-t border-[var(--border)] bg-[var(--bg-secondary)] flex items-center justify-between">
                <button
                  onClick={() => handleOrderAction(selectedOrder.id, "TRASH")}
                  className="px-3 py-1.5 rounded-lg bg-red-500/10 hover:bg-red-500/20 text-red-400 border border-red-500/30 text-xs font-bold transition-all flex items-center gap-1.5"
                >
                  <Trash2 size={13} />
                  <span>Move to Trash</span>
                </button>
                <button
                  onClick={() => setSelectedOrder(null)}
                  className="px-4 py-2 rounded-xl bg-[var(--surface-hover)] hover:opacity-80 text-[var(--text-primary)] text-xs font-semibold transition-all"
                >
                  Close
                </button>
            </div>
          </div>
        )}
      </Drawer>

      {/* GST Tax Invoice Preview Modal */}
      {invoiceOrder && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-in fade-in">
          <div className="bg-[var(--surface)] border border-[var(--border)] rounded-2xl w-full max-w-4xl max-h-[90vh] flex flex-col shadow-2xl animate-in zoom-in-95 overflow-hidden">
            {/* Modal Header */}
            <div className="flex items-center justify-between p-4 border-b border-[var(--border)] bg-[var(--surface)]">
              <div className="flex items-center gap-2.5">
                <Receipt className="text-indigo-400" size={20} />
                <div>
                  <h3 className="font-bold text-base text-[var(--text-primary)] flex items-center gap-2">
                    GST Tax Invoice
                    <span className="font-mono text-indigo-400 text-sm">
                      {invoiceOrder.shopifyOrderName || (invoiceOrder.shopifyOrderNumber ? `#${invoiceOrder.shopifyOrderNumber}` : `#${invoiceOrder.orderNumber}`)}
                    </span>
                  </h3>
                  <p className="text-[11px] text-[var(--text-secondary)]">
                    Generated with company master profile and live GST rates
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-2">
                <a
                  href="/settings/company"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-[var(--surface-hover)] hover:bg-slate-700 text-xs font-bold text-[var(--text-secondary)] transition-all"
                  title="Change Company Legal Name, GSTIN, Bank Details"
                >
                  <Building2 size={13} />
                  <span>Edit Company Master</span>
                </a>

                <button
                  onClick={() => window.open(`/orders/${invoiceOrder.id}/invoice`, "_blank")}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-bold shadow-md shadow-indigo-600/25 transition-all cursor-pointer"
                >
                  <Printer size={13} />
                  <span>Print / Download PDF</span>
                </button>

                <button
                  onClick={() => setInvoiceOrder(null)}
                  className="p-1.5 rounded-xl text-[var(--text-muted)] hover:text-[var(--text-primary)] hover:bg-[var(--surface-hover)] transition-colors"
                >
                  <X size={18} />
                </button>
              </div>
            </div>

            {/* Modal Body: Invoice Content */}
            <div className="flex-1 overflow-y-auto p-6 bg-[var(--surface)] space-y-4">
              {invoiceLoading ? (
                <div className="py-20 flex flex-col items-center justify-center gap-3">
                  <RefreshCw size={28} className="animate-spin text-indigo-400" />
                  <span className="text-xs text-[var(--text-secondary)] font-bold">Calculating GST Tax Invoice...</span>
                </div>
              ) : !invoiceData ? (
                <div className="py-16 text-center text-[var(--text-secondary)] max-w-md mx-auto space-y-3">
                  <AlertCircle size={32} className="mx-auto text-rose-500 mb-2" />
                  <p className="font-bold text-[var(--text-primary)]">{invoiceError || "Failed to load invoice details."}</p>
                  {invoiceError && (invoiceError.includes("Company") || invoiceError.includes("GSTIN")) && (
                    <a
                      href="/settings/company"
                      className="inline-block px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl text-xs font-bold transition-all shadow-lg"
                    >
                      Configure Company Profile &amp; Invoice Master
                    </a>
                  )}
                </div>
              ) : (
                /* Styled Invoice Paper */
                <div className="bg-white text-slate-900 rounded-2xl p-6 sm:p-8 shadow-xl border border-slate-200 text-xs font-sans space-y-4">
                  {/* Header */}
                  <div className="flex justify-between items-start border-b-2 border-slate-900 pb-3">
                    <div>
                      <span className="text-[9px] font-black uppercase tracking-widest text-indigo-600 block">
                        TAX INVOICE
                      </span>
                      <h2 className="text-lg font-black text-slate-950">
                        {invoiceData.company.legalName}
                      </h2>
                      {invoiceData.company.tradeName && (
                        <p className="text-[11px] font-bold text-slate-600">Trade: {invoiceData.company.tradeName}</p>
                      )}
                      <p className="text-[10px] text-slate-600 mt-0.5 max-w-sm">
                        {invoiceData.company.address}, {invoiceData.company.city}, {invoiceData.company.state} - {invoiceData.company.pincode}
                      </p>
                    </div>

                    <div className="text-right space-y-1 text-[10px] font-mono">
                      {invoiceData.company.logoUrl ? (
                        invoiceData.company.logoUrl?.startsWith("data:application/pdf") ? (
                          <div className="inline-flex items-center gap-1 bg-slate-100 px-2 py-0.5 rounded border text-[9px] font-sans text-slate-700">
                            <FileText size={12} className="text-rose-500" />
                            <span>PDF Logo</span>
                          </div>
                        ) : (
                          <img src={invoiceData.company.logoUrl} alt="Logo" className="h-8 max-w-[100px] object-contain ml-auto" />
                        )
                      ) : (
                        <div className="w-8 h-8 bg-slate-900 text-white flex items-center justify-center font-black text-xs rounded-lg ml-auto">
                          {invoiceData.company.legalName?.trim() ? invoiceData.company.legalName.trim().charAt(0).toUpperCase() : "C"}
                        </div>
                      )}
                      <div className="bg-slate-100 px-2.5 py-1 rounded border border-slate-300">
                        <span className="text-[var(--text-muted)] block text-[8px] uppercase">Invoice Number</span>
                        <strong className="text-indigo-800 font-bold">{invoiceData.invoiceNumber}</strong>
                      </div>
                      <p className="text-slate-600">Date: {new Date(invoiceData.invoiceDate).toLocaleDateString()}</p>
                      <p className="text-slate-800 font-bold">GSTIN: {invoiceData.company.gstin}</p>
                    </div>
                  </div>

                  {/* Metadata Grid */}
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 bg-slate-50 p-2.5 rounded-lg border border-slate-200 text-[10px]">
                    <div>
                      <span className="text-[var(--text-muted)] block text-[8px] uppercase">Order No</span>
                      <strong className="font-mono">#{invoiceData.orderNumber}</strong>
                    </div>
                    <div>
                      <span className="text-[var(--text-muted)] block text-[8px] uppercase">Payment Mode</span>
                      <strong className="font-mono">{invoiceData.paymentMethod}</strong>
                    </div>
                    <div>
                      <span className="text-[var(--text-muted)] block text-[8px] uppercase">Place of Supply</span>
                      <strong>{invoiceData.placeOfSupply}</strong>
                    </div>
                    <div>
                      <span className="text-[var(--text-muted)] block text-[8px] uppercase">GST Route</span>
                      <strong className="text-indigo-900">
                        {invoiceData.isIntraState ? "Intra-State (CGST+SGST)" : "Inter-State (IGST)"}
                      </strong>
                    </div>
                  </div>

                  {/* Customer Billed / Shipped */}
                  <div className="grid grid-cols-2 gap-4 border-b border-slate-200 pb-3 text-[11px]">
                    <div>
                      <span className="text-[9px] font-black uppercase text-[var(--text-muted)] block mb-0.5">
                        Billed To (Customer):
                      </span>
                      <p className="font-bold text-slate-900">{invoiceData.customer.billingAddress?.name}</p>
                      <p className="text-slate-600 text-[10px]">
                        {invoiceData.customer.billingAddress?.address1}
                        {invoiceData.customer.billingAddress?.address2 ? `, ${invoiceData.customer.billingAddress?.address2}` : ""}, {invoiceData.customer.billingAddress?.city}, {invoiceData.customer.billingAddress?.state} - {invoiceData.customer.billingAddress?.zip}
                      </p>
                      {invoiceData.customer.phone && <p className="text-slate-600 text-[10px] font-mono">Ph: {invoiceData.customer.phone}</p>}
                    </div>

                    <div className="border-l pl-3 border-slate-200">
                      <span className="text-[9px] font-black uppercase text-[var(--text-muted)] block mb-0.5">
                        Shipped To:
                      </span>
                      <p className="font-bold text-slate-900">{invoiceData.customer.shippingAddress?.name}</p>
                      <p className="text-slate-600 text-[10px]">
                        {invoiceData.customer.shippingAddress?.address1}
                        {invoiceData.customer.shippingAddress?.address2 ? `, ${invoiceData.customer.shippingAddress?.address2}` : ""}, {invoiceData.customer.shippingAddress?.city}, {invoiceData.customer.shippingAddress?.state} - {invoiceData.customer.shippingAddress?.zip}
                      </p>
                    </div>
                  </div>

                  {/* Items Table */}
                  <table className="w-full text-left text-[10px] border-collapse border border-slate-300">
                    <thead>
                      <tr className="bg-slate-100 font-bold uppercase text-[8px] text-slate-700 border-b border-slate-300">
                        <th className="p-1.5 border-r border-slate-300 text-center w-6">#</th>
                        <th className="p-1.5 border-r border-slate-300">Item &amp; SKU</th>
                        <th className="p-1.5 border-r border-slate-300 text-center">HSN</th>
                        <th className="p-1.5 border-r border-slate-300 text-center">Qty</th>
                        <th className="p-1.5 border-r border-slate-300 text-right">Unit Price (₹)</th>
                        <th className="p-1.5 border-r border-slate-300 text-right">Discount (₹)</th>
                        <th className="p-1.5 border-r border-slate-300 text-right">Taxable Val (₹)</th>
                        {invoiceData.isIntraState ? (
                          <>
                            <th className="p-1.5 border-r border-slate-300 text-right">CGST</th>
                            <th className="p-1.5 border-r border-slate-300 text-right">SGST</th>
                          </>
                        ) : (
                          <th className="p-1.5 border-r border-slate-300 text-right">IGST</th>
                        )}
                        <th className="p-1.5 text-right">Total (₹)</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-200">
                      {invoiceData.items.map((it: any, idx: number) => {
                        if (it.isComboHeader) {
                          return (
                            <tr key={idx} className="bg-slate-100/90 font-bold border-t border-b border-slate-300">
                              <td className="p-1.5 border-r border-slate-300 text-center text-slate-800">{it.srNo}</td>
                              <td className="p-1.5 border-r border-slate-300">
                                <span className="font-extrabold text-indigo-950 block">COMBO: {it.title}</span>
                                <span className="font-mono text-[8px] text-slate-600 block">
                                  SKU: {it.sku} • [COMBO KIT] — Included Invoice Components:
                                </span>
                              </td>
                              <td className="p-1.5 border-r border-slate-300 text-center font-mono text-slate-400">—</td>
                              <td className="p-1.5 border-r border-slate-300 text-center font-bold text-slate-900">{it.quantity}</td>
                              <td className="p-1.5 border-r border-slate-300 text-right font-mono text-slate-900">
                                ₹{(it.unitPrice ?? 0).toFixed(2)}
                              </td>
                              <td className="p-1.5 border-r border-slate-300 text-right font-mono text-emerald-800">
                                {it.discountAmount && it.discountAmount > 0 ? `₹${it.discountAmount.toFixed(2)}` : "—"}
                              </td>
                              <td className="p-1.5 border-r border-slate-300 text-right font-mono text-slate-400">—</td>
                              {invoiceData.isIntraState ? (
                                <>
                                  <td className="p-1.5 border-r border-slate-300 text-right font-mono text-slate-400">—</td>
                                  <td className="p-1.5 border-r border-slate-300 text-right font-mono text-slate-400">—</td>
                                </>
                              ) : (
                                <td className="p-1.5 border-r border-slate-300 text-right font-mono text-slate-400">—</td>
                              )}
                              <td className="p-1.5 text-right font-mono font-black text-slate-950">₹{it.grossTotal.toFixed(2)}</td>
                            </tr>
                          );
                        }

                        if (it.isComboComponent) {
                          return (
                            <tr key={idx} className="bg-white hover:bg-slate-50 text-[9.5px]">
                              <td className="p-1.5 border-r border-slate-300 text-center text-indigo-500 font-mono">↳</td>
                              <td className="p-1.5 border-r border-slate-300 pl-3">
                                <div className="border-l-2 border-indigo-400 pl-2 py-0.5">
                                  <span className="font-bold text-slate-900 block">{it.title}</span>
                                  <span className="font-mono text-[8.5px] text-slate-500">
                                    Component SKU: {it.sku} • GST: {it.taxRate}%
                                  </span>
                                </div>
                              </td>
                              <td className="p-1.5 border-r border-slate-300 text-center font-mono text-[9px]">{it.hsnCode || "—"}</td>
                              <td className="p-1.5 border-r border-slate-300 text-center font-semibold">{it.quantity}</td>
                              <td className="p-1.5 border-r border-slate-300 text-right font-mono">
                                ₹{(it.unitPrice ?? 0).toFixed(2)}
                              </td>
                              <td className="p-1.5 border-r border-slate-300 text-right font-mono text-emerald-800">
                                {it.discountAmount && it.discountAmount > 0 ? `₹${it.discountAmount.toFixed(2)}` : "—"}
                              </td>
                              <td className="p-1.5 border-r border-slate-300 text-right font-mono font-semibold">
                                ₹{it.taxableValue.toFixed(2)}
                              </td>
                              {invoiceData.isIntraState ? (
                                <>
                                  <td className="p-1.5 border-r border-slate-300 text-right font-mono text-emerald-800">
                                    ₹{it.cgstAmount.toFixed(2)}
                                  </td>
                                  <td className="p-1.5 border-r border-slate-300 text-right font-mono text-emerald-800">
                                    ₹{it.sgstAmount.toFixed(2)}
                                  </td>
                                </>
                              ) : (
                                <td className="p-1.5 border-r border-slate-300 text-right font-mono text-cyan-800">
                                  ₹{it.igstAmount.toFixed(2)}
                                </td>
                              )}
                              <td className="p-1.5 text-right font-mono font-bold text-slate-800">₹{it.grossTotal.toFixed(2)}</td>
                            </tr>
                          );
                        }

                        return (
                          <tr key={it.srNo ?? idx}>
                            <td className="p-1.5 border-r border-slate-300 text-center text-[var(--text-muted)]">{it.srNo}</td>
                            <td className="p-1.5 border-r border-slate-300">
                              <span className="font-bold block">{it.title}</span>
                              <span className="font-mono text-[var(--text-muted)] text-[9px]">
                                {it.sku} {it.type === "COMBO" ? "• [COMBO]" : ""}
                              </span>
                            </td>
                            <td className="p-1.5 border-r border-slate-300 text-center font-mono">{it.hsnCode || "—"}</td>
                            <td className="p-1.5 border-r border-slate-300 text-center font-bold">{it.quantity}</td>
                            <td className="p-1.5 border-r border-slate-300 text-right font-mono">
                              ₹{(it.unitPrice ?? it.unitPriceExclTax ?? 0).toFixed(2)}
                            </td>
                            <td className="p-1.5 border-r border-slate-300 text-right font-mono text-emerald-800">
                              {it.discountAmount && it.discountAmount > 0 ? `₹${it.discountAmount.toFixed(2)}` : "—"}
                            </td>
                            <td className="p-1.5 border-r border-slate-300 text-right font-mono">₹{it.taxableValue.toFixed(2)}</td>
                            {invoiceData.isIntraState ? (
                              <>
                                <td className="p-1.5 border-r border-slate-300 text-right font-mono text-emerald-800">₹{it.cgstAmount.toFixed(2)}</td>
                                <td className="p-1.5 border-r border-slate-300 text-right font-mono text-emerald-800">₹{it.sgstAmount.toFixed(2)}</td>
                              </>
                            ) : (
                              <td className="p-1.5 border-r border-slate-300 text-right font-mono text-cyan-800">₹{it.igstAmount.toFixed(2)}</td>
                            )}
                            <td className="p-1.5 text-right font-mono font-black">₹{it.grossTotal.toFixed(2)}</td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>

                  {/* Summary & Bank Info */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-2">
                    <div className="text-[9px] space-y-1">
                      <span className="font-bold text-slate-700 block">Bank Account:</span>
                      <p className="text-slate-600">{invoiceData.company.bankName} | A/C: {invoiceData.company.accountNumber}</p>
                      <p className="text-slate-600">IFSC: {invoiceData.company.ifscCode} | UPI: {invoiceData.company.upiId}</p>
                      <p className="text-[var(--text-muted)] italic pt-1">Amount in Words: {invoiceData.summary.amountInWords}</p>
                    </div>

                    <div className="border border-slate-300 p-2.5 rounded bg-slate-50 space-y-1 text-[10px]">
                      <div className="flex justify-between text-slate-600">
                        <span>Taxable Amount:</span>
                        <span className="font-mono font-bold">₹{invoiceData.summary.subtotalTaxable.toFixed(2)}</span>
                      </div>
                      {invoiceData.summary.totalDiscounts && invoiceData.summary.totalDiscounts > 0 ? (
                        <div className="flex justify-between text-emerald-800 font-mono text-[9px] font-bold">
                          <span>Discounts:</span>
                          <span>-₹{invoiceData.summary.totalDiscounts.toFixed(2)}</span>
                        </div>
                      ) : null}
                      <div className="flex justify-between text-slate-600">
                        <span>Total Tax:</span>
                        <span className="font-mono font-bold text-amber-800">₹{invoiceData.summary.totalTax.toFixed(2)}</span>
                      </div>
                      <div className="flex justify-between items-center pt-1 border-t border-slate-300 font-bold text-xs">
                        <span>Grand Total:</span>
                        <span className="font-mono font-black text-indigo-900 text-sm">
                          ₹{Number(invoiceData.summary.grandTotal).toFixed(2)}
                        </span>
                      </div>
                    </div>
                  </div>

                  {/* Footer: Terms & Authorized Signatory with Signature */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-3 border-t border-slate-300 text-[9px]">
                    <div className="space-y-0.5">
                      <span className="font-bold text-slate-800 uppercase tracking-wider block text-[8px]">Terms &amp; Conditions:</span>
                      <p className="text-slate-600 whitespace-pre-line leading-tight">{invoiceData.company.termsConditions}</p>
                    </div>

                    <div className="text-right space-y-1 flex flex-col justify-end">
                      <span className="text-slate-700 font-bold block text-[9px]">
                        For {invoiceData.company.legalName || "Seller"}:
                      </span>

                      <div className="h-10 flex items-center justify-end">
                        {invoiceData.company.signatureUrl ? (
                          invoiceData.company.signatureUrl?.startsWith("data:application/pdf") ? (
                            <div className="border border-slate-400 rounded px-2 py-0.5 inline-flex items-center gap-1 bg-white">
                              <FileText size={12} className="text-rose-500" />
                              <span className="text-[9px] font-bold text-slate-900">Authorized Stamp Attached</span>
                            </div>
                          ) : (
                            <img
                              src={invoiceData.company.signatureUrl}
                              alt="Authorized Signature"
                              className="h-9 max-w-[130px] object-contain inline-block"
                            />
                          )
                        ) : (
                          <div className="border-b border-dashed border-slate-400 w-28 h-5 flex items-end justify-center">
                            <span className="text-[8px] italic text-[var(--text-secondary)] font-mono">[ Digitally Signed ]</span>
                          </div>
                        )}
                      </div>

                      <span className="font-bold text-slate-950 border-t-2 border-slate-900 pt-0.5 inline-block text-[9.5px]">
                        {invoiceData.company.authorizedSignatory || "Authorized Signatory"}
                      </span>
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
      </div>
    </RouteGuard>
  );
}
