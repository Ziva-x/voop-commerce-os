/**
 * VOOP Unified Courier Status Normalization Layer
 * 
 * Single source of truth for standardizing operational shipment statuses
 * across Delhivery, Blue Dart, XpressBees, Ecom Express, Ekart, and Shadowfax.
 */

export type VoopShipmentStatus =
  | "AWB_GENERATED"
  | "PICKUP_COMPLETED"
  | "IN_TRANSIT"
  | "OUT_FOR_DELIVERY"
  | "DELIVERED"
  | "RTO_INITIATED"
  | "RTO_IN_TRANSIT"
  | "RTO"
  | "RTO_DELIVERED"
  | "CANCELLED"
  | "CANCELLED_PRE_DISPATCH"
  // Legacy / granular backward-compatibility tokens:
  | "CREATED"
  | "LABEL_CREATED"
  | "MANIFESTED"
  | "PICKUP_SCHEDULED"
  | "READY_FOR_PICKUP"
  | "PICKUP_ATTEMPTED"
  | "PICKUP_FAILED"
  | "PICKED_UP"
  | "DISPATCHED"
  | "UNKNOWN";

export type VoopShipmentStatusFilter = "ALL" | VoopShipmentStatus;

export interface VoopStatusDefinition {
  id: VoopShipmentStatusFilter;
  label: string;
  isOperational: boolean;
  isActive: boolean; // Active operational vs terminal/completed state
}

/**
 * Strict invariant status ordering across the VOOP primary filter tabs:
 * 1. All
 * 2. AWB Generated (All pre-pickup states)
 * 3. In Transit (Actual carrier pickup & transit movement)
 * 4. Out for Delivery
 * 5. Delivered
 * 6. RTO
 * 7. RTO Delivered
 * 
 * NO separate tabs for any pickup-related states.
 * Pre-pickup states (Pickup Pending, Pickup Scheduled, Pickup Rescheduled, 
 * Pickup Not Done, Pickup Attempted, Manifest Uploaded) all belong under AWB GENERATED.
 */
export const VOOP_SHIPMENT_STATUSES: readonly VoopStatusDefinition[] = [
  { id: "ALL", label: "All", isOperational: false, isActive: false },
  { id: "AWB_GENERATED", label: "AWB Generated", isOperational: true, isActive: true },
  { id: "IN_TRANSIT", label: "In Transit", isOperational: true, isActive: true },
  { id: "OUT_FOR_DELIVERY", label: "Out for Delivery", isOperational: true, isActive: true },
  { id: "DELIVERED", label: "Delivered", isOperational: true, isActive: false },
  { id: "RTO", label: "RTO", isOperational: true, isActive: true },
  { id: "RTO_DELIVERED", label: "RTO Delivered", isOperational: true, isActive: false },
] as const;

/**
 * State machine hierarchy weights.
 * Higher rank represents further progress in the shipment lifecycle.
 * All pre-pickup states are rank 3 (AWB_GENERATED).
 */
export const STATUS_HIERARCHY: Record<string, number> = {
  UNKNOWN: 0,
  CREATED: 1,
  LABEL_CREATED: 2,
  MANIFESTED: 3,
  AWB_GENERATED: 3,
  PICKUP_PENDING: 3,
  PICKUP_ASSIGNED: 3,
  PICKUP_SCHEDULED: 3,
  READY_FOR_PICKUP: 3,
  PICKUP_RESCHEDULED: 3,
  PICKUP_ATTEMPTED: 3,
  PICKUP_FAILED: 3,
  DISPATCHED: 3,
  PICKED_UP: 5,
  PICKUP_COMPLETED: 5,
  IN_TRANSIT: 7,
  OUT_FOR_DELIVERY: 8,
  DELIVERED: 10,
  // RTO branch
  RTO_INITIATED: 7,
  RTO_IN_TRANSIT: 8,
  RTO: 8,
  RTO_DELIVERED: 10,
  // Terminal cancellations
  CANCELLED: 10,
  CANCELLED_PRE_DISPATCH: 10,
};

