
Object.defineProperty(exports, "__esModule", { value: true });

const {
  Decimal,
  objectEnumValues,
  makeStrictEnum,
  Public,
  getRuntime,
  skip
} = require('./runtime/index-browser.js')


const Prisma = {}

exports.Prisma = Prisma
exports.$Enums = {}

/**
 * Prisma Client JS version: 5.22.0
 * Query Engine version: 605197351a3c8bdd595af2d2a9bc3025bca48ea2
 */
Prisma.prismaVersion = {
  client: "5.22.0",
  engine: "605197351a3c8bdd595af2d2a9bc3025bca48ea2"
}

Prisma.PrismaClientKnownRequestError = () => {
  const runtimeName = getRuntime().prettyName;
  throw new Error(`PrismaClientKnownRequestError is unable to run in this browser environment, or has been bundled for the browser (running in ${runtimeName}).
In case this error is unexpected for you, please report it in https://pris.ly/prisma-prisma-bug-report`,
)};
Prisma.PrismaClientUnknownRequestError = () => {
  const runtimeName = getRuntime().prettyName;
  throw new Error(`PrismaClientUnknownRequestError is unable to run in this browser environment, or has been bundled for the browser (running in ${runtimeName}).
In case this error is unexpected for you, please report it in https://pris.ly/prisma-prisma-bug-report`,
)}
Prisma.PrismaClientRustPanicError = () => {
  const runtimeName = getRuntime().prettyName;
  throw new Error(`PrismaClientRustPanicError is unable to run in this browser environment, or has been bundled for the browser (running in ${runtimeName}).
In case this error is unexpected for you, please report it in https://pris.ly/prisma-prisma-bug-report`,
)}
Prisma.PrismaClientInitializationError = () => {
  const runtimeName = getRuntime().prettyName;
  throw new Error(`PrismaClientInitializationError is unable to run in this browser environment, or has been bundled for the browser (running in ${runtimeName}).
In case this error is unexpected for you, please report it in https://pris.ly/prisma-prisma-bug-report`,
)}
Prisma.PrismaClientValidationError = () => {
  const runtimeName = getRuntime().prettyName;
  throw new Error(`PrismaClientValidationError is unable to run in this browser environment, or has been bundled for the browser (running in ${runtimeName}).
In case this error is unexpected for you, please report it in https://pris.ly/prisma-prisma-bug-report`,
)}
Prisma.NotFoundError = () => {
  const runtimeName = getRuntime().prettyName;
  throw new Error(`NotFoundError is unable to run in this browser environment, or has been bundled for the browser (running in ${runtimeName}).
In case this error is unexpected for you, please report it in https://pris.ly/prisma-prisma-bug-report`,
)}
Prisma.Decimal = Decimal

/**
 * Re-export of sql-template-tag
 */
Prisma.sql = () => {
  const runtimeName = getRuntime().prettyName;
  throw new Error(`sqltag is unable to run in this browser environment, or has been bundled for the browser (running in ${runtimeName}).
In case this error is unexpected for you, please report it in https://pris.ly/prisma-prisma-bug-report`,
)}
Prisma.empty = () => {
  const runtimeName = getRuntime().prettyName;
  throw new Error(`empty is unable to run in this browser environment, or has been bundled for the browser (running in ${runtimeName}).
In case this error is unexpected for you, please report it in https://pris.ly/prisma-prisma-bug-report`,
)}
Prisma.join = () => {
  const runtimeName = getRuntime().prettyName;
  throw new Error(`join is unable to run in this browser environment, or has been bundled for the browser (running in ${runtimeName}).
In case this error is unexpected for you, please report it in https://pris.ly/prisma-prisma-bug-report`,
)}
Prisma.raw = () => {
  const runtimeName = getRuntime().prettyName;
  throw new Error(`raw is unable to run in this browser environment, or has been bundled for the browser (running in ${runtimeName}).
In case this error is unexpected for you, please report it in https://pris.ly/prisma-prisma-bug-report`,
)}
Prisma.validator = Public.validator

/**
* Extensions
*/
Prisma.getExtensionContext = () => {
  const runtimeName = getRuntime().prettyName;
  throw new Error(`Extensions.getExtensionContext is unable to run in this browser environment, or has been bundled for the browser (running in ${runtimeName}).
In case this error is unexpected for you, please report it in https://pris.ly/prisma-prisma-bug-report`,
)}
Prisma.defineExtension = () => {
  const runtimeName = getRuntime().prettyName;
  throw new Error(`Extensions.defineExtension is unable to run in this browser environment, or has been bundled for the browser (running in ${runtimeName}).
In case this error is unexpected for you, please report it in https://pris.ly/prisma-prisma-bug-report`,
)}

