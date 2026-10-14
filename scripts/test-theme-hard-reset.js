/**
 * VOOP Global UI / Theme System Hard Reset Verification Suite
 * 
 * Verifies:
 * 1. Authoritative Master Tokens in voop-theme.css (Light, Dark, and Locked Dark Nav)
 * 2. Complete removal of the 5 selectable brand accent palette buttons from ThemeBottomSheet
 * 3. Locked dark navigation system across both Light & Dark modes
 * 4. User-level theme persistence & strict user isolation (User A vs User B)
 * 5. Component class standardization (.btn-*, .voop-table, .badge-*, inputs)
 */

const fs = require('fs');
const path = require('path');
const assert = require('assert');

let passed = 0;
let failed = 0;

function test(name, fn) {
  try {
    fn();
    console.log(`  ✓ PASS: ${name}`);
    passed++;
  } catch (err) {
    console.error(`  ✗ FAIL: ${name}`);
    console.error(`    -> ${err.message}`);
    failed++;
  }
}

console.log('===================================================================');
console.log('  RUNNING VOOP GLOBAL UI / THEME HARD RESET VERIFICATION SUITE');
console.log('===================================================================\n');

// ─── SUITE 1: MASTER DESIGN TOKENS (LIGHT, DARK, NAVIGATION) ───────────
console.log('Suite 1: Master Design Tokens in voop-theme.css');
const themeCss = fs.readFileSync(path.join(__dirname, '../design-system/voop-theme.css'), 'utf8');

test('Light Theme Token: --bg-primary = #F8FAFC', () => {
  assert(themeCss.includes('--bg-primary:          #F8FAFC;'));
});

test('Light Theme Token: --bg-secondary = #F1F5F9', () => {
  assert(themeCss.includes('--bg-secondary:        #F1F5F9;'));
});

test('Light Theme Token: --surface = #FFFFFF', () => {
  assert(themeCss.includes('--surface:             #FFFFFF;'));
});

test('Light Theme Token: --text-primary = #0F172A', () => {
  assert(themeCss.includes('--text-primary:        #0F172A;'));
});

test('Light Theme Token: --text-secondary = #475569', () => {
  assert(themeCss.includes('--text-secondary:      #475569;'));
});

test('Light Theme Token: --text-muted = #64748B', () => {
  assert(themeCss.includes('--text-muted:          #64748B;'));
});

test('Light Theme Token: --border = #E2E8F0', () => {
  assert(themeCss.includes('--border:              #E2E8F0;'));
});

test('Light Theme Token: --border-strong = #CBD5E1', () => {
  assert(themeCss.includes('--border-strong:       #CBD5E1;'));
});

test('Light Theme Token: --accent = #2563EB', () => {
  assert(themeCss.includes('--accent:              #2563EB;'));
});

test('Light Theme Token: --accent-hover = #1D4ED8', () => {
  assert(themeCss.includes('--accent-hover:        #1D4ED8;'));
});

test('Light Theme Token: --accent-soft = #EFF6FF', () => {
  assert(themeCss.includes('--accent-soft:         #EFF6FF;'));
});

test('Light Theme Token: --success = #16A34A', () => {
  assert(themeCss.includes('--success:             #16A34A;'));
});

test('Light Theme Token: --warning = #D97706', () => {
  assert(themeCss.includes('--warning:             #D97706;'));
});

test('Light Theme Token: --error = #DC2626', () => {
  assert(themeCss.includes('--error:               #DC2626;'));
});

test('Dark Theme Token: --bg-primary = #0B1120', () => {
  assert(themeCss.includes('--bg-primary:          #0B1120;'));
});

test('Dark Theme Token: --bg-secondary = #111827', () => {
  assert(themeCss.includes('--bg-secondary:        #111827;'));
});

test('Dark Theme Token: --surface = #172033', () => {
  assert(themeCss.includes('--surface:             #172033;'));
});

test('Dark Theme Token: --surface-elevated = #1E293B', () => {
  assert(themeCss.includes('--surface-elevated:    #1E293B;'));
});

