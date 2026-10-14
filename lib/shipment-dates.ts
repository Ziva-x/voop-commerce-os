/**
 * VOOP Shipment Dates Normalization Engine
 * Single source of truth for resolving and formatting shipment dates across table and drawer.
 */

const MONTH_NAMES = [
  "Jan", "Feb", "Mar", "Apr", "May", "Jun",
  "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
];

export interface FormattedDateValue {
  displayDate: string;      // e.g. "08 Sep 2026" or "Not available"
  fullTimestamp: string | null; // e.g. "08 Sep 2026, 02:15 PM" or null
  date: Date | null;
  isAvailable: boolean;
  hasTime: boolean;
}

export interface ShipmentDateEntry extends FormattedDateValue {
  label: "Order" | "Pickup" | "ETD" | "Delivered" | "RTO" | "RTO Delivered";
  subStatus?: "Scheduled" | "Picked up" | "Attempted" | "Pending" | string | null;
}

export interface ResolvedShipmentDates {
  lifecycle: "FORWARD" | "RTO";
  isForwardDelivered: boolean;
  isRtoDelivered: boolean;
  effectiveStatus: string;
  orderDate: ShipmentDateEntry;
  pickupDate: ShipmentDateEntry;
  etdDate: ShipmentDateEntry;
  deliveredDate?: ShipmentDateEntry;
  rtoDate?: ShipmentDateEntry;
  rtoDeliveredDate?: ShipmentDateEntry;
  entries: ShipmentDateEntry[];
}

/**
 * Format a raw date input into compact display and full timestamp
 */
export function formatShipmentDate(raw: Date | string | number | null | undefined): FormattedDateValue {
  if (!raw) {
    return {
      displayDate: "Not available",
      fullTimestamp: null,
      date: null,
      isAvailable: false,
      hasTime: false,
    };
  }

  let d: Date;
  let isDateOnlyString = false;

  if (typeof raw === "string") {
    const trimmed = raw.trim();
    if (!trimmed) {
      return {
        displayDate: "Not available",
        fullTimestamp: null,
        date: null,
        isAvailable: false,
        hasTime: false,
      };
    }
    // Check if string is simple YYYY-MM-DD date without time
    if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) {
      isDateOnlyString = true;
      const [y, m, day] = trimmed.split("-").map(Number);
      d = new Date(y, m - 1, day);
    } else {
      d = new Date(trimmed);
    }
  } else if (raw instanceof Date) {
    d = raw;
  } else {
    d = new Date(raw);
  }

  if (isNaN(d.getTime())) {
    return {
      displayDate: "Not available",
      fullTimestamp: null,
      date: null,
      isAvailable: false,
      hasTime: false,
    };
  }

  const dayStr = String(d.getDate()).padStart(2, "0");
  const monthStr = MONTH_NAMES[d.getMonth()] || "";
  const yearStr = String(d.getFullYear());
  const displayDate = `${dayStr} ${monthStr} ${yearStr}`;

  // Check if timestamp contains actual time information
  const hours = d.getHours();
  const minutes = d.getMinutes();
  const seconds = d.getSeconds();
  const ms = d.getMilliseconds();
  const hasTime = !isDateOnlyString && (hours !== 0 || minutes !== 0 || seconds !== 0 || ms !== 0);

  let fullTimestamp = displayDate;
  if (hasTime) {
    let displayHour = hours % 12;
    if (displayHour === 0) displayHour = 12;
    const hourStr = String(displayHour).padStart(2, "0");
    const minStr = String(minutes).padStart(2, "0");
    const ampm = hours >= 12 ? "PM" : "AM";
    fullTimestamp = `${displayDate}, ${hourStr}:${minStr} ${ampm}`;
  }

  return {
    displayDate,
    fullTimestamp,
    date: d,
    isAvailable: true,
    hasTime,
  };
}

/**
 * Normalizes all key shipment dates for any shipment object or tracking payload.
 * Single source of truth for both the Shipments table and the Tracking Details drawer.
 */