/**
 * Shorthand utilities for JSON filtering
 */
Prisma.DbNull = objectEnumValues.instances.DbNull
Prisma.JsonNull = objectEnumValues.instances.JsonNull
Prisma.AnyNull = objectEnumValues.instances.AnyNull

Prisma.NullTypes = {
  DbNull: objectEnumValues.classes.DbNull,
  JsonNull: objectEnumValues.classes.JsonNull,
  AnyNull: objectEnumValues.classes.AnyNull
}



/**
 * Enums
 */

exports.Prisma.TransactionIsolationLevel = makeStrictEnum({
  ReadUncommitted: 'ReadUncommitted',
  ReadCommitted: 'ReadCommitted',
  RepeatableRead: 'RepeatableRead',
  Serializable: 'Serializable'
});

exports.Prisma.UserScalarFieldEnum = {
  id: 'id',
  email: 'email',
  username: 'username',
  usernameLastChangedAt: 'usernameLastChangedAt',
  passwordHash: 'passwordHash',
  name: 'name',
  contactNo: 'contactNo',
  businessName: 'businessName',
  address: 'address',
  city: 'city',
  state: 'state',
  pincode: 'pincode',
  country: 'country',
  createdAt: 'createdAt',
  updatedAt: 'updatedAt',
  storeId: 'storeId',
  voopStoreId: 'voopStoreId',
  tenantId: 'tenantId',
  createdById: 'createdById',
  role: 'role',
  permissions: 'permissions'
};

exports.Prisma.UserPreferenceScalarFieldEnum = {
  id: 'id',
  userId: 'userId',
  themeMode: 'themeMode',
  accentTheme: 'accentTheme',
  createdAt: 'createdAt',
  updatedAt: 'updatedAt'
};

exports.Prisma.StoreMembershipScalarFieldEnum = {
  id: 'id',
  userId: 'userId',
  storeId: 'storeId',
  tenantId: 'tenantId',
  status: 'status',
  role: 'role',
  permissions: 'permissions',
  createdAt: 'createdAt',
  updatedAt: 'updatedAt'
};

exports.Prisma.ShopifyStoreScalarFieldEnum = {
  id: 'id',
  voopStoreId: 'voopStoreId',
  tenantId: 'tenantId',
  publicStoreRef: 'publicStoreRef',
  accountId: 'accountId',
  shopDomain: 'shopDomain',
  accessToken: 'accessToken',
  apiKey: 'apiKey',
  apiSecret: 'apiSecret',
  webhookSecret: 'webhookSecret',
  storeName: 'storeName',
  email: 'email',
  currency: 'currency',
  isConnected: 'isConnected',
  lastProductSyncAt: 'lastProductSyncAt',
  lastOrderSyncAt: 'lastOrderSyncAt',
  lastFullSyncAt: 'lastFullSyncAt',
  createdAt: 'createdAt',
  updatedAt: 'updatedAt'
};

exports.Prisma.SyncJobScalarFieldEnum = {
  id: 'id',
  storeId: 'storeId',
  type: 'type',
  status: 'status',
  currentBatch: 'currentBatch',
  totalBatches: 'totalBatches',
  processedCount: 'processedCount',
  totalCount: 'totalCount',
  pageInfo: 'pageInfo',
  errorMessage: 'errorMessage',
  metadata: 'metadata',
  startedAt: 'startedAt',
  completedAt: 'completedAt',
  heartbeat: 'heartbeat',
  createdAt: 'createdAt',
  updatedAt: 'updatedAt'
};

exports.Prisma.ShopifyProductScalarFieldEnum = {
  id: 'id',
  storeId: 'storeId',
  shopifyProductId: 'shopifyProductId',
  title: 'title',
  handle: 'handle',
  productType: 'productType',
  vendor: 'vendor',
  status: 'status',
  tags: 'tags',
  imageUrl: 'imageUrl',
  rawPayload: 'rawPayload',
  createdAt: 'createdAt',
  updatedAt: 'updatedAt',
  syncedAt: 'syncedAt'
};

exports.Prisma.ShopifyVariantScalarFieldEnum = {
  id: 'id',
  storeId: 'storeId',
  productId: 'productId',
  shopifyProductId: 'shopifyProductId',
  shopifyVariantId: 'shopifyVariantId',
  title: 'title',
  sku: 'sku',
  barcode: 'barcode',
  price: 'price',
  compareAtPrice: 'compareAtPrice',
  inventoryItemId: 'inventoryItemId',
  inventoryQuantity: 'inventoryQuantity',
  imageUrl: 'imageUrl',
  rawPayload: 'rawPayload',
  createdAt: 'createdAt',
  updatedAt: 'updatedAt',
  syncedAt: 'syncedAt'
};