export interface NormalizedStatusResult {
  normalizedStatus: VoopShipmentStatus;
  displayStatus: string;
  rawStatus: string;
  isRto: boolean;
  isRtoDelivered: boolean;
  isForwardDelivered: boolean;
  isRescheduled?: boolean;
}

export interface CourierStatusDetails {
  normalizedStatus: VoopShipmentStatus;
  displayStatus: string;
  rawStatus: string;
  rawStatusCode: string;
  eventTime: Date | null;
  location: string | null;
  description: string | null;
  isRescheduled?: boolean;
}

/**
 * Validate that an event timestamp is not in the future (with 5-minute clock skew tolerance).
 */
export function isValidEventTimestamp(timestamp: Date | string | number | null | undefined): boolean {
  if (!timestamp) return false;
  const d = new Date(timestamp);
  const time = d.getTime();
  if (isNaN(time)) return false;
  // Maximum allowed future tolerance: 5 minutes for server clock skew
  const maxAllowedFuture = Date.now() + 5 * 60 * 1000;
  return time <= maxAllowedFuture;
}

/**
 * Normalizes courier status, status types, instructions, and checkpoint scans into VOOP standard status.
 * CRITICAL: Manifested != In Transit. Pickup != In Transit.
 * Delhivery UD code is NOT an in-transit indicator.
 */
