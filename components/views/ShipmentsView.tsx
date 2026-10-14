"use client";

import { useEffect, useState, useRef } from "react";
import { createPortal } from "react-dom";
import {
  Truck,
  Search,
  CheckCircle2,
  AlertTriangle,
  RotateCcw,
  Plus,
  ArrowUpRight,
  Barcode,
  Package,
  Clock,
  MapPin,
  RefreshCw,
  X,
  ShieldCheck,
  ShieldAlert,
  Calendar,
  CreditCard,
  Hash,
  Activity,
  Layers,
  Trash2,
  AlertOctagon,
  ExternalLink,
  Download,
  CheckSquare,
  Square,
  User,
  Phone,
  MessageCircle,
  ChevronLeft,
  ChevronRight,
  ChevronsLeft,
  ChevronsRight,
  ChevronDown,
  Copy,
  Check,
} from "lucide-react";
import Link from "next/link";
import { formatDate } from "@/lib/utils";
import { SearchInput } from "@/components/ui/Input";
import { Drawer } from "@/components/ui";
import { CourierService, SUPPORTED_COURIERS } from "@/lib/services/CourierService";
import { TableSkeleton } from "@/components/LoadingSkeleton";
import { appFetch } from "@/lib/api";
import { RouteGuard } from "@/components/auth/RouteGuard";
import { resolveShipmentDates, ShipmentDateEntry } from "@/lib/shipment-dates";
import { VOOP_SHIPMENT_STATUSES } from "@/lib/courier-status";

