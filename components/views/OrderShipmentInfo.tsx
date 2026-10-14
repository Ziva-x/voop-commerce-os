"use client";

import React from "react";
import {
  Truck,
  ExternalLink,
  CheckCircle2,
  Clock,
  RefreshCw,
  Package,
  AlertCircle,
  ShieldCheck,
} from "lucide-react";
import { formatDate } from "@/lib/utils";
import { CourierService } from "@/lib/services/CourierService";

export interface TrackingItem {
  number: string;
  company?: string | null;
  url?: string | null;
  deliveryStatus?: string | null;
  pickupDate?: string | Date | null;
  etdDate?: string | Date | null;
}

export interface OrderShipmentInfoProps {
  fulfillmentStatus?: string | null;
  deliveryStatus?: string | null;
  trackingList?: TrackingItem[];
  pickupDate?: string | Date | null;
  deliveryDate?: string | Date | null;
  etdDate?: string | Date | null;
  rtoDate?: string | Date | null;
  rtoDeliveredDate?: string | Date | null;
  warehouseStatus?: string | null;
  outwardScanned?: boolean;
  rtoInwardScanned?: boolean;
  hasRtoDiscrepancy?: boolean;
  onTrack?: (awb: string, carrier?: string) => void;
}

/**
 * Capitalize AM/PM and sanitize invalid date strings.
 * Returns null if invalid or empty to avoid rendering broken placeholders.
 */
function formatDisplayDate(dateInput: string | Date | null | undefined): string | null {
  if (!dateInput) return null;
  const d = new Date(dateInput);
  if (isNaN(d.getTime())) return null;
  const str = formatDate(d);
  if (!str || str === "—") return null;
  return str.replace(/\b(am|pm)\b/i, (m) => m.toUpperCase());
}