export function normalizeCourierStatus(
  rawStatusInput: string = "",
  statusTypeInput: string = "",
  instructionsInput: string = "",
  scansInput: any[] = []
): NormalizedStatusResult {
  const raw = (rawStatusInput || "").toUpperCase().trim();
  const type = (statusTypeInput || "").toUpperCase().trim();
  const inst = (instructionsInput || "").toUpperCase().trim();
  const scans = Array.isArray(scansInput) ? scansInput : [];

  // Check scans for RTO terminal indicators
  const hasRtoDeliveredScan = scans.some((s) => {
    const st = ((s.statusType || s.type || "") as string).toUpperCase();
    const txt = `${s.status || ""} ${s.instructions || ""} ${s.description || ""}`.toUpperCase();
    return (
      st === "RT-DL" ||
      (st === "DL" && (txt.includes("RTO") || txt.includes("RETURN") || txt.includes("ACCEPTED") || txt.includes("ORIGIN") || txt.includes("CLIENT"))) ||
      txt.includes("RTO DELIVERED") ||
      txt.includes("RETURN DELIVERED") ||
      txt.includes("RETURN ACCEPTED") ||
      txt.includes("RETURN ACCEPT") ||
      txt.includes("DELIVERED TO ORIGIN") ||
      txt.includes("DELIVERED TO CLIENT") ||
      txt.includes("RETURNED TO ORIGIN") ||
      txt.includes("RETURNED TO SHIPPER") ||
      txt.includes("RECEIVED AT ORIGIN") ||
      txt.includes("RECEIVED AT RETURN") ||
      txt.includes("RETURN RECEIVED") ||
      txt.includes("RD-AC")
    );
  });

  const hasRtoActiveScan = scans.some((s) => {
    const st = ((s.statusType || s.type || "") as string).toUpperCase();
    const txt = `${s.status || ""} ${s.instructions || ""} ${s.description || ""}`.toUpperCase();
    return (
      st === "RT" ||
      txt.includes("RTO INITIATED") ||
      txt.includes("RTO IN TRANSIT") ||
      txt.includes("RTO IN-TRANSIT") ||
      txt.includes("RETURN TO ORIGIN") ||
      txt.includes("RETURNING TO ORIGIN") ||
      txt.includes("RETURNING") ||
      (txt.includes("RTO") && !txt.includes("RT-DL") && !txt.includes("RTO DELIVERED") && !txt.includes("RETURN ACCEPT"))
    );
  });

  // 1. Cancellation Check
  if (
    raw.includes("CANCEL") ||
    type === "CC" ||
    type === "CN" ||
    inst.includes("CANCEL") ||
    rawStatusInput === "CANCELLED_PRE_DISPATCH"
  ) {
    return {
      normalizedStatus: rawStatusInput === "CANCELLED_PRE_DISPATCH" ? "CANCELLED_PRE_DISPATCH" : "CANCELLED",
      displayStatus: "Cancelled",
      rawStatus: rawStatusInput || "Cancelled",
      isRto: false,
      isRtoDelivered: false,
      isForwardDelivered: false,
    };
  }

  // 2. RTO Check: First determine if shipment is in RTO lifecycle
  const isRtoCandidate =
    type === "RT" ||
    type === "RT-DL" ||
    (type === "DL" && (raw.includes("RTO") || raw.includes("RETURN") || inst.includes("RETURN") || inst.includes("RTO"))) ||
    raw.includes("RTO") ||
    raw.includes("RETURN TO ORIGIN") ||
    raw.includes("RETURNED TO ORIGIN") ||
    raw.includes("RETURNING TO ORIGIN") ||
    raw.includes("RETURNED") ||
    raw.includes("RETURNING") ||
    inst.includes("RTO") ||
    inst.includes("RETURN TO ORIGIN") ||
    inst.includes("RETURN ACCEPTED") ||
    hasRtoDeliveredScan ||
    hasRtoActiveScan;

  if (isRtoCandidate) {
    // 2a. RTO Delivered (Terminal RTO) - Mutually exclusive from active RTO
    const isRtoTerminal =
      type === "RT-DL" ||
      (type === "DL" && isRtoCandidate) ||
      hasRtoDeliveredScan ||
      raw.includes("RTO DELIVERED") ||
      raw.includes("RETURN DELIVERED") ||
      raw.includes("DELIVERED TO ORIGIN") ||
      raw.includes("DELIVERED TO CLIENT") ||
      raw.includes("RETURNED TO ORIGIN") ||
      raw.includes("RETURNED TO SHIPPER") ||
      raw.includes("RECEIVED AT ORIGIN") ||
      raw.includes("RECEIVED AT RETURN") ||
      raw.includes("RETURN RECEIVED") ||
      inst.includes("RTO DELIVERED") ||
      inst.includes("RETURN DELIVERED") ||
      inst.includes("DELIVERED TO ORIGIN") ||
      inst.includes("RETURN ACCEPTED") ||
      inst.includes("RETURN ACCEPT") ||
      inst.includes("RD-AC") ||
      (!raw.includes("UNDELIVERED") && (raw.includes("DELIVERED") || raw === "DL" || type === "DL") && isRtoCandidate);

    if (isRtoTerminal) {
      return {
        normalizedStatus: "RTO_DELIVERED",
        displayStatus: "RTO Delivered",
        rawStatus: rawStatusInput || "RTO Delivered",
        isRto: false,
        isRtoDelivered: true,
        isForwardDelivered: false,
      };
    }

    // 2b. Active RTO in transit
    if (
      raw.includes("RTO IN TRANSIT") ||
      raw.includes("RTO IN-TRANSIT") ||
      raw.includes("RETURNING TO ORIGIN") ||
      inst.includes("RTO IN TRANSIT") ||
      inst.includes("RTO IN-TRANSIT")
    ) {
      return {
        normalizedStatus: "RTO",
        displayStatus: "RTO in Transit",
        rawStatus: rawStatusInput || "RTO in Transit",
        isRto: true,
        isRtoDelivered: false,
        isForwardDelivered: false,
      };
    }

    // 2c. Active RTO Initiated / General RTO
    return {
      normalizedStatus: "RTO",
      displayStatus: "RTO",
      rawStatus: rawStatusInput || "RTO",
      isRto: true,
      isRtoDelivered: false,
      isForwardDelivered: false,
    };
  }

  // 3. Normal Forward Delivered (Terminal delivery to customer)
  // Ensure "UNDELIVERED" / "FAILED" is excluded
  if (
    !raw.includes("UNDELIVERED") &&
    !raw.includes("DELIVERY FAILED") &&
    !inst.includes("UNDELIVERED") &&
    (type === "DL" ||
      raw === "DELIVERED" ||
      raw.includes("DELIVERED SUCCESSFULLY") ||
      raw.includes("SHIPMENT DELIVERED") ||
      inst.includes("SHIPMENT DELIVERED") ||
      inst.includes("DELIVERED SUCCESSFULLY") ||
      (raw.includes("DELIVERED") && !raw.includes("NOT DELIVERED") && !raw.includes("ATTEMPTED")))
  ) {
    return {
      normalizedStatus: "DELIVERED",
      displayStatus: "Delivered",
      rawStatus: rawStatusInput || "Delivered",
      isRto: false,
      isRtoDelivered: false,
      isForwardDelivered: true,
    };
  }

  // 4. Out for Delivery
  if (
    type === "OFD" ||
    raw.includes("OUT FOR DELIVERY") ||
    raw.includes("OUT-FOR-DELIVERY") ||
    raw.includes("OUT_FOR_DELIVERY") ||
    raw === "OFD" ||
    raw.includes("WITH DELIVERY AGENT") ||
    raw.includes("DISPATCHED FOR DELIVERY") ||
    inst.includes("OUT FOR DELIVERY") ||
    inst.includes("WITH DELIVERY AGENT")
  ) {
    return {
      normalizedStatus: "OUT_FOR_DELIVERY",
      displayStatus: "Out for Delivery",
      rawStatus: rawStatusInput || "Out for Delivery",
      isRto: false,
      isRtoDelivered: false,
      isForwardDelivered: false,
    };
  }

  // 5. Picked Up / Collected by Carrier / Handed Over (Actual carrier physical handover)
  // Confirmed courier pickup moves shipment to IN_TRANSIT with detailed substatus
  if (
    type === "PU" ||
    type === "PK" ||
    type === "P" ||
    type === "PC" ||
    raw.includes("CARRIER PICKED UP") ||
    raw.includes("PICKED UP") ||
    raw.includes("PICKED-UP") ||
    raw.includes("PICKED_UP") ||
    raw.includes("PACKAGE PICKED UP") ||
    raw.includes("SHIPMENT PICKED UP") ||
    raw.includes("PICKUP COMPLETED") ||
    raw.includes("PICKUP_COMPLETED") ||
    raw.includes("PICKUP DONE") ||
    raw.includes("INWARDED AT ORIGIN") ||
    raw.includes("INWARDED_ORIGIN") ||
    raw.includes("RECEIVED FROM SHIPPER") ||
    raw.includes("COLLECTED FROM") ||
    raw.includes("HANDED OVER TO COURIER") ||
    raw.includes("HANDED OVER TO CARRIER") ||
    raw.includes("COLLECTED BY CARRIER") ||
    raw.includes("RECEIVED_FROM_SELLER") ||
    raw.includes("PACKAGE COLLECTED") ||
    raw.includes("COLLECTED") ||
    inst.includes("PACKAGE PICKED UP") ||
    inst.includes("SHIPMENT PICKED UP") ||
    (inst.includes("PICKED UP") && !inst.includes("NOT PICKED UP"))
  ) {
    return {
      normalizedStatus: "IN_TRANSIT",
      displayStatus: rawStatusInput ? (rawStatusInput.toUpperCase().includes("PICK") ? "Carrier Picked Up" : rawStatusInput) : "Carrier Picked Up",
      rawStatus: rawStatusInput || "Carrier Picked Up",
      isRto: false,
      isRtoDelivered: false,
      isForwardDelivered: false,
    };
  }

  // 6. In Transit (Actual carrier movement beyond pickup — COURIER DATA ONLY)
  // CRITICAL: type === "UD" is NOT an in-transit indicator. In Delhivery, UD means generic "Update".
  // CRITICAL: plain "DISPATCHED" is internal warehouse status, NOT courier transit movement!
  const hasMovementText =
    raw.includes("IN TRANSIT") ||
    raw.includes("IN-TRANSIT") ||
    raw.includes("IN_TRANSIT") ||
    raw.includes("INTRANSIT") ||
    raw.includes("ARRIVED AT") ||
    raw.includes("DEPARTED") ||
    raw.includes("EN ROUTE") ||
    raw.includes("ENROUTE") ||
    raw.includes("REACHED AT") ||
    raw.includes("REACHED") ||
    raw.includes("ACCEPTED AT HUB") ||
    raw.includes("RECEIVED AT HUB") ||
    raw.includes("VEHICLE DEPARTED") ||
    raw.includes("BAG RECEIVED") ||
    raw.includes("CONNECTED TO") ||
    raw.includes("FORWARDED TO") ||
    raw.includes("DISPATCHED FROM") ||
    raw.includes("DISPATCHED TO") ||
    raw.includes("MOVING") ||
    raw.includes("ARRIVED_HUB") ||
    raw.includes("DEPARTED_HUB") ||
    raw.includes("NETWORK_TRANSIT") ||
    inst.includes("IN TRANSIT") ||
    inst.includes("REACHED AT FACILITY") ||
    inst.includes("BAG RECEIVED") ||
    inst.includes("VEHICLE DEPARTED") ||
    inst.includes("DEPARTED FROM FACILITY") ||
    inst.includes("CONNECTED TO HUB");

  const isDeliveryAttemptRetry =
    raw.includes("NDR") ||
    raw.includes("UNDELIVERED") ||
    raw.includes("DELIVERY FAILED") ||
    raw.includes("ATTEMPT FAILED") ||
    raw.includes("UNSUCCESSFUL ATTEMPT") ||
    inst.includes("UNDELIVERED") ||
    inst.includes("CUSTOMER NOT AVAILABLE") ||
    inst.includes("DELIVERY ATTEMPTED") ||
    (inst.includes("RESCHEDULED") && !inst.includes("PICKUP")) ||
    inst.includes("CONSIGNEE REFUSED") ||
    inst.includes("INCORRECT ADDRESS") ||
    inst.includes("DOOR CLOSED") ||
    inst.includes("OTP NOT RECEIVED") ||
    inst.includes("CUSTOMER UNREACHABLE") ||
    inst.includes("FAILED DELIVERY");

  if (
    type === "IT" ||
    type === "RAD" ||
    type === "DEP" ||
    type === "ARR" ||
    hasMovementText ||
    isDeliveryAttemptRetry
  ) {
    return {
      normalizedStatus: "IN_TRANSIT",
      displayStatus: "In Transit",
      rawStatus: rawStatusInput || "In Transit",
      isRto: false,
      isRtoDelivered: false,
      isForwardDelivered: false,
    };
  }

  // =========================================================================
  // ALL PRE-PICKUP STATES MUST REMAIN UNDER: AWB GENERATED
  // Detailed courier status preserved in displayStatus and rawStatus
  // =========================================================================

  // 7a. Pickup Rescheduled (Pre-pickup state under AWB_GENERATED)
  if (
    raw.includes("RESCHEDULE") ||
    inst.includes("RESCHEDULE") ||
    raw.includes("RE-SCHEDULE") ||
    inst.includes("RE-SCHEDULE")
  ) {
    return {
      normalizedStatus: "AWB_GENERATED",
      displayStatus: "Pickup Rescheduled",
      rawStatus: rawStatusInput || "Pickup Rescheduled",
      isRto: false,
      isRtoDelivered: false,
      isForwardDelivered: false,
      isRescheduled: true,
    };
  }

  // 7b. Pickup Not Done / Not Ready / Delayed / Not Collected (Pre-pickup state under AWB_GENERATED)
  if (
    raw.includes("NOT DONE") ||
    inst.includes("NOT DONE") ||
    raw.includes("NOT READY") ||
    inst.includes("NOT READY") ||
    raw.includes("NOT COLLECTED") ||
    inst.includes("NOT COLLECTED") ||
    raw.includes("PICKUP DELAYED") ||
    inst.includes("PICKUP DELAYED")
  ) {
    return {
      normalizedStatus: "AWB_GENERATED",
      displayStatus: "Pickup Not Done",
      rawStatus: rawStatusInput || "Pickup Not Done",
      isRto: false,
      isRtoDelivered: false,
      isForwardDelivered: false,
    };
  }

  // 7c. Pickup Attempted / Failed (Pre-pickup state under AWB_GENERATED)
  if (
    raw.includes("PICKUP ATTEMPTED") ||
    raw.includes("PICKUP FAILED") ||
    inst.includes("PICKUP ATTEMPTED") ||
    inst.includes("PICKUP FAILED") ||
    raw.includes("ATTEMPT FAILED")
  ) {
    return {
      normalizedStatus: "AWB_GENERATED",
      displayStatus: "Pickup Attempted",
      rawStatus: rawStatusInput || "Pickup Attempted",
      isRto: false,
      isRtoDelivered: false,
      isForwardDelivered: false,
    };
  }

  // 7d. Pickup Pending / Awaiting Pickup / Seller Preparing (Pre-pickup state under AWB_GENERATED)
  if (
    raw.includes("PICKUP PENDING") ||
    inst.includes("PICKUP PENDING") ||
    raw.includes("PENDING PICKUP") ||
    inst.includes("PENDING PICKUP") ||
    raw.includes("AWAITING PICKUP") ||
    inst.includes("AWAITING PICKUP") ||
    raw.includes("NOT PICKED UP") ||
    inst.includes("NOT PICKED UP") ||
    raw.includes("SELLER PREPARING") ||
    inst.includes("SELLER PREPARING") ||
    raw.includes("PICKUP NOT ASSIGNED") ||
    inst.includes("PICKUP NOT ASSIGNED") ||
    raw.includes("COURIER HAS NOT COLLECTED") ||
    inst.includes("COURIER HAS NOT COLLECTED") ||
    raw.includes("AWAITING COURIER") ||
    inst.includes("AWAITING COURIER") ||
    raw.includes("WAITING FOR PICKUP") ||
    inst.includes("WAITING FOR PICKUP") ||
    raw.includes("COLLECTION PENDING") ||
    inst.includes("COLLECTION PENDING") ||
    raw.includes("YET TO BE PICKED UP") ||
    inst.includes("YET TO BE PICKED UP")
  ) {
    return {
      normalizedStatus: "AWB_GENERATED",
      displayStatus: "Pickup Pending",
      rawStatus: rawStatusInput || "Pickup Pending",
      isRto: false,
      isRtoDelivered: false,
      isForwardDelivered: false,
    };
  }

  // 7e. Pickup Scheduled / Assigned / Booked (Pre-pickup state under AWB_GENERATED)
  if (
    type === "PP" ||
    raw.includes("SCHEDULED") ||
    inst.includes("SCHEDULED") ||
    raw.includes("PICKUP ASSIGNED") ||
    inst.includes("PICKUP ASSIGNED") ||
    raw.includes("ASSIGNED") ||
    inst.includes("ASSIGNED") ||
    raw.includes("BOOKED") ||
    inst.includes("BOOKED") ||
    raw.includes("READY FOR PICKUP") ||
    raw.includes("READY TO PICKUP") ||
    inst.includes("READY FOR PICKUP") ||
    inst.includes("READY TO PICKUP")
  ) {
    return {
      normalizedStatus: "AWB_GENERATED",
      displayStatus: "Pickup Scheduled",
      rawStatus: rawStatusInput || "Pickup Scheduled",
      isRto: false,
      isRtoDelivered: false,
      isForwardDelivered: false,
    };
  }

  // 8. Manifest Uploaded / Manifested / Data Received / Label Created / Default Fallback
  const isManifest =
    raw.includes("MANIFEST") ||
    inst.includes("MANIFEST") ||
    raw === "DATA RECEIVED" ||
    inst.includes("DATA RECEIVED");

  return {
    normalizedStatus: "AWB_GENERATED",
    displayStatus: isManifest ? "Manifest Uploaded" : (rawStatusInput || "AWB Generated"),
    rawStatus: rawStatusInput || (isManifest ? "Manifest Uploaded" : "AWB Generated"),
    isRto: false,
    isRtoDelivered: false,
    isForwardDelivered: false,
  };
}