export default function ShipmentsPage() {
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [syncingAll, setSyncingAll] = useState(false);
  const [actionLoading, setActionLoading] = useState(false);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("ALL");
  const [carrierFilter, setCarrierFilter] = useState("ALL");
  const [outwardFilter, setOutwardFilter] = useState(false);
  const [page, setPage] = useState(1);
  const [limit, setLimit] = useState(50);
  const [isTrashView, setIsTrashView] = useState(false);
  const [expandedDatesAwb, setExpandedDatesAwb] = useState<string | null>(null);

  // Date Range Filter State
  const [datePreset, setDatePreset] = useState<"ALL" | "TODAY" | "YESTERDAY" | "LAST_7_DAYS" | "CUSTOM">("ALL");
  const [startDate, setStartDate] = useState<string>("");
  const [endDate, setEndDate] = useState<string>("");
  const [tempStart, setTempStart] = useState<string>("");
  const [tempEnd, setTempEnd] = useState<string>("");
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [customRangeError, setCustomRangeError] = useState<string | null>(null);
  const datePickerRef = useRef<HTMLDivElement>(null);

  // Bulk Selection for CSV Export & Trash
  const [selectedAwbs, setSelectedAwbs] = useState<string[]>([]);

  // Tracking Drawer State
  const [activeAwb, setActiveAwb] = useState<string | null>(null);
  const [activeCarrier, setActiveCarrier] = useState<string | null>(null);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [trackingLoading, setTrackingLoading] = useState(false);
  const [trackingData, setTrackingData] = useState<any>(null);
  const [trackingError, setTrackingError] = useState<string | null>(null);
  const [trackingLoadingAwb, setTrackingLoadingAwb] = useState<string | null>(null);
  const [copiedAwb, setCopiedAwb] = useState(false);

  // RTO Return Inspection Modal State
  const [rtoModalOpen, setRtoModalOpen] = useState(false);
  const [rtoLoading, setRtoLoading] = useState(false);
  const [rtoSubmitting, setRtoSubmitting] = useState(false);
  const [rtoDetails, setRtoDetails] = useState<any>(null);
  const [rtoCondition, setRtoCondition] = useState<"all_good" | "some_damaged" | "all_damaged">("all_good");
  const [rtoItems, setRtoItems] = useState<
    Array<{
      sku: string;
      name: string;
      quantity: number;
      goodQty: number;
      damagedQty: number;
      parentComboSku?: string | null;
    }>
  >([]);
  const [rtoReceivedBy, setRtoReceivedBy] = useState("Warehouse Staff");
  const [rtoNotes, setRtoNotes] = useState("");

  const handleOpenRtoModal = async (awb: string) => {
    setRtoModalOpen(true);
    setRtoLoading(true);
    setRtoDetails(null);
    setRtoCondition("all_good");
    setRtoNotes("");
    try {
      const res = await appFetch(`/api/shipments/rto/receive?awb=${encodeURIComponent(awb.trim())}`);
      const json = await res.json();
      if (json.success) {
        setRtoDetails(json);
        const initialItems = (json.returnItems || []).map((item: any) => ({
          sku: item.sku,
          name: item.name,
          quantity: item.quantity,
          goodQty: item.quantity,
          damagedQty: 0,
          parentComboSku: item.parentComboSku || null,
        }));
        setRtoItems(initialItems);
      } else {
        alert(json.error || "Failed to load RTO return items.");
        setRtoModalOpen(false);
      }
    } catch (e: any) {
      alert(`Error loading RTO details: ${e.message}`);
      setRtoModalOpen(false);
    } finally {
      setRtoLoading(false);
    }
  };

  const handleRtoConditionChange = (cond: "all_good" | "some_damaged" | "all_damaged") => {
    setRtoCondition(cond);
    if (cond === "all_good") {
      setRtoItems(
        rtoItems.map((i) => ({
          ...i,
          goodQty: i.quantity,
          damagedQty: 0,
        }))
      );
    } else if (cond === "all_damaged") {
      setRtoItems(
        rtoItems.map((i) => ({
          ...i,
          goodQty: 0,
          damagedQty: i.quantity,
        }))
      );
    }
  };

  const handleConfirmRtoReceipt = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!rtoDetails?.shipment?.awb) return;

    setRtoSubmitting(true);
    try {
      const payloadItems: Array<{ sku: string; quantity: number; condition: "good" | "damaged" }> = [];
      for (const item of rtoItems) {
        if (item.goodQty > 0) {
          payloadItems.push({ sku: item.sku, quantity: item.goodQty, condition: "good" });
        }
        if (item.damagedQty > 0) {
          payloadItems.push({ sku: item.sku, quantity: item.damagedQty, condition: "damaged" });
        }
      }

      if (payloadItems.length === 0) {
        alert("Please specify at least 1 returned item quantity.");
        setRtoSubmitting(false);
        return;
      }

      const res = await appFetch("/api/shipments/rto/receive", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          awb: rtoDetails.shipment.awb,
          condition: rtoCondition,
          items: payloadItems,
          receivedBy: rtoReceivedBy,
          notes: rtoNotes,
        }),
      });

      const json = await res.json();
      if (json.success) {
        alert("✓ RTO received successfully! Inventory restored and updated.");
        setRtoModalOpen(false);
        await loadData();
      } else {
        alert(`RTO receipt failed: ${json.error}`);
      }
    } catch (e: any) {
      alert(`Error submitting RTO receipt: ${e.message}`);
    } finally {
      setRtoSubmitting(false);
    }
  };

  // Initialize Date Filter from URL search params on mount
  useEffect(() => {
    if (typeof window === "undefined") return;
    const sp = new URLSearchParams(window.location.search);
    const urlPreset = (sp.get("dateRange") || sp.get("datePreset") || "").toUpperCase();
    const urlFrom = sp.get("dateFrom") || sp.get("startDate") || "";
    const urlTo = sp.get("dateTo") || sp.get("endDate") || "";

    if (urlPreset === "TODAY") {
      setDatePreset("TODAY");
    } else if (urlPreset === "YESTERDAY") {
      setDatePreset("YESTERDAY");
    } else if (urlPreset === "LAST_7_DAYS" || urlPreset === "7DAYS" || urlPreset === "LAST7DAYS") {
      setDatePreset("LAST_7_DAYS");
    } else if (urlPreset === "CUSTOM" || (urlFrom && urlTo)) {
      setDatePreset("CUSTOM");
      if (urlFrom) {
        setStartDate(urlFrom);
        setTempStart(urlFrom);
      }
      if (urlTo) {
        setEndDate(urlTo);
        setTempEnd(urlTo);
      }
    }
  }, []);

  // Close Date Picker Popover on click outside or Escape
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (datePickerRef.current && !datePickerRef.current.contains(e.target as Node)) {
        setShowDatePicker(false);
      }
    };
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape" && showDatePicker) setShowDatePicker(false);
    };
    document.addEventListener("mousedown", handleClickOutside);
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [showDatePicker]);

  const loadData = async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({
        page: page.toString(),
        limit: limit.toString(),
        search,
        status: statusFilter,
        carrier: carrierFilter,
        outward: outwardFilter ? "true" : "false",
        trash: isTrashView ? "true" : "false",
      });

      if (datePreset === "TODAY") {
        params.set("dateRange", "today");
      } else if (datePreset === "YESTERDAY") {
        params.set("dateRange", "yesterday");
      } else if (datePreset === "LAST_7_DAYS") {
        params.set("dateRange", "last_7_days");
      } else if (datePreset === "CUSTOM") {
        if (startDate) params.set("dateFrom", startDate);
        if (endDate) params.set("dateTo", endDate);
      }

      // Sync URL without reload
      if (typeof window !== "undefined") {
        const url = new URL(window.location.href);
        if (datePreset === "ALL") {
          url.searchParams.delete("dateRange");
          url.searchParams.delete("dateFrom");
          url.searchParams.delete("dateTo");
        } else if (datePreset === "CUSTOM") {
          url.searchParams.set("dateRange", "custom");
          if (startDate) url.searchParams.set("dateFrom", startDate);
          if (endDate) url.searchParams.set("dateTo", endDate);
        } else {
          url.searchParams.set("dateRange", datePreset.toLowerCase());
          url.searchParams.delete("dateFrom");
          url.searchParams.delete("dateTo");
        }
        window.history.replaceState(null, "", url.toString());
      }

      const res = await appFetch(`/api/shipments?${params.toString()}`);
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
  }, [page, limit, statusFilter, carrierFilter, outwardFilter, isTrashView, datePreset, startDate, endDate]);

  // Escape key closes tracking drawer
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape" && drawerOpen) setDrawerOpen(false);
    };
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [drawerOpen]);

  // Debounced search
  useEffect(() => {
    const timer = setTimeout(() => {
      setPage(1);
      loadData();
    }, 300);
    return () => clearTimeout(timer);
  }, [search]);

  const handleSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setPage(1);
    loadData();
  };

  // Selection Handlers
  const handleToggleSelectAll = () => {
    if (selectedAwbs.length === shipments.length && shipments.length > 0) {
      setSelectedAwbs([]);
    } else {
      setSelectedAwbs(shipments.map((s: any) => s.awb));
    }
  };

  const handleToggleSelect = (awb: string) => {
    setSelectedAwbs((prev) =>
      prev.includes(awb) ? prev.filter((item) => item !== awb) : [...prev, awb]
    );
  };

  // Bulk CSV Export
  const handleDownloadCsv = (exportOnlySelected: boolean = false) => {
    const params = new URLSearchParams({
      export: "csv",
      search,
      status: statusFilter,
      carrier: carrierFilter,
      trash: isTrashView ? "true" : "false",
    });

    if (datePreset === "TODAY") {
      params.set("dateRange", "today");
    } else if (datePreset === "YESTERDAY") {
      params.set("dateRange", "yesterday");
    } else if (datePreset === "LAST_7_DAYS") {
      params.set("dateRange", "last_7_days");
    } else if (datePreset === "CUSTOM") {
      if (startDate) params.set("dateFrom", startDate);
      if (endDate) params.set("dateTo", endDate);
    }

    if (exportOnlySelected && selectedAwbs.length > 0) {
      params.set("awbs", selectedAwbs.join(","));
    }

    const downloadUrl = `/api/shipments?${params.toString()}`;
    const link = document.createElement("a");
    link.href = downloadUrl;
    link.setAttribute("download", `shipments-export-${new Date().toISOString().slice(0, 10)}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  // Open Drawer and fetch tracking
  const handleOpenTracking = async (awb: string, carrierName?: string, forceRefresh = false) => {
    const clean = awb.split(" ")[0];
    setActiveAwb(clean);
    setActiveCarrier(carrierName || "Delhivery");
    setDrawerOpen(true);
    setTrackingLoading(true);
    setTrackingLoadingAwb(clean);
    setTrackingError(null);

    const detected = CourierService.detectCourier(carrierName, clean);

    try {
      const res = await appFetch(
        `/api/shipments/tracking?awb=${encodeURIComponent(clean)}&carrier=${encodeURIComponent(carrierName || detected.displayName || "")}${forceRefresh ? "&refresh=true" : ""}`
      );
      const json = await res.json();

      const matchingShipment = shipments.find((s: any) => s.awb.split(" ")[0] === clean);

      if (json.success && json.tracking) {
        setTrackingData({
          ...matchingShipment,
          ...json.tracking,
          orderCreatedAt: matchingShipment?.orderCreatedAt || json.tracking.orderCreatedAt,
          pickupDate: json.tracking.pickupDate || matchingShipment?.pickupDate,
          etdDate: json.tracking.etdDate || json.tracking.estimatedDelivery || matchingShipment?.etdDate,
          deliveryDate: json.tracking.deliveryDate || matchingShipment?.deliveryDate,
          rtoDate: json.tracking.rtoDate || matchingShipment?.rtoDate,
          rtoDeliveredDate: json.tracking.rtoDeliveredDate || matchingShipment?.rtoDeliveredDate,
        });
        if (forceRefresh) {
          loadData();
        }
      } else {
        setTrackingData({
          ...matchingShipment,
          awb: clean,
          carrier: detected.displayName,
          status: matchingShipment?.status || "Manifested",
          normalizedStatus: matchingShipment?.normalizedStatus || "MANIFESTED",
          orderNumber: matchingShipment?.orderNumber,
          orderCreatedAt: matchingShipment?.orderCreatedAt,
          pickupDate: matchingShipment?.pickupDate,
          etdDate: matchingShipment?.etdDate,
          deliveryDate: matchingShipment?.deliveryDate,
          rtoDate: matchingShipment?.rtoDate,
          rtoDeliveredDate: matchingShipment?.rtoDeliveredDate,
          amount: matchingShipment?.amount,
          payment: matchingShipment?.payment,
          statusLocation: matchingShipment?.statusLocation || "Assigned to " + detected.displayName,
          outwardScanned: matchingShipment?.outwardScanned,
          rtoInwardScanned: matchingShipment?.rtoInwardScanned,
          scans: matchingShipment?.scans || [],
          officialTrackingUrl: CourierService.getTrackingUrl(clean, carrierName || detected.displayName),
          warning: json.error || null,
        });
        if (json.error) {
          setTrackingError(json.error);
        }
      }
    } catch (e: any) {
      setTrackingError(e.message || "Network error fetching tracking.");
    } finally {
      setTrackingLoading(false);
      setTrackingLoadingAwb(null);
    }
  };

  // Bulk Sync all Delhivery shipments
  const handleSyncAllDelhivery = async () => {
    setSyncingAll(true);
    try {
      const res = await appFetch("/api/shipments", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "SYNC_ALL_DELHIVERY" }),
      });
      const json = await res.json();
      if (json.success) {
        await loadData();
      }
    } catch (e) {
      console.error(e);
    } finally {
      setSyncingAll(false);
    }
  };

  // Trash & Delete Handlers
  const handleShipmentAction = async (
    awb: string | string[],
    action: "TRASH" | "RESTORE" | "PERMANENT_DELETE" | "EMPTY_TRASH"
  ) => {
    if (action === "PERMANENT_DELETE" || action === "EMPTY_TRASH") {
      const confirmed = window.confirm(
        action === "EMPTY_TRASH"
          ? "Are you sure you want to permanently delete all items in Trash? This cannot be undone."
          : "Are you sure you want to permanently delete this shipment?"
      );
      if (!confirmed) return;
    }

    setActionLoading(true);
    try {
      const payload: any = { action };
      if (Array.isArray(awb)) {
        payload.awbs = awb;
      } else if (awb) {
        payload.awb = awb;
      }

      const res = await appFetch("/api/shipments", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const json = await res.json();
      if (json.success) {
        setSelectedAwbs([]);
        await loadData();
      } else {
        alert(json.error || "Action failed");
      }
    } catch (e: any) {
      alert(e.message);
    } finally {
      setActionLoading(false);
    }
  };

  const summary = data?.summary || {
    total: 0,
    outwardScanned: 0,
    inTransit: 0,
    delivered: 0,
    rto: 0,
    totalValue: 0,
    rtoValue: 0,
    couriers: {},
  };
  const shipments = data?.shipments || [];
  const total = data?.total ?? data?.pagination?.total ?? shipments.length;
  const trashCount = data?.trashCount || 0;

  const getDaysLeftInTrash = (deletedAt: string | null) => {
    if (!deletedAt) return 30;
    const deletedTime = new Date(deletedAt).getTime();
    const expiryTime = deletedTime + 30 * 24 * 60 * 60 * 1000;
    const msLeft = expiryTime - Date.now();
    const daysLeft = Math.max(1, Math.ceil(msLeft / (24 * 60 * 60 * 1000)));
    return daysLeft;
  };

  const getStatusBadge = (status: string, normalized?: string, s?: any) => {
    const norm = (normalized || status || "").toUpperCase().replace(/-/g, "_");
    const dateInfo = s ? resolveShipmentDates(s) : null;
    const rawStatus = (s?.rawStatus || s?.status || status || "").trim();
    const rawUpper = rawStatus.toUpperCase();

    if (norm === "RTO_DELIVERED") {
      return (
        <span className="px-2.5 py-0.5 rounded-full text-[10px] font-bold uppercase bg-purple-500/15 text-purple-700 dark:text-purple-300 border border-purple-500/30">
          RTO DELIVERED
        </span>
      );
    }
    if (norm === "RTO" || norm === "RTO_INITIATED" || norm === "RTO_IN_TRANSIT") {
      return (
        <span className="px-2.5 py-0.5 rounded-full text-[10px] font-bold uppercase bg-amber-500/15 text-amber-700 dark:text-amber-300 border border-amber-500/30">
          {norm === "RTO_IN_TRANSIT" ? "RTO IN TRANSIT" : (status?.toUpperCase().includes("RTO") && !status?.toUpperCase().includes("DELIVERED") ? status.toUpperCase() : "RTO")}
        </span>
      );
    }
    if (norm === "DELIVERED" || dateInfo?.isForwardDelivered) {
      return (
        <span className="px-2.5 py-0.5 rounded-full text-[10px] font-bold uppercase bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 border border-emerald-500/30">
          DELIVERED
        </span>
      );
    }
    if (norm === "OUT_FOR_DELIVERY" || norm === "OFD") {
      return (
        <span className="px-2.5 py-0.5 rounded-full text-[10px] font-bold uppercase bg-indigo-500/15 text-indigo-700 dark:text-indigo-300 border border-indigo-500/30 animate-pulse">
          OUT FOR DELIVERY
        </span>
      );
    }
    if (norm === "IN_TRANSIT" || norm === "INTRANSIT" || norm === "PICKUP_COMPLETED" || norm === "PICKED_UP") {
      const isCarrierPickup = rawUpper.includes("PICK") || rawUpper.includes("COLLECT") || rawUpper.includes("HANDED OVER");
      return (
        <div className="flex flex-col gap-0.5 items-start">
          <span className="px-2.5 py-0.5 rounded-full text-[10px] font-bold uppercase bg-sky-500/15 text-sky-700 dark:text-sky-300 border border-sky-500/30">
            IN TRANSIT
          </span>
          {isCarrierPickup && (
            <span className="text-[10px] font-semibold text-sky-600 dark:text-sky-400">
              Picked Up by Carrier
            </span>
          )}
        </div>
      );
    }
    if (norm === "CANCELLED" || norm === "CANCELLED_PRE_DISPATCH" || norm.includes("CANCEL")) {
      return (
        <span className="px-2.5 py-0.5 rounded-full text-[10px] font-bold uppercase bg-rose-500/15 text-rose-700 dark:text-rose-300 border border-rose-500/30">
          CANCELLED
        </span>
      );
    }

    // ALL PRE-PICKUP STATES REMAIN UNDER: AWB GENERATED
    // With detailed status from the courier shipment timeline
    let subStatusText = "";
    let subStatusColor = "text-[var(--text-secondary)]";

    if (rawUpper.includes("RESCHEDULE")) {
      subStatusText = s?.pickupDate ? `Pickup Rescheduled · ${formatDate(s.pickupDate)}` : "Pickup Rescheduled";
      subStatusColor = "text-amber-600 dark:text-amber-400";
    } else if (rawUpper.includes("NOT DONE") || rawUpper.includes("NOT READY") || rawUpper.includes("NOT COLLECTED") || rawUpper.includes("DELAYED")) {
      subStatusText = "Pickup Not Done";
      subStatusColor = "text-rose-600 dark:text-rose-400";
    } else if (rawUpper.includes("ATTEMPT") || rawUpper.includes("FAILED") || norm === "PICKUP_ATTEMPTED" || norm === "PICKUP_FAILED") {
      subStatusText = "Pickup Attempted";
      subStatusColor = "text-amber-600 dark:text-amber-400";
    } else if (rawUpper.includes("PENDING") || norm === "PICKUP_PENDING") {
      subStatusText = "Pickup Pending";
      subStatusColor = "text-[var(--text-secondary)]";
    } else if (rawUpper.includes("ASSIGNED") || norm === "PICKUP_ASSIGNED") {
      subStatusText = "Pickup Assigned";
      subStatusColor = "text-[var(--text-secondary)]";
    } else if (rawUpper.includes("SCHEDULED") || norm === "PICKUP_SCHEDULED" || norm === "READY_FOR_PICKUP") {
      subStatusText = s?.pickupDate ? `Pickup Scheduled · ${formatDate(s.pickupDate)}` : "Pickup Scheduled";
      subStatusColor = "text-[var(--text-secondary)]";
    } else if (rawUpper.includes("MANIFEST")) {
      subStatusText = "Manifest Uploaded";
      subStatusColor = "text-[var(--text-secondary)]";
    }

    return (
      <div className="flex flex-col gap-0.5 items-start">
        <span className="px-2.5 py-0.5 rounded-full text-[10px] font-bold uppercase bg-slate-500/15 text-slate-700 dark:text-slate-300 border border-slate-500/30">
          AWB GENERATED
        </span>
        {subStatusText && (
          <span className={`text-[10px] font-semibold ${subStatusColor}`}>
            {subStatusText}
          </span>
        )}
      </div>
    );
  };

  const currentDrawerCourier = CourierService.detectCourier(
    activeCarrier || trackingData?.carrier,
    activeAwb
  );

  return (
    <RouteGuard requiredPermission="shipments.view" moduleName="Shipments & Logistics">
      <div className="space-y-6 relative">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <h2 className="text-xl sm:text-2xl font-black text-[var(--text-primary)] tracking-tight flex items-center gap-2.5">
              <Truck size={24} className="text-[var(--accent)]" /> {isTrashView ? "Shipments Trash (30 Days Retention)" : "Multi-Carrier Shipments & Logistics"}
            </h2>
            <p className="text-xs text-[var(--text-secondary)] mt-0.5">
              {isTrashView
                ? "Deleted shipments are safely retained for 30 days before permanent deletion."
                : "Unified tracking, bulk selection & CSV export across Delhivery, Blue Dart, XpressBees, Ecom Express, Ekart, and Shadowfax."}
            </p>
          </div>

          <div className="flex items-center gap-2 flex-wrap">
            {/* Active View vs Trash Tab Switcher */}
            <div className="flex items-center p-1 bg-[var(--surface)] border border-[var(--border)] rounded-xl shadow-2xs">
              <button
                onClick={() => { setIsTrashView(false); setPage(1); }}
                className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${!isTrashView
                  ? "bg-[var(--accent)] text-white shadow-2xs"
                  : "text-[var(--text-secondary)] hover:text-[var(--text-primary)] dark:hover:text-white"
                  }`}
              >
                Active Shipments ({!isTrashView ? (data?.total || 0) : ""})
              </button>
              <button
                onClick={() => { setIsTrashView(true); setPage(1); }}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${isTrashView
                  ? "bg-rose-600 text-white shadow-2xs"
                  : "text-[var(--text-secondary)] hover:text-[var(--text-primary)] dark:hover:text-white"
                  }`}
              >
                <Trash2 size={13} />
                <span>Trash ({trashCount})</span>
              </button>
            </div>

            {!isTrashView ? (
              <>
                {/* CSV Export All Button */}
                <button
                  onClick={() => handleDownloadCsv(false)}
                  className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-[var(--surface)] border border-[var(--border)] hover:bg-[var(--surface-hover)] text-[var(--text-primary)] text-xs font-semibold shadow-2xs transition-all cursor-pointer"
                  title="Download all filtered shipments as CSV"
                >
                  <Download size={14} className="text-[var(--accent)]" />
                  <span>Export CSV</span>
                </button>

                <button
                  onClick={handleSyncAllDelhivery}
                  disabled={syncingAll}
                  className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-[var(--surface)] border border-[var(--border)] hover:bg-[var(--surface-hover)] text-[var(--accent)] text-xs font-semibold shadow-2xs transition-all cursor-pointer disabled:opacity-50"
                >
                  <RefreshCw size={13} className={syncingAll ? "animate-spin text-[var(--accent)]" : "text-[var(--accent)]"} />
                  <span>{syncingAll ? "Syncing Delhivery..." : "Sync Delhivery Tracking"}</span>
                </button>
                <Link
                  href="/scanner"
                  className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-[var(--accent)]/10 border border-[var(--accent)]/20 text-[var(--accent)] hover:bg-[var(--accent)]/20 text-xs font-bold transition-all shadow-2xs"
                >
                  <Barcode size={14} /> Open Outward Scanner
                </Link>
              </>
            ) : (
              trashCount > 0 && (
                <button
                  onClick={() => handleShipmentAction([], "EMPTY_TRASH")}
                  disabled={actionLoading}
                  className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-rose-600 hover:bg-rose-500 text-white text-xs font-bold shadow-2xs transition-all cursor-pointer"
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
          <div className="p-4 rounded-xl bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-900/60 text-xs text-rose-700 dark:text-rose-300 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <AlertOctagon size={16} className="text-rose-600 dark:text-rose-400 shrink-0" />
              <span>
                Shipments in Trash are kept for <strong>30 days</strong> from the delete date before being permanently purged.
              </span>
            </div>
            <span className="font-mono font-bold text-white bg-rose-600 px-2.5 py-1 rounded-md">
              {data?.total || 0} items in Trash
            </span>
          </div>
        )}

        {/* KPI Cards Grid (Modern Light UI + Dark OLED) */}
        {!isTrashView && (
          <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
            <div className="p-4 rounded-2xl bg-[var(--surface)] border border-[var(--border)] shadow-xs space-y-1 transition-all hover:border-[var(--accent)]/40">
              <div className="flex items-center justify-between">
                <span className="text-[10px] font-bold uppercase tracking-wider text-[var(--text-muted)]">Total Shipments</span>
                <span className="w-2 h-2 rounded-full bg-[var(--text-primary)]" />
              </div>
              <p className="text-2xl font-black text-[var(--text-primary)] font-mono">{summary.total}</p>
              <span className="text-[11px] text-[var(--text-secondary)] font-mono block">₹{summary.totalValue?.toLocaleString("en-IN")} Value</span>
            </div>

            <div className="p-4 rounded-2xl bg-[var(--surface)] border border-[var(--border)] shadow-xs space-y-1 transition-all hover:border-cyan-400/50">
              <div className="flex items-center justify-between">
                <span className="text-[10px] font-bold uppercase tracking-wider text-cyan-700 dark:text-cyan-400">Outward Scanned</span>
                <span className="w-2 h-2 rounded-full bg-cyan-500" />
              </div>
              <p className="text-2xl font-black text-cyan-600 dark:text-cyan-400 font-mono">{summary.outwardScanned}</p>
              <span className="text-[11px] text-cyan-700 dark:text-cyan-400 block">Verified dispatched</span>
            </div>

            <div className="p-4 rounded-2xl bg-[var(--surface)] border border-[var(--border)] shadow-xs space-y-1 transition-all hover:border-[var(--accent)]/40">
              <div className="flex items-center justify-between">
                <span className="text-[10px] font-bold uppercase tracking-wider text-[var(--accent)]">In Transit</span>
                <span className="w-2 h-2 rounded-full bg-[var(--accent)]" />
              </div>
              <p className="text-2xl font-black text-[var(--accent)] font-mono">{summary.inTransit}</p>
              <span className="text-[11px] text-[var(--text-secondary)] block">On the road</span>
            </div>

            <div className="p-4 rounded-2xl bg-[var(--surface)] border border-[var(--border)] shadow-xs space-y-1 transition-all hover:border-emerald-400/50">
              <div className="flex items-center justify-between">
                <span className="text-[10px] font-bold uppercase tracking-wider text-emerald-700 dark:text-emerald-400">Delivered</span>
                <span className="w-2 h-2 rounded-full bg-emerald-500" />
              </div>
              <p className="text-2xl font-black text-emerald-600 dark:text-emerald-400 font-mono">{summary.delivered}</p>
              <span className="text-[11px] text-emerald-700 dark:text-emerald-400 block">Completed deliveries</span>
            </div>

            <div className="p-4 rounded-2xl bg-[var(--surface)] border border-[var(--border)] shadow-xs space-y-1 transition-all hover:border-amber-400/50">
              <div className="flex items-center justify-between">
                <span className="text-[10px] font-bold uppercase tracking-wider text-amber-700 dark:text-amber-400">RTO</span>
                <span className="w-2 h-2 rounded-full bg-amber-500" />
              </div>
              <p className="text-2xl font-black text-amber-600 dark:text-amber-400 font-mono">{summary.rto}</p>
              <span className="text-[11px] text-amber-700 dark:text-amber-400 font-mono block">₹{summary.rtoValue?.toLocaleString("en-IN")} at risk</span>
            </div>
          </div>
        )}

        {/* Carrier Filter Tabs */}
        <div className="flex items-center gap-2 overflow-x-auto pb-1 text-xs">
          <span className="text-[var(--text-muted)] font-bold uppercase text-[10px] mr-1 shrink-0">Couriers:</span>
          {[
            { id: "ALL", label: "All Couriers", count: summary.total },
            { id: "Delhivery", label: "Delhivery", count: summary.couriers?.delhivery },
            { id: "Blue Dart", label: "Blue Dart", count: summary.couriers?.bluedart },
            { id: "XpressBees", label: "XpressBees", count: summary.couriers?.xpressbees },
            { id: "Ecom Express", label: "Ecom Express", count: summary.couriers?.ecomExpress },
            { id: "Ekart", label: "Ekart", count: summary.couriers?.ekart },
            { id: "Shadowfax", label: "Shadowfax", count: summary.couriers?.shadowfax },
          ].map((c) => (
            <button
              key={c.id}
              onClick={() => { setCarrierFilter(c.id); setPage(1); }}
              className={`px-3 py-1.5 rounded-xl text-xs font-semibold whitespace-nowrap transition-all flex items-center gap-1.5 cursor-pointer ${carrierFilter === c.id
                ? "bg-[var(--accent)] text-white font-bold shadow-2xs"
                : "bg-[var(--surface)] border border-[var(--border)] text-[var(--text-secondary)] hover:text-[var(--text-primary)] dark:hover:text-white hover:bg-[var(--surface-hover)]"
                }`}
            >
              <span>{c.label}</span>
              {c.count !== undefined && c.count > 0 && (
                <span className={`px-1.5 py-0.2 rounded-full text-[10px] font-mono ${carrierFilter === c.id ? "bg-white/20 text-white" : "bg-[var(--surface-secondary)] text-[var(--text-secondary)] border border-[var(--border)]"
                  }`}>
                  {c.count}
                </span>
              )}
            </button>
          ))}
        </div>

        {/* Status Filter Tabs & Search Bar */}
        <div className="flex flex-col sm:flex-row gap-3 items-center justify-between">
          <div className="flex items-center gap-1.5 overflow-x-auto w-full sm:w-auto">
            {VOOP_SHIPMENT_STATUSES.map((st) => (
              <button
                key={st.id}
                onClick={() => {
                  setStatusFilter(st.id);
                  setPage(1);
                }}
                className={`px-3 py-1.5 rounded-xl text-xs font-semibold whitespace-nowrap transition-all cursor-pointer ${statusFilter === st.id
                  ? "bg-[var(--accent)]/10 text-[var(--accent)] border border-[var(--accent)]/30 font-bold shadow-2xs"
                  : "bg-[var(--surface)] border border-[var(--border)] text-[var(--text-secondary)] hover:text-[var(--text-primary)] dark:hover:text-white hover:bg-[var(--surface-hover)]"
                  }`}
              >
                {st.label}
              </button>
            ))}
          </div>

          <div className="flex items-center gap-2.5 w-full sm:w-auto flex-wrap justify-between sm:justify-end">
            {/* Date Range Dropdown Filter */}
            <div className="relative" ref={datePickerRef}>
              <button
                type="button"
                onClick={() => setShowDatePicker(!showDatePicker)}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold transition-all cursor-pointer shadow-2xs border ${
                  datePreset !== "ALL"
                    ? "bg-[var(--accent)]/10 text-[var(--accent)] border-[var(--accent)]/40 font-bold"
                    : "bg-[var(--surface)] text-[var(--text-secondary)] hover:text-[var(--text-primary)] dark:hover:text-white hover:bg-[var(--surface-hover)] border-[var(--border)]"
                }`}
                title="Filter shipments by date range"
              >
                <Calendar size={13} className={datePreset !== "ALL" ? "text-[var(--accent)]" : "text-[var(--text-muted)]"} />
                <span className="text-[11px] font-medium text-[var(--text-muted)]">Date Range:</span>
                <span className="font-semibold">
                  {datePreset === "TODAY"
                    ? "Today"
                    : datePreset === "YESTERDAY"
                    ? "Yesterday"
                    : datePreset === "LAST_7_DAYS"
                    ? "Last 7 Days"
                    : datePreset === "CUSTOM"
                    ? startDate && endDate
                      ? `${startDate} - ${endDate}`
                      : "Custom Range"
                    : "All Dates"}
                </span>
                <ChevronDown
                  size={13}
                  className={`text-[var(--text-muted)] transition-transform duration-150 ${showDatePicker ? "rotate-180" : ""}`}
                />
                {datePreset !== "ALL" && (
                  <span
                    role="button"
                    tabIndex={0}
                    onClick={(e) => {
                      e.stopPropagation();
                      setDatePreset("ALL");
                      setStartDate("");
                      setEndDate("");
                      setTempStart("");
                      setTempEnd("");
                      setCustomRangeError(null);
                      setPage(1);
                    }}
                    className="ml-1 p-0.5 rounded-full hover:bg-[var(--surface-hover)] text-[var(--text-muted)] hover:text-[var(--text-primary)] cursor-pointer"
                    title="Clear date filter"
                  >
                    <X size={12} />
                  </span>
                )}
              </button>

              {/* Date Picker Popover */}
              {showDatePicker && (
                <div className="absolute right-0 sm:right-0 left-0 sm:left-auto top-10 z-50 w-72 bg-[var(--surface)] border border-[var(--border)] rounded-2xl shadow-xl p-3.5 space-y-3 animate-in fade-in zoom-in-95 duration-100">
                  <div className="flex items-center justify-between border-b border-[var(--border)] pb-2">
                    <span className="text-[11px] font-bold uppercase tracking-wider text-[var(--text-muted)] flex items-center gap-1.5">
                      <Calendar size={12} className="text-[var(--accent)]" /> Date Range Filter
                    </span>
                    {datePreset !== "ALL" && (
                      <button
                        type="button"
                        onClick={() => {
                          setDatePreset("ALL");
                          setStartDate("");
                          setEndDate("");
                          setTempStart("");
                          setTempEnd("");
                          setCustomRangeError(null);
                          setPage(1);
                          setShowDatePicker(false);
                        }}
                        className="text-[10px] font-semibold text-[var(--text-muted)] hover:text-[var(--text-primary)] cursor-pointer"
                      >
                        Reset to All
                      </button>
                    )}
                  </div>

                  {/* Presets Grid */}
                  <div className="grid grid-cols-2 gap-1.5 text-xs font-medium">
                    {[
                      { id: "ALL", label: "All Dates" },
                      { id: "TODAY", label: "Today" },
                      { id: "YESTERDAY", label: "Yesterday" },
                      { id: "LAST_7_DAYS", label: "Last 7 Days" },
                    ].map((item) => (
                      <button
                        key={item.id}
                        type="button"
                        onClick={() => {
                          setCustomRangeError(null);
                          setDatePreset(item.id as any);
                          setStartDate("");
                          setEndDate("");
                          setPage(1);
                          setShowDatePicker(false);
                        }}
                        className={`px-2.5 py-1.5 rounded-lg text-left transition-colors cursor-pointer text-xs ${
                          datePreset === item.id
                            ? "bg-[var(--accent)]/15 text-[var(--accent)] font-bold border border-[var(--accent)]/30"
                            : "text-[var(--text-secondary)] hover:bg-[var(--surface-hover)] hover:text-[var(--text-primary)]"
                        }`}
                      >
                        {item.label}
                      </button>
                    ))}
                    <button
                      type="button"
                      onClick={() => {
                        setCustomRangeError(null);
                        setDatePreset("CUSTOM");
                      }}
                      className={`col-span-2 px-2.5 py-1.5 rounded-lg text-left transition-colors cursor-pointer text-xs ${
                        datePreset === "CUSTOM"
                          ? "bg-[var(--accent)]/15 text-[var(--accent)] font-bold border border-[var(--accent)]/30"
                          : "text-[var(--text-secondary)] hover:bg-[var(--surface-hover)] hover:text-[var(--text-primary)]"
                      }`}
                    >
                      Custom Range
                    </button>
                  </div>

                  {/* Custom Range Input Area */}
                  {datePreset === "CUSTOM" && (
                    <div className="pt-2 border-t border-[var(--border)] space-y-2.5">
                      <div className="space-y-2">
                        <div>
                          <label className="text-[11px] font-semibold text-[var(--text-muted)] block mb-1">
                            Start Date
                          </label>
                          <input
                            type="date"
                            value={tempStart}
                            onChange={(e) => {
                              setTempStart(e.target.value);
                              if (tempEnd && e.target.value > tempEnd) {
                                setCustomRangeError("End date cannot be earlier than start date.");
                              } else {
                                setCustomRangeError(null);
                              }
                            }}
                            className="w-full bg-[var(--surface)] border border-[var(--border)] rounded-lg px-2.5 py-1.5 text-xs text-[var(--text-primary)] font-medium focus:outline-none focus:border-[var(--accent)] focus:ring-1 focus:ring-[var(--accent)] transition-all shadow-2xs [color-scheme:light] dark:[color-scheme:dark]"
                          />
                        </div>
                        <div>
                          <label className="text-[11px] font-semibold text-[var(--text-muted)] block mb-1">
                            End Date
                          </label>
                          <input
                            type="date"
                            value={tempEnd}
                            onChange={(e) => {
                              setTempEnd(e.target.value);
                              if (tempStart && tempStart > e.target.value) {
                                setCustomRangeError("End date cannot be earlier than start date.");
                              } else {
                                setCustomRangeError(null);
                              }
                            }}
                            className="w-full bg-[var(--surface)] border border-[var(--border)] rounded-lg px-2.5 py-1.5 text-xs text-[var(--text-primary)] font-medium focus:outline-none focus:border-[var(--accent)] focus:ring-1 focus:ring-[var(--accent)] transition-all shadow-2xs [color-scheme:light] dark:[color-scheme:dark]"
                          />
                        </div>
                      </div>

                      {customRangeError && (
                        <p className="text-[11px] text-rose-600 dark:text-rose-400 font-semibold px-0.5">
                          {customRangeError}
                        </p>
                      )}

                      <button
                        type="button"
                        onClick={() => {
                          if (!tempStart) {
                            setCustomRangeError("Please select a start date.");
                            return;
                          }
                          if (!tempEnd) {
                            setCustomRangeError("Please select an end date.");
                            return;
                          }
                          if (tempStart > tempEnd) {
                            setCustomRangeError("End date cannot be earlier than start date.");
                            return;
                          }
                          setCustomRangeError(null);
                          setStartDate(tempStart);
                          setEndDate(tempEnd);
                          setPage(1);
                          setShowDatePicker(false);
                        }}
                        disabled={!tempStart || !tempEnd || tempStart > tempEnd}
                        className="w-full py-1.5 bg-[var(--accent)] hover:bg-[var(--accent-hover)] text-white rounded-lg text-xs font-bold transition-all cursor-pointer shadow-2xs disabled:opacity-50 disabled:cursor-not-allowed"
                      >
                        Apply
                      </button>
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* Top Rows Per Page & Count */}
            <div className="flex items-center gap-2 text-xs text-[var(--text-secondary)] bg-[var(--surface)] border border-[var(--border)] px-3 py-1.5 rounded-xl shadow-2xs">
              <span className="text-[11px] font-medium text-[var(--text-muted)]">
                Showing <strong className="text-[var(--text-primary)]">{shipments.length}</strong> of <strong className="text-[var(--text-primary)]">{total}</strong>
              </span>
              <span className="text-[var(--border)]">|</span>
              <div className="flex items-center gap-1">
                <span className="text-[11px] text-[var(--text-muted)]">Rows:</span>
                {[50, 100, 200, 500].map((num) => (
                  <button
                    key={num}
                    type="button"
                    onClick={() => {
                      setLimit(num);
                      setPage(1);
                    }}
                    className={`px-1.5 py-0.5 rounded text-[10px] font-bold transition-all cursor-pointer ${limit === num
                      ? "bg-[var(--accent)] text-white shadow-2xs"
                      : "text-[var(--text-secondary)] hover:bg-[var(--bg-secondary)] dark:hover:bg-[var(--surface-hover)]"
                      }`}
                  >
                    {num === 500 ? "All" : num}
                  </button>
                ))}
              </div>
            </div>

            <div className="w-full sm:w-72">
              <SearchInput
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                onClear={() => setSearch("")}
                placeholder="Search AWB, order #, carrier, phone..."
                className="py-2 text-xs"
              />
            </div>
          </div>
        </div>

        {/* Floating Bulk Actions Bar */}
        {selectedAwbs.length > 0 && (
          <div className="p-3 bg-[var(--surface)] border border-[var(--accent)]/40 rounded-xl flex items-center justify-between gap-3 text-xs shadow-lg animate-in fade-in slide-in-from-top-2">
            <div className="flex items-center gap-2 text-[var(--accent)] font-semibold">
              <CheckSquare size={16} className="text-[var(--accent)]" />
              <span>
                {selectedAwbs.length} shipment{selectedAwbs.length > 1 ? "s" : ""} selected
              </span>
            </div>

            <div className="flex items-center gap-2">
              {!isTrashView ? (
                <>
                  <button
                    onClick={() => handleDownloadCsv(true)}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[var(--accent)] hover:bg-[var(--accent-hover)] text-white text-xs font-bold transition-all shadow-sm cursor-pointer"
                  >
                    <Download size={13} />
                    <span>Download Selected CSV</span>
                  </button>
                  <button
                    onClick={() => handleShipmentAction(selectedAwbs, "TRASH")}
                    disabled={actionLoading}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-red-500/10 hover:bg-red-500/20 text-red-600 dark:text-red-400 border border-red-500/30 text-xs font-bold transition-all cursor-pointer"
                  >
                    <Trash2 size={13} />
                    <span>Move to Trash ({selectedAwbs.length})</span>
                  </button>
                </>
              ) : (
                <>
                  <button
                    onClick={() => handleShipmentAction(selectedAwbs, "RESTORE")}
                    disabled={actionLoading}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-emerald-500 hover:bg-emerald-400 text-white text-xs font-bold transition-all cursor-pointer"
                  >
                    <RotateCcw size={13} />
                    <span>Restore Selected ({selectedAwbs.length})</span>
                  </button>
                  <button
                    onClick={() => handleShipmentAction(selectedAwbs, "PERMANENT_DELETE")}
                    disabled={actionLoading}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-red-600 hover:bg-red-500 text-white text-xs font-bold transition-all cursor-pointer"
                  >
                    <Trash2 size={13} />
                    <span>Delete Forever ({selectedAwbs.length})</span>
                  </button>
                </>
              )}
              <button
                onClick={() => setSelectedAwbs([])}
                className="text-xs text-[var(--text-secondary)] hover:text-[var(--text-primary)] dark:hover:text-white px-2 py-1 cursor-pointer"
              >
                Clear Selection
              </button>
            </div>
          </div>
        )}

        {/* Shipments Table */}
        <div className="bg-[var(--surface)] border border-[var(--border)] rounded-2xl shadow-xs overflow-hidden">
          {loading && shipments.length === 0 ? (
            <TableSkeleton rows={8} cols={8} />
          ) : (
            <div className="overflow-x-auto animate-fade-in">
              <table className="w-full text-left text-sm border-collapse">
                <thead>
                  <tr className="bg-[var(--bg-secondary)] border-b border-[var(--border)] text-[var(--text-secondary)] uppercase text-[10px] tracking-wider font-bold">
                    <th className="py-3.5 px-4 w-10">
                      <button onClick={handleToggleSelectAll} className="text-[var(--text-secondary)] hover:text-[var(--text-primary)]">
                        {selectedAwbs.length === shipments.length && shipments.length > 0 ? (
                          <CheckSquare size={16} className="text-purple-600 dark:text-purple-400" />
                        ) : (
                          <Square size={16} />
                        )}
                      </button>
                    </th>
                    <th className="py-3.5 px-4">AWB Number</th>
                    <th className="py-3.5 px-4">Order #</th>
                    <th className="py-3.5 px-4">Customer Details</th>
                    <th className="py-3.5 px-4">Courier Carrier</th>
                    <th className="py-3.5 px-4">Status</th>
                    <th className="py-3.5 px-3 min-w-[125px]">Dates</th>
                    <th className="py-3.5 px-4">WH Physical Scans</th>
                    <th className="py-3.5 px-4">Payment</th>
                    <th className="py-3.5 px-4">Amount</th>
                    <th className="py-3.5 px-4 text-right">{isTrashView ? "Trash Retention" : "Actions"}</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[var(--border)]/80">
                  {shipments.length === 0 ? (
                    <tr>
                      <td colSpan={11} className="p-16 text-center text-[var(--text-muted)] text-sm">
                        {isTrashView ? "Trash is empty." : "No shipments found matching filters."}
                      </td>
                    </tr>
                  ) : (
                    shipments.map((s: any) => {
                      const dateInfo = resolveShipmentDates(s);
                      const isSelected = selectedAwbs.includes(s.awb);
                      const isLoadingThisAwb = trackingLoadingAwb === s.awb;
                      const isRto = dateInfo.lifecycle === "RTO" || s.normalizedStatus === "RTO" || s.status?.toUpperCase().includes("RTO");
                      const daysLeft = getDaysLeftInTrash(s.deletedAt);
                      const courier = CourierService.detectCourier(s.carrier, s.awb);
                      const cleanOrderNum = (s.orderNumber || "").replace(/^#+/, "");

                      return (
                        <tr
                          key={s.awb}
                          className={`table-row-hover transition-colors ${isSelected ? "bg-purple-500/10" : ""
                            }`}
                        >
                          {/* Checkbox */}
                          <td className="py-3 px-4">
                            <button
                              onClick={() => handleToggleSelect(s.awb)}
                              className="text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
                            >
                              {isSelected ? (
                                <CheckSquare size={15} className="text-purple-400" />
                              ) : (
                                <Square size={15} />
                              )}
                            </button>
                          </td>

                          {/* AWB */}
                          <td className="p-3.5 font-mono font-bold text-[var(--text-primary)] select-all">
                            <div className="flex flex-col gap-0.5">
                              <span className="font-mono text-sm">{s.awb.split(" ")[0]}</span>
                              {s.statusLocation && (
                                <span className="text-[10px] font-normal text-[var(--text-muted)] flex items-center gap-0.5">
                                  <MapPin size={10} className="text-slate-600" /> {s.statusLocation.split("(")[0].trim()}
                                </span>
                              )}
                              {/* Mobile Collapsible Dates Toggle */}
                              <div className="md:hidden mt-1">
                                <button
                                  type="button"
                                  onClick={() => setExpandedDatesAwb(expandedDatesAwb === s.awb ? null : s.awb)}
                                  className="inline-flex items-center gap-1 text-[10px] font-bold text-purple-600 dark:text-purple-400 bg-purple-500/10 hover:bg-purple-500/20 px-1.5 py-0.5 rounded border border-purple-500/20 transition-all cursor-pointer"
                                  title="Toggle compact dates summary"
                                >
                                  <Calendar size={10} />
                                  <span>{expandedDatesAwb === s.awb ? "Hide Dates" : "Dates"}</span>
                                </button>
                                {expandedDatesAwb === s.awb && (
                                  <div className="mt-1.5 p-2 rounded-lg bg-[var(--surface-hover)] border border-[var(--border)] space-y-1 text-left min-w-[140px] animate-fade-in shadow-xs">
                                    {dateInfo.entries.map((entry) => (
                                      <div key={entry.label} className="flex items-baseline justify-between gap-2 border-b border-[var(--border)]/40 pb-0.5 last:border-b-0 last:pb-0">
                                        <span className="text-[9px] font-bold uppercase text-[var(--text-muted)]">{entry.label}:</span>
                                        <span
                                          className={`text-[10px] font-mono font-semibold ${
                                            entry.isAvailable
                                              ? entry.label === "Delivered"
                                                ? "text-emerald-500 dark:text-emerald-400"
                                                : entry.label === "RTO Delivered"
                                                ? "text-purple-500 dark:text-purple-400"
                                                : entry.label === "RTO"
                                                ? "text-amber-500 dark:text-amber-400"
                                                : "text-[var(--text-primary)]"
                                              : "text-[var(--text-muted)] italic font-normal"
                                          }`}
                                          title={entry.fullTimestamp || undefined}
                                        >
                                          {entry.displayDate}
                                        </span>
                                      </div>
                                    ))}
                                  </div>
                                )}
                              </div>
                            </div>
                          </td>

                          {/* Clean Order # */}
                          <td className="p-3.5 font-mono text-cyan-700 dark:text-cyan-400 font-bold">
                            {cleanOrderNum ? `#${cleanOrderNum}` : "—"}
                          </td>

                          {/* Customer Details */}
                          <td className="p-3.5">
                            <div className="flex flex-col gap-1 text-xs">
                              {/* Customer Name */}
                              <div className="font-semibold text-[var(--text-primary)] flex items-center gap-1.5">
                                <User size={12} className="text-[var(--text-secondary)] shrink-0" />
                                <span className="truncate max-w-[140px]">{s.customerName || "—"}</span>
                              </div>

                              {/* Customer Phone + Quick Actions */}
                              {s.customerPhone ? (
                                <div className="flex items-center gap-1.5">
                                  <span className="font-mono text-[11px] text-[var(--text-secondary)] select-all">
                                    {s.customerPhone}
                                  </span>
                                  <a
                                    href={`https://wa.me/91${s.customerPhone.replace(/\D/g, "").slice(-10)}?text=${encodeURIComponent(
                                      `Hi ${s.customerName || "Customer"}, this is regarding your order #${cleanOrderNum} (${s.awb.split(" ")[0]}).`
                                    )}`}
                                    target="_blank"
                                    rel="noreferrer"
                                    title="Open WhatsApp Chat"
                                    className="p-1 rounded bg-emerald-500/10 hover:bg-emerald-500/25 text-emerald-400 border border-emerald-500/30 transition-all cursor-pointer"
                                  >
                                    <MessageCircle size={11} />
                                  </a>
                                  <a
                                    href={`tel:${s.customerPhone}`}
                                    title="Call Customer"
                                    className="p-1 rounded bg-blue-500/10 hover:bg-blue-500/25 text-blue-400 border border-blue-500/30 transition-all cursor-pointer"
                                  >
                                    <Phone size={11} />
                                  </a>
                                </div>
                              ) : (
                                <span className="text-[10px] text-slate-600 font-mono">No phone</span>
                              )}

                              {/* Destination City, State, Pin */}
                              {(s.destinationCity || s.destinationPin) && (
                                <div
                                  className="flex items-center gap-1 text-[10px] text-[var(--text-secondary)] hover:text-slate-200 transition-colors"
                                  title={s.fullAddress || `${s.destinationCity || ""}, ${s.destinationState || ""} ${s.destinationPin || ""}`}
                                >
                                  <MapPin size={10} className="text-purple-400 shrink-0" />
                                  <span className="truncate max-w-[150px]">
                                    {[s.destinationCity, s.destinationPin].filter(Boolean).join(" - ")}
                                  </span>
                                </div>
                              )}
                            </div>
                          </td>

                          {/* Courier Carrier Badge */}
                          <td className="p-3.5">
                            <span className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-md text-[10px] font-bold border ${courier.badgeClass}`}>
                              <Truck size={11} className={courier.iconColor} />
                              <span>{courier.displayName}</span>
                            </span>
                          </td>

                          {/* Status */}
                          <td className="p-3.5">
                            {getStatusBadge(s.status, s.normalizedStatus, s)}
                          </td>

                          {/* Dates */}
                          <td className="p-3.5">
                            <div className="flex flex-col gap-1.5 min-w-[110px]">
                              {dateInfo.entries.map((entry) => (
                                <div key={entry.label} className="flex flex-col leading-tight">
                                  <span className="text-[9px] font-bold uppercase tracking-wider text-[var(--text-muted)]">
                                    {entry.label}
                                    {entry.subStatus && (
                                      <span className={`ml-1 font-semibold ${entry.subStatus === "Picked up" ? "text-teal-600 dark:text-teal-400" : "text-amber-600 dark:text-amber-400"}`}>
                                        ({entry.subStatus})
                                      </span>
                                    )}
                                  </span>
                                  <span
                                    className={`text-xs font-semibold font-mono ${
                                      entry.isAvailable
                                        ? entry.label === "Delivered"
                                          ? "text-emerald-600 dark:text-emerald-400 font-bold"
                                          : entry.label === "RTO Delivered"
                                          ? "text-purple-600 dark:text-purple-400 font-bold"
                                          : entry.label === "RTO"
                                          ? "text-amber-600 dark:text-amber-400 font-bold"
                                          : "text-[var(--text-primary)]"
                                        : "text-[var(--text-muted)] italic font-normal text-[11px]"
                                    }`}
                                    title={entry.fullTimestamp || undefined}
                                  >
                                    {entry.displayDate}
                                  </span>
                                </div>
                              ))}
                            </div>
                          </td>

                          {/* Warehouse Physical Scan Status */}
                          <td className="p-3.5">
                            <div className="flex flex-col gap-1 items-start">
                              {s.outwardScanned ? (
                                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-bold bg-emerald-500/10 text-emerald-400 border border-emerald-500/30">
                                  <CheckCircle2 size={11} /> Outward Scanned
                                </span>
                              ) : (
                                <span className="text-[10px] text-[var(--text-muted)] font-mono">
                                  Pending dispatch scan
                                </span>
                              )}

                              {isRto && (
                                s.rtoInwardScanned ? (
                                  <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-bold bg-amber-500/10 text-amber-400 border border-amber-500/30">
                                    <ShieldCheck size={11} /> RTO Received in WH
                                  </span>
                                ) : (
                                  <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-bold bg-red-500/15 text-red-300 border border-red-500/30 animate-pulse">
                                    <AlertTriangle size={11} className="text-red-400" /> Missing WH Scan
                                  </span>
                                )
                              )}
                            </div>
                          </td>

                          {/* Payment */}
                          <td className="p-3.5 text-[var(--text-secondary)] font-semibold">{s.payment || "Prepaid"}</td>

                          {/* Amount */}
                          <td className="p-3.5 font-mono font-bold text-[var(--text-primary)]">₹{s.amount?.toFixed(2)}</td>

                          {/* Actions */}
                          <td className="p-3.5 text-right">
                            {!isTrashView ? (
                              <div className="flex items-center justify-end gap-1.5">
                                {isRto && !s.rtoInventoryProcessed && (
                                  <button
                                    onClick={() => handleOpenRtoModal(s.awb.split(" ")[0])}
                                    className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md bg-amber-500/15 hover:bg-amber-500/25 text-amber-700 dark:text-amber-300 border border-amber-500/40 text-xs font-bold transition-all shadow-sm cursor-pointer"
                                    title="Mark RTO parcel received back at warehouse and inspect inventory"
                                  >
                                    <RotateCcw size={12} className="text-amber-600 dark:text-amber-400" />
                                    <span>Mark RTO Received</span>
                                  </button>
                                )}

                                {s.rtoInventoryProcessed && (
                                  <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-bold bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 border border-emerald-500/20">
                                    <CheckCircle2 size={11} /> RTO Restored
                                  </span>
                                )}

                                <button
                                  onClick={() => handleOpenTracking(s.awb.split(" ")[0], s.carrier)}
                                  disabled={isLoadingThisAwb}
                                  className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md bg-purple-500/10 hover:bg-purple-500/20 text-purple-700 dark:text-purple-300 border border-purple-500/30 text-xs font-bold transition-all cursor-pointer disabled:opacity-50"
                                >
                                  {isLoadingThisAwb ? (
                                    <>
                                      <RefreshCw size={11} className="animate-spin" />
                                      <span>Loading...</span>
                                    </>
                                  ) : (
                                    <>
                                      <span>Track</span>
                                      <ArrowUpRight size={12} />
                                    </>
                                  )}
                                </button>
                                <button
                                  onClick={() => handleShipmentAction(s.awb, "TRASH")}
                                  disabled={actionLoading}
                                  title="Move Shipment to 30-Day Trash"
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
                                  onClick={() => handleShipmentAction(s.awb, "RESTORE")}
                                  disabled={actionLoading}
                                  title="Restore Shipment"
                                  className="px-2 py-1 rounded-md bg-emerald-500/15 hover:bg-emerald-500/25 text-emerald-400 border border-emerald-500/30 text-[11px] font-bold transition-all flex items-center gap-1"
                                >
                                  <RotateCcw size={11} /> Restore
                                </button>
                                <button
                                  onClick={() => handleShipmentAction(s.awb, "PERMANENT_DELETE")}
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
          )}
        </div>

        {/* Tracking Drawer — rendered in shared Drawer portal so it anchors flush to viewport */}
        <Drawer
          isOpen={drawerOpen}
          onClose={() => setDrawerOpen(false)}
          width="max-w-lg"
          ariaLabel={`Tracking details for ${activeAwb}`}
          customLayout
        >
          <div className="flex flex-col h-full overflow-hidden">
            {/* ── FIXED HEADER ── */}
              <div className="shrink-0 border-b border-[var(--border)] bg-[var(--surface)]">
                {/* Top bar: courier label + status badge + close */}
                <div className="flex items-center justify-between px-4 pt-4 pb-2">
                  <div className="flex items-center gap-2">
                    <div className="w-6 h-6 rounded-md bg-[var(--accent)]/10 border border-[var(--accent)]/20 flex items-center justify-center">
                      <Truck size={13} className="text-[var(--accent)]" />
                    </div>
                    <span className="text-[11px] font-bold uppercase tracking-widest text-[var(--text-muted)]">
                      {currentDrawerCourier.displayName}
                    </span>
                  </div>
                  <div className="flex items-center gap-2">
                    {trackingData && getStatusBadge(trackingData.status, trackingData.normalizedStatus, trackingData)}
                    <button
                      onClick={() => setDrawerOpen(false)}
                      className="p-1.5 rounded-lg text-[var(--text-muted)] hover:text-[var(--text-primary)] hover:bg-[var(--surface-hover)] transition-colors cursor-pointer"
                      aria-label="Close drawer"
                    >
                      <X size={16} />
                    </button>
                  </div>
                </div>
                {/* AWB number + copy button */}
                <div className="flex items-center gap-2 px-4 pb-4">
                  <span className="font-mono text-base font-bold text-[var(--text-primary)] tracking-tight">
                    {activeAwb}
                  </span>
                  <button
                    onClick={() => {
                      navigator.clipboard.writeText(activeAwb || "").then(() => {
                        setCopiedAwb(true);
                        setTimeout(() => setCopiedAwb(false), 2000);
                      });
                    }}
                    className="flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-semibold text-[var(--text-muted)] hover:text-[var(--accent)] hover:bg-[var(--accent)]/10 border border-transparent hover:border-[var(--accent)]/20 transition-all cursor-pointer"
                    aria-label="Copy tracking number"
                  >
                    {copiedAwb ? (
                      <><Check size={11} className="text-emerald-500" /><span className="text-emerald-500">Copied</span></>
                    ) : (
                      <><Copy size={11} /><span>Copy</span></>
                    )}
                  </button>
                </div>
              </div>

              {/* ── SCROLLABLE BODY ── */}
              <div className="flex-1 overflow-y-auto">
                {trackingLoading ? (
                  /* Loading skeleton */
                  <div className="p-4 space-y-3 animate-pulse">
                    <div className="h-9 rounded-lg bg-[var(--bg-secondary)]" />
                    <div className="h-32 rounded-xl bg-[var(--bg-secondary)]" />
                    <div className="grid grid-cols-2 gap-2">
                      <div className="h-14 rounded-lg bg-[var(--bg-secondary)]" />
                      <div className="h-14 rounded-lg bg-[var(--bg-secondary)]" />
                    </div>
                    <div className="h-24 rounded-xl bg-[var(--bg-secondary)]" />
                    <div className="space-y-3">
                      {[...Array(4)].map((_, i) => (
                        <div key={i} className="h-12 rounded-lg bg-[var(--bg-secondary)]" />
                      ))}
                    </div>
                  </div>
                ) : trackingData ? (
                  <div className="p-4 space-y-4">

                    {/* Official Carrier Portal Link */}
                    <a
                      href={trackingData.officialTrackingUrl || CourierService.getTrackingUrl(activeAwb!, activeCarrier)}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="w-full flex items-center justify-between gap-2 px-3.5 py-2.5 rounded-lg bg-[var(--bg-secondary)] hover:bg-[var(--surface-hover)] text-[var(--text-secondary)] hover:text-[var(--text-primary)] border border-[var(--border)] text-xs font-semibold transition-all group"
                    >
                      <span>Open Official {currentDrawerCourier.displayName} Portal</span>
                      <ExternalLink size={13} className="shrink-0 group-hover:translate-x-0.5 transition-transform" />
                    </a>

                    {/* Shipment Summary Grid */}
                    <div className="rounded-xl bg-[var(--bg-secondary)] border border-[var(--border)] divide-y divide-[var(--border)] overflow-hidden">
                      <div className="grid grid-cols-2 divide-x divide-[var(--border)]">
                        <div className="px-3.5 py-3">
                          <p className="text-[9px] font-bold uppercase tracking-wider text-[var(--text-muted)] mb-0.5">Order</p>
                          <p className="font-mono font-bold text-xs text-[var(--text-primary)]">
                            {trackingData.orderNumber ? `#${trackingData.orderNumber.replace(/^#+/, "")}` : "—"}
                          </p>
                        </div>
                        <div className="px-3.5 py-3">
                          <p className="text-[9px] font-bold uppercase tracking-wider text-[var(--text-muted)] mb-0.5">Payment</p>
                          <p className="font-semibold text-xs text-[var(--text-secondary)]">{trackingData.payment || "Prepaid"}</p>
                        </div>
                      </div>
                      <div className="grid grid-cols-2 divide-x divide-[var(--border)]">
                        <div className="px-3.5 py-3">
                          <p className="text-[9px] font-bold uppercase tracking-wider text-[var(--text-muted)] mb-0.5">Amount</p>
                          <p className="font-mono font-bold text-xs text-[var(--text-primary)]">₹{trackingData.amount?.toFixed(2) || "0.00"}</p>
                        </div>
                        <div className="px-3.5 py-3">
                          <p className="text-[9px] font-bold uppercase tracking-wider text-[var(--text-muted)] mb-0.5">Carrier</p>
                          <p className="font-semibold text-xs text-[var(--accent)]">{currentDrawerCourier.displayName}</p>
                        </div>
                      </div>
                      {trackingData.statusLocation && (
                        <div className="px-3.5 py-3 flex items-start gap-2">
                          <MapPin size={13} className="text-[var(--text-muted)] mt-0.5 shrink-0" />
                          <div>
                            <p className="text-[9px] font-bold uppercase tracking-wider text-[var(--text-muted)] mb-0.5">Current Location</p>
                            <p className="text-xs font-medium text-[var(--text-secondary)]">{trackingData.statusLocation}</p>
                          </div>
                        </div>
                      )}
                    </div>

                    {/* Warehouse Verification */}
                    <div className="grid grid-cols-2 gap-2">
                      <div className="rounded-lg bg-[var(--bg-secondary)] border border-[var(--border)] px-3 py-2.5">
                        <p className="text-[9px] font-bold uppercase tracking-wider text-[var(--text-muted)] mb-1">Outward Scan</p>
                        {trackingData.outwardScanned ? (
                          <span className="inline-flex items-center gap-1 text-[11px] font-bold text-emerald-600 dark:text-emerald-400">
                            <CheckCircle2 size={11} /> Scanned
                          </span>
                        ) : (
                          <span className="text-[11px] text-[var(--text-muted)] font-medium">Pending</span>
                        )}
                      </div>
                      <div className="rounded-lg bg-[var(--bg-secondary)] border border-[var(--border)] px-3 py-2.5">
                        <p className="text-[9px] font-bold uppercase tracking-wider text-[var(--text-muted)] mb-1">RTO Inward</p>
                        {trackingData.rtoInwardScanned ? (
                          <span className="inline-flex items-center gap-1 text-[11px] font-bold text-emerald-600 dark:text-emerald-400">
                            <ShieldCheck size={11} /> Received
                          </span>
                        ) : trackingData.normalizedStatus === "RTO" || trackingData.normalizedStatus === "RTO_DELIVERED" ? (
                          <span className="inline-flex items-center gap-1 text-[11px] font-bold text-red-600 dark:text-red-400">
                            <AlertTriangle size={11} /> Missing
                          </span>
                        ) : (
                          <span className="text-[11px] text-[var(--text-muted)] font-medium">—</span>
                        )}
                      </div>
                    </div>

                    {/* Key Dates */}
                    {(() => {
                      const drawerDates = resolveShipmentDates(trackingData);
                      return (
                        <div className="rounded-xl bg-[var(--bg-secondary)] border border-[var(--border)] overflow-hidden">
                          <div className="flex items-center justify-between px-3.5 py-2.5 border-b border-[var(--border)]">
                            <div className="flex items-center gap-1.5">
                              <Calendar size={12} className="text-[var(--text-muted)]" />
                              <span className="text-[10px] font-bold uppercase tracking-wider text-[var(--text-muted)]">
                                Key Dates
                              </span>
                            </div>
                            <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-[var(--surface)] border border-[var(--border)] text-[var(--text-muted)]">
                              {drawerDates.lifecycle === "RTO" ? "RTO Lifecycle" : "Forward"}
                            </span>
                          </div>
                          <div className="grid grid-cols-2 divide-x divide-[var(--border)]">
                            {drawerDates.entries.map((entry, idx) => {
                              const isOddLast = drawerDates.entries.length % 2 !== 0 && idx === drawerDates.entries.length - 1;
                              return (
                                <div
                                  key={entry.label}
                                  className={`px-3.5 py-2.5 ${idx >= 2 ? "border-t border-[var(--border)]" : ""} ${isOddLast ? "col-span-2" : ""}`}
                                >
                                  <p className="text-[9px] font-bold uppercase tracking-wider text-[var(--text-muted)] mb-0.5">
                                    {entry.label}
                                    {entry.subStatus && (
                                      <span className={`ml-1 font-semibold ${entry.subStatus === "Picked up" ? "text-teal-600 dark:text-teal-400" : "text-amber-600 dark:text-amber-400"}`}>
                                        ({entry.subStatus})
                                      </span>
                                    )}
                                  </p>
                                  {entry.isAvailable ? (
                                    <>
                                      <p className={`font-mono text-xs font-bold ${
                                        entry.label === "Delivered" ? "text-emerald-600 dark:text-emerald-400" :
                                        entry.label === "RTO Delivered" ? "text-purple-600 dark:text-purple-400" :
                                        entry.label === "RTO" ? "text-amber-600 dark:text-amber-400" :
                                        "text-[var(--text-primary)]"
                                      }`}>{entry.displayDate}</p>
                                      {entry.hasTime && entry.fullTimestamp && (
                                        <p className="text-[10px] text-[var(--text-muted)] font-mono mt-0.5">
                                          {entry.fullTimestamp.includes(", ") ? entry.fullTimestamp.split(", ")[1] : ""}
                                        </p>
                                      )}
                                    </>
                                  ) : (
                                    <p className="text-xs text-[var(--text-muted)]">—</p>
                                  )}
                                </div>
                              );
                            })}
                          </div>
                        </div>
                      );
                    })()}

                    {/* Tracking Error (non-destructive) */}
                    {trackingError && (
                      <div className="flex items-start gap-2 px-3.5 py-3 rounded-lg bg-amber-500/5 border border-amber-500/20 text-xs text-amber-700 dark:text-amber-400">
                        <AlertTriangle size={13} className="shrink-0 mt-0.5" />
                        <span>{trackingError}</span>
                      </div>
                    )}

                    {/* Shipment Timeline */}
                    <div>
                      <div className="flex items-center gap-1.5 mb-3">
                        <Activity size={12} className="text-[var(--text-muted)]" />
                        <span className="text-[10px] font-bold uppercase tracking-wider text-[var(--text-muted)]">Shipment Timeline</span>
                      </div>

                      {trackingData.scans && trackingData.scans.length > 0 ? (
                        <div className="relative pl-5">
                          {/* Vertical rule */}
                          <div className="absolute left-[7px] top-2 bottom-2 w-px bg-[var(--border)]" />
                          <div className="space-y-4">
                            {trackingData.scans.map((scan: any, idx: number) => {
                              const isLatest = idx === 0;
                              return (
                                <div key={idx} className="relative flex gap-3">
                                  {/* Timeline dot */}
                                  <div className={`absolute -left-5 top-1 w-3.5 h-3.5 rounded-full border-2 flex items-center justify-center shrink-0 ${isLatest
                                    ? "bg-[var(--accent)] border-[var(--accent)] shadow-sm"
                                    : "bg-[var(--bg-secondary)] border-[var(--border-strong)]"
                                  }`}>
                                    {isLatest && <div className="w-1.5 h-1.5 rounded-full bg-white" />}
                                  </div>
                                  {/* Event content */}
                                  <div className={`flex-1 min-w-0 ${
                                    isLatest
                                      ? "rounded-lg bg-[var(--bg-secondary)] border border-[var(--border)] px-3 py-2.5"
                                      : "pb-1"
                                  }`}>
                                    <div className="flex items-start justify-between gap-2">
                                      <span className={`text-xs font-semibold leading-snug ${isLatest ? "text-[var(--text-primary)]" : "text-[var(--text-secondary)]"}`}>
                                        {scan.status}
                                      </span>
                                      <span className="text-[10px] font-mono text-[var(--text-muted)] shrink-0 whitespace-nowrap">
                                        {new Date(scan.timestamp).toLocaleString("en-IN", {
                                          day: "numeric",
                                          month: "short",
                                          hour: "2-digit",
                                          minute: "2-digit",
                                        })}
                                      </span>
                                    </div>
                                    {scan.location && (
                                      <div className="flex items-center gap-1 mt-0.5 text-[11px] text-[var(--text-muted)]">
                                        <MapPin size={10} className="shrink-0" />
                                        <span className="truncate">{scan.location}</span>
                                      </div>
                                    )}
                                    {scan.instructions && (
                                      <div className="mt-1.5 text-[11px] text-amber-700 dark:text-amber-400 bg-amber-500/5 border border-amber-500/15 rounded px-2 py-1 italic">
                                        {scan.instructions}
                                      </div>
                                    )}
                                  </div>
                                </div>
                              );
                            })}
                          </div>
                        </div>
                      ) : (
                        <div className="rounded-lg bg-[var(--bg-secondary)] border border-[var(--border)] px-3.5 py-4 text-center text-xs text-[var(--text-muted)]">
                          {trackingData?.warning || `No scan events yet. Click the official tracking portal link for live checkpoints from ${currentDrawerCourier.displayName}.`}
                        </div>
                      )}
                    </div>

                    {/* Bottom spacer */}
                    <div className="h-2" />
                  </div>
                ) : null}
              </div>

              {/* ── FIXED FOOTER ── */}
              <div className="shrink-0 border-t border-[var(--border)] bg-[var(--surface)] px-4 py-3 flex items-center justify-between gap-3">
                <span className="text-[10px] font-mono text-[var(--text-muted)] truncate">
                  {trackingData?.lastSyncedAt
                    ? `Synced ${new Date(trackingData.lastSyncedAt).toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" })}`
                    : trackingData?.statusTimestamp
                    ? `Updated ${new Date(trackingData.statusTimestamp).toLocaleString("en-IN", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}`
                    : ""}
                </span>
                <button
                  onClick={() => handleOpenTracking(activeAwb!, activeCarrier || undefined, true)}
                  disabled={trackingLoading}
                  className="flex items-center gap-1.5 px-3.5 py-2 rounded-lg bg-[var(--accent)] hover:bg-[var(--accent-hover)] text-white font-bold text-xs shadow-sm transition-all cursor-pointer disabled:opacity-50 shrink-0"
                >
                  <RefreshCw size={12} className={trackingLoading ? "animate-spin" : ""} />
                  <span>Refresh</span>
                </button>
              </div>

          </div>
        </Drawer>

        {/* RTO Return & Damage Inspection Modal */}
        {rtoModalOpen && (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4 backdrop-blur-sm">
      <div className="w-full max-w-2xl bg-slate-950 border border-amber-500/40 rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">
        {/* Modal Header */}
        <div className="p-4 bg-[var(--surface)] border-b border-[var(--border)] flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-amber-500/10 border border-amber-500/30 flex items-center justify-center text-amber-400">
              <RotateCcw size={16} />
            </div>
            <div>
              <h3 className="text-sm font-bold text-[var(--text-primary)] flex items-center gap-2">
                <span>RTO Inward &amp; Damage Inspection</span>
                {rtoDetails?.order?.orderNumber && (
                  <span className="text-xs font-mono text-purple-300 font-normal">
                    (Order #{rtoDetails.order.orderNumber.replace(/^#+/, "")})
                  </span>
                )}
              </h3>
              <p className="text-[11px] text-[var(--text-secondary)]">
                Physical parcel returned to warehouse. Inspect items before restoring inventory.
              </p>
            </div>
          </div>
          <button
            onClick={() => setRtoModalOpen(false)}
            className="text-[var(--text-secondary)] hover:text-white p-1 rounded-lg hover:bg-[var(--surface-hover)] transition-colors text-sm"
          >
            ✕
          </button>
        </div>

        {rtoLoading ? (
          <div className="p-12 text-center text-[var(--text-muted)] flex flex-col items-center justify-center gap-2">
            <RefreshCw size={20} className="animate-spin text-amber-400" />
            <span className="text-xs">Resolving shipment BOM &amp; component breakdown...</span>
          </div>
        ) : rtoDetails ? (
          <form onSubmit={handleConfirmRtoReceipt} className="flex flex-col flex-1 overflow-hidden">
            <div className="p-4 space-y-4 overflow-y-auto flex-1 text-xs">
              {/* Shipment Info Strip */}
              <div className="grid grid-cols-3 gap-2 bg-[var(--surface)] p-3 rounded-xl border border-[var(--border)]">
                <div>
                  <span className="text-[10px] text-[var(--text-muted)] uppercase font-bold block">AWB Number</span>
                  <span className="font-mono font-bold text-[var(--text-primary)]">{rtoDetails.shipment.awb}</span>
                </div>
                <div>
                  <span className="text-[10px] text-[var(--text-muted)] uppercase font-bold block">Carrier</span>
                  <span className="text-[var(--text-secondary)]">{rtoDetails.shipment.carrier || "Delhivery"}</span>
                </div>
                <div>
                  <span className="text-[10px] text-[var(--text-muted)] uppercase font-bold block">Customer</span>
                  <span className="text-[var(--text-secondary)] truncate block">
                    {rtoDetails.shipment.customerName || rtoDetails.order?.customerName || "Customer"}
                  </span>
                </div>
              </div>

              {/* Preset Selector */}
              <div className="space-y-1.5">
                <label className="text-[11px] font-bold uppercase tracking-wider text-[var(--text-secondary)]">
                  Overall Condition Preset
                </label>
                <div className="grid grid-cols-3 gap-2">
                  <button
                    type="button"
                    onClick={() => handleRtoConditionChange("all_good")}
                    className={`p-2.5 rounded-xl border text-center transition-all ${rtoCondition === "all_good"
                      ? "bg-emerald-500/15 border-emerald-500 text-emerald-300 font-bold shadow-sm"
                      : "bg-[var(--surface)] border-[var(--border)] text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
                      }`}
                  >
                    <span className="block text-xs">✓ All Good</span>
                    <span className="text-[10px] opacity-80 block mt-0.5">100% Saleable Stock</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => handleRtoConditionChange("some_damaged")}
                    className={`p-2.5 rounded-xl border text-center transition-all ${rtoCondition === "some_damaged"
                      ? "bg-amber-500/15 border-amber-500 text-amber-300 font-bold shadow-sm"
                      : "bg-[var(--surface)] border-[var(--border)] text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
                      }`}
                  >
                    <span className="block text-xs">⚠️ Some Damaged</span>
                    <span className="text-[10px] opacity-80 block mt-0.5">Component Breakdown</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => handleRtoConditionChange("all_damaged")}
                    className={`p-2.5 rounded-xl border text-center transition-all ${rtoCondition === "all_damaged"
                      ? "bg-rose-500/15 border-rose-500 text-rose-300 font-bold shadow-sm"
                      : "bg-[var(--surface)] border-[var(--border)] text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
                      }`}
                  >
                    <span className="block text-xs">❌ All Damaged</span>
                    <span className="text-[10px] opacity-80 block mt-0.5">100% Damaged Stock</span>
                  </button>
                </div>
              </div>

              {/* Component Breakdown Table */}
              <div className="space-y-1.5">
                <label className="text-[11px] font-bold uppercase tracking-wider text-[var(--text-secondary)]">
                  Returned Component Breakdown
                </label>
                <div className="bg-[var(--bg-secondary)] border border-[var(--border)] rounded-xl overflow-hidden">
                  <table className="w-full text-left text-xs border-collapse">
                    <thead>
                      <tr className="border-b border-[var(--border)] bg-[var(--surface)] text-[var(--text-secondary)] text-[10px] font-semibold uppercase">
                        <th className="py-2.5 px-3">Single SKU</th>
                        <th className="py-2.5 px-3">Description</th>
                        <th className="py-2.5 px-3 text-center">Returned</th>
                        <th className="py-2.5 px-3 text-center text-emerald-400">Good (Saleable)</th>
                        <th className="py-2.5 px-3 text-center text-rose-400">Damaged</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-[var(--border)]">
                      {rtoItems.map((item, idx) => (
                        <tr key={idx} className="hover:bg-[var(--surface-hover)]/30">
                          <td className="py-2.5 px-3 font-mono font-bold text-[var(--text-primary)] align-middle">
                            {item.sku}
                            {item.parentComboSku && (
                              <span className="block text-[9px] text-purple-400 font-sans font-normal">
                                from combo {item.parentComboSku}
                              </span>
                            )}
                          </td>
                          <td className="py-2.5 px-3 text-[var(--text-secondary)] align-middle truncate max-w-[160px]">
                            {item.name}
                          </td>
                          <td className="py-2.5 px-3 text-center font-mono font-bold text-[var(--text-primary)] align-middle">
                            {item.quantity}
                          </td>
                          <td className="py-2.5 px-3 align-middle text-center">
                            <input
                              type="number"
                              min="0"
                              max={item.quantity}
                              value={item.goodQty}
                              onChange={(e) => {
                                const val = Math.max(0, Math.min(item.quantity, parseInt(e.target.value, 10) || 0));
                                const next = [...rtoItems];
                                next[idx].goodQty = val;
                                next[idx].damagedQty = item.quantity - val;
                                setRtoItems(next);
                              }}
                              className="w-16 bg-[var(--surface)] border border-emerald-500/40 rounded-lg px-2 py-1 text-center font-mono font-bold text-emerald-400 focus:outline-none focus:border-emerald-400"
                            />
                          </td>
                          <td className="py-2.5 px-3 align-middle text-center">
                            <input
                              type="number"
                              min="0"
                              max={item.quantity}
                              value={item.damagedQty}
                              onChange={(e) => {
                                const val = Math.max(0, Math.min(item.quantity, parseInt(e.target.value, 10) || 0));
                                const next = [...rtoItems];
                                next[idx].damagedQty = val;
                                next[idx].goodQty = item.quantity - val;
                                setRtoItems(next);
                              }}
                              className="w-16 bg-[var(--surface)] border border-rose-500/40 rounded-lg px-2 py-1 text-center font-mono font-bold text-rose-400 focus:outline-none focus:border-rose-400"
                            />
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>

              {/* Summary Metric Strip */}
              <div className="grid grid-cols-2 gap-3">
                <div className="p-3 rounded-xl bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-between">
                  <div>
                    <span className="text-[10px] font-bold uppercase text-emerald-400 block">
                      Saleable Stock to Add (+)
                    </span>
                    <span className="text-base font-bold font-mono text-emerald-400">
                      +{rtoItems.reduce((acc, i) => acc + (i.goodQty || 0), 0)} pcs
                    </span>
                  </div>
                  <Package size={20} className="text-emerald-400/60" />
                </div>

                <div className="p-3 rounded-xl bg-rose-500/10 border border-rose-500/20 flex items-center justify-between">
                  <div>
                    <span className="text-[10px] font-bold uppercase text-rose-400 block">
                      Damaged Stock to Add (+)
                    </span>
                    <span className="text-base font-bold font-mono text-rose-400">
                      +{rtoItems.reduce((acc, i) => acc + (i.damagedQty || 0), 0)} pcs
                    </span>
                  </div>
                  <ShieldAlert size={20} className="text-rose-400/60" />
                </div>
              </div>

              {/* Inputs */}
              <div className="grid grid-cols-2 gap-3 pt-1">
                <div>
                  <label className="text-[var(--text-secondary)] font-semibold block mb-1">Inspector / Received By</label>
                  <input
                    type="text"
                    value={rtoReceivedBy}
                    onChange={(e) => setRtoReceivedBy(e.target.value)}
                    className="w-full bg-[var(--surface)] border border-[var(--border)] rounded-lg px-3 py-2 text-[var(--text-primary)]"
                  />
                </div>
                <div>
                  <label className="text-[var(--text-secondary)] font-semibold block mb-1">Inspection Notes / Remarks</label>
                  <input
                    type="text"
                    placeholder="e.g. Broken nozzle on snow foam"
                    value={rtoNotes}
                    onChange={(e) => setRtoNotes(e.target.value)}
                    className="w-full bg-[var(--surface)] border border-[var(--border)] rounded-lg px-3 py-2 text-[var(--text-primary)]"
                  />
                </div>
              </div>
            </div>

            {/* Modal Footer */}
            <div className="p-4 border-t border-[var(--border)] bg-[var(--surface)] flex items-center justify-between">
              <button
                type="button"
                onClick={() => setRtoModalOpen(false)}
                className="px-4 py-2 rounded-xl bg-[var(--surface-hover)] hover:bg-slate-700 text-[var(--text-secondary)] font-semibold text-xs transition-colors"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={rtoSubmitting}
                className="flex items-center gap-1.5 px-5 py-2 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold text-xs shadow-md shadow-amber-500/20 transition-all cursor-pointer disabled:opacity-50"
              >
                <RotateCcw size={13} className={rtoSubmitting ? "animate-spin" : ""} />
                <span>{rtoSubmitting ? "Processing..." : "Confirm & Inward Stock"}</span>
              </button>
            </div>
          </form>
        ) : null}
      </div>
    </div>
  )
}
      </div >
    </RouteGuard >
  );
}