exports.Prisma.ShopifyOrderScalarFieldEnum = {
  id: 'id',
  storeId: 'storeId',
  shopifyOrderId: 'shopifyOrderId',
  shopifyOrderNumber: 'shopifyOrderNumber',
  shopifyOrderName: 'shopifyOrderName',
  shopifyOrderCreatedAt: 'shopifyOrderCreatedAt',
  orderNumber: 'orderNumber',
  name: 'name',
  customerName: 'customerName',
  email: 'email',
  phone: 'phone',
  currency: 'currency',
  totalPrice: 'totalPrice',
  subtotalPrice: 'subtotalPrice',
  totalDiscounts: 'totalDiscounts',
  totalTax: 'totalTax',
  financialStatus: 'financialStatus',
  fulfillmentStatus: 'fulfillmentStatus',
  deliveryStatus: 'deliveryStatus',
  outwardScanned: 'outwardScanned',
  outwardScannedAt: 'outwardScannedAt',
  rtoInwardScanned: 'rtoInwardScanned',
  rtoInwardScannedAt: 'rtoInwardScannedAt',
  pickupDate: 'pickupDate',
  etdDate: 'etdDate',
  processedAt: 'processedAt',
  cancelledAt: 'cancelledAt',
  deletedAt: 'deletedAt',
  tags: 'tags',
  note: 'note',
  shippingAddress: 'shippingAddress',
  rawPayload: 'rawPayload',
  invoiceCompanySnapshot: 'invoiceCompanySnapshot',
  createdAt: 'createdAt',
  updatedAt: 'updatedAt',
  syncedAt: 'syncedAt'
};

exports.Prisma.ShopifyOrderItemScalarFieldEnum = {
  id: 'id',
  storeId: 'storeId',
  orderId: 'orderId',
  shopifyOrderId: 'shopifyOrderId',
  shopifyLineItemId: 'shopifyLineItemId',
  shopifyProductId: 'shopifyProductId',
  shopifyVariantId: 'shopifyVariantId',
  productTitle: 'productTitle',
  variantTitle: 'variantTitle',
  sku: 'sku',
  quantity: 'quantity',
  fulfilledQuantity: 'fulfilledQuantity',
  deductedQuantity: 'deductedQuantity',
  reversedQuantity: 'reversedQuantity',
  unitPrice: 'unitPrice',
  discountTotal: 'discountTotal',
  totalPrice: 'totalPrice',
  isDeducted: 'isDeducted',
  deductionStatus: 'deductionStatus',
  deductedComponents: 'deductedComponents',
  comboInvoiceComponents: 'comboInvoiceComponents',
  rawPayload: 'rawPayload',
  deletedAt: 'deletedAt',
  createdAt: 'createdAt',
  updatedAt: 'updatedAt'
};

exports.Prisma.ShopifyFulfillmentScalarFieldEnum = {
  id: 'id',
  storeId: 'storeId',
  orderId: 'orderId',
  shopifyOrderId: 'shopifyOrderId',
  shopifyFulfillmentId: 'shopifyFulfillmentId',
  status: 'status',
  trackingCompany: 'trackingCompany',
  trackingNumber: 'trackingNumber',
  trackingUrl: 'trackingUrl',
  deliveryStatus: 'deliveryStatus',
  pickupDate: 'pickupDate',
  etdDate: 'etdDate',
  deliveryDate: 'deliveryDate',
  rtoDeliveredDate: 'rtoDeliveredDate',
  lineItemIds: 'lineItemIds',
  createdAt: 'createdAt',
  updatedAt: 'updatedAt'
};

exports.Prisma.StockItemScalarFieldEnum = {
  id: 'id',
  storeId: 'storeId',
  sku: 'sku',
  name: 'name',
  type: 'type',
  category: 'category',
  unit: 'unit',
  currentStock: 'currentStock',
  damagedStock: 'damagedStock',
  reservedStock: 'reservedStock',
  availableStock: 'availableStock',
  minStockLevel: 'minStockLevel',
  reorderLevel: 'reorderLevel',
  avgUnitCost: 'avgUnitCost',
  sellingPrice: 'sellingPrice',
  costPrice: 'costPrice',
  location: 'location',
  notes: 'notes',
  createdAt: 'createdAt',
  updatedAt: 'updatedAt'
};

