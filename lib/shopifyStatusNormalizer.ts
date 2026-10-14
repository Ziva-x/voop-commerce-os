/**
 * shopifyStatusNormalizer.ts
 *
 * Centralizes the mapping of raw Shopify API status strings
 * to the normalized UPPERCASE values stored in the VOOP DB.
 *
 * Shopify fulfillment_status raw values:
 *   null / ""            → UNFULFILLED
 *   "unfulfilled"        → UNFULFILLED
 *   "in_progress"        → IN_PROGRESS  (some items being prepared)
 *   "partial"            → PARTIALLY_FULFILLED
 *   "fulfilled"          → FULFILLED
 *   "on_hold"            → ON_HOLD
 *   "scheduled"          → SCHEDULED
 *   "returned"           → RETURNED
 *
 * Shopify financial_status raw values:
 *   "pending"            → PENDING        (COD / bank deposit awaiting)
 *   "authorized"         → AUTHORIZED     (card hold, not captured)
 *   "partially_paid"     → PARTIALLY_PAID
 *   "paid"               → PAID
 *   "partially_refunded" → PARTIALLY_REFUNDED
 *   "refunded"           → REFUNDED
 *   "voided"             → VOIDED         (= cancelled before capture)
 *
 * An order is considered CANCELLED if ANY of the following is true:
 *   - payload.cancelled_at is set
 *   - financial_status is "voided"
 *   - topic is "orders/cancelled"
 */

// ─────────────────────────────────────────────────────────────────────────────
// Fulfillment Status
// ─────────────────────────────────────────────────────────────────────────────

const FULFILLMENT_STATUS_MAP: Record<string, string> = {
  "":              "UNFULFILLED",
  "null":          "UNFULFILLED",
  "unfulfilled":   "UNFULFILLED",
  "in_progress":   "IN_PROGRESS",
  "partial":       "PARTIALLY_FULFILLED",
  "fulfilled":     "FULFILLED",
  "on_hold":       "ON_HOLD",
  "scheduled":     "SCHEDULED",
  "returned":      "RETURNED",
};

export function normalizeFulfillmentStatus(raw: string | null | undefined): string {
  if (!raw) return "UNFULFILLED";
  const key = String(raw).toLowerCase().trim();
  return FULFILLMENT_STATUS_MAP[key] ?? raw.toUpperCase().replace(/ /g, "_");
}

// ─────────────────────────────────────────────────────────────────────────────
// Financial Status
// ─────────────────────────────────────────────────────────────────────────────

const FINANCIAL_STATUS_MAP: Record<string, string> = {
  "":                   "PAID",
  "null":               "PAID",
  "pending":            "PENDING",
  "authorized":         "AUTHORIZED",
  "partially_paid":     "PARTIALLY_PAID",
  "paid":               "PAID",
  "partially_refunded": "PARTIALLY_REFUNDED",
  "refunded":           "REFUNDED",
  "voided":             "VOIDED",   // Order was cancelled before payment captured
};

export function normalizeFinancialStatus(raw: string | null | undefined): string {
  if (!raw) return "PAID";
  const key = String(raw).toLowerCase().trim();
  return FINANCIAL_STATUS_MAP[key] ?? raw.toUpperCase().replace(/ /g, "_");
}

// ─────────────────────────────────────────────────────────────────────────────
// Cancellation Detection
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Returns true if any Shopify signal indicates the order is cancelled.
 * Shopify can signal cancellation via:
 *  - topic: "orders/cancelled"
 *  - payload.cancelled_at being non-null
 *  - payload.financial_status === "voided" (cancelled before capture)
 *  - payload.financial_status === "cancelled" (rare, non-standard)
 */
export function isOrderCancelled(payload: any, topic?: string): boolean {
  if (topic === "orders/cancelled") return true;
  if (payload?.cancelled_at) return true;
  const fs = (payload?.financial_status || "").toLowerCase();
  return fs === "voided" || fs === "cancelled";
}

/**
 * Returns true if the order is fulfilled (all line items shipped).
 */
export function isOrderFulfilled(payload: any, topic?: string): boolean {
  if (topic === "orders/fulfilled") return true;
  const fs = (payload?.fulfillment_status || "").toLowerCase();
  return fs === "fulfilled";
}

/**
 * Returns true if the order has partial fulfillment activity.
 */
export function isOrderPartiallyFulfilled(payload: any): boolean {
  const fs = (payload?.fulfillment_status || "").toLowerCase();
  return fs === "partial" || fs === "in_progress";
}

// ─────────────────────────────────────────────────────────────────────────────
// Human-Readable Labels (for sync logs and UI)
// ─────────────────────────────────────────────────────────────────────────────

export function getFulfillmentStatusLabel(normalized: string): string {
  const LABELS: Record<string, string> = {
    UNFULFILLED:          "Unfulfilled",
    IN_PROGRESS:          "In Progress",
    PARTIALLY_FULFILLED:  "Partially Fulfilled",
    FULFILLED:            "Fulfilled",
    ON_HOLD:              "On Hold",
    SCHEDULED:            "Scheduled",
    RETURNED:             "Returned",
  };
  return LABELS[normalized] ?? normalized;
}

export function getFinancialStatusLabel(normalized: string): string {
  const LABELS: Record<string, string> = {
    PENDING:              "Pending (COD / Unpaid)",
    AUTHORIZED:           "Authorized",
    PARTIALLY_PAID:       "Partially Paid",
    PAID:                 "Paid",
    PARTIALLY_REFUNDED:   "Partially Refunded",
    REFUNDED:             "Refunded",
    VOIDED:               "Voided / Cancelled",
  };
  return LABELS[normalized] ?? normalized;
}
