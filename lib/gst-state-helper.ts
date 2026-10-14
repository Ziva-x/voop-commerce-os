/**
 * GST State Codes, Names, and Pincode Mapping for India
 */

export interface IndianStateInfo {
  code: string; // 2-digit GST code, e.g. "32"
  shortCode: string; // e.g. "KL"
  name: string; // e.g. "Kerala"
  pincodePrefixes: string[];
}

export const INDIAN_STATES: Record<string, IndianStateInfo> = {
  KERALA: {
    code: "32",
    shortCode: "KL",
    name: "Kerala",
    pincodePrefixes: ["67", "68", "69"],
  },
  KARNATAKA: {
    code: "29",
    shortCode: "KA",
    name: "Karnataka",
    pincodePrefixes: ["56", "57", "58", "59"],
  },
  TAMIL_NADU: {
    code: "33",
    shortCode: "TN",
    name: "Tamil Nadu",
    pincodePrefixes: ["60", "61", "62", "63", "64"],
  },
  MAHARASHTRA: {
    code: "27",
    shortCode: "MH",
    name: "Maharashtra",
    pincodePrefixes: ["40", "41", "42", "43", "44"],
  },
  DELHI: {
    code: "07",
    shortCode: "DL",
    name: "Delhi",
    pincodePrefixes: ["11"],
  },
  GUJARAT: {
    code: "24",
    shortCode: "GJ",
    name: "Gujarat",
    pincodePrefixes: ["36", "37", "38", "39"],
  },
  UTTAR_PRADESH: {
    code: "09",
    shortCode: "UP",
    name: "Uttar Pradesh",
    pincodePrefixes: ["20", "21", "22", "23", "24", "25", "26", "27", "28"],
  },
  RAJASTHAN: {
    code: "08",
    shortCode: "RJ",
    name: "Rajasthan",
    pincodePrefixes: ["30", "31", "32", "33", "34"],
  },
  WEST_BENGAL: {
    code: "19",
    shortCode: "WB",
    name: "West Bengal",
    pincodePrefixes: ["70", "71", "72", "73", "74"],
  },
  TELANGANA: {
    code: "36",
    shortCode: "TS",
    name: "Telangana",
    pincodePrefixes: ["50"],
  },
  ANDHRA_PRADESH: {
    code: "37",
    shortCode: "AP",
    name: "Andhra Pradesh",
    pincodePrefixes: ["51", "52", "53"],
  },
  HARYANA: {
    code: "06",
    shortCode: "HR",
    name: "Haryana",
    pincodePrefixes: ["12", "13"],
  },
  PUNJAB: {
    code: "03",
    shortCode: "PB",
    name: "Punjab",
    pincodePrefixes: ["14", "15", "16"],
  },
  MADHYA_PRADESH: {
    code: "23",
    shortCode: "MP",
    name: "Madhya Pradesh",
    pincodePrefixes: ["45", "46", "47", "48", "49"],
  },
  BIHAR: {
    code: "10",
    shortCode: "BR",
    name: "Bihar",
    pincodePrefixes: ["80", "81", "82", "83", "84", "85"],
  },
  ODISHA: {
    code: "21",
    shortCode: "OR",
    name: "Odisha",
    pincodePrefixes: ["75", "76", "77"],
  },
  JHARKHAND: {
    code: "20",
    shortCode: "JH",
    name: "Jharkhand",
    pincodePrefixes: ["81", "82", "83"],
  },
  CHHATTISGARH: {
    code: "22",
    shortCode: "CG",
    name: "Chhattisgarh",
    pincodePrefixes: ["49"],
  },
  UTTARAKHAND: {
    code: "05",
    shortCode: "UK",
    name: "Uttarakhand",
    pincodePrefixes: ["24", "26"],
  },
  GOA: {
    code: "30",
    shortCode: "GA",
    name: "Goa",
    pincodePrefixes: ["403"],
  },
  ASSAM: {
    code: "18",
    shortCode: "AS",
    name: "Assam",
    pincodePrefixes: ["78"],
  },
  JAMMU_AND_KASHMIR: {
    code: "01",
    shortCode: "JK",
    name: "Jammu and Kashmir",
    pincodePrefixes: ["18", "19"],
  },
  HIMACHAL_PRADESH: {
    code: "02",
    shortCode: "HP",
    name: "Himachal Pradesh",
    pincodePrefixes: ["17"],
  },
  PUDUCHERRY: {
    code: "34",
    shortCode: "PY",
    name: "Puducherry",
    pincodePrefixes: ["605"],
  },
  CHANDIGARH: {
    code: "04",
    shortCode: "CH",
    name: "Chandigarh",
    pincodePrefixes: ["160"],
  },
  TRIPURA: {
    code: "16",
    shortCode: "TR",
    name: "Tripura",
    pincodePrefixes: ["799"],
  },
  MEGHALAYA: {
    code: "17",
    shortCode: "ML",
    name: "Meghalaya",
    pincodePrefixes: ["793", "794"],
  },
  MANIPUR: {
    code: "14",
    shortCode: "MN",
    name: "Manipur",
    pincodePrefixes: ["795"],
  },
  NAGALAND: {
    code: "13",
    shortCode: "NL",
    name: "Nagaland",
    pincodePrefixes: ["797"],
  },
  SIKKIM: {
    code: "11",
    shortCode: "SK",
    name: "Sikkim",
    pincodePrefixes: ["737"],
  },
  MIZORAM: {
    code: "15",
    shortCode: "MZ",
    name: "Mizoram",
    pincodePrefixes: ["796"],
  },
  ARUNACHAL_PRADESH: {
    code: "12",
    shortCode: "AR",
    name: "Arunachal Pradesh",
    pincodePrefixes: ["791", "792"],
  },
  LADAKH: {
    code: "38",
    shortCode: "LA",
    name: "Ladakh",
    pincodePrefixes: ["194"],
  },
};

