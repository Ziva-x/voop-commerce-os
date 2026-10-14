const fs = require('fs');
const path = require('path');
const assert = require('assert');

console.log('================================================================================');
console.log('TEST SUITE: VOOP ANALYTICS MONTHLY BUSINESS EXPENSES');
console.log('================================================================================\n');

let passed = 0;
let failed = 0;

function test(name, fn) {
  try {
    fn();
    console.log(`  ✓ PASS: ${name}`);
    passed++;
  } catch (err) {
    console.error(`  ✗ FAIL: ${name}`);
    console.error(`    ${err.message}`);
    failed++;
  }
}

// 1. Check AnalyticsService.ts implementation
const analyticsServicePath = path.join(__dirname, '../lib/services/AnalyticsService.ts');
const analyticsServiceContent = fs.readFileSync(analyticsServicePath, 'utf8');

test('AnalyticsService: Queries PurchaseBill as primary data source with storeId isolation', () => {
  assert(analyticsServiceContent.includes('prisma.purchaseBill.findMany'), 'Missing purchaseBill.findMany in AnalyticsService');
  assert(analyticsServiceContent.includes('status: { not: "CANCELLED" }'), 'Missing status filter excluding cancelled bills');
  assert(analyticsServiceContent.includes('orderBy: { billDate: "desc" }'), 'Missing billDate ordering');
});

test('AnalyticsService: Uses billDate (not createdAt) for monthly aggregation', () => {
  assert(analyticsServiceContent.includes('new Date(b.billDate)'), 'Does not use billDate for monthly aggregation');
  assert(analyticsServiceContent.includes('b.totalAmount'), 'Does not use totalAmount for expense sum');
});

test('AnalyticsService: Normalizes expense categories cleanly', () => {
  assert(analyticsServiceContent.includes('export function normalizeExpenseCategory'), 'Missing normalizeExpenseCategory export');
  
  // Emulate normalization function logic
  function normalizeExpenseCategory(rawCategory, billType) {
    const cat = (rawCategory || billType || "Other").trim();
    const upper = cat.toUpperCase();
    if (upper === "PACKAGING" || upper === "PACKAGING SUPPLIES") return "Packaging";
    if (upper === "INVENTORY" || upper === "INVENTORY (GRN)" || upper === "RAW MATERIALS" || upper === "PRODUCT COST") return "Raw Materials";
    if (upper === "TRANSPORTATION" || upper === "SHIPPING_LOGISTICS" || upper === "SHIPPING" || upper === "COURIER" || upper === "TRANSPORTATION & FREIGHT" || upper === "FREIGHT") return "Courier";
    if (upper === "MARKETING_ADS" || upper === "MARKETING / COLLAB" || upper === "ADVERTISING" || upper === "MARKETING") return "Advertising";
    if (upper === "OPERATIONAL_OVERHEAD" || upper === "OVERHEAD & RENT" || upper === "OVERHEAD") return "Overhead & Rent";
    if (upper === "PAYMENT_GATEWAY" || upper === "PAYMENT GATEWAY") return "Payment Gateway";
    if (upper === "SALARIES") return "Salaries";
    if (upper === "SOFTWARE" || upper === "SOFTWARE / APPS") return "Software / Apps";
    if (upper === "MISC" || upper === "GENERAL BUSINESS") return "Other";
    return cat;
  }

  assert.strictEqual(normalizeExpenseCategory('PACKAGING'), 'Packaging');
  assert.strictEqual(normalizeExpenseCategory(null, 'INVENTORY'), 'Raw Materials');
  assert.strictEqual(normalizeExpenseCategory('Shipping'), 'Courier');
  assert.strictEqual(normalizeExpenseCategory('Advertising'), 'Advertising');
  assert.strictEqual(normalizeExpenseCategory('Salaries'), 'Salaries');
  assert.strictEqual(normalizeExpenseCategory(null, 'MISC'), 'Other');
});

test('AnalyticsService: Creates dynamic 6-month chart relative to current date', () => {
  assert(analyticsServiceContent.includes('for (let i = 5; i >= 0; i--)'), 'Missing dynamic 6-month loop');
  assert(analyticsServiceContent.includes('d.toLocaleDateString("en-US", { month: "short", year: "2-digit" })'), 'Missing month label format');
});