/**
 * Explicit courier normalization function for multi-courier pipelines.
 * Preserves raw status, code, location, and description.
 */
export function normalizeCourierShipmentStatus(
  courier: string = "Delhivery",
  rawStatus: string = "",
  rawStatusCode: string = "",
  trackingEvent?: any
): CourierStatusDetails {
  const eventStatus = trackingEvent?.status || trackingEvent?.Scan || trackingEvent?.Status || rawStatus;
  const eventCode = trackingEvent?.statusType || trackingEvent?.ScanType || trackingEvent?.StatusCode || rawStatusCode;
  const eventInst = trackingEvent?.instructions || trackingEvent?.Instructions || "";
  const eventLocation = trackingEvent?.location || trackingEvent?.ScannedLocation || trackingEvent?.StatusLocation || null;
  const eventTime = trackingEvent?.timestamp
    ? new Date(trackingEvent.timestamp)
    : trackingEvent?.ScanDateTime
      ? new Date(trackingEvent.ScanDateTime)
      : trackingEvent?.StatusDateTime
        ? new Date(trackingEvent.StatusDateTime)
        : null;

  const result = normalizeCourierStatus(
    eventStatus,
    eventCode,
    eventInst,
    trackingEvent?.scans || []
  );

  return {
    normalizedStatus: result.normalizedStatus,
    displayStatus: result.displayStatus,
    rawStatus: eventStatus || result.rawStatus,
    rawStatusCode: eventCode || "",
    eventTime,
    location: eventLocation,
    description: eventInst || trackingEvent?.description || result.displayStatus,
    isRescheduled: result.isRescheduled,
  };
}