exports.Prisma.ComboComponentScalarFieldEnum = {
  id: 'id',
  storeId: 'storeId',
  comboSku: 'comboSku',
  componentSku: 'componentSku',
  quantity: 'quantity',
  createdAt: 'createdAt',
  updatedAt: 'updatedAt'
};

exports.Prisma.PurchaseBillScalarFieldEnum = {
  id: 'id',
  storeId: 'storeId',
  billNumber: 'billNumber',
  billType: 'billType',
  supplier: 'supplier',
  billDate: 'billDate',
  dueDate: 'dueDate',
  paymentStatus: 'paymentStatus',
  paymentMode: 'paymentMode',
  subtotal: 'subtotal',
  taxTotal: 'taxTotal',
  discountTotal: 'discountTotal',
  totalAmount: 'totalAmount',
  notes: 'notes',
  attachmentUrl: 'attachmentUrl',
  status: 'status',
  createdAt: 'createdAt',
  updatedAt: 'updatedAt'
};

exports.Prisma.PurchaseBillItemScalarFieldEnum = {
  id: 'id',
  storeId: 'storeId',
  billId: 'billId',
  sku: 'sku',
  itemName: 'itemName',
  category: 'category',
  quantity: 'quantity',
  unitCost: 'unitCost',
  taxRate: 'taxRate',
  taxAmount: 'taxAmount',
  discount: 'discount',
  totalAmount: 'totalAmount',
  alreadyAddedToPnl: 'alreadyAddedToPnl',
  createdAt: 'createdAt'
};

exports.Prisma.InventoryLedgerScalarFieldEnum = {
  id: 'id',
  storeId: 'storeId',
  sku: 'sku',
  type: 'type',
  inventoryBucket: 'inventoryBucket',
  quantity: 'quantity',
  unitCost: 'unitCost',
  balanceAfter: 'balanceAfter',
  referenceType: 'referenceType',
  referenceId: 'referenceId',
  orderId: 'orderId',
  orderLineId: 'orderLineId',
  fulfillmentId: 'fulfillmentId',
  shipmentId: 'shipmentId',
  billId: 'billId',
  productId: 'productId',
  variantId: 'variantId',
  idempotencyKey: 'idempotencyKey',
  originalLedgerEntryId: 'originalLedgerEntryId',
  fulfillmentLineId: 'fulfillmentLineId',
  reversalReference: 'reversalReference',
  createdBy: 'createdBy',
  notes: 'notes',
  createdAt: 'createdAt'
};

exports.Prisma.MetaAccountScalarFieldEnum = {
  id: 'id',
  storeId: 'storeId',
  adAccountId: 'adAccountId',
  name: 'name',
  currency: 'currency',
  status: 'status',
  accessToken: 'accessToken',
  lastSyncedAt: 'lastSyncedAt',
  createdAt: 'createdAt',
  updatedAt: 'updatedAt'
};

exports.Prisma.MetaCampaignScalarFieldEnum = {
  id: 'id',
  storeId: 'storeId',
  metaAccountId: 'metaAccountId',
  campaignId: 'campaignId',
  name: 'name',
  status: 'status',
  objective: 'objective',
  dailyBudget: 'dailyBudget',
  lifetimeBudget: 'lifetimeBudget',
  createdAt: 'createdAt',
  updatedAt: 'updatedAt'
};

exports.Prisma.MetaAdSetScalarFieldEnum = {
  id: 'id',
  storeId: 'storeId',
  campaignId: 'campaignId',
  adSetId: 'adSetId',
  name: 'name',
  status: 'status',
  dailyBudget: 'dailyBudget',
  createdAt: 'createdAt',
  updatedAt: 'updatedAt'
};

exports.Prisma.MetaAdScalarFieldEnum = {
  id: 'id',
  storeId: 'storeId',
  adSetId: 'adSetId',
  adId: 'adId',
  name: 'name',
  status: 'status',
  creativeTitle: 'creativeTitle',
  creativeUrl: 'creativeUrl',
  createdAt: 'createdAt',
  updatedAt: 'updatedAt'
};

exports.Prisma.MetaDailyMetricScalarFieldEnum = {
  id: 'id',
  storeId: 'storeId',
  metaAccountId: 'metaAccountId',
  campaignId: 'campaignId',
  adSetId: 'adSetId',
  adId: 'adId',
  date: 'date',
  spend: 'spend',
  impressions: 'impressions',
  clicks: 'clicks',
  purchases: 'purchases',
  revenue: 'revenue',
  cpc: 'cpc',
  cpm: 'cpm',
  ctr: 'ctr',
  cpp: 'cpp',
  roas: 'roas',
  createdAt: 'createdAt'
};

