export type CourierType =
  | "DELHIVERY"
  | "BLUEDART"
  | "XPRESSBEES"
  | "ECOM_EXPRESS"
  | "EKART"
  | "SHADOWFAX";

export interface CourierConfigField {
  key: string;
  label: string;
  type: "text" | "password" | "select";
  required: boolean;
  placeholder?: string;
  options?: Array<{ label: string; value: string }>;
  isSecret?: boolean;
  helpText?: string;
}

export interface TestConnectionResult {
  success: boolean;
  message: string;
  statusCode?: number;
  details?: any;
}

export interface CourierTrackingScan {
  status: string;
  statusType?: string | null;
  location?: string | null;
  instructions?: string | null;
  timestamp: Date | string;
}

export interface CourierTrackingResult {
  awb: string;
  orderNumber?: string | null;
  normalizedStatus: string;
  rawStatus: string;
  statusLocation?: string | null;
  statusTimestamp?: Date | null;
  customerName?: string | null;
  customerPhone?: string | null;
  destinationCity?: string | null;
  destinationState?: string | null;
  destinationPin?: string | null;
  pickupDate?: Date | null;
  deliveryDate?: Date | null;
  scans: CourierTrackingScan[];
}

export interface ICourierAdapter {
  readonly id: CourierType;
  readonly name: string;
  readonly logoUrl?: string;
  readonly description: string;
  readonly fields: CourierConfigField[];
  readonly defaultEnvironment: "PRODUCTION" | "TEST" | "STAGING";

  testConnection(credentials: Record<string, any>, environment?: string): Promise<TestConnectionResult>;
  fetchTracking?(awb: string, credentials: Record<string, any>, environment?: string): Promise<CourierTrackingResult | null>;
  detectAwb(awb: string): boolean;
}
