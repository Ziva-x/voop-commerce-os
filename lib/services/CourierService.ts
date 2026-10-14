export interface CourierInfo {
  name: string;
  code: "DELHIVERY" | "BLUEDART" | "XPRESSBEES" | "ECOM_EXPRESS" | "EKART" | "SHADOWFAX" | "OTHER";
  displayName: string;
  badgeClass: string;
  badgeBg: string;
  badgeText: string;
  badgeBorder: string;
  iconColor: string;
  trackUrl: (awb: string) => string;
}

export const SUPPORTED_COURIERS: Record<string, CourierInfo> = {
  DELHIVERY: {
    name: "Delhivery",
    code: "DELHIVERY",
    displayName: "Delhivery",
    badgeClass: "bg-purple-50 text-purple-700 border-purple-200",
    badgeBg: "bg-purple-50",
    badgeText: "text-purple-700",
    badgeBorder: "border-purple-200",
    iconColor: "text-purple-600",
    trackUrl: (awb: string) => `https://www.delhivery.com/track/package/${encodeURIComponent(awb.trim())}`,
  },
  BLUEDART: {
    name: "Blue Dart",
    code: "BLUEDART",
    displayName: "Blue Dart",
    badgeClass: "bg-blue-50 text-blue-700 border-blue-200",
    badgeBg: "bg-blue-50",
    badgeText: "text-blue-700",
    badgeBorder: "border-blue-200",
    iconColor: "text-blue-600",
    trackUrl: (awb: string) => `https://www.bluedart.com/tracking?trackNumber=${encodeURIComponent(awb.trim())}`,
  },
  XPRESSBEES: {
    name: "XpressBees",
    code: "XPRESSBEES",
    displayName: "XpressBees",
    badgeClass: "bg-orange-50 text-orange-700 border-orange-200",
    badgeBg: "bg-orange-50",
    badgeText: "text-orange-700",
    badgeBorder: "border-orange-200",
    iconColor: "text-orange-600",
    trackUrl: (awb: string) => `https://www.xpressbees.com/track?isawb=Yes&trackid=${encodeURIComponent(awb.trim())}`,
  },
  ECOM_EXPRESS: {
    name: "Ecom Express",
    code: "ECOM_EXPRESS",
    displayName: "Ecom Express",
    badgeClass: "bg-emerald-50 text-emerald-700 border-emerald-200",
    badgeBg: "bg-emerald-50",
    badgeText: "text-emerald-700",
    badgeBorder: "border-emerald-200",
    iconColor: "text-emerald-600",
    trackUrl: (awb: string) => `https://ecomexpress.in/tracking/?awb_number=${encodeURIComponent(awb.trim())}`,
  },
  EKART: {
    name: "Ekart",
    code: "EKART",
    displayName: "Ekart Logistics",
    badgeClass: "bg-amber-50 text-amber-700 border-amber-200",
    badgeBg: "bg-amber-50",
    badgeText: "text-amber-700",
    badgeBorder: "border-amber-200",
    iconColor: "text-amber-600",
    trackUrl: (awb: string) => `https://ekartlogistics.com/shipmenttrack/${encodeURIComponent(awb.trim())}`,
  },
  SHADOWFAX: {
    name: "Shadowfax",
    code: "SHADOWFAX",
    displayName: "Shadowfax",
    badgeClass: "bg-rose-50 text-rose-700 border-rose-200",
    badgeBg: "bg-rose-50",
    badgeText: "text-rose-700",
    badgeBorder: "border-rose-200",
    iconColor: "text-rose-600",
    trackUrl: (awb: string) => `https://tracker.shadowfax.in/#/track?awb=${encodeURIComponent(awb.trim())}`,
  },
  OTHER: {
    name: "Courier",
    code: "OTHER",
    displayName: "Other Carrier",
    badgeClass: "bg-slate-100 text-slate-700 border-slate-200",
    badgeBg: "bg-slate-100",
    badgeText: "text-slate-700",
    badgeBorder: "border-slate-200",
    iconColor: "text-slate-500",
    trackUrl: (awb: string) => `https://www.google.com/search?q=${encodeURIComponent("track package " + awb.trim())}`,
  },
};