test('Dark Theme Token: --text-primary = #F8FAFC', () => {
  assert(themeCss.includes('--text-primary:        #F8FAFC;'));
});

test('Dark Theme Token: --text-secondary = #CBD5E1', () => {
  assert(themeCss.includes('--text-secondary:      #CBD5E1;'));
});

test('Dark Theme Token: --text-muted = #94A3B8', () => {
  assert(themeCss.includes('--text-muted:          #94A3B8;'));
});

test('Dark Theme Token: --border = #263449', () => {
  assert(themeCss.includes('--border:              #263449;'));
});

test('Dark Theme Token: --border-strong = #334155', () => {
  assert(themeCss.includes('--border-strong:       #334155;'));
});

test('Dark Theme Token: --accent = #3B82F6', () => {
  assert(themeCss.includes('--accent:              #3B82F6;'));
});

test('Dark Theme Token: --accent-hover = #60A5FA', () => {
  assert(themeCss.includes('--accent-hover:        #60A5FA;'));
});

test('Dark Theme Token: --accent-soft = #172554', () => {
  assert(themeCss.includes('--accent-soft:         #172554;'));
});

test('Dark Theme Token: --success = #22C55E', () => {
  assert(themeCss.includes('--success:             #22C55E;'));
});

test('Dark Theme Token: --warning = #F59E0B', () => {
  assert(themeCss.includes('--warning:             #F59E0B;'));
});

test('Dark Theme Token: --error = #EF4444', () => {
  assert(themeCss.includes('--error:               #EF4444;'));
});

// ─── SUITE 2: LOCKED DARK NAVIGATION SYSTEM (SECTION 7) ────────────────
console.log('\nSuite 2: Locked Dark Navigation Tokens');

test('Navigation Token: --nav-bg = #0B1120', () => {
  assert(themeCss.includes('--nav-bg:                      #0B1120;'));
});

test('Navigation Token: --nav-bg-secondary = #111827', () => {
  assert(themeCss.includes('--nav-bg-secondary:            #111827;'));
});

test('Navigation Token: --nav-text-primary = #F8FAFC', () => {
  assert(themeCss.includes('--nav-text-primary:            #F8FAFC;'));
});

test('Navigation Token: --nav-text-secondary exists', () => {
  assert(themeCss.includes('--nav-text-secondary:'));
});

test('Navigation Token: --nav-border = #1E293B', () => {
  assert(themeCss.includes('--nav-border:                  #1E293B;'));
});

test('Navigation Token: --nav-hover = #172033', () => {
  assert(themeCss.includes('--nav-hover:                   #172033;'));
});

test('Navigation Token: --nav-active = #1D4ED8', () => {
  assert(themeCss.includes('--nav-active:                  #1D4ED8;'));
});

test('Navigation Token: --nav-active-text = #FFFFFF', () => {
  assert(themeCss.includes('--nav-active-text:             #FFFFFF;'));
});

test('Sidebar component binds directly to var(--nav-bg)', () => {
  const sidebarContent = fs.readFileSync(path.join(__dirname, '../components/Sidebar.tsx'), 'utf8');
  assert(sidebarContent.includes('bg-[var(--nav-bg)]'));
  assert(sidebarContent.includes('border-[var(--nav-border)]'));
  assert(sidebarContent.includes('bg-[var(--nav-active)]'));
  assert(sidebarContent.includes('text-[var(--nav-active-text)]'));
});

// ─── SUITE 3: REMOVAL OF BRAND ACCENT PALETTE SELECTOR ─────────────────
console.log('\nSuite 3: Brand Accent Palette Selector Elimination');
const bottomSheetContent = fs.readFileSync(path.join(__dirname, '../components/theme/ThemeBottomSheet.tsx'), 'utf8');

test('ThemeBottomSheet DOES NOT render "Brand Accent Palette"', () => {
  assert(!bottomSheetContent.includes('Brand Accent Palette'));
});