export function resolveShipmentDates(shipment: any): ResolvedShipmentDates {
  if (!shipment) {
    const defaultEntry = (label: ShipmentDateEntry["label"]): ShipmentDateEntry => ({
      label,
      ...formatShipmentDate(null),
    });
    return {
      lifecycle: "FORWARD",
      isForwardDelivered: false,
      isRtoDelivered: false,
      effectiveStatus: "MANIFESTED",
      orderDate: defaultEntry("Order"),
      pickupDate: defaultEntry("Pickup"),
      etdDate: defaultEntry("ETD"),
      entries: [defaultEntry("Order"), defaultEntry("Pickup"), defaultEntry("ETD")],
    };
  }

  const norm = (shipment.normalizedStatus || shipment.currentStatus || shipment.status || "").toUpperCase().replace(/-/g, "_");
  const rawStatus = (shipment.rawStatus || shipment.status || "").toUpperCase();
  const statusType = (shipment.statusType || "").toUpperCase();
  const scans: any[] = Array.isArray(shipment.scans)
    ? shipment.scans
    : Array.isArray(shipment.events)
    ? shipment.events
    : [];

  // 1. Detect RTO lifecycle
  const hasRtoScan = scans.some((s) => {
    const st = (s.statusType || "").toUpperCase();
    const stText = (s.status || s.description || "").toUpperCase();
    return (
      st === "RT" ||
      st === "RT-DL" ||
      stText.includes("RTO") ||
      stText.includes("RETURN TO ORIGIN") ||
      stText.includes("RETURNED")
    );
  });

  const isRto =
    norm === "RTO" ||
    norm === "RTO_DELIVERED" ||
    statusType === "RT" ||
    statusType === "RT-DL" ||
    rawStatus.includes("RTO") ||
    rawStatus.includes("RETURN TO ORIGIN") ||
    Boolean(shipment.rtoInwardScanned) ||
    Boolean(shipment.rtoInventoryProcessed) ||
    Boolean(shipment.rtoDate) ||
    Boolean(shipment.isReplacementRto) ||
    hasRtoScan;

  // 2. Detect RTO Delivered vs Normal Forward Delivered
  const hasRtoDeliveredScan = scans.some((s) => {
    const st = (s.statusType || "").toUpperCase();
    const stText = `${s.status || ""} ${s.instructions || ""} ${s.description || ""}`.toUpperCase();
    return (
      st === "RT-DL" ||
      (st === "DL" && (stText.includes("RTO") || stText.includes("RETURN") || stText.includes("ACCEPTED") || stText.includes("ORIGIN") || stText.includes("CLIENT"))) ||
      stText.includes("RTO DELIVERED") ||
      stText.includes("RETURN DELIVERED") ||
      stText.includes("RETURN ACCEPTED") ||
      stText.includes("RETURN ACCEPT") ||
      stText.includes("DELIVERED TO ORIGIN") ||
      stText.includes("DELIVERED TO CLIENT") ||
      stText.includes("RETURNED TO SHIPPER") ||
      stText.includes("RETURNED TO ORIGIN") ||
      (isRto && !stText.includes("UNDELIVERED") && stText.includes("DELIVERED"))
    );
  });

  const isRtoDelivered =
    isRto &&
    (norm === "RTO_DELIVERED" ||
      statusType === "RT-DL" ||
      Boolean(shipment.rtoReceivedAt) ||
      Boolean(shipment.rtoInwardScanned) ||
      hasRtoDeliveredScan ||
      (!rawStatus.includes("UNDELIVERED") && rawStatus.includes("DELIVERED")) ||
      (Boolean(shipment.deliveryDate) && isRto));

  const isForwardDelivered =
    !isRto &&
    (norm === "DELIVERED" ||
      statusType === "DL" ||
      Boolean(shipment.deliveryDate) ||
      (!rawStatus.includes("UNDELIVERED") && rawStatus.includes("DELIVERED")) ||
      scans.some((s) => {
        const st = (s.statusType || "").toUpperCase();
        const stText = (s.status || s.description || "").toUpperCase();
        return st === "DL" || (!stText.includes("UNDELIVERED") && stText.includes("DELIVERED"));
      }));

  // 3. Resolve Order Date
  const rawOrderDate =
    shipment.orderCreatedAt ||
    shipment.shopifyOrderCreatedAt ||
    shipment.date ||
    shipment.createdAt ||
    null;
  const orderFormatted = formatShipmentDate(rawOrderDate);
  const orderDate: ShipmentDateEntry = {
    label: "Order",
    ...orderFormatted,
  };

  // 4. Resolve Pickup Date & Status
  // Look for authoritative physical courier pickup event in scans
  const physicalPickupScan = scans.find((s) => {
    const st = ((s.statusType || s.ScanType || "") as string).toUpperCase();
    const txt = `${s.status || s.Scan || ""} ${s.instructions || s.Instructions || ""} ${s.description || ""}`.toUpperCase();
    return (
      st === "PU" ||
      txt.includes("PICKED UP") ||
      txt.includes("PICKED-UP") ||
      txt.includes("PACKAGE PICKED UP") ||
      txt.includes("SHIPMENT PICKED UP") ||
      txt.includes("PICKUP COMPLETED") ||
      txt.includes("PICKUP DONE") ||
      txt.includes("INWARDED AT ORIGIN") ||
      txt.includes("RECEIVED FROM SHIPPER")
    );
  });

  let rawPickupDate: Date | string | null = null;
  let pickupSubStatus: string | null = null;

  const rawStatusUpper = (shipment.rawStatus || shipment.status || "").toUpperCase();

  if (physicalPickupScan?.timestamp || physicalPickupScan?.ScanDateTime) {
    rawPickupDate = physicalPickupScan.timestamp || physicalPickupScan.ScanDateTime;
    pickupSubStatus = "Picked up";
  } else if (norm === "PICKED_UP" || norm === "PICKUP_COMPLETED") {
    rawPickupDate = shipment.pickupDate || shipment.statusTimestamp || null;
    pickupSubStatus = "Picked up";
  } else if (rawStatusUpper.includes("RESCHEDULE")) {
    rawPickupDate = shipment.pickupDate;
    pickupSubStatus = "Rescheduled";
  } else if (rawStatusUpper.includes("NOT DONE") || rawStatusUpper.includes("NOT READY") || rawStatusUpper.includes("NOT COLLECTED")) {
    rawPickupDate = shipment.pickupDate;
    pickupSubStatus = "Not Done";
  } else if (shipment.pickupDate) {
    rawPickupDate = shipment.pickupDate;
    pickupSubStatus = "Scheduled";
  }

  const pickupFormatted = formatShipmentDate(rawPickupDate);
  const pickupDate: ShipmentDateEntry = {
    label: "Pickup",
    ...pickupFormatted,
    subStatus: pickupFormatted.isAvailable ? pickupSubStatus : null,
  };

  // 5. Resolve ETD Date
  const rawEtdDate =
    shipment.etdDate ||
    shipment.estimatedDelivery ||
    shipment.expectedDeliveryDate ||
    null;
  const etdFormatted = formatShipmentDate(rawEtdDate);
  const etdDate: ShipmentDateEntry = {
    label: "ETD",
    ...etdFormatted,
  };

  // Build the entries array (Every shipment starts with Order, Pickup, ETD)
  const entries: ShipmentDateEntry[] = [orderDate, pickupDate, etdDate];

  let deliveredDate: ShipmentDateEntry | undefined;
  let rtoDate: ShipmentDateEntry | undefined;
  let rtoDeliveredDate: ShipmentDateEntry | undefined;

  if (!isRto && isForwardDelivered) {
    // 6. Normal Forward Delivered
    let rawDeliveredDate = shipment.deliveryDate || null;
    if (!rawDeliveredDate && scans.length > 0) {
      const delScan = scans.find((s) => {
        const st = (s.statusType || "").toUpperCase();
        const txt = `${s.status || ""} ${s.instructions || ""} ${s.description || ""}`.toUpperCase();
        return st === "DL" || (!txt.includes("UNDELIVERED") && txt.includes("DELIVERED"));
      });
      if (delScan?.timestamp) {
        rawDeliveredDate = delScan.timestamp;
      }
    }
    const delFormatted = formatShipmentDate(rawDeliveredDate || shipment.statusTimestamp);
    deliveredDate = {
      label: "Delivered",
      ...delFormatted,
    };
    entries.push(deliveredDate);
  } else if (isRto) {
    // 7. RTO Shipment
    let rawRtoDate = shipment.rtoDate || null;
    if (!rawRtoDate && scans.length > 0) {
      // Find the scan when RTO was initiated
      const rtoScan = scans.find((s) => {
        const st = (s.statusType || "").toUpperCase();
        const txt = `${s.status || ""} ${s.instructions || ""} ${s.description || ""}`.toUpperCase();
        return st === "RT" || txt.includes("RTO") || txt.includes("RETURN TO ORIGIN") || txt.includes("RETURNED");
      });
      if (rtoScan?.timestamp) {
        rawRtoDate = rtoScan.timestamp;
      }
    }
    const rtoFormatted = formatShipmentDate(rawRtoDate || shipment.statusTimestamp);
    rtoDate = {
      label: "RTO",
      ...rtoFormatted,
    };
    entries.push(rtoDate);

    if (isRtoDelivered) {
      // 8. RTO Delivered - MUST NEVER be labeled as normal Delivered
      let rawRtoDeliveredDate =
        shipment.rtoDeliveredDate ||
        shipment.rtoReceivedAt ||
        shipment.deliveryDate ||
        null;

      if (!rawRtoDeliveredDate && scans.length > 0) {
        const rtoDelScan = scans.find((s) => {
          const st = (s.statusType || "").toUpperCase();
          const txt = `${s.status || ""} ${s.instructions || ""} ${s.description || ""}`.toUpperCase();
          return (
            st === "RT-DL" ||
            txt.includes("RTO DELIVERED") ||
            txt.includes("RETURN DELIVERED") ||
            txt.includes("DELIVERED TO ORIGIN") ||
            txt.includes("DELIVERED TO CLIENT") ||
            txt.includes("RETURNED TO SHIPPER") ||
            (!txt.includes("UNDELIVERED") && txt.includes("DELIVERED"))
          );
        });
        if (rtoDelScan?.timestamp) {
          rawRtoDeliveredDate = rtoDelScan.timestamp;
        }
      }

      const rtoDelFormatted = formatShipmentDate(
        rawRtoDeliveredDate || shipment.rtoInwardScannedAt || shipment.statusTimestamp
      );
      rtoDeliveredDate = {
        label: "RTO Delivered",
        ...rtoDelFormatted,
      };
      entries.push(rtoDeliveredDate);
    }
  }

  const effectiveStatus = isRtoDelivered
    ? "RTO_DELIVERED"
    : isRto
    ? "RTO"
    : isForwardDelivered
    ? "DELIVERED"
    : norm || "MANIFESTED";

  return {
    lifecycle: isRto ? "RTO" : "FORWARD",
    isForwardDelivered,
    isRtoDelivered,
    effectiveStatus,
    orderDate,
    pickupDate,
    etdDate,
    deliveredDate,
    rtoDate,
    rtoDeliveredDate,
    entries,
  };
}