/**
 * Normalizes any state text (e.g. "Kerla", "KL", "32", "Kerala") into standardized IndianStateInfo
 */
export function resolveIndianState(addressInput: any): IndianStateInfo {
  if (!addressInput) {
    return INDIAN_STATES.KERALA;
  }

  let addressObj: any = addressInput;
  if (typeof addressInput === "string") {
    try {
      addressObj = JSON.parse(addressInput);
    } catch {
      addressObj = { province: addressInput };
    }
  }

  const province = (addressObj?.province || "").toUpperCase().trim();
  const provinceCode = (addressObj?.provinceCode || addressObj?.province_code || "").toUpperCase().trim();
  const zip = String(addressObj?.zip || addressObj?.postalCode || addressObj?.pincode || "").trim();
  const city = (addressObj?.city || "").toUpperCase().trim();

  // 1. Direct State Key Match
  for (const [key, info] of Object.entries(INDIAN_STATES)) {
    const normKey = key.replace(/_/g, " ");
    if (
      province === info.name.toUpperCase() ||
      province === normKey ||
      provinceCode === info.shortCode ||
      provinceCode === info.code ||
      province === info.shortCode
    ) {
      return info;
    }
  }

  // 2. Partial Province string matching
  if (province.includes("KERALA") || province.includes("KERLA") || city.includes("KOCHI") || city.includes("TRIVANDRUM") || city.includes("CALICUT")) {
    return INDIAN_STATES.KERALA;
  }
  if (province.includes("KARNATAKA") || province.includes("BANGALORE") || city.includes("BENGALURU") || city.includes("BANGALORE")) {
    return INDIAN_STATES.KARNATAKA;
  }
  if (province.includes("MAHARASHTRA") || province.includes("MUMBAI") || city.includes("MUMBAI") || city.includes("PUNE")) {
    return INDIAN_STATES.MAHARASHTRA;
  }
  if (province.includes("TAMIL") || province.includes("CHENNAI") || city.includes("CHENNAI") || city.includes("COIMBATORE")) {
    return INDIAN_STATES.TAMIL_NADU;
  }
  if (province.includes("DELHI") || city.includes("DELHI") || city.includes("NEW DELHI")) {
    return INDIAN_STATES.DELHI;
  }
  if (province.includes("GUJARAT") || province.includes("AHMEDABAD") || city.includes("AHMEDABAD") || city.includes("SURAT")) {
    return INDIAN_STATES.GUJARAT;
  }
  if (province.includes("UTTAR PRADESH") || province.includes("NOIDA") || province.includes("LUCKNOW") || city.includes("NOIDA") || city.includes("LUCKNOW")) {
    return INDIAN_STATES.UTTAR_PRADESH;
  }
  if (province.includes("RAJASTHAN") || province.includes("JAIPUR") || city.includes("JAIPUR")) {
    return INDIAN_STATES.RAJASTHAN;
  }
  if (province.includes("WEST BENGAL") || province.includes("KOLKATA") || city.includes("KOLKATA")) {
    return INDIAN_STATES.WEST_BENGAL;
  }
  if (province.includes("TELANGANA") || province.includes("HYDERABAD") || city.includes("HYDERABAD")) {
    return INDIAN_STATES.TELANGANA;
  }
  if (province.includes("ANDHRA") || province.includes("VIZAG")) {
    return INDIAN_STATES.ANDHRA_PRADESH;
  }
  if (province.includes("HARYANA") || province.includes("GURGAON") || province.includes("GURUGRAM") || city.includes("GURUGRAM")) {
    return INDIAN_STATES.HARYANA;
  }
  if (province.includes("PUNJAB") || province.includes("CHANDIGARH") || city.includes("LUDHIANA") || city.includes("AMRITSAR")) {
    return INDIAN_STATES.PUNJAB;
  }
  if (province.includes("MADHYA") || province.includes("INDORE") || city.includes("INDORE") || city.includes("BHOPAL")) {
    return INDIAN_STATES.MADHYA_PRADESH;
  }
  if (province.includes("BIHAR") || province.includes("PATNA") || city.includes("PATNA")) {
    return INDIAN_STATES.BIHAR;
  }
  if (province.includes("ODISHA") || province.includes("ORISSA") || city.includes("BHUBANESWAR")) {
    return INDIAN_STATES.ODISHA;
  }
  if (province.includes("GOA")) {
    return INDIAN_STATES.GOA;
  }
  if (province.includes("ASSAM") || city.includes("GUWAHATI")) {
    return INDIAN_STATES.ASSAM;
  }

  // 3. Fallback to Pincode Lookup
  if (zip && zip.length >= 2) {
    const cleanZip = zip.replace(/\D/g, "");
    if (cleanZip.length >= 2) {
      const prefix2 = cleanZip.substring(0, 2);
      const prefix3 = cleanZip.substring(0, 3);

      for (const info of Object.values(INDIAN_STATES)) {
        if (info.pincodePrefixes.includes(prefix3) || info.pincodePrefixes.includes(prefix2)) {
          return info;
        }
      }
    }
  }

  // Default fallback
  return INDIAN_STATES.KERALA;
}
