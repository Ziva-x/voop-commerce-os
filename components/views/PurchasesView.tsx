"use client";

import { useEffect, useState } from "react";
import {
  Receipt,
  Plus,
  Filter,
  DollarSign,
  Calendar,
  Building,
  CheckCircle2,
  Clock,
  Trash2,
  ChevronDown,
  ChevronUp,
  FileText,
  Boxes,
  Truck,
  Megaphone,
  Layers,
  Wrench,
  HelpCircle,
  X,
  Search,
} from "lucide-react";
import { formatDate } from "@/lib/utils";
import { CardGridSkeleton, TableSkeleton } from "@/components/LoadingSkeleton";
import { appFetch } from "@/lib/api";
import { RouteGuard } from "@/components/auth/RouteGuard";
import { SearchInput } from "@/components/ui/Input";

const BILL_TYPE_CONFIG: Record<string, { label: string; icon: any; color: string; bg: string }> = {
  INVENTORY: { label: "Inventory (GRN)", icon: Boxes, color: "text-emerald-400", bg: "bg-emerald-500/10 border-emerald-500/20" },
  TRANSPORTATION: { label: "Transportation & Freight", icon: Truck, color: "text-purple-400", bg: "bg-purple-500/10 border-purple-500/20" },
  SHIPPING_LOGISTICS: { label: "Transportation & Freight", icon: Truck, color: "text-purple-400", bg: "bg-purple-500/10 border-purple-500/20" },
  PACKAGING: { label: "Packaging Supplies", icon: Layers, color: "text-amber-400", bg: "bg-amber-500/10 border-amber-500/20" },
  MARKETING_ADS: { label: "Marketing / Collab", icon: Megaphone, color: "text-pink-400", bg: "bg-pink-500/10 border-pink-500/20" },
  OPERATIONAL_OVERHEAD: { label: "Overhead & Rent", icon: Wrench, color: "text-blue-400", bg: "bg-blue-500/10 border-blue-500/20" },
  MISC: { label: "General Business", icon: HelpCircle, color: "text-[var(--text-secondary)]", bg: "bg-slate-500/10 border-slate-500/20" },
};