// ═══════════════════════════════════════════════════════════════════
// SHIPMENT DATE RANGE FILTER CALCULATIONS (BUSINESS TIMEZONE AWARE)
// ═══════════════════════════════════════════════════════════════════

export interface ShipmentDateRangeOptions {
  preset?: string | null; // "today" | "yesterday" | "last_7_days" | "custom" | "all"
  dateFrom?: string | null; // "YYYY-MM-DD" or ISO string
  dateTo?: string | null; // "YYYY-MM-DD" or ISO string
  timeZone?: string; // Default: "Asia/Kolkata"
  referenceDate?: Date; // Optional reference date for testing
}

export interface ShipmentDateRangeBounds {
  start: Date;
  end: Date;
  preset: "today" | "yesterday" | "last_7_days" | "custom";
  formattedStart: string; // e.g. "10 Sep 2026"
  formattedEnd: string; // e.g. "16 Sep 2026"
  dateFromStr: string; // "YYYY-MM-DD"
  dateToStr: string; // "YYYY-MM-DD"
  timeZone: string;
}

/**
 * Formats a Date object into "YYYY-MM-DD" in the specified business timezone.
 */
export function getLocalDateString(d: Date = new Date(), timeZone = "Asia/Kolkata"): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: timeZone || "Asia/Kolkata",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(d);
}

