"use client";

import React, { useState, useEffect, useRef, useMemo } from "react";
import {
  FilePlus,
  Search,
  Plus,
  Trash2,
  Save,
  MessageSquare,
  Printer,
  ChevronDown,
  RefreshCw,
  Package,
  Receipt,
  Truck,
  CreditCard,
  X,
  ExternalLink,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { appFetch } from "@/lib/api";
import { RouteGuard } from "@/components/auth/RouteGuard";
import { SearchInput } from "@/components/ui/Input";

type OfflineOrder = {
  id: string;
  orderNumber: string;
  channel: string;
  customerName: string | null;
  customerPhone: string | null;
  paymentMode: string;
  paymentStatus: string;
  totalAmount: number;
  status: string;
  trackingNumber: string | null;
  courier: string | null;
  createdAt: string;
  items: any[];
};

type SearchProduct = {
  sku: string;
  name: string;
  availableStock: number;
  currentStock: number;
  sellingPrice: number;
  taxRate: number;
  hsnCode: string;
  isTaxInclusive: boolean;
};

type LineItem = {
  id: string;
  sku: string;
  name: string;
  quantity: number;
  unitPrice: number;
  discount: number;
  taxRate: number;
  isTaxInclusive: boolean;
};

const CHANNELS = ["WALK_IN", "WHATSAPP", "PHONE", "INSTAGRAM"];
const COURIERS = ["Delhivery", "DTDC", "BlueDart", "Ecom", "XpressBees", "Other"];
const PAYMENT_MODES = ["CASH", "UPI", "CARD", "BANK_TRANSFER", "COD"];

export default function BillingPage() {
  const [activeTab, setActiveTab] = useState<"CREATE" | "RECENT">("CREATE");

  // ─── CREATE BILL STATE ──────────────────────────────────────────────────
  const [channel, setChannel] = useState("WALK_IN");
  const [customerName, setCustomerName] = useState("");
  const [customerPhone, setCustomerPhone] = useState("");
  const [customerAddress, setCustomerAddress] = useState("");
  
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<SearchProduct[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [showDropdown, setShowDropdown] = useState(false);
  
  const [lineItems, setLineItems] = useState<LineItem[]>([]);
  const [shippingCharge, setShippingCharge] = useState(0);
  const [paymentMode, setPaymentMode] = useState("CASH");
  const [paymentStatus, setPaymentStatus] = useState("PAID");
  const [advanceAmount, setAdvanceAmount] = useState(0);
  
  const [courier, setCourier] = useState("");
  const [trackingNumber, setTrackingNumber] = useState("");
  const [delhiveryRefNo, setDelhiveryRefNo] = useState("");
  const [notes, setNotes] = useState("");

  const [isSaving, setIsSaving] = useState(false);
  const [saveError, setSaveError] = useState("");
  const [saveSuccess, setSaveSuccess] = useState("");

  const searchRef = useRef<HTMLDivElement>(null);

  // ─── RECENT BILLS STATE ─────────────────────────────────────────────────
  const [recentOrders, setRecentOrders] = useState<OfflineOrder[]>([]);
  const [isLoadingOrders, setIsLoadingOrders] = useState(false);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);

  // ─── EFFECTS ────────────────────────────────────────────────────────────
  useEffect(() => {
    if (activeTab === "RECENT") {
      fetchOrders();
    }
  }, [activeTab, page]);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (searchRef.current && !searchRef.current.contains(event.target as Node)) {
        setShowDropdown(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  // ─── SEARCH LOGIC ───────────────────────────────────────────────────────
  useEffect(() => {
    const delayDebounceFn = setTimeout(async () => {
      if (!searchQuery.trim()) {
        setSearchResults([]);
        return;
      }
      setIsSearching(true);
      try {
        const res = await appFetch(`/api/billing/products?q=${encodeURIComponent(searchQuery)}`);
        const data = await res.json();
        if (data.success) {
          setSearchResults(data.products || []);
          setShowDropdown(true);
        }
      } catch (err) {
        console.error(err);
      } finally {
        setIsSearching(false);
      }
    }, 300);

    return () => clearTimeout(delayDebounceFn);
  }, [searchQuery]);

  // AWB Lookup
  const handleAwbLookup = async () => {
    if (!trackingNumber.trim()) return;
    try {
      const res = await appFetch(`/api/delhivery/lookup?awb=${trackingNumber}`);
      const data = await res.json();
      if (data.found) {
        if (data.referenceNo) setDelhiveryRefNo(data.referenceNo);
        if (data.customerName && !customerName) setCustomerName(data.customerName);
        if (data.customerPhone && !customerPhone) setCustomerPhone(data.customerPhone);
        if (data.payment) setPaymentMode(data.payment.toUpperCase() === "COD" ? "COD" : "PREPAID");
        if (data.carrier) setCourier(data.carrier);
      }
    } catch (e) {
      console.error(e);
    }
  };

  // ─── CART LOGIC ─────────────────────────────────────────────────────────
  const addProductToCart = (product: SearchProduct) => {
    const existingIndex = lineItems.findIndex(i => i.sku === product.sku);
    if (existingIndex >= 0) {
      const newItems = [...lineItems];
      newItems[existingIndex].quantity += 1;
      setLineItems(newItems);
    } else {
      setLineItems([...lineItems, {
        id: Math.random().toString(36).substring(7),
        sku: product.sku,
        name: product.name,
        quantity: 1,
        unitPrice: product.sellingPrice,
        discount: 0,
        taxRate: product.taxRate,
        isTaxInclusive: product.isTaxInclusive,
      }]);
    }
    setSearchQuery("");
    setShowDropdown(false);
  };

  const updateLineItem = (id: string, field: keyof LineItem, value: number) => {
    setLineItems(items => items.map(i => i.id === id ? { ...i, [field]: value } : i));
  };

  const removeLineItem = (id: string) => {
    setLineItems(items => items.filter(i => i.id !== id));
  };

  const cartTotals = useMemo(() => {
    let subtotal = 0;
    let totalDiscount = 0;
    let totalTax = 0;

    lineItems.forEach(item => {
      const lineBase = (item.quantity * item.unitPrice) - item.discount;
      const taxAmount = item.isTaxInclusive
        ? lineBase - (lineBase / (1 + item.taxRate / 100))
        : lineBase * (item.taxRate / 100);
      
      subtotal += lineBase;
      totalDiscount += item.discount;
      totalTax += taxAmount;
    });

    const grandTotal = subtotal + shippingCharge + (lineItems.some(i => !i.isTaxInclusive) ? totalTax : 0);

    return { subtotal, totalDiscount, totalTax, grandTotal };
  }, [lineItems, shippingCharge]);

  // ─── SAVE BILL ──────────────────────────────────────────────────────────
  const handleSaveBill = async (action: "SAVE" | "WHATSAPP" | "PRINT") => {
    if (lineItems.length === 0) {
      setSaveError("Please add at least one product to the bill.");
      return;
    }
    if (channel === "WHATSAPP" && !customerPhone) {
      setSaveError("Customer phone is required for WhatsApp orders.");
      return;
    }

    setIsSaving(true);
    setSaveError("");
    setSaveSuccess("");

    try {
      const res = await appFetch("/api/billing", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          channel,
          customerName,
          customerPhone,
          customerAddress: customerAddress ? { line1: customerAddress } : null,
          paymentMode,
          paymentStatus,
          advanceAmount,
          notes,
          courier: courier || null,
          trackingNumber: trackingNumber || null,
          delhiveryRefNo: delhiveryRefNo || null,
          shippingCharge,
          items: lineItems.map(i => ({
            sku: i.sku,
            productName: i.name,
            quantity: i.quantity,
            unitPrice: i.unitPrice,
            discount: i.discount,
            taxRate: i.taxRate,
            isTaxInclusive: i.isTaxInclusive
          }))
        })
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to save bill");

      setSaveSuccess(`Bill ${data.order.orderNumber} saved successfully!`);
      
      // Perform action
      if (action === "WHATSAPP" && customerPhone) {
        const text = `Hi ${customerName || ''},\nThank you for your order!\n\nOrder No: ${data.order.orderNumber}\nTotal Amount: ₹${cartTotals.grandTotal.toFixed(2)}\n\nBest regards,\nMonkeyGarage`;
        window.open(`https://wa.me/${customerPhone.replace(/\D/g, '')}?text=${encodeURIComponent(text)}`, '_blank');
      } else if (action === "PRINT") {
        // We can redirect to an invoice page if it existed, for now just show success
        alert(`Would print invoice for ${data.order.orderNumber}`);
      }

      // Reset form
      setLineItems([]);
      setCustomerName("");
      setCustomerPhone("");
      setCustomerAddress("");
      setTrackingNumber("");
      setCourier("");
      setNotes("");
      setShippingCharge(0);
      
    } catch (err: any) {
      setSaveError(err.message);
    } finally {
      setIsSaving(false);
    }
  };

  // ─── FETCH ORDERS ───────────────────────────────────────────────────────
  const fetchOrders = async () => {
    setIsLoadingOrders(true);
    try {
      const res = await appFetch(`/api/billing?page=${page}&limit=20`);
      const data = await res.json();
      if (data.success) {
        setRecentOrders(data.orders);
        setTotalPages(data.pagination.pages);
      }
    } catch (e) {
      console.error(e);
    } finally {
      setIsLoadingOrders(false);
    }
  };

  const handleCancelOrder = async (id: string) => {
    if (!confirm("Are you sure you want to cancel this order? Stock will be returned.")) return;
    try {
      const res = await appFetch(`/api/billing/${id}`, { method: "DELETE" });
      const data = await res.json();
      if (res.ok) {
        fetchOrders();
      } else {
        alert(data.error);
      }
    } catch (e) {
      console.error(e);
    }
  };

  // ─── RENDER ─────────────────────────────────────────────────────────────
  return (
    <RouteGuard requiredPermission="orders.view" moduleName="Manual Billing">
      <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Manual Billing</h1>
          <p className="text-sm text-[var(--text-secondary)]">Create walk-in, phone, WhatsApp, or custom manual orders.</p>
        </div>
        <div className="flex bg-[var(--surface-hover)] p-1 rounded-xl">
          <button
            onClick={() => setActiveTab("CREATE")}
            className={cn(
              "px-4 py-2 rounded-lg text-sm font-semibold transition-all",
              activeTab === "CREATE" ? "bg-cyan-500/20 text-cyan-400 shadow-sm" : "text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--surface-hover)]"
            )}
          >
            Create Bill
          </button>
          <button
            onClick={() => setActiveTab("RECENT")}
            className={cn(
              "px-4 py-2 rounded-lg text-sm font-semibold transition-all",
              activeTab === "RECENT" ? "bg-cyan-500/20 text-cyan-400 shadow-sm" : "text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--surface-hover)]"
            )}
          >
            Recent Bills
          </button>
        </div>
      </div>

      {activeTab === "CREATE" && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          {/* LEFT: Customer & Courier Form */}
          <div className="lg:col-span-4 space-y-6">
            <div className="glass-panel p-5 space-y-4">
              <h2 className="text-sm font-bold text-[var(--text-secondary)] flex items-center gap-2">
                <Receipt size={16} className="text-cyan-400"/> Order Details
              </h2>
              
              <div>
                <label className="block text-xs font-semibold text-[var(--text-secondary)] mb-1.5">Channel</label>
                <div className="grid grid-cols-2 gap-2">
                  {CHANNELS.map(ch => (
                    <button
                      key={ch}
                      onClick={() => setChannel(ch)}
                      className={cn(
                        "px-3 py-2 rounded-lg text-xs font-semibold border transition-all",
                        channel === ch 
                          ? "bg-cyan-500/20 border-cyan-500/30 text-cyan-400" 
                          : "border-[var(--border)] hover:bg-[var(--surface-hover)]/50 text-[var(--text-secondary)]"
                      )}
                    >
                      {ch.replace("_", " ")}
                    </button>
                  ))}
                </div>
              </div>

              <div className="space-y-3 pt-2">
                <div>
                  <label className="block text-xs font-semibold text-[var(--text-secondary)] mb-1.5">Customer Name</label>
                  <input
                    type="text"
                    value={customerName}
                    onChange={e => setCustomerName(e.target.value)}
                    className="w-full bg-[var(--surface)] border border-slate-200 dark:border-[var(--border)] rounded-lg px-3 py-2 text-sm focus:border-[var(--accent)] focus:ring-1 focus:ring-[var(--accent)]/20 outline-none text-slate-900 dark:text-slate-100"
                    placeholder="Walk-in Customer"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-[var(--text-secondary)] mb-1.5">Phone Number</label>
                  <input
                    type="tel"
                    value={customerPhone}
                    onChange={e => setCustomerPhone(e.target.value)}
                    className="w-full bg-[var(--surface)] border border-slate-200 dark:border-[var(--border)] rounded-lg px-3 py-2 text-sm focus:border-[var(--accent)] focus:ring-1 focus:ring-[var(--accent)]/20 outline-none text-slate-900 dark:text-slate-100"
                    placeholder="+91..."
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-[var(--text-secondary)] mb-1.5">Full Address (Optional)</label>
                  <textarea
                    value={customerAddress}
                    onChange={e => setCustomerAddress(e.target.value)}
                    rows={2}
                    className="w-full bg-[var(--surface)] border border-slate-200 dark:border-[var(--border)] rounded-lg px-3 py-2 text-sm focus:border-[var(--accent)] focus:ring-1 focus:ring-[var(--accent)]/20 outline-none resize-none text-slate-900 dark:text-slate-100"
                    placeholder="Shipping address if applicable..."
                  />
                </div>
              </div>
            </div>

            <div className="glass-panel p-5 space-y-4">
              <h2 className="text-sm font-bold text-[var(--text-secondary)] flex items-center gap-2">
                <Truck size={16} className="text-purple-400"/> Shipping & Tracking
              </h2>
              
              <div className="space-y-3">
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-semibold text-[var(--text-secondary)] mb-1.5">Courier</label>
                    <select
                      value={courier}
                      onChange={e => setCourier(e.target.value)}
                      className="w-full bg-[var(--surface)] border border-slate-200 dark:border-[var(--border)] rounded-lg px-3 py-2 text-sm focus:border-[var(--accent)] outline-none text-slate-900 dark:text-slate-100"
                    >
                      <option value="">None</option>
                      {COURIERS.map(c => <option key={c} value={c}>{c}</option>)}
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-[var(--text-secondary)] mb-1.5">Shipping Charge (₹)</label>
                    <input
                      type="number"
                      min="0"
                      value={shippingCharge}
                      onChange={e => setShippingCharge(parseFloat(e.target.value) || 0)}
                      className="w-full bg-[var(--surface)] border border-slate-200 dark:border-[var(--border)] rounded-lg px-3 py-2 text-sm focus:border-[var(--accent)] outline-none text-slate-900 dark:text-slate-100"
                    />
                  </div>
                </div>
                <div>
                  <label className="block text-xs font-semibold text-[var(--text-secondary)] mb-1.5 flex justify-between">
                    <span>Tracking Number / AWB</span>
                    {trackingNumber && (
                      <button onClick={handleAwbLookup} className="text-cyan-400 hover:underline text-[10px]">
                        Auto-fill from AWB
                      </button>
                    )}
                  </label>
                  <input
                    type="text"
                    value={trackingNumber}
                    onChange={e => setTrackingNumber(e.target.value)}
                    className="w-full bg-[var(--surface)] border border-slate-200 dark:border-[var(--border)] rounded-lg px-3 py-2 text-sm focus:border-[var(--accent)] outline-none uppercase text-slate-900 dark:text-slate-100"
                    placeholder="e.g. 139281234..."
                  />
                </div>
                {delhiveryRefNo && (
                  <p className="text-[10px] text-emerald-400">Delhivery Ref: {delhiveryRefNo}</p>
                )}
              </div>
            </div>
          </div>

          {/* RIGHT: Cart & Checkout */}
          <div className="lg:col-span-8 flex flex-col gap-6">
            <div className="glass-panel p-5 flex flex-col gap-4 flex-1">
              <h2 className="text-sm font-bold text-[var(--text-secondary)] flex items-center gap-2">
                <Package size={16} className="text-emerald-400"/> Line Items
              </h2>

              {/* Search Bar */}
              <div className="relative" ref={searchRef}>
                <SearchInput
                  value={searchQuery}
                  onChange={e => setSearchQuery(e.target.value)}
                  onFocus={() => { if(searchResults.length > 0) setShowDropdown(true); }}
                  onClear={() => setSearchQuery("")}
                  trailingIcon={
                    isSearching ? (
                      <RefreshCw size={16} className="text-[var(--text-muted)] animate-spin" />
                    ) : undefined
                  }
                  placeholder="Search by SKU or Product Name..."
                  className="py-3 text-sm"
                />

                {/* Dropdown */}
                {showDropdown && searchResults.length > 0 && (
                  <div className="absolute top-full left-0 right-0 mt-2 bg-[var(--surface)] border border-slate-200 dark:border-[var(--border)] rounded-xl shadow-xl overflow-hidden z-20 max-h-64 overflow-y-auto">
                    {searchResults.map((product) => (
                      <button
                        key={product.sku}
                        onClick={() => addProductToCart(product)}
                        className="w-full flex items-center justify-between p-3 border-b border-slate-100 dark:border-[var(--border)] hover:bg-slate-50 dark:hover:bg-[var(--surface-hover)]/50 transition-colors text-left"
                      >
                        <div>
                          <div className="font-semibold text-sm text-[var(--text-primary)]">{product.name}</div>
                          <div className="text-[11px] text-[var(--text-muted)] flex gap-2">
                            <span>SKU: {product.sku}</span>
                            <span>•</span>
                            <span className={product.availableStock > 0 ? "text-emerald-500 dark:text-emerald-400" : "text-red-500 dark:text-red-400"}>
                              Stock: {product.availableStock}
                            </span>
                          </div>
                        </div>
                        <div className="text-right">
                          <div className="font-mono text-sm text-cyan-600 dark:text-cyan-400">₹{product.sellingPrice}</div>
                          <div className="text-[10px] text-[var(--text-muted)]">GST: {product.taxRate}%</div>
                        </div>
                      </button>
                    ))}
                  </div>
                )}
              </div>

              {/* Cart Table */}
              <div className="border border-[var(--border)] rounded-xl overflow-x-auto flex-1 bg-[var(--surface)]">
                <table className="w-full text-left text-sm">
                  <thead className="bg-[var(--bg-secondary)]/50 border-b border-[var(--border)]">
                    <tr>
                      <th className="px-4 py-3 font-semibold text-[var(--text-secondary)]">Product</th>
                      <th className="px-4 py-3 font-semibold text-[var(--text-secondary)] w-24">Qty</th>
                      <th className="px-4 py-3 font-semibold text-[var(--text-secondary)] w-28">Price (₹)</th>
                      <th className="px-4 py-3 font-semibold text-[var(--text-secondary)] w-24">Disc (₹)</th>
                      <th className="px-4 py-3 font-semibold text-[var(--text-secondary)] w-20">GST</th>
                      <th className="px-4 py-3 font-semibold text-[var(--text-secondary)] w-24 text-right">Total</th>
                      <th className="px-4 py-3 w-10"></th>
                    </tr>
                  </thead>
                  <tbody>
                    {lineItems.length === 0 ? (
                      <tr>
                        <td colSpan={7} className="px-4 py-8 text-center text-[var(--text-muted)] italic">
                          No items added yet. Search above to add products.
                        </td>
                      </tr>
                    ) : (
                      lineItems.map(item => {
                        const lineBase = (item.quantity * item.unitPrice) - item.discount;
                        const lineTotal = item.isTaxInclusive ? lineBase : lineBase + (lineBase * (item.taxRate / 100));
                        
                        return (
                          <tr key={item.id} className="border-b border-slate-100 dark:border-[var(--border)]/50 group">
                            <td className="px-4 py-3">
                              <div className="font-semibold text-slate-800 dark:text-slate-200">{item.name}</div>
                              <div className="text-[10px] text-[var(--text-muted)] font-mono">{item.sku}</div>
                            </td>
                            <td className="px-4 py-3">
                              <input
                                type="number"
                                min="1"
                                value={item.quantity}
                                onChange={e => updateLineItem(item.id, "quantity", parseFloat(e.target.value) || 1)}
                                className="w-16 bg-[var(--bg-secondary)] border border-slate-200 dark:border-[var(--border)] rounded px-2 py-1 text-sm outline-none text-slate-900 dark:text-slate-100"
                              />
                            </td>
                            <td className="px-4 py-3">
                              <input
                                type="number"
                                min="0"
                                value={item.unitPrice}
                                onChange={e => updateLineItem(item.id, "unitPrice", parseFloat(e.target.value) || 0)}
                                className="w-20 bg-[var(--bg-secondary)] border border-slate-200 dark:border-[var(--border)] rounded px-2 py-1 text-sm outline-none text-slate-900 dark:text-slate-100"
                              />
                            </td>
                            <td className="px-4 py-3">
                              <input
                                type="number"
                                min="0"
                                value={item.discount}
                                onChange={e => updateLineItem(item.id, "discount", parseFloat(e.target.value) || 0)}
                                className="w-16 bg-[var(--bg-secondary)] border border-slate-200 dark:border-[var(--border)] rounded px-2 py-1 text-sm outline-none text-pink-500 dark:text-pink-400"
                              />
                            </td>
                            <td className="px-4 py-3 text-xs text-[var(--text-secondary)]">
                              {item.taxRate}% {item.isTaxInclusive ? "(Inc)" : "(Exc)"}
                            </td>
                            <td className="px-4 py-3 text-right font-mono font-semibold text-cyan-400">
                              ₹{lineTotal.toFixed(2)}
                            </td>
                            <td className="px-4 py-3">
                              <button
                                onClick={() => removeLineItem(item.id)}
                                className="text-[var(--text-muted)] hover:text-red-400 opacity-0 group-hover:opacity-100 transition-opacity"
                              >
                                <X size={16} />
                              </button>
                            </td>
                          </tr>
                        );
                      })
                    )}
                  </tbody>
                </table>
              </div>

              {/* Checkout Footer */}
              <div className="mt-auto border-t border-[var(--border)] pt-4 flex flex-col sm:flex-row justify-between items-end gap-6">
                
                <div className="w-full sm:w-auto space-y-3 flex-1 max-w-sm">
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-[10px] font-semibold text-[var(--text-secondary)] mb-1 uppercase tracking-wider">Payment Mode</label>
                      <select
                        value={paymentMode}
                        onChange={e => setPaymentMode(e.target.value)}
                        className="w-full bg-[var(--surface)] border border-slate-200 dark:border-[var(--border)] rounded-lg px-2 py-1.5 text-sm focus:border-[var(--accent)] outline-none font-semibold text-slate-900 dark:text-slate-100"
                      >
                        {PAYMENT_MODES.map(m => <option key={m} value={m}>{m.replace("_", " ")}</option>)}
                      </select>
                    </div>
                    <div>
                      <label className="block text-[10px] font-semibold text-[var(--text-secondary)] mb-1 uppercase tracking-wider">Status</label>
                      <select
                        value={paymentStatus}
                        onChange={e => setPaymentStatus(e.target.value)}
                        className="w-full bg-[var(--surface)] border border-slate-200 dark:border-[var(--border)] rounded-lg px-2 py-1.5 text-sm focus:border-[var(--accent)] outline-none font-semibold text-slate-900 dark:text-slate-100"
                      >
                        <option value="PAID">PAID</option>
                        <option value="PENDING">PENDING</option>
                        <option value="PARTIAL">PARTIAL</option>
                      </select>
                    </div>
                  </div>
                  {paymentStatus === "PARTIAL" && (
                    <div className="grid grid-cols-2 gap-3 mt-3">
                      <div>
                        <label className="block text-[10px] font-semibold text-[var(--text-secondary)] mb-1 uppercase tracking-wider">Advance Paid</label>
                        <input
                          type="number"
                          min="0"
                          value={advanceAmount || ''}
                          onChange={e => setAdvanceAmount(Number(e.target.value) || 0)}
                          className="w-full bg-[var(--surface)] border border-slate-200 dark:border-[var(--border)] rounded-lg px-2 py-1.5 text-sm focus:border-[var(--accent)] outline-none font-mono text-slate-900 dark:text-slate-100"
                          placeholder="0.00"
                        />
                      </div>
                      <div>
                        <label className="block text-[10px] font-semibold text-[var(--text-secondary)] mb-1 uppercase tracking-wider">Pending COD</label>
                        <div className="w-full bg-slate-50 dark:bg-[var(--surface)]/50 border border-[var(--border)] rounded-lg px-2 py-1.5 text-sm text-slate-600 dark:text-[var(--text-muted)] font-mono">
                          ₹{Math.max(0, cartTotals.grandTotal + shippingCharge - advanceAmount).toFixed(2)}
                        </div>
                      </div>
                    </div>
                  )}
                  <div className={paymentStatus === "PARTIAL" ? "mt-3" : ""}>
                    <label className="block text-[10px] font-semibold text-[var(--text-secondary)] mb-1 uppercase tracking-wider">Internal Notes</label>
                    <input
                      type="text"
                      value={notes}
                      onChange={e => setNotes(e.target.value)}
                      className="w-full bg-[var(--surface)] border border-slate-200 dark:border-[var(--border)] rounded-lg px-3 py-1.5 text-sm outline-none text-slate-900 dark:text-slate-100"
                      placeholder="Optional remarks..."
                    />
                  </div>
                </div>

                <div className="w-full sm:w-auto bg-[var(--surface)] p-4 rounded-xl border border-[var(--border)] min-w-[240px]">
                  <div className="space-y-1.5 text-sm">
                    <div className="flex justify-between text-[var(--text-secondary)]">
                      <span>Subtotal</span>
                      <span className="font-mono">₹{cartTotals.subtotal.toFixed(2)}</span>
                    </div>
                    {cartTotals.totalDiscount > 0 && (
                      <div className="flex justify-between text-pink-400">
                        <span>Discount</span>
                        <span className="font-mono">- ₹{cartTotals.totalDiscount.toFixed(2)}</span>
                      </div>
                    )}
                    <div className="flex justify-between text-[var(--text-secondary)]">
                      <span>GST Included/Added</span>
                      <span className="font-mono">₹{cartTotals.totalTax.toFixed(2)}</span>
                    </div>
                    {shippingCharge > 0 && (
                      <div className="flex justify-between text-purple-400">
                        <span>Shipping</span>
                        <span className="font-mono">+ ₹{shippingCharge.toFixed(2)}</span>
                      </div>
                    )}
                    <div className="border-t border-[var(--border)] my-2 pt-2 flex justify-between font-bold text-lg text-[var(--text-primary)]">
                      <span>Total</span>
                      <span className="font-mono text-cyan-400">₹{cartTotals.grandTotal.toFixed(2)}</span>
                    </div>
                  </div>
                </div>
              </div>

              {saveError && <div className="text-sm text-red-400 bg-red-500/10 p-3 rounded-lg border border-red-500/20">{saveError}</div>}
              {saveSuccess && <div className="text-sm text-emerald-400 bg-emerald-500/10 p-3 rounded-lg border border-emerald-500/20">{saveSuccess}</div>}

              {/* Action Buttons */}
              <div className="flex flex-col sm:flex-row gap-3 mt-2">
                <button
                  onClick={() => handleSaveBill("SAVE")}
                  disabled={isSaving || lineItems.length === 0}
                  className="flex-1 bg-[var(--primary)] hover:bg-[var(--primary-hover)] text-white font-semibold py-3 px-4 rounded-xl flex items-center justify-center gap-2 transition-colors disabled:opacity-50"
                >
                  <Save size={18} /> Save Bill
                </button>
                <button
                  onClick={() => handleSaveBill("WHATSAPP")}
                  disabled={isSaving || lineItems.length === 0}
                  className="flex-1 bg-emerald-600/20 hover:bg-emerald-600/30 text-emerald-400 border border-emerald-500/30 font-semibold py-3 px-4 rounded-xl flex items-center justify-center gap-2 transition-colors disabled:opacity-50"
                >
                  <MessageSquare size={18} /> Save + WhatsApp
                </button>
                <button
                  onClick={() => handleSaveBill("PRINT")}
                  disabled={isSaving || lineItems.length === 0}
                  className="flex-1 bg-cyan-600/20 hover:bg-cyan-600/30 text-cyan-400 border border-cyan-500/30 font-semibold py-3 px-4 rounded-xl flex items-center justify-center gap-2 transition-colors disabled:opacity-50"
                >
                  <Printer size={18} /> Save + Print
                </button>
              </div>

            </div>
          </div>
        </div>
      )}

      {activeTab === "RECENT" && (
        <div className="glass-panel overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="bg-[var(--surface)] border-b border-[var(--border)]">
                <tr>
                  <th className="px-4 py-3 font-semibold text-[var(--text-secondary)]">Order ID</th>
                  <th className="px-4 py-3 font-semibold text-[var(--text-secondary)]">Date & Channel</th>
                  <th className="px-4 py-3 font-semibold text-[var(--text-secondary)]">Customer</th>
                  <th className="px-4 py-3 font-semibold text-[var(--text-secondary)]">Items</th>
                  <th className="px-4 py-3 font-semibold text-[var(--text-secondary)]">Amount & Status</th>
                  <th className="px-4 py-3 font-semibold text-[var(--text-secondary)] text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/50">
                {isLoadingOrders ? (
                  <tr><td colSpan={6} className="p-8 text-center text-[var(--text-muted)]"><RefreshCw className="animate-spin inline mr-2"/> Loading...</td></tr>
                ) : recentOrders.length === 0 ? (
                  <tr><td colSpan={6} className="p-8 text-center text-[var(--text-muted)]">No offline orders found.</td></tr>
                ) : (
                  recentOrders.map(order => (
                    <tr key={order.id} className={cn("hover:bg-[var(--surface-hover)]/20 transition-colors", order.status === 'CANCELLED' && "opacity-50")}>
                      <td className="px-4 py-3">
                        <div className="font-mono font-bold text-slate-200">{order.orderNumber}</div>
                        {order.trackingNumber && (
                          <div className="text-[10px] text-purple-400 flex items-center gap-1 mt-1">
                            <Truck size={10}/> {order.trackingNumber}
                          </div>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        <div className="text-[var(--text-secondary)]">{new Date(order.createdAt).toLocaleDateString()}</div>
                        <span className="inline-flex mt-1 text-[10px] font-bold tracking-wider uppercase px-2 py-0.5 rounded-full bg-[var(--surface-hover)] text-[var(--text-secondary)]">
                          {order.channel.replace("_", " ")}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <div className="font-semibold text-slate-200">{order.customerName || "-"}</div>
                        <div className="text-xs text-[var(--text-muted)]">{order.customerPhone || ""}</div>
                      </td>
                      <td className="px-4 py-3">
                        <div className="text-xs text-[var(--text-secondary)] max-w-[200px] truncate">
                          {order.items.map(i => `${i.quantity}x ${i.sku}`).join(", ")}
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        <div className="font-mono font-bold text-cyan-400">₹{order.totalAmount.toFixed(2)}</div>
                        <div className="flex gap-2 mt-1">
                          <span className={cn("text-[10px] font-bold", order.paymentStatus === "PAID" ? "text-emerald-400" : "text-amber-400")}>
                            {order.paymentMode} {order.paymentStatus}
                          </span>
                        </div>
                      </td>
                      <td className="px-4 py-3 text-right">
                        <div className="flex items-center justify-end gap-2">
                          {order.customerPhone && (
                            <a 
                              href={`https://wa.me/${order.customerPhone.replace(/\D/g, '')}?text=${encodeURIComponent(`Here is your bill: ${typeof window !== 'undefined' ? window.location.origin : 'https://voop-webapp.fly.dev'}/orders/${order.id}/invoice`)}`} 
                              target="_blank" 
                              rel="noreferrer"
                              className="p-1.5 text-emerald-400 hover:bg-emerald-400/10 rounded-lg transition-colors"
                              title="Share on WhatsApp"
                            >
                              <MessageSquare size={16}/>
                            </a>
                          )}
                          <a 
                            href={`/orders/${order.id}/invoice`}
                            target="_blank"
                            rel="noreferrer"
                            className="p-1.5 text-cyan-400 hover:bg-cyan-400/10 rounded-lg transition-colors"
                            title="Download/Print Invoice"
                          >
                            <Printer size={16}/>
                          </a>
                          {order.status !== 'CANCELLED' && (
                            <button 
                              onClick={() => handleCancelOrder(order.id)}
                              className="p-1.5 text-[var(--text-muted)] hover:text-red-400 hover:bg-red-400/10 rounded-lg transition-colors"
                              title="Cancel Order"
                            >
                              <Trash2 size={16}/>
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
          {totalPages > 1 && (
            <div className="p-4 border-t border-[var(--border)] flex justify-center gap-2">
              <button disabled={page === 1} onClick={() => setPage(p => p - 1)} className="px-3 py-1 bg-[var(--surface-hover)] rounded disabled:opacity-50">Prev</button>
              <span className="px-3 py-1 text-sm text-[var(--text-secondary)]">Page {page} of {totalPages}</span>
              <button disabled={page === totalPages} onClick={() => setPage(p => p + 1)} className="px-3 py-1 bg-[var(--surface-hover)] rounded disabled:opacity-50">Next</button>
            </div>
          )}
        </div>
      )}
      </div>
    </RouteGuard>
  );
}