exports.Prisma.MetaPixelScalarFieldEnum = {
  id: 'id',
  storeId: 'storeId',
  pixelId: 'pixelId',
  name: 'name',
  accessToken: 'accessToken',
  testEventCode: 'testEventCode',
  status: 'status',
  lastFiredAt: 'lastFiredAt',
  lastSyncedAt: 'lastSyncedAt',
  createdAt: 'createdAt',
  updatedAt: 'updatedAt'
};

exports.Prisma.MetaPixelEventScalarFieldEnum = {
  id: 'id',
  storeId: 'storeId',
  pixelId: 'pixelId',
  eventName: 'eventName',
  eventCount: 'eventCount',
  date: 'date',
  timestamp: 'timestamp'
};

exports.Prisma.DelhiveryConfigScalarFieldEnum = {
  id: 'id',
  storeId: 'storeId',
  apiToken: 'apiToken',
  clientName: 'clientName',
  warehousePin: 'warehousePin',
  mode: 'mode',
  isActive: 'isActive',
  updatedAt: 'updatedAt'
};

exports.Prisma.CourierIntegrationScalarFieldEnum = {
  id: 'id',
  storeId: 'storeId',
  voopStoreId: 'voopStoreId',
  courier: 'courier',
  status: 'status',
  credentialsEncrypted: 'credentialsEncrypted',
  environment: 'environment',
  lastTestedAt: 'lastTestedAt',
  lastSuccessfulSyncAt: 'lastSuccessfulSyncAt',
  lastError: 'lastError',
  createdAt: 'createdAt',
  updatedAt: 'updatedAt'
};

exports.Prisma.SyncLogScalarFieldEnum = {
  id: 'id',
  storeId: 'storeId',
  type: 'type',
  status: 'status',
  recordsCount: 'recordsCount',
  durationMs: 'durationMs',
  errorDetails: 'errorDetails',
  details: 'details',
  startedAt: 'startedAt',
  completedAt: 'completedAt'
};

exports.Prisma.ShopifyWebhookEventScalarFieldEnum = {
  id: 'id',
  storeId: 'storeId',
  topic: 'topic',
  shopifyEventId: 'shopifyEventId',
  payload: 'payload',
  status: 'status',
  errorMessage: 'errorMessage',
  receivedAt: 'receivedAt',
  processedAt: 'processedAt'
};

exports.Prisma.VoopApiKeyScalarFieldEnum = {
  id: 'id',
  storeId: 'storeId',
  name: 'name',
  keyHash: 'keyHash',
  keyPrefix: 'keyPrefix',
  lastUsedAt: 'lastUsedAt',
  isActive: 'isActive',
  createdAt: 'createdAt',
  updatedAt: 'updatedAt'
};

exports.Prisma.ShipmentScalarFieldEnum = {
  id: 'id',
  storeId: 'storeId',
  awb: 'awb',
  shopifyOrderId: 'shopifyOrderId',
  shopifyOrderNumber: 'shopifyOrderNumber',
  shopifyOrderName: 'shopifyOrderName',
  orderNumber: 'orderNumber',
  carrier: 'carrier',
  status: 'status',
  normalizedStatus: 'normalizedStatus',
  rawStatus: 'rawStatus',
  statusType: 'statusType',
  statusLocation: 'statusLocation',
  statusTimestamp: 'statusTimestamp',
  statusInstructions: 'statusInstructions',
  payment: 'payment',
  amount: 'amount',
  date: 'date',
  orderCreatedAt: 'orderCreatedAt',
  shippingCharge: 'shippingCharge',
  scannedAtHome: 'scannedAtHome',
  outwardScanned: 'outwardScanned',
  outwardScannedAt: 'outwardScannedAt',
  rtoInwardScanned: 'rtoInwardScanned',
  rtoInwardScannedAt: 'rtoInwardScannedAt',
  rtoInventoryProcessed: 'rtoInventoryProcessed',
  rtoReceivedAt: 'rtoReceivedAt',
  rtoCondition: 'rtoCondition',
  rtoReceivedBy: 'rtoReceivedBy',
  rtoInspectionDetails: 'rtoInspectionDetails',
  pickupDate: 'pickupDate',
  etdDate: 'etdDate',
  deliveryDate: 'deliveryDate',
  rtoDate: 'rtoDate',
  ndrStatus: 'ndrStatus',
  rtoDiscrepancy: 'rtoDiscrepancy',
  inwardScannedAt: 'inwardScannedAt',
  inTransitDate: 'inTransitDate',
  deletedAt: 'deletedAt',
  amountFetched: 'amountFetched',
  isReplacementOutward: 'isReplacementOutward',
  isReversePickupReceived: 'isReversePickupReceived',
  isReplacementRto: 'isReplacementRto',
  replacementOutwardAt: 'replacementOutwardAt',
  reversePickupAt: 'reversePickupAt',
  replacementRtoAt: 'replacementRtoAt',
  customerName: 'customerName',
  customerPhone: 'customerPhone',
  notes: 'notes',
  shopifyFulfillmentId: 'shopifyFulfillmentId',
  trackingCompany: 'trackingCompany',
  trackingUrl: 'trackingUrl',
  courierType: 'courierType',
  lineItemsSummary: 'lineItemsSummary',
  lastSyncedAt: 'lastSyncedAt',
  rawTrackingPayload: 'rawTrackingPayload',
  rtoVerificationStatus: 'rtoVerificationStatus',
  createdAt: 'createdAt',
  updatedAt: 'updatedAt'
};