/**
 * Converts a date string ("YYYY-MM-DD") and boundary position ("start" | "end")
 * into a UTC Date object aligned to 00:00:00.000 or 23:59:59.999 in the target timezone.
 */
export function parseLocalDateToUtc(
  dateStr: string,
  boundary: "start" | "end",
  timeZone = "Asia/Kolkata"
): Date {
  const clean = dateStr.trim();
  const timeComponent = boundary === "start" ? "00:00:00.000" : "23:59:59.999";

  // If already an ISO string with time information
  if (clean.includes("T")) {
    const d = new Date(clean);
    if (!isNaN(d.getTime())) return d;
  }

  // Extract YYYY-MM-DD if string is longer
  const dateOnly = clean.slice(0, 10);

  // Fast-path for India Standard Time (VOOP Business Default UTC+05:30)
  if (!timeZone || timeZone === "Asia/Kolkata" || timeZone === "IST") {
    return new Date(`${dateOnly}T${timeComponent}+05:30`);
  }

  if (timeZone === "UTC" || timeZone === "Etc/UTC") {
    return new Date(`${dateOnly}T${timeComponent}Z`);
  }

  // Dynamic IANA timezone offset calculation
  try {
    const dummy = new Date(`${dateOnly}T12:00:00Z`);
    const parts = new Intl.DateTimeFormat("en-US", {
      timeZone,
      timeZoneName: "longOffset",
    }).formatToParts(dummy);
    const offsetPart = parts.find((p) => p.type === "timeZoneName")?.value || "+05:30";
    const cleanOffset = offsetPart.replace("GMT", "").trim() || "+05:30";
    return new Date(`${dateOnly}T${timeComponent}${cleanOffset}`);
  } catch {
    return new Date(`${dateOnly}T${timeComponent}+05:30`);
  }
}