export function OrderShipmentInfo({
  fulfillmentStatus,
  deliveryStatus,
  trackingList = [],
  pickupDate,
  deliveryDate,
  etdDate,
  rtoDate,
  rtoDeliveredDate,
  warehouseStatus,
  outwardScanned = false,
  rtoInwardScanned = false,
  hasRtoDiscrepancy = false,
  onTrack,
}: OrderShipmentInfoProps) {
  // ── 1. Resolve Fulfillment Status Pill ──
  const rawFulfill = (fulfillmentStatus || "UNFULFILLED").toUpperCase().trim();
  let fulfillLabel = "Unfulfilled";
  let fulfillStyle = "bg-[var(--neutral-soft)] text-[var(--text-secondary)] border border-[var(--border)]";
  let FulfillIcon = Clock;

  if (rawFulfill === "FULFILLED") {
    fulfillLabel = "Fulfilled";
    fulfillStyle = "bg-[var(--success-soft)] text-[var(--success)] border border-[var(--success)]/25";
    FulfillIcon = CheckCircle2;
  } else if (rawFulfill === "IN_PROGRESS") {
    fulfillLabel = "In Progress";
    fulfillStyle = "bg-[var(--warning-soft)] text-[var(--warning)] border border-[var(--warning)]/25";
    FulfillIcon = RefreshCw;
  } else if (rawFulfill === "PARTIALLY_FULFILLED") {
    fulfillLabel = "Partial";
    fulfillStyle = "bg-[var(--warning-soft)] text-[var(--warning)] border border-[var(--warning)]/25";
    FulfillIcon = Package;
  } else if (rawFulfill === "ON_HOLD") {
    fulfillLabel = "On Hold";
    fulfillStyle = "bg-[var(--warning-soft)] text-[var(--warning)] border border-[var(--warning)]/25";
    FulfillIcon = AlertCircle;
  } else if (rawFulfill === "SCHEDULED") {
    fulfillLabel = "Scheduled";
    fulfillStyle = "bg-[var(--info-soft)] text-[var(--info)] border border-[var(--info)]/25";
    FulfillIcon = Clock;
  } else if (rawFulfill === "RETURNED") {
    fulfillLabel = "Returned";
    fulfillStyle = "bg-[var(--error-soft)] text-[var(--error)] border border-[var(--error)]/25";
    FulfillIcon = AlertCircle;
  }

  // ── 2. Resolve Shipment Status Pill ──
  const primaryTrack = trackingList[0];
  const rawShipmentStatus = (
    deliveryStatus ||
    primaryTrack?.deliveryStatus ||
    ""
  ).toUpperCase().replace(/-/g, "_").trim();

  let shipmentLabel: string | null = null;
  let shipmentStyle = "";

  if (rawShipmentStatus === "PICKUP_COMPLETED" || rawShipmentStatus === "PICKED_UP") {
    shipmentLabel = "Carrier Picked Up";
    shipmentStyle = "bg-sky-500/15 text-sky-700 dark:text-sky-300 border border-sky-500/30";
  } else if (rawShipmentStatus === "PICKUP_SCHEDULED" || rawShipmentStatus === "READY_FOR_PICKUP" || rawShipmentStatus === "READY FOR PICKUP") {
    shipmentLabel = "Pickup Scheduled";
    shipmentStyle = "bg-[var(--warning-soft)] text-[var(--warning)] border border-[var(--warning)]/25";
  } else if (rawShipmentStatus === "PICKUP_ATTEMPTED" || rawShipmentStatus === "PICKUP_FAILED") {
    shipmentLabel = "Pickup Attempted";
    shipmentStyle = "bg-[var(--warning-soft)] text-[var(--warning)] border border-[var(--warning)]/25";
  } else if (rawShipmentStatus === "DELIVERED") {
    shipmentLabel = "Delivered";
    shipmentStyle = "bg-[var(--success-soft)] text-[var(--success)] border border-[var(--success)]/25";
  } else if (rawShipmentStatus === "IN_TRANSIT" || rawShipmentStatus === "INTRANSIT") {
    shipmentLabel = "In Transit";
    shipmentStyle = "bg-[var(--info-soft)] text-[var(--info)] border border-[var(--info)]/25";
  } else if (rawShipmentStatus === "OUT_FOR_DELIVERY" || rawShipmentStatus === "OFD") {
    shipmentLabel = "Out for Delivery";
    shipmentStyle = "bg-[var(--accent-soft)] text-[var(--accent)] border border-[var(--accent)]/25";
  } else if (rawShipmentStatus === "RTO") {
    shipmentLabel = "RTO";
    shipmentStyle = "bg-[var(--warning-soft)] text-[var(--warning)] border border-[var(--warning)]/25";
  } else if (rawShipmentStatus === "RTO_DELIVERED" || rawShipmentStatus === "RTO DELIVERED") {
    shipmentLabel = "RTO Delivered";
    shipmentStyle = "bg-[var(--error-soft)] text-[var(--error)] border border-[var(--error)]/25";
  } else if (rawShipmentStatus === "AWB_GENERATED" || rawShipmentStatus === "MANIFESTED" || rawShipmentStatus === "DISPATCHED") {
    shipmentLabel = "AWB Generated";
    shipmentStyle = "bg-[var(--neutral-soft)] text-[var(--text-secondary)] border border-[var(--border)]";
  } else if (rawShipmentStatus.includes("CANCEL")) {
    shipmentLabel = "Cancelled";
    shipmentStyle = "bg-[var(--error-soft)] text-[var(--error)] border border-[var(--error)]/25";
  } else if (
    rawShipmentStatus &&
    rawShipmentStatus !== "CONFIRMED" &&
    rawShipmentStatus !== "PENDING" &&
    rawShipmentStatus !== "UNFULFILLED" &&
    rawShipmentStatus !== rawFulfill
  ) {
    shipmentLabel = rawShipmentStatus
      .replace(/_/g, " ")
      .toLowerCase()
      .replace(/\b\w/g, (c) => c.toUpperCase());
    shipmentStyle = "bg-[var(--neutral-soft)] text-[var(--text-secondary)] border border-[var(--border)]";
  }

  // ── 3. Resolve Date Text & Formatting ──
  // Precedence: RTO Delivered -> Delivered -> RTO -> Pickup -> ETD
  const resolvedPickupDate = pickupDate || primaryTrack?.pickupDate;
  const resolvedEtdDate = etdDate || primaryTrack?.etdDate;

  let dateLabel: string | null = null;
  let dateFormatted: string | null = null;
  let dateColorStyle = "text-[var(--text-muted)]";

  if ((rawShipmentStatus === "RTO_DELIVERED" || rawShipmentStatus === "RTO DELIVERED") && rtoDeliveredDate) {
    dateLabel = "RTO Delivered";
    dateFormatted = formatDisplayDate(rtoDeliveredDate);
    dateColorStyle = "text-[var(--error)] font-medium";
  } else if (rawShipmentStatus === "DELIVERED" && deliveryDate) {
    dateLabel = "Delivered";
    dateFormatted = formatDisplayDate(deliveryDate);
    dateColorStyle = "text-[var(--success)] font-medium";
  } else if (rawShipmentStatus === "RTO" && rtoDate) {
    dateLabel = "RTO";
    dateFormatted = formatDisplayDate(rtoDate);
    dateColorStyle = "text-[var(--warning)] font-medium";
  } else if (resolvedPickupDate) {
    dateLabel = "Pickup";
    dateFormatted = formatDisplayDate(resolvedPickupDate);
    dateColorStyle = "text-[var(--text-secondary)]";
  } else if (resolvedEtdDate) {
    dateLabel = "ETD";
    dateFormatted = formatDisplayDate(resolvedEtdDate);
    dateColorStyle = "text-[var(--info)] font-medium";
  }

  // ── 4. Resolve Warehouse Status ──
  let whLabel: string | null = null;
  let whDotStyle = "bg-[var(--text-disabled)]";
  let whTextStyle = "text-[var(--text-secondary)]";

  if (hasRtoDiscrepancy) {
    whLabel = "⚠️ Missing WH Scan";
    whDotStyle = "bg-[var(--error)] animate-pulse";
    whTextStyle = "text-[var(--error)] font-bold";
  } else if (rtoInwardScanned) {
    whLabel = "RTO Received";
    whDotStyle = "bg-[var(--warning)]";
    whTextStyle = "text-[var(--warning)] font-semibold";
  } else if (outwardScanned) {
    whLabel = "Outward Scanned";
    whDotStyle = "bg-[var(--success)]";
    whTextStyle = "text-[var(--success)] font-semibold";
  } else if (warehouseStatus) {
    whLabel = warehouseStatus;
    whDotStyle = "bg-[var(--accent)]";
    whTextStyle = "text-[var(--text-secondary)] font-medium";
  } else if (trackingList.length > 0) {
    whLabel = "Dispatched";
    whDotStyle = "bg-[var(--accent)]";
    whTextStyle = "text-[var(--text-secondary)] font-medium";
  } else {
    whLabel = "Not Dispatched";
    whDotStyle = "bg-[var(--text-disabled)]";
    whTextStyle = "text-[var(--text-muted)]";
  }

  return (
    <div className="space-y-1.5 min-w-[150px] max-w-[260px]">
      {/* 1. Status Badges Row: [✓ Fulfilled] [Ready for Pickup] */}
      <div className="flex items-center gap-1.5 flex-wrap leading-none">
        <span
          className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-bold tracking-tight shadow-2xs ${fulfillStyle}`}
        >
          <FulfillIcon size={9} className="shrink-0" />
          <span>{fulfillLabel}</span>
        </span>

        {shipmentLabel && (
          <span
            className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-bold tracking-tight shadow-2xs ${shipmentStyle}`}
          >
            <span>{shipmentLabel}</span>
          </span>
        )}
      </div>

      {/* 2. Courier + AWB Hierarchy */}
      {trackingList.length > 0 && (
        <div className="space-y-1 pt-0.5">
          {trackingList.map((track, idx) => {
            const detected = CourierService.detectCourier(track.company, track.number);
            const directUrl = CourierService.getTrackingUrl(track.number, track.company, track.url);

            return (
              <div key={idx} className="leading-tight">
                {/* 🚚 Courier Name */}
                <div className="font-semibold text-xs text-[var(--text-primary)] flex items-center gap-1.5">
                  <Truck size={12} className="text-[var(--accent)] shrink-0" />
                  <span>{detected.displayName}</span>
                </div>

                {/* AWB Number + External Tracking Icon */}
                <div className="pl-4 mt-0.5">
                  <a
                    href={directUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    onClick={(e) => {
                      if (onTrack) {
                        e.preventDefault();
                        onTrack(track.number, detected.displayName);
                      }
                    }}
                    className="font-mono text-[11px] text-[var(--text-secondary)] hover:text-[var(--accent)] inline-flex items-center gap-1 transition-colors hover:underline cursor-pointer group whitespace-nowrap select-all"
                    title={`Track with ${detected.displayName} (${track.number})`}
                  >
                    <span>{track.number}</span>
                    <ExternalLink size={9} className="opacity-60 group-hover:opacity-100 shrink-0 transition-opacity" />
                  </a>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* 3. Compact Date Line: Pickup · 10 Sep 2026, 08:53 PM */}
      {dateLabel && dateFormatted && (
        <div className={`text-[11px] font-mono leading-tight ${dateColorStyle}`}>
          <span>{dateLabel}</span>
          <span className="mx-1 text-[var(--text-muted)] opacity-50">·</span>
          <span>{dateFormatted}</span>
        </div>
      )}

      {/* 4. Warehouse Status Line: Warehouse · Dispatched */}
      {whLabel && (
        <div className="text-[11px] text-[var(--text-muted)] flex items-center gap-1.5 leading-tight pt-0.5">
          <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${whDotStyle}`} />
          <span>
            Warehouse
            <span className="mx-1 opacity-50">·</span>
            <span className={whTextStyle}>{whLabel}</span>
          </span>
        </div>
      )}
    </div>
  );
}

export default OrderShipmentInfo;