exports.Prisma.ShipmentScanScalarFieldEnum = {
  id: 'id',
  storeId: 'storeId',
  shipmentId: 'shipmentId',
  awb: 'awb',
  status: 'status',
  statusType: 'statusType',
  location: 'location',
  instructions: 'instructions',
  nslCode: 'nslCode',
  timestamp: 'timestamp',
  rawPayload: 'rawPayload',
  createdAt: 'createdAt'
};

exports.Prisma.CollaborationScalarFieldEnum = {
  id: 'id',
  storeId: 'storeId',
  instagramLink: 'instagramLink',
  instagramId: 'instagramId',
  daysToCreate: 'daysToCreate',
  contentType: 'contentType',
  platforms: 'platforms',
  vehicleOwned: 'vehicleOwned',
  vehicleUsed: 'vehicleUsed',
  fullName: 'fullName',
  place: 'place',
  whatsappNumber: 'whatsappNumber',
  address: 'address',
  collabType: 'collabType',
  status: 'status',
  awb: 'awb',
  couponCode: 'couponCode',
  customResponses: 'customResponses',
  createdAt: 'createdAt',
  updatedAt: 'updatedAt'
};

exports.Prisma.CollabSettingScalarFieldEnum = {
  id: 'id',
  storeId: 'storeId',
  bannerUrl: 'bannerUrl',
  bannerImageBase64: 'bannerImageBase64',
  title: 'title',
  description: 'description',
  themeColor: 'themeColor',
  privacyUrl: 'privacyUrl',
  termsUrl: 'termsUrl',
  formSchema: 'formSchema',
  customStyles: 'customStyles',
  updatedAt: 'updatedAt'
};

exports.Prisma.ExpenseSettingScalarFieldEnum = {
  id: 'id',
  storeId: 'storeId',
  packagingCostPerOrder: 'packagingCostPerOrder',
  freightCostPerOrder: 'freightCostPerOrder',
  rtoCostPerOrder: 'rtoCostPerOrder',
  gatewayFeePercent: 'gatewayFeePercent',
  monthlyFixedOverhead: 'monthlyFixedOverhead',
  defaultCogsPercent: 'defaultCogsPercent',
  autoFetchMetaAds: 'autoFetchMetaAds',
  useEstimatedExpenses: 'useEstimatedExpenses',
  customRules: 'customRules',
  updatedAt: 'updatedAt'
};

exports.Prisma.ProductTaxConfigScalarFieldEnum = {
  id: 'id',
  storeId: 'storeId',
  shopifyProductId: 'shopifyProductId',
  shopifyVariantId: 'shopifyVariantId',
  sku: 'sku',
  title: 'title',
  hsnCode: 'hsnCode',
  taxRate: 'taxRate',
  isTaxInclusive: 'isTaxInclusive',
  overridePrice: 'overridePrice',
  notes: 'notes',
  createdAt: 'createdAt',
  updatedAt: 'updatedAt'
};

exports.Prisma.ComboInvoiceComponentScalarFieldEnum = {
  id: 'id',
  storeId: 'storeId',
  comboSku: 'comboSku',
  componentSku: 'componentSku',
  quantity: 'quantity',
  allocatedValue: 'allocatedValue',
  gstRate: 'gstRate',
  hsnCode: 'hsnCode',
  taxMode: 'taxMode',
  createdAt: 'createdAt',
  updatedAt: 'updatedAt'
};