/**
 * Calculates start and end Date objects for shipment filtering based on presets
 * or custom ranges, strictly adhering to the business timezone.
 */
export function calculateShipmentDateRangeBounds(
  options: ShipmentDateRangeOptions
): ShipmentDateRangeBounds | null {
  const rawPreset = (options.preset || "").toLowerCase().trim();
  const timeZone = options.timeZone || "Asia/Kolkata";
  const refDate = options.referenceDate || new Date();

  // If explicitly "all" or empty with no dateFrom/dateTo, no filter is applied
  if (rawPreset === "all" || (!rawPreset && !options.dateFrom && !options.dateTo)) {
    return null;
  }

  const todayStr = getLocalDateString(refDate, timeZone);
  const [y, m, d] = todayStr.split("-").map(Number);

  let preset: "today" | "yesterday" | "last_7_days" | "custom" = "custom";
  let fromDateStr = "";
  let toDateStr = "";

  if (rawPreset === "today") {
    preset = "today";
    fromDateStr = todayStr;
    toDateStr = todayStr;
  } else if (rawPreset === "yesterday") {
    preset = "yesterday";
    const prevUtc = new Date(Date.UTC(y, m - 1, d - 1));
    const yesterdayStr = prevUtc.toISOString().slice(0, 10);
    fromDateStr = yesterdayStr;
    toDateStr = yesterdayStr;
  } else if (rawPreset === "last_7_days" || rawPreset === "7days" || rawPreset === "last7days") {
    // 7 full calendar days: today plus previous 6 calendar days
    preset = "last_7_days";
    const sixDaysAgoUtc = new Date(Date.UTC(y, m - 1, d - 6));
    fromDateStr = sixDaysAgoUtc.toISOString().slice(0, 10);
    toDateStr = todayStr;
  } else {
    // Custom range or explicit dateFrom / dateTo
    preset = "custom";
    if (!options.dateFrom) {
      throw new Error("Start date is required for custom date range");
    }
    fromDateStr = options.dateFrom.slice(0, 10);
    toDateStr = (options.dateTo || options.dateFrom).slice(0, 10);
  }

  const start = parseLocalDateToUtc(fromDateStr, "start", timeZone);
  const end = parseLocalDateToUtc(toDateStr, "end", timeZone);

  if (isNaN(start.getTime()) || isNaN(end.getTime())) {
    throw new Error("Invalid date format provided for date range filter");
  }

  if (start.getTime() > end.getTime()) {
    throw new Error("End date cannot be earlier than start date");
  }

  const formattedStart = formatShipmentDate(start).displayDate;
  const formattedEnd = formatShipmentDate(end).displayDate;

  return {
    start,
    end,
    preset,
    formattedStart,
    formattedEnd,
    dateFromStr: fromDateStr,
    dateToStr: toDateStr,
    timeZone,
  };
}