export default function PurchasesPage() {
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [filterType, setFilterType] = useState("ALL");
  const [filterPayment, setFilterPayment] = useState("ALL");
  const [searchSupplier, setSearchSupplier] = useState("");
  const [expandedBillId, setExpandedBillId] = useState<string | null>(null);

  // New Bill Modal State
  const [showModal, setShowModal] = useState(false);
  const [billForm, setBillForm] = useState({
    billNumber: "",
    billType: "INVENTORY",
    supplier: "",
    billDate: new Date().toISOString().split("T")[0],
    dueDate: "",
    paymentStatus: "PAID",
    paymentMode: "BANK_TRANSFER",
    notes: "",
    items: [
      { sku: "", itemName: "", category: "INVENTORY", quantity: 100, unitCost: 180, taxRate: 0, discount: 0, alreadyAddedToPnl: false },
    ],
  });

  const loadData = async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (filterType !== "ALL") params.append("billType", filterType);
      if (filterPayment !== "ALL") params.append("paymentStatus", filterPayment);
      if (searchSupplier) params.append("supplier", searchSupplier);

      const res = await appFetch(`/api/purchases?${params.toString()}`);
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
  }, [filterType, filterPayment]);

  const handleAddItemRow = () => {
    setBillForm({
      ...billForm,
      items: [
        ...billForm.items,
        { sku: "", itemName: "", category: billForm.billType, quantity: 1, unitCost: 0, taxRate: 0, discount: 0, alreadyAddedToPnl: false },
      ],
    });
  };

  const handleRemoveItemRow = (idx: number) => {
    const nextItems = billForm.items.filter((_, i) => i !== idx);
    setBillForm({ ...billForm, items: nextItems });
  };

  const handleItemChange = (idx: number, field: string, value: any) => {
    const nextItems = [...billForm.items];
    nextItems[idx] = { ...nextItems[idx], [field]: value };
    setBillForm({ ...billForm, items: nextItems });
  };

  const handleCreateBill = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const res = await appFetch("/api/purchases", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(billForm),
      });
      const json = await res.json();
      if (json.success) {
        setShowModal(false);
        // Reset Form
        setBillForm({
          billNumber: "",
          billType: "INVENTORY",
          supplier: "",
          billDate: new Date().toISOString().split("T")[0],
          dueDate: "",
          paymentStatus: "PAID",
          paymentMode: "BANK_TRANSFER",
          notes: "",
          items: [
            { sku: "", itemName: "", category: "INVENTORY", quantity: 100, unitCost: 180, taxRate: 0, discount: 0, alreadyAddedToPnl: false },
          ],
        });
        await loadData();
      } else {
        alert(json.error || "Failed to create bill");
      }
    } catch (e: any) {
      alert(e.message);
    }
  };

  const handleDeleteBill = async (id: string, billNumber: string) => {
    if (!confirm(`Are you sure you want to delete Bill ${billNumber}? This will reverse inventory stock.`)) return;
    try {
      await appFetch(`/api/purchases?id=${id}`, { method: "DELETE" });
      await loadData();
    } catch (e) {
      console.error(e);
    }
  };

  const summary = data?.summary || {};
  const bills = data?.bills || [];
  const typeBreakdown = summary?.typeBreakdown || {};

  return (
    <RouteGuard requiredPermission="purchases.view" moduleName="Purchases & Inward Bills">
      <div className="space-y-6 min-w-0">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-[var(--border)]/80 pb-4">
        <div>
          <h2 className="text-xl sm:text-2xl font-bold text-[var(--text-primary)] tracking-tight flex items-center gap-2">
            <Receipt className="text-cyan-400" size={24} />
            <span>Purchases &amp; Expense Invoices</span>
          </h2>
          <p className="text-xs text-[var(--text-secondary)] mt-1">
            Log vendor purchase bills (GRN), transportation freight, packaging, and operating expenses.
          </p>
        </div>

        <button
          onClick={() => {
            setBillForm({
              ...billForm,
              billNumber: `BILL-${Math.floor(100000 + Math.random() * 900000)}`,
            });
            setShowModal(true);
          }}
          className="flex items-center gap-1.5 px-4 py-2.5 rounded-xl bg-cyan-500 hover:bg-cyan-400 text-slate-950 text-xs font-bold shadow-lg shadow-cyan-500/20 transition-all self-start sm:self-auto cursor-pointer"
        >
          <Plus size={15} />
          <span>Record New Bill / Invoice</span>
        </button>
      </div>

      {/* KPI Cards */}
      {loading ? (
        <CardGridSkeleton count={4} />
      ) : (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 animate-fade-in">
          <div className="glass-panel p-5 space-y-1.5">
            <span className="text-xs font-semibold text-[var(--text-muted)] uppercase tracking-wider flex items-center gap-1.5">
              <DollarSign size={14} className="text-cyan-600 dark:text-cyan-400" /> Total Billed Amount
            </span>
            <p className="text-2xl sm:text-3xl font-black text-[var(--text-primary)] font-mono">
              ₹{(summary.totalAmount ?? 0).toLocaleString("en-IN", { minimumFractionDigits: 2 })}
            </p>
            <p className="text-xs text-[var(--text-muted)]">{summary.totalBills ?? 0} Recorded Invoices</p>
          </div>

          <div className="glass-panel p-5 space-y-1.5 border-l-4 border-l-purple-500">
            <span className="text-xs font-semibold text-purple-600 dark:text-purple-400 uppercase tracking-wider flex items-center gap-1.5">
              <Truck size={14} /> Transportation &amp; Freight
            </span>
            <p className="text-2xl sm:text-3xl font-black text-purple-600 dark:text-purple-400 font-mono">
              ₹{(typeBreakdown.TRANSPORTATION ?? 0).toLocaleString("en-IN", { minimumFractionDigits: 2 })}
            </p>
            <p className="text-xs text-[var(--text-muted)]">Courier &amp; Cargo Freight Bills</p>
          </div>

          <div className="glass-panel p-5 space-y-1.5 border-l-4 border-l-emerald-500">
            <span className="text-xs font-semibold text-emerald-600 dark:text-emerald-400 uppercase tracking-wider flex items-center gap-1.5">
              <Boxes size={14} /> Inventory (GRN)
            </span>
            <p className="text-2xl sm:text-3xl font-black text-emerald-600 dark:text-emerald-400 font-mono">
              ₹{(typeBreakdown.INVENTORY ?? 0).toLocaleString("en-IN", { minimumFractionDigits: 2 })}
            </p>
            <p className="text-xs text-[var(--text-muted)]">Physical Stock Purchases</p>
          </div>

          <div className="glass-panel p-5 space-y-1.5 border-l-4 border-l-amber-500">
            <span className="text-xs font-semibold text-amber-600 dark:text-amber-400 uppercase tracking-wider flex items-center gap-1.5">
              <Layers size={14} /> Packaging Supplies
            </span>
            <p className="text-2xl sm:text-3xl font-black text-amber-600 dark:text-amber-400 font-mono">
              ₹{(typeBreakdown.PACKAGING ?? 0).toLocaleString("en-IN", { minimumFractionDigits: 2 })}
            </p>
            <p className="text-xs text-[var(--text-muted)]">Boxes, Tape &amp; Materials</p>
          </div>
        </div>
      )}

      {/* Filter & Search Bar */}
      <div className="glass-panel p-4 sm:p-5 flex flex-wrap gap-3.5 items-center">
        <div className="w-56">
          <select
            value={filterType}
            onChange={(e) => setFilterType(e.target.value)}
            className="w-full bg-[var(--surface)] border border-[var(--border)] rounded-xl px-3.5 py-2.5 text-sm text-[var(--text-primary)] focus:outline-none focus:border-[var(--accent)] font-medium cursor-pointer"
          >
            <option value="ALL">All Categories</option>
            <option value="INVENTORY">Inventory (GRN)</option>
            <option value="TRANSPORTATION">Transportation &amp; Freight</option>
            <option value="PACKAGING">Packaging Supplies</option>
            <option value="MARKETING_ADS">Marketing &amp; Ads</option>
            <option value="OPERATIONAL_OVERHEAD">Overheads &amp; Rent</option>
            <option value="MISC">General Business</option>
          </select>
        </div>

        <div className="w-48">
          <select
            value={filterPayment}
            onChange={(e) => setFilterPayment(e.target.value)}
            className="w-full bg-[var(--surface)] border border-[var(--border)] rounded-xl px-3.5 py-2.5 text-sm text-[var(--text-primary)] focus:outline-none focus:border-[var(--accent)] font-medium cursor-pointer"
          >
            <option value="ALL">All Payment Status</option>
            <option value="PAID">Paid</option>
            <option value="PENDING">Pending</option>
            <option value="PARTIAL">Partial</option>
          </select>
        </div>

        <div className="flex-1 min-w-[220px]">
          <SearchInput
            placeholder="Search vendor or supplier name..."
            value={searchSupplier}
            onChange={(e) => setSearchSupplier(e.target.value)}
            onClear={() => {
              setSearchSupplier("");
            }}
            onKeyDown={(e) => {
              if (e.key === "Enter") loadData();
            }}
            className="py-2.5 text-sm"
          />
        </div>

        <button
          onClick={loadData}
          className="px-5 py-2.5 rounded-xl bg-slate-100 dark:bg-[var(--surface-hover)] hover:bg-[var(--surface-hover)] text-[var(--text-primary)] border border-[var(--border)] text-sm font-semibold cursor-pointer"
        >
          Filter
        </button>
      </div>

      {/* Bills Table */}
      <div className="glass-panel overflow-hidden">
        {loading ? (
          <TableSkeleton rows={8} cols={8} />
        ) : (
          <div className="overflow-x-auto animate-fade-in">
            <table className="w-full text-left text-sm text-[var(--text-secondary)]">
              <thead className="bg-[var(--bg-secondary)]/90 text-[var(--text-muted)] uppercase text-xs tracking-wider border-b border-[var(--border)] font-semibold">
                <tr>
                  <th className="py-3.5 px-5">Invoice #</th>
                  <th className="py-3.5 px-5">Category</th>
                  <th className="py-3.5 px-5">Supplier / Vendor</th>
                  <th className="py-3.5 px-5">Date</th>
                  <th className="py-3.5 px-5">Items / SKUs</th>
                  <th className="py-3.5 px-5">Payment Status</th>
                  <th className="py-3.5 px-5">Total Amount</th>
                  <th className="py-3.5 px-5 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--border)]/80">
                {bills.length === 0 ? (
                  <tr>
                    <td colSpan={8} className="py-16 text-center text-[var(--text-muted)] text-sm">
                      No purchase bills recorded. Click &quot;Record New Bill&quot; above to log expenses.
                    </td>
                  </tr>
                ) : (
                  bills.map((bill: any) => {
                  const typeConf = BILL_TYPE_CONFIG[bill.billType] || BILL_TYPE_CONFIG.MISC;
                  const TypeIcon = typeConf.icon;
                  const isExpanded = expandedBillId === bill.id;

                  return (
                    <tr key={bill.id} className="table-row-hover">
                      <td className="py-3 px-4 font-mono font-bold text-[var(--text-primary)] select-all">
                        {bill.billNumber}
                      </td>
                      <td className="py-3 px-4">
                        <span className={`px-2 py-0.5 rounded text-[10px] font-bold border inline-flex items-center gap-1 ${typeConf.bg} ${typeConf.color}`}>
                          <TypeIcon size={10} />
                          <span>{typeConf.label}</span>
                        </span>
                      </td>
                      <td className="py-3 px-4 font-medium text-[var(--text-primary)]">{bill.supplier}</td>
                      <td className="py-3 px-4 text-[var(--text-secondary)] font-mono">{formatDate(bill.billDate)}</td>
                      <td className="py-3 px-4">
                        <span className="text-[11px] text-[var(--text-secondary)]">
                          {bill.items?.length || 0} line item{bill.items?.length !== 1 ? "s" : ""}
                        </span>
                      </td>
                      <td className="py-3 px-4">
                        <span
                          className={`badge ${
                            bill.paymentStatus === "PAID"
                              ? "badge-success"
                              : bill.paymentStatus === "PARTIAL"
                              ? "badge-warning"
                              : "badge-danger"
                          }`}
                        >
                          {bill.paymentStatus}
                        </span>
                      </td>
                      <td className="py-3 px-4 font-mono font-bold text-[var(--text-primary)] text-sm">
                        ₹{bill.totalAmount.toFixed(2)}
                      </td>
                      <td className="py-3 px-4 text-right">
                        <div className="flex items-center justify-end gap-1.5">
                          <button
                            onClick={() => setExpandedBillId(isExpanded ? null : bill.id)}
                            className="p-1 text-[var(--text-secondary)] hover:text-white rounded hover:bg-[var(--surface-hover)]"
                            title="View line items"
                          >
                            {isExpanded ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
                          </button>
                          <button
                            onClick={() => handleDeleteBill(bill.id, bill.billNumber)}
                            className="p-1 text-red-400 hover:text-red-300 rounded hover:bg-red-500/10"
                            title="Delete Bill"
                          >
                            <Trash2 size={13} />
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
      )}
    </div>

      {/* RECORD NEW BILL MODAL */}
      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4 backdrop-blur-sm">
          <div className="w-full max-w-2xl bg-slate-950 border border-cyan-500/40 rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">
            <div className="p-4 sm:p-5 bg-[var(--surface)] border-b border-[var(--border)] flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <div className="p-2 rounded-xl bg-cyan-500/20 text-cyan-400 border border-cyan-500/30">
                  <Receipt size={20} />
                </div>
                <div>
                  <h3 className="font-bold text-[var(--text-primary)] text-base">Record New Bill / Invoice</h3>
                  <p className="text-xs text-[var(--text-secondary)]">
                    Log inventory purchases, transportation freight bills, and operational expenses.
                  </p>
                </div>
              </div>
              <button
                onClick={() => setShowModal(false)}
                className="p-1 rounded-lg text-[var(--text-secondary)] hover:text-white hover:bg-[var(--surface-hover)] cursor-pointer"
              >
                <X size={18} />
              </button>
            </div>

            <form onSubmit={handleCreateBill} className="p-4 sm:p-6 overflow-y-auto space-y-4 text-xs">
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div>
                  <label className="text-[var(--text-secondary)] font-semibold block mb-1">Invoice / Bill Number *</label>
                  <input
                    type="text"
                    required
                    placeholder="e.g. INV-2026-089"
                    value={billForm.billNumber}
                    onChange={(e) => setBillForm({ ...billForm, billNumber: e.target.value })}
                    className="w-full bg-[var(--surface)] border border-[var(--border)] rounded-lg px-3 py-2 text-[var(--text-primary)] font-mono"
                  />
                </div>

                <div>
                  <label className="text-[var(--text-secondary)] font-semibold block mb-1">Bill Category *</label>
                  <select
                    value={billForm.billType}
                    onChange={(e) => setBillForm({ ...billForm, billType: e.target.value })}
                    className="w-full bg-[var(--surface)] border border-[var(--border)] rounded-lg px-3 py-2 text-[var(--text-primary)] font-semibold"
                  >
                    <option value="INVENTORY">Inventory (GRN Physical Stock)</option>
                    <option value="TRANSPORTATION">Transportation &amp; Freight</option>
                    <option value="PACKAGING">Packaging Boxes &amp; Tape</option>
                    <option value="MARKETING_ADS">Marketing &amp; Ads</option>
                    <option value="OPERATIONAL_OVERHEAD">Operating Overheads &amp; Rent</option>
                    <option value="MISC">General Business Expenses</option>
                  </select>
                </div>

                <div>
                  <label className="text-[var(--text-secondary)] font-semibold block mb-1">Supplier / Vendor Name *</label>
                  <input
                    type="text"
                    required
                    placeholder="e.g. Apex Plastics Ltd / Delhivery"
                    value={billForm.supplier}
                    onChange={(e) => setBillForm({ ...billForm, supplier: e.target.value })}
                    className="w-full bg-[var(--surface)] border border-[var(--border)] rounded-lg px-3 py-2 text-[var(--text-primary)]"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div>
                  <label className="text-[var(--text-secondary)] font-semibold block mb-1">Bill Date</label>
                  <input
                    type="date"
                    value={billForm.billDate}
                    onChange={(e) => setBillForm({ ...billForm, billDate: e.target.value })}
                    className="w-full bg-[var(--surface)] border border-[var(--border)] rounded-lg px-3 py-2 text-[var(--text-primary)]"
                  />
                </div>

                <div>
                  <label className="text-[var(--text-secondary)] font-semibold block mb-1">Payment Status</label>
                  <select
                    value={billForm.paymentStatus}
                    onChange={(e) => setBillForm({ ...billForm, paymentStatus: e.target.value })}
                    className="w-full bg-[var(--surface)] border border-[var(--border)] rounded-lg px-3 py-2 text-[var(--text-primary)]"
                  >
                    <option value="PAID">Paid</option>
                    <option value="PENDING">Pending</option>
                    <option value="PARTIAL">Partially Paid</option>
                  </select>
                </div>

                <div>
                  <label className="text-[var(--text-secondary)] font-semibold block mb-1">Payment Mode</label>
                  <select
                    value={billForm.paymentMode}
                    onChange={(e) => setBillForm({ ...billForm, paymentMode: e.target.value })}
                    className="w-full bg-[var(--surface)] border border-[var(--border)] rounded-lg px-3 py-2 text-[var(--text-primary)]"
                  >
                    <option value="BANK_TRANSFER">Bank Transfer / NEFT</option>
                    <option value="UPI">UPI / GPay</option>
                    <option value="CARD">Credit / Debit Card</option>
                    <option value="CASH">Cash</option>
                  </select>
                </div>
              </div>

              {/* Line Items Builder */}
              <div className="space-y-2 pt-2 border-t border-[var(--border)]">
                <div className="flex justify-between items-center">
                  <span className="font-bold text-[var(--text-primary)]">Line Items (SKUs &amp; Services):</span>
                  <button
                    type="button"
                    onClick={handleAddItemRow}
                    className="text-xs text-cyan-400 hover:text-cyan-300 font-semibold flex items-center gap-1 cursor-pointer"
                  >
                    <Plus size={13} /> Add Item Row
                  </button>
                </div>

                <div className="space-y-2 max-h-60 overflow-y-auto pr-1">
                  {billForm.items.map((item, idx) => (
                    <div key={idx} className="grid grid-cols-12 gap-2 bg-[var(--surface)] p-2.5 rounded-lg border border-[var(--border)] items-end">
                      <div className="col-span-3">
                        <label className="text-[10px] text-[var(--text-secondary)] block mb-0.5">
                          SKU {billForm.billType === "INVENTORY" ? "(Required for GRN)" : "(Optional)"}
                        </label>
                        <input
                          type="text"
                          placeholder="e.g. FOAM"
                          value={item.sku}
                          onChange={(e) => handleItemChange(idx, "sku", e.target.value)}
                          className="w-full bg-[var(--bg-secondary)] border border-[var(--border)] rounded px-2 py-1 text-[var(--text-primary)] font-mono uppercase text-xs"
                        />
                      </div>

                      <div className="col-span-3">
                        <label className="text-[10px] text-[var(--text-secondary)] block mb-0.5">Item / Service Name *</label>
                        <input
                          type="text"
                          required
                          placeholder="e.g. Foam Sprayer / Freight Charges"
                          value={item.itemName}
                          onChange={(e) => handleItemChange(idx, "itemName", e.target.value)}
                          className="w-full bg-[var(--bg-secondary)] border border-[var(--border)] rounded px-2 py-1 text-[var(--text-primary)] text-xs"
                        />
                      </div>

                      <div className="col-span-2">
                        <label className="text-[10px] text-[var(--text-secondary)] block mb-0.5">Quantity</label>
                        <input
                          type="number"
                          min="1"
                          value={item.quantity}
                          onChange={(e) => handleItemChange(idx, "quantity", parseFloat(e.target.value) || 1)}
                          className="w-full bg-[var(--bg-secondary)] border border-[var(--border)] rounded px-2 py-1 text-[var(--text-primary)] font-mono text-xs"
                        />
                      </div>

                      <div className="col-span-2">
                        <label className="text-[10px] text-[var(--text-secondary)] block mb-0.5">Unit Cost (₹)</label>
                        <input
                          type="number"
                          min="0"
                          step="0.1"
                          value={item.unitCost}
                          onChange={(e) => handleItemChange(idx, "unitCost", parseFloat(e.target.value) || 0)}
                          className="w-full bg-[var(--bg-secondary)] border border-[var(--border)] rounded px-2 py-1 text-[var(--text-primary)] font-mono text-xs"
                        />
                      </div>

                      {/* Already in P&L checkbox */}
                      <div className="col-span-1 flex flex-col items-center justify-end pb-1 gap-0.5">
                        <label
                          htmlFor={`pnl-flag-${idx}`}
                          className={`text-[9px] leading-tight font-semibold text-center cursor-pointer select-none ${
                            item.alreadyAddedToPnl ? "text-amber-400" : "text-[var(--text-muted)]"
                          }`}
                          title="Tick if this line item has already been recorded in P&L elsewhere. It will still count toward your bill total but will be excluded from P&L calculations to avoid double-counting."
                        >
                          In P&amp;L
                        </label>
                        <input
                          id={`pnl-flag-${idx}`}
                          type="checkbox"
                          checked={Boolean((item as any).alreadyAddedToPnl)}
                          onChange={(e) => handleItemChange(idx, "alreadyAddedToPnl", e.target.checked)}
                          className="w-3.5 h-3.5 accent-amber-400 cursor-pointer"
                          title="Already added to P&L — exclude from P&L calculations"
                        />
                      </div>

                      <div className="col-span-1 flex justify-center pb-1">
                        {billForm.items.length > 1 && (
                          <button
                            type="button"
                            onClick={() => handleRemoveItemRow(idx)}
                            className="text-red-400 hover:text-red-300 p-1"
                          >
                            <Trash2 size={13} />
                          </button>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Total Calculation Display */}
              <div className="p-3 bg-slate-900 rounded-xl border border-[var(--border)] flex justify-between items-center">
                <span className="text-[var(--text-secondary)] font-semibold">Total Bill Amount:</span>
                <span className="text-xl font-bold font-mono text-cyan-400">
                  ₹
                  {billForm.items
                    .reduce((acc, item) => acc + (item.quantity || 1) * (item.unitCost || 0), 0)
                    .toLocaleString("en-IN", { minimumFractionDigits: 2 })}
                </span>
              </div>

              {/* Modal Actions */}
              <div className="pt-2 flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setShowModal(false)}
                  className="px-4 py-2 rounded-xl bg-[var(--surface-hover)] hover:bg-slate-700 text-[var(--text-secondary)] font-semibold cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 rounded-xl bg-cyan-500 hover:bg-cyan-400 text-slate-950 font-bold shadow-md shadow-cyan-500/20 transition-all cursor-pointer"
                >
                  Post &amp; Save Bill
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