exports.Prisma.AdPlatformAccountScalarFieldEnum = {
  id: 'id',
  storeId: 'storeId',
  platform: 'platform',
  accountId: 'accountId',
  accountName: 'accountName',
  currency: 'currency',
  status: 'status',
  accessToken: 'accessToken',
  refreshToken: 'refreshToken',
  clientId: 'clientId',
  clientSecret: 'clientSecret',
  developerToken: 'developerToken',
  organizationId: 'organizationId',
  pixelId: 'pixelId',
  extraConfig: 'extraConfig',
  spendThisMonth: 'spendThisMonth',
  roas: 'roas',
  lastSyncedAt: 'lastSyncedAt',
  createdAt: 'createdAt',
  updatedAt: 'updatedAt'
};

exports.Prisma.AdDailyMetricScalarFieldEnum = {
  id: 'id',
  storeId: 'storeId',
  accountId: 'accountId',
  date: 'date',
  platform: 'platform',
  spend: 'spend',
  impressions: 'impressions',
  clicks: 'clicks',
  conversions: 'conversions',
  revenue: 'revenue',
  cpc: 'cpc',
  cpm: 'cpm',
  ctr: 'ctr',
  roas: 'roas',
  createdAt: 'createdAt'
};

exports.Prisma.StoreSettingScalarFieldEnum = {
  storeId: 'storeId',
  companyName: 'companyName',
  tradeName: 'tradeName',
  gstin: 'gstin',
  pan: 'pan',
  cin: 'cin',
  lutNumber: 'lutNumber',
  addressLine1: 'addressLine1',
  addressLine2: 'addressLine2',
  city: 'city',
  state: 'state',
  stateCode: 'stateCode',
  pincode: 'pincode',
  country: 'country',
  email: 'email',
  phone: 'phone',
  website: 'website',
  logoUrl: 'logoUrl',
  bankName: 'bankName',
  accountNumber: 'accountNumber',
  ifscCode: 'ifscCode',
  accountHolderName: 'accountHolderName',
  branchName: 'branchName',
  upiId: 'upiId',
  invoicePrefix: 'invoicePrefix',
  invoiceCounter: 'invoiceCounter',
  termsConditions: 'termsConditions',
  authorizedSignatory: 'authorizedSignatory',
  declaration: 'declaration',
  signatureUrl: 'signatureUrl',
  createdAt: 'createdAt',
  updatedAt: 'updatedAt'
};

exports.Prisma.OfflineOrderScalarFieldEnum = {
  id: 'id',
  storeId: 'storeId',
  orderNumber: 'orderNumber',
  channel: 'channel',
  customerName: 'customerName',
  customerPhone: 'customerPhone',
  customerAddress: 'customerAddress',
  paymentMode: 'paymentMode',
  paymentStatus: 'paymentStatus',
  subtotal: 'subtotal',
  totalDiscount: 'totalDiscount',
  totalTax: 'totalTax',
  shippingCharge: 'shippingCharge',
  totalAmount: 'totalAmount',
  advanceAmount: 'advanceAmount',
  pendingAmount: 'pendingAmount',
  notes: 'notes',
  courier: 'courier',
  trackingNumber: 'trackingNumber',
  delhiveryRefNo: 'delhiveryRefNo',
  status: 'status',
  cancelledAt: 'cancelledAt',
  deletedAt: 'deletedAt',
  invoiceCompanySnapshot: 'invoiceCompanySnapshot',
  createdAt: 'createdAt',
  updatedAt: 'updatedAt'
};

exports.Prisma.OfflineOrderItemScalarFieldEnum = {
  id: 'id',
  storeId: 'storeId',
  orderId: 'orderId',
  sku: 'sku',
  productName: 'productName',
  quantity: 'quantity',
  unitPrice: 'unitPrice',
  discount: 'discount',
  taxRate: 'taxRate',
  taxAmount: 'taxAmount',
  totalAmount: 'totalAmount',
  hsnCode: 'hsnCode',
  comboInvoiceComponents: 'comboInvoiceComponents',
  createdAt: 'createdAt'
};

exports.Prisma.AppSubscriptionScalarFieldEnum = {
  id: 'id',
  storeId: 'storeId',
  companyId: 'companyId',
  shopifyChargeId: 'shopifyChargeId',
  shopifyConfirmationUrl: 'shopifyConfirmationUrl',
  status: 'status',
  planName: 'planName',
  planPrice: 'planPrice',
  currency: 'currency',
  trialDays: 'trialDays',
  trialEndsAt: 'trialEndsAt',
  billingOn: 'billingOn',
  createdAt: 'createdAt',
  updatedAt: 'updatedAt'
};