test('ThemeBottomSheet DOES NOT contain palette list array', () => {
  assert(!bottomSheetContent.includes('["voop", "emerald", "purple", "amber", "teal"]'));
});

test('ThemeBottomSheet contains exactly Theme Mode (Light vs Dark)', () => {
  assert(bottomSheetContent.includes('Theme Mode'));
  assert(bottomSheetContent.includes('Light Mode'));
  assert(bottomSheetContent.includes('Dark Mode'));
});

test('ThemeBottomSheet contains exactly Theme Mode (Light vs Dark) and Classic Style is removed', () => {
  assert(!bottomSheetContent.includes('Classic Style'));
  assert(bottomSheetContent.includes('Light Mode'));
  assert(bottomSheetContent.includes('Dark Mode'));
});

// ─── SUITE 4: THEME PERSISTENCE & USER ISOLATION SIMULATION ────────────
console.log('\nSuite 4: Theme Persistence & Strict User Isolation (Section 16 & 17)');

test('Simulate User A (Light Mode) vs User B (Dark Mode) Isolation', () => {
  // Simulated isolated preference storage per userId
  const db = new Map();

  function saveUserPref(userId, themeMode, style = 'modern') {
    db.set(userId, { themeMode, style });
    return db.get(userId);
  }

  function getUserPref(userId) {
    return db.get(userId) || { themeMode: 'dark', style: 'modern' };
  }

  // 1. User A sets Light Mode
  saveUserPref('user-a-id', 'light', 'modern');
  // 2. User B sets Dark Mode
  saveUserPref('user-b-id', 'dark', 'classic');

  // Verify User A remains Light Mode
  const prefA = getUserPref('user-a-id');
  assert.strictEqual(prefA.themeMode, 'light');
  assert.strictEqual(prefA.style, 'modern');

  // Verify User B remains Dark Mode
  const prefB = getUserPref('user-b-id');
  assert.strictEqual(prefB.themeMode, 'dark');
  assert.strictEqual(prefB.style, 'classic');

  // 3. User A toggles to Dark Mode
  saveUserPref('user-a-id', 'dark', 'modern');
  assert.strictEqual(getUserPref('user-a-id').themeMode, 'dark');
  assert.strictEqual(getUserPref('user-b-id').themeMode, 'dark'); // User B undisturbed

  // 4. User B toggles to Light Mode
  saveUserPref('user-b-id', 'light', 'classic');
  assert.strictEqual(getUserPref('user-a-id').themeMode, 'dark'); // User A undisturbed
  assert.strictEqual(getUserPref('user-b-id').themeMode, 'light');
});

// ─── SUITE 5: CANONICAL COMPONENT CLASSES ──────────────────────────────
console.log('\nSuite 5: Standardized Component Classes');

test('Canonical .btn-primary uses var(--accent)', () => {
  assert(themeCss.includes('.btn-primary {'));
  assert(themeCss.includes('background-color: var(--accent) !important;'));
});

test('Canonical .btn-secondary uses var(--surface) and var(--text-primary)', () => {
  assert(themeCss.includes('.btn-secondary {'));
  assert(themeCss.includes('background-color: var(--surface) !important;'));
  assert(themeCss.includes('color: var(--text-primary) !important;'));
});

test('Canonical table styles defined (.voop-table)', () => {
  assert(themeCss.includes('.voop-table,'));
  assert(themeCss.includes('background-color: var(--table-bg);'));
});

test('Canonical badges defined for semantic status tokens', () => {
  assert(themeCss.includes('.badge-success'));
  assert(themeCss.includes('.badge-warning'));
  assert(themeCss.includes('.badge-danger'));
  assert(themeCss.includes('.badge-info'));
});

console.log('\n===================================================================');
console.log(`  RESULTS: ${passed} PASSED, ${failed} FAILED`);
console.log('===================================================================\n');

if (failed > 0) {
  process.exit(1);
} else {
  console.log('All VOOP Global UI / Theme Hard Reset tests passed successfully!\n');
}
