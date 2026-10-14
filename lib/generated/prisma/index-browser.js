
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
  Serializable: 'Serializable'
});

exports.Prisma.ShopifyStoreScalarFieldEnum = {
  id: 'id',
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
  orderNumber: 'orderNumber',
  name: 'name',
  email: 'email',
  phone: 'phone',
  currency: 'currency',
  totalPrice: 'totalPrice',
  subtotalPrice: 'subtotalPrice',
  totalDiscounts: 'totalDiscounts',
  totalTax: 'totalTax',
  financialStatus: 'financialStatus',
  fulfillmentStatus: 'fulfillmentStatus',
  processedAt: 'processedAt',
  cancelledAt: 'cancelledAt',
  tags: 'tags',
  note: 'note',
  shippingAddress: 'shippingAddress',
  rawPayload: 'rawPayload',
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
  unitPrice: 'unitPrice',
  discountTotal: 'discountTotal',
  totalPrice: 'totalPrice',
  isDeducted: 'isDeducted',
  deductionStatus: 'deductionStatus',
  deductedComponents: 'deductedComponents',
  rawPayload: 'rawPayload',
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
  lineItemIds: 'lineItemIds',
  createdAt: 'createdAt',
  updatedAt: 'updatedAt'
};

exports.Prisma.StockItemScalarFieldEnum = {
  id: 'id',
  sku: 'sku',
  name: 'name',
  category: 'category',
  unit: 'unit',
  currentStock: 'currentStock',
  reservedStock: 'reservedStock',
  availableStock: 'availableStock',
  minStockLevel: 'minStockLevel',
  reorderLevel: 'reorderLevel',
  avgUnitCost: 'avgUnitCost',
  location: 'location',
  notes: 'notes',
  createdAt: 'createdAt',
  updatedAt: 'updatedAt'
};

exports.Prisma.PurchaseBillScalarFieldEnum = {
  id: 'id',
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
  createdAt: 'createdAt'
};

exports.Prisma.InventoryLedgerScalarFieldEnum = {
  id: 'id',
  sku: 'sku',
  type: 'type',
  quantity: 'quantity',
  unitCost: 'unitCost',
  balanceAfter: 'balanceAfter',
  referenceType: 'referenceType',
  referenceId: 'referenceId',
  billId: 'billId',
  notes: 'notes',
  createdAt: 'createdAt'
};

exports.Prisma.MetaAccountScalarFieldEnum = {
  id: 'id',
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

exports.Prisma.DelhiveryConfigScalarFieldEnum = {
  id: 'id',
  apiToken: 'apiToken',
  clientName: 'clientName',
  warehousePin: 'warehousePin',
  mode: 'mode',
  isActive: 'isActive',
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
  name: 'name',
  keyHash: 'keyHash',
  keyPrefix: 'keyPrefix',
  lastUsedAt: 'lastUsedAt',
  isActive: 'isActive',
  createdAt: 'createdAt',
  updatedAt: 'updatedAt'
};

exports.Prisma.SortOrder = {
  asc: 'asc',
  desc: 'desc'
};

exports.Prisma.NullsOrder = {
  first: 'first',
  last: 'last'
};


exports.Prisma.ModelName = {
  ShopifyStore: 'ShopifyStore',
  ShopifyProduct: 'ShopifyProduct',
  ShopifyVariant: 'ShopifyVariant',
  ShopifyOrder: 'ShopifyOrder',
  ShopifyOrderItem: 'ShopifyOrderItem',
  ShopifyFulfillment: 'ShopifyFulfillment',
  StockItem: 'StockItem',
  PurchaseBill: 'PurchaseBill',
  PurchaseBillItem: 'PurchaseBillItem',
  InventoryLedger: 'InventoryLedger',
  MetaAccount: 'MetaAccount',
  MetaCampaign: 'MetaCampaign',
  MetaAdSet: 'MetaAdSet',
  MetaAd: 'MetaAd',
  MetaDailyMetric: 'MetaDailyMetric',
  DelhiveryConfig: 'DelhiveryConfig',
  SyncLog: 'SyncLog',
  ShopifyWebhookEvent: 'ShopifyWebhookEvent',
  VoopApiKey: 'VoopApiKey'
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