export class CourierService {
  /**
   * Normalize raw carrier name string into internal courier type
   */
  public static normalizeCarrierType(
    carrierName?: string | null,
    awb?: string | null
  ): "DELHIVERY" | "BLUEDART" | "XPRESSBEES" | "ECOM_EXPRESS" | "EKART" | "SHADOWFAX" | "UNKNOWN" {
    const rawName = (carrierName || "").trim().toLowerCase();
    const cleanAwb = (awb || "").trim().toUpperCase();

    // 1. Text-based carrier matching (handles typos, spaces, underscores, suffixes)
    if (
      rawName.includes("delhivery") ||
      rawName === "dl" ||
      rawName.includes("delhivery express") ||
      rawName.includes("delhivery surface")
    ) {
      return "DELHIVERY";
    }

    if (
      rawName.includes("blue dart") ||
      rawName.includes("bluedart") ||
      rawName.includes("blue_dart") ||
      rawName.includes("blue-dart") ||
      rawName.includes("trackdart") ||
      rawName === "bd"
    ) {
      return "BLUEDART";
    }

    if (
      rawName.includes("xpressbees") ||
      rawName.includes("xpress bees") ||
      rawName.includes("xpress_bees") ||
      rawName.includes("xpress-bees") ||
      rawName.includes("xb express") ||
      rawName === "xb"
    ) {
      return "XPRESSBEES";
    }

    if (
      rawName.includes("ecom express") ||
      rawName.includes("ecomexpress") ||
      rawName.includes("ecom_express") ||
      rawName.includes("ecom-express") ||
      rawName === "ecom"
    ) {
      return "ECOM_EXPRESS";
    }

    if (
      rawName.includes("ekart") ||
      rawName.includes("e-kart") ||
      rawName.includes("ekart logistics") ||
      rawName.includes("flipkart logistics") ||
      rawName.includes("ekart_logistics")
    ) {
      return "EKART";
    }

    if (
      rawName.includes("shadowfax") ||
      rawName.includes("shadow fax") ||
      rawName.includes("shadow_fax") ||
      rawName.includes("shadow-fax") ||
      rawName === "sfx"
    ) {
      return "SHADOWFAX";
    }

    // 2. High-confidence AWB prefix & format matching (when carrier name is absent or generic "Courier")
    if (cleanAwb) {
      if (/^(FMPC|KLMP|MPLK|FMPP|WSR|SRT|ELOG)/i.test(cleanAwb)) {
        return "EKART";
      }
      if (/^(SFX|SF)\w+/i.test(cleanAwb)) {
        return "SHADOWFAX";
      }
      if (/^(XB\d{10,14}|14\d{12}|24\d{12})$/i.test(cleanAwb)) {
        return "XPRESSBEES";
      }
      if (/^(8\d{8}|9\d{8})$/.test(cleanAwb)) {
        return "ECOM_EXPRESS";
      }
      // Delhivery standard numeric prefixes (12 to 14 digits)
      if (/^(469\d{11}|14\d{12}|33\d{11}|28\d{11}|58\d{11}|12\d{10,12})$/.test(cleanAwb)) {
        return "DELHIVERY";
      }
      if (/^\d{8,11}$/.test(cleanAwb) && !rawName) {
        // BlueDart numeric 8, 9, or 11 digits
        return "BLUEDART";
      }
    }

    // 3. DO NOT default unknown couriers to Delhivery!
    return "UNKNOWN";
  }

  /**
   * Detect courier from company name or AWB format
   */
  public static detectCourier(carrierName?: string | null, awb?: string | null): CourierInfo {
    const code = this.normalizeCarrierType(carrierName, awb);

    if (code !== "UNKNOWN" && SUPPORTED_COURIERS[code]) {
      return SUPPORTED_COURIERS[code];
    }

    // Return OTHER/Unknown with original carrier name preserved as displayName
    const fallbackName = (carrierName || "").trim() || "Other Carrier";
    return {
      ...SUPPORTED_COURIERS.OTHER,
      name: fallbackName,
      displayName: fallbackName,
      code: "OTHER",
      trackUrl: (trackingNumber: string) =>
        `https://www.google.com/search?q=${encodeURIComponent("track " + fallbackName + " " + trackingNumber.trim())}`,
    };
  }

  /**
   * Get direct tracking URL for any courier, prioritizing Shopify-supplied tracking URL
   */
  public static getTrackingUrl(awb: string, carrierName?: string | null, customUrl?: string | null): string {
    if (customUrl && customUrl.startsWith("http")) {
      return customUrl;
    }
    const courier = this.detectCourier(carrierName, awb);
    return courier.trackUrl(awb);
  }
}