/**
 * Status Progression Guard:
 * Ensures statuses progress forward according to the state machine and never regress backward.
 * E.g., DELIVERED must never regress to IN_TRANSIT, and older events arriving out of order
 * cannot overwrite newer status.
 */
export function canAdvanceStatus(
  currentStatus: string | null | undefined,
  candidateStatus: string | null | undefined,
  currentTimestamp?: Date | string | null,
  candidateTimestamp?: Date | string | null
): boolean {
  if (!candidateStatus) return false;
  if (!currentStatus) return true;

  const curr = currentStatus.toUpperCase().replace(/-/g, "_");
  const cand = candidateStatus.toUpperCase().replace(/-/g, "_");

  // Terminal states cannot regress
  if (curr === "DELIVERED" && cand !== "DELIVERED") {
    return false;
  }
  if (curr === "RTO_DELIVERED" && cand !== "RTO_DELIVERED") {
    return false;
  }
  if (
    (curr === "CANCELLED" || curr === "CANCELLED_PRE_DISPATCH") &&
    cand !== "CANCELLED" &&
    cand !== "CANCELLED_PRE_DISPATCH"
  ) {
    return false;
  }

  // Check event timestamps if both are provided and valid
  if (currentTimestamp && candidateTimestamp) {
    const currTime = new Date(currentTimestamp).getTime();
    const candTime = new Date(candidateTimestamp).getTime();
    if (!isNaN(currTime) && !isNaN(candTime)) {
      // If candidate is older than current event by more than 1 minute, reject
      if (candTime < currTime - 60 * 1000) {
        return false;
      }
    }
  }

  const currRank = STATUS_HIERARCHY[curr] ?? 0;
  const candRank = STATUS_HIERARCHY[cand] ?? 0;

  // Allow transitions into RTO lifecycle from active statuses (e.g. from IN_TRANSIT or OUT_FOR_DELIVERY)
  if (cand.startsWith("RTO") && !curr.startsWith("RTO")) {
    return currRank >= (STATUS_HIERARCHY.MANIFESTED ?? 3) && curr !== "DELIVERED";
  }

  // Allow NDR / redelivery attempts (e.g. failed attempt moving back to in transit awaiting next attempt)
  if (curr === "OUT_FOR_DELIVERY" && cand === "IN_TRANSIT") {
    return true;
  }

  // Progression: candRank must be >= currRank to advance forward
  return candRank >= currRank;
}

