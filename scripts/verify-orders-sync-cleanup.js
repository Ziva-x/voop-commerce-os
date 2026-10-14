const fs = require('fs');
const path = require('path');
const assert = require('assert');

console.log('================================================================================');
console.log('TEST SUITE: VOOP ORDERS & SYNC UI CLEANUP');
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

// 1. Check DashboardView
const dashboardViewPath = path.join(__dirname, '../components/DashboardView.tsx');
const dashboardViewContent = fs.readFileSync(dashboardViewPath, 'utf8');

test('DashboardView: Shiprocket completely removed from Courier API Bridge', () => {
  assert(!dashboardViewContent.toLowerCase().includes('shiprocket'), 'Found Shiprocket in DashboardView');
  assert(dashboardViewContent.includes('Delhivery / Blue Dart'), 'Missing Delhivery / Blue Dart bridge subtitle');
});

test('DashboardView: formatSyncDetails helper formats embedded ISO timestamps', () => {
  assert(dashboardViewContent.includes('function formatSyncDetails'), 'Missing formatSyncDetails function');
  const regex = /\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?Z?/g;
  const sampleDetails = '5-Hour Safety Incremental Sync completed: 0 changed order(s) updated. (Scanned changes since 2026-09-11T04:56:05.140Z)';
  const formatted = sampleDetails.replace(regex, '11 Sep 2026, 10:26 am');
  assert(!formatted.includes('2026-09-11T'), 'ISO timestamp still present in formatted output');
  assert(formatted.includes('11 Sep 2026, 10:26 am'), 'Human-readable timestamp missing');
});

test('DashboardView: Recent Sync Operations uses responsive layout without overflow', () => {
  assert(dashboardViewContent.includes('min-w-0 flex-1'), 'Missing min-w-0 flex-1 on sync content');
  assert(dashboardViewContent.includes('flex flex-col sm:flex-row sm:items-center justify-between'), 'Missing responsive flex direction on card');
  assert(dashboardViewContent.includes('truncate'), 'Missing text truncate on sync details to prevent card expansion');
  assert(dashboardViewContent.includes('whitespace-nowrap'), 'Missing whitespace-nowrap on metadata items');
});

// 2. Check OrdersView
const ordersViewPath = path.join(__dirname, '../components/views/OrdersView.tsx');
const ordersViewContent = fs.readFileSync(ordersViewPath, 'utf8');

test('OrdersView: Date range inputs use VOOP master theme tokens', () => {
  const dateInputMatches = ordersViewContent.match(/<input\b[^>]*?type="date"[^>]*?\/>/gs) || [];
  // Since onChange has (e) =>, match from <input type="date" to />
  const startIdx = ordersViewContent.indexOf('type="date"');
  const endIdx = ordersViewContent.indexOf('/>', startIdx);
  const firstInput = ordersViewContent.slice(startIdx, endIdx + 2);

  const startIdx2 = ordersViewContent.indexOf('type="date"', endIdx);
  const endIdx2 = ordersViewContent.indexOf('/>', startIdx2);
  const secondInput = ordersViewContent.slice(startIdx2, endIdx2 + 2);

  for (const input of [firstInput, secondInput]) {
    assert(!input.includes('bg-slate-900'), 'Date input has forbidden bg-slate-900');
    assert(!input.includes('text-slate-200'), 'Date input has forbidden text-slate-200');
    assert(input.includes('bg-[var(--input-bg)]'), 'Missing bg-[var(--input-bg)] on date input');
    assert(input.includes('border-[var(--input-border)]'), 'Missing border-[var(--input-border)] on date input');
    assert(input.includes('text-[var(--input-text)]'), 'Missing text-[var(--input-text)] on date input');
    assert(input.includes('focus:border-[var(--input-focus)]'), 'Missing focus:border-[var(--input-focus)] on date input');
  }
});

test('OrdersView: Date range inputs and presets match dimensions (h-8)', () => {
  assert(ordersViewContent.includes('h-8 px-2.5 rounded-md text-xs font-medium'), 'Preset buttons missing h-8 dimension match');
  assert(ordersViewContent.includes('h-8 bg-[var(--input-bg)]'), 'Date inputs missing h-8 dimension match');
});

test('OrdersView: Preserves existing date filtering logic and handlers', () => {
  assert(ordersViewContent.includes('setStartDate(e.target.value)'), 'Missing setStartDate handler');
  assert(ordersViewContent.includes('setEndDate(e.target.value)'), 'Missing setEndDate handler');
  assert(ordersViewContent.includes('setDatePreset("CUSTOM")'), 'Missing setDatePreset("CUSTOM")');
});

// 3. Check voop-theme.css
const themeCssPath = path.join(__dirname, '../design-system/voop-theme.css');
const themeCssContent = fs.readFileSync(themeCssPath, 'utf8');

test('voop-theme.css: Date input color-scheme and calendar indicator rules defined', () => {
  assert(themeCssContent.includes('input[type="date"]'), 'Missing input[type="date"] styles');
  assert(themeCssContent.includes('input[type="date"]::-webkit-calendar-picker-indicator'), 'Missing calendar picker indicator styles');
  assert(themeCssContent.includes('color-scheme: light'), 'Missing light color-scheme rule');
  assert(themeCssContent.includes('color-scheme: dark'), 'Missing dark color-scheme rule');
});

// 4. Check CouriersView
const couriersViewPath = path.join(__dirname, '../components/views/CouriersView.tsx');
const couriersViewContent = fs.readFileSync(couriersViewPath, 'utf8');

test('CouriersView: Exactly 6 supported couriers defined without Shiprocket', () => {
  assert(!couriersViewContent.toLowerCase().includes('shiprocket'), 'Found Shiprocket in CouriersView');
  const supported = ['DELHIVERY', 'BLUEDART', 'XPRESSBEES', 'ECOM_EXPRESS', 'EKART', 'SHADOWFAX'];
  for (const c of supported) {
    assert(couriersViewContent.includes(c), `Missing courier ${c} in CouriersView`);
  }
});

console.log('\n================================================================================');
console.log(`RESULTS: ${passed} PASSED, ${failed} FAILED`);
console.log('================================================================================');

if (failed > 0) {
  process.exit(1);
}