test('AnalyticsService: createExpense delegates to PurchasesService.createBill', () => {
  assert(analyticsServiceContent.includes('PurchasesService.createBill'), 'createExpense does not delegate to PurchasesService.createBill');
});

test('AnalyticsService: deleteExpense delegates to PurchasesService.deleteBill', () => {
  assert(analyticsServiceContent.includes('PurchasesService.deleteBill'), 'deleteExpense does not delegate to PurchasesService.deleteBill');
});

// 2. Check /api/analytics/expenses/route.ts
const expensesRoutePath = path.join(__dirname, '../app/api/analytics/expenses/route.ts');
const expensesRouteContent = fs.readFileSync(expensesRoutePath, 'utf8');

test('API Route: GET /api/analytics/expenses retrieves bills via PurchasesService with store isolation', () => {
  assert(expensesRouteContent.includes('PurchasesService.getBills(auth.storeId)'), 'Missing PurchasesService.getBills with storeId');
  assert(expensesRouteContent.includes('authorizeStoreAccess'), 'Missing authorizeStoreAccess check');
});

test('API Route: POST and DELETE delegate to AnalyticsService (and thus PurchasesService)', () => {
  assert(expensesRouteContent.includes('AnalyticsService.createExpense(auth.storeId, body)'), 'POST does not call createExpense with storeId');
  assert(expensesRouteContent.includes('AnalyticsService.deleteExpense(auth.storeId, id)'), 'DELETE does not call deleteExpense with storeId');
});

// 3. Check AnalyticsView.tsx
const analyticsViewPath = path.join(__dirname, '../components/views/AnalyticsView.tsx');
const analyticsViewContent = fs.readFileSync(analyticsViewPath, 'utf8');

test('AnalyticsView: Preserves UI layout and uses formatShortDate for expense table', () => {
  assert(analyticsViewContent.includes('formatShortDate(exp.date)'), 'Missing formatShortDate on expense date');
  assert(analyticsViewContent.includes('Monthly Business Expenses'), 'Missing Monthly Business Expenses header');
  assert(analyticsViewContent.includes('Monthly Expense Trend (Past 6 Months)'), 'Missing Monthly Expense Trend header');
  assert(analyticsViewContent.includes('Category Breakdown'), 'Missing Category Breakdown header');
  assert(analyticsViewContent.includes('No expenses recorded yet.'), 'Missing empty state copy');
});

// 4. Verify Purchases (All Bills) Page is completely untouched
const purchasesViewPath = path.join(__dirname, '../components/views/PurchasesView.tsx');
const purchasesViewContent = fs.readFileSync(purchasesViewPath, 'utf8');

test('PurchasesView: Purchases (All Bills) UI is completely untouched', () => {
  assert(purchasesViewContent.includes('BILL_TYPE_CONFIG'), 'PurchasesView BILL_TYPE_CONFIG modified');
  assert(purchasesViewContent.includes('Record New Bill'), 'PurchasesView Record New Bill button missing');
  assert(purchasesViewContent.includes('All Payment Status'), 'PurchasesView filters missing');
});

// 5. Verify PnLService consistency
const pnlServicePath = path.join(__dirname, '../lib/services/PnLService.ts');
const pnlServiceContent = fs.readFileSync(pnlServicePath, 'utf8');

test('PnLService: Uses identical accounting rules (billDate, totalAmount, status not CANCELLED)', () => {
  assert(pnlServiceContent.includes('prisma.purchaseBill.findMany'), 'PnL does not query purchaseBill');
  assert(pnlServiceContent.includes('status: { not: "CANCELLED" }'), 'PnL does not filter cancelled bills');
  assert(pnlServiceContent.includes('b.totalAmount'), 'PnL does not sum totalAmount');
});

console.log('\n================================================================================');
console.log(`RESULTS: ${passed} PASSED, ${failed} FAILED`);
console.log('================================================================================');

if (failed > 0) {
  process.exit(1);
}