exports.Prisma.BusinessExpenseScalarFieldEnum = {
  id: 'id',
  storeId: 'storeId',
  amount: 'amount',
  category: 'category',
  date: 'date',
  description: 'description',
  vendor: 'vendor',
  note: 'note',
  createdAt: 'createdAt',
  updatedAt: 'updatedAt'
};

exports.Prisma.DamageRecordScalarFieldEnum = {
  id: 'id',
  storeId: 'storeId',
  shipmentId: 'shipmentId',
  orderId: 'orderId',
  awb: 'awb',
  idempotencyKey: 'idempotencyKey',
  damagedItems: 'damagedItems',
  receivedBy: 'receivedBy',
  notes: 'notes',
  inventoryMoved: 'inventoryMoved',
  createdAt: 'createdAt'
};

exports.Prisma.SortOrder = {
  asc: 'asc',
  desc: 'desc'
};

exports.Prisma.NullableJsonNullValueInput = {
  DbNull: Prisma.DbNull,
  JsonNull: Prisma.JsonNull
};

exports.Prisma.QueryMode = {
  default: 'default',
  insensitive: 'insensitive'
};

exports.Prisma.NullsOrder = {
  first: 'first',
  last: 'last'
};

exports.Prisma.JsonNullValueFilter = {
  DbNull: Prisma.DbNull,
  JsonNull: Prisma.JsonNull,
  AnyNull: Prisma.AnyNull
};


exports.Prisma.ModelName = {
  User: 'User',
  UserPreference: 'UserPreference',
  StoreMembership: 'StoreMembership',
  ShopifyStore: 'ShopifyStore',
  SyncJob: 'SyncJob',
  ShopifyProduct: 'ShopifyProduct',
  ShopifyVariant: 'ShopifyVariant',
  ShopifyOrder: 'ShopifyOrder',
  ShopifyOrderItem: 'ShopifyOrderItem',
  ShopifyFulfillment: 'ShopifyFulfillment',
  StockItem: 'StockItem',
  ComboComponent: 'ComboComponent',
  PurchaseBill: 'PurchaseBill',
  PurchaseBillItem: 'PurchaseBillItem',
  InventoryLedger: 'InventoryLedger',
  MetaAccount: 'MetaAccount',
  MetaCampaign: 'MetaCampaign',
  MetaAdSet: 'MetaAdSet',
  MetaAd: 'MetaAd',
  MetaDailyMetric: 'MetaDailyMetric',
  MetaPixel: 'MetaPixel',
  MetaPixelEvent: 'MetaPixelEvent',
  DelhiveryConfig: 'DelhiveryConfig',
  CourierIntegration: 'CourierIntegration',
  SyncLog: 'SyncLog',
  ShopifyWebhookEvent: 'ShopifyWebhookEvent',
  VoopApiKey: 'VoopApiKey',
  Shipment: 'Shipment',
  ShipmentScan: 'ShipmentScan',
  Collaboration: 'Collaboration',
  CollabSetting: 'CollabSetting',
  ExpenseSetting: 'ExpenseSetting',
  ProductTaxConfig: 'ProductTaxConfig',
  ComboInvoiceComponent: 'ComboInvoiceComponent',
  AdPlatformAccount: 'AdPlatformAccount',
  AdDailyMetric: 'AdDailyMetric',
  StoreSetting: 'StoreSetting',
  OfflineOrder: 'OfflineOrder',
  OfflineOrderItem: 'OfflineOrderItem',
  AppSubscription: 'AppSubscription',
  BusinessExpense: 'BusinessExpense',
  DamageRecord: 'DamageRecord'
};

/**
 * This is a stub Prisma Client that will error at runtime if called.
 */
class PrismaClient {
  constructor() {
    return new Proxy(this, {
      get(target, prop) {
        let message
        const runtime = getRuntime()
        if (runtime.isEdge) {
          message = `PrismaClient is not configured to run in ${runtime.prettyName}. In order to run Prisma Client on edge runtime, either:
- Use Prisma Accelerate: https://pris.ly/d/accelerate
- Use Driver Adapters: https://pris.ly/d/driver-adapters
`;
        } else {
          message = 'PrismaClient is unable to run in this browser environment, or has been bundled for the browser (running in `' + runtime.prettyName + '`).'
        }
        
        message += `
If this is unexpected, please open an issue: https://pris.ly/prisma-prisma-bug-report`

        throw new Error(message)
      }
    })
  }
}

exports.PrismaClient = PrismaClient

Object.assign(exports, Prisma)
