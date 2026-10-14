const fs = require('fs');

console.log('=== VERIFYING AREA 1: ORDERS PAYMENT STATUS SELECT ===');
const ordersView = fs.readFileSync('components/views/OrdersView.tsx', 'utf8');
const selectTsx = fs.readFileSync('components/ui/Select.tsx', 'utf8');

const requiredOptions = [
  'All Payment Status',
  'Paid',
  'Pending (COD / Unpaid)',
  'Authorized (Card Hold)',
  'Partially Paid',
  'Partially Refunded',
  'Refunded',
  'Voided / Cancelled'
];

let allOptionsPresent = true;
for (const opt of requiredOptions) {
  if (!ordersView.includes(opt)) {
    console.error('Missing option:', opt);
    allOptionsPresent = false;
  }
}
console.log('All 8 exact options in OrdersView:', allOptionsPresent ? 'PASS' : 'FAIL');

const a11yChecks = [
  'role="combobox"',
  'role="listbox"',
  'role="option"',
  'aria-haspopup="listbox"',
  'aria-expanded',
  'ArrowDown',
  'ArrowUp',
  'Enter',
  'Escape',
  'handleOutsideClick'
];
let allA11y = true;
for (const check of a11yChecks) {
  if (!selectTsx.includes(check)) {
    console.error('Missing a11y feature in Select.tsx:', check);
    allA11y = false;
  }
}
console.log('Select.tsx a11y and keyboard support:', allA11y ? 'PASS' : 'FAIL');

console.log('\n=== VERIFYING AREA 2: ALL COURIER APIS ===');
const couriersView = fs.readFileSync('components/views/CouriersView.tsx', 'utf8');
const requiredCouriers = [
  'Delhivery',
  'Blue Dart',
  'XpressBees',
  'Ecom Express',
  'Ekart Logistics',
  'Shadowfax'
];
let allCouriersPresent = true;
for (const c of requiredCouriers) {
  if (!couriersView.includes(c)) {
    console.error('Missing courier partner in CouriersView:', c);
    allCouriersPresent = false;
  }
}
console.log('All 6 courier partners defined:', allCouriersPresent ? 'PASS' : 'FAIL');

console.log('Tenant Isolation present:', couriersView.includes('Tenant Isolation') ? 'PASS' : 'FAIL');
console.log('AES-256 Secure present:', couriersView.includes('AES-256 Secure') ? 'PASS' : 'FAIL');
console.log('Active & Encrypted present:', couriersView.includes('Active & Encrypted') ? 'PASS' : 'FAIL');

// Check no forbidden hardcoded dark backgrounds in couriersView
const forbiddenMatches = couriersView.match(/#(000|fff|0b1220|1e3a8a)|bg-slate-900|bg-slate-950/gi);
console.log('Forbidden hardcoded dark tokens in CouriersView:', forbiddenMatches ? forbiddenMatches : 'NONE (PASS)');

console.log('\n=== VERIFYING PAGE ROUTE WRAPPERS ===');
const couriersPage1 = fs.readFileSync('app/settings/couriers/page.tsx', 'utf8');
const couriersPage2 = fs.readFileSync('app/app/[storeId]/settings/couriers/page.tsx', 'utf8');

console.log('app/settings/couriers/page.tsx uses CouriersView:', couriersPage1.includes('<CouriersView') ? 'PASS' : 'FAIL');
console.log('app/app/[storeId]/settings/couriers/page.tsx uses CouriersView:', couriersPage2.includes('<CouriersView') ? 'PASS' : 'FAIL');
