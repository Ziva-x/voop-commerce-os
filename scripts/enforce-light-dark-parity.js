const fs = require('fs');
const path = require('path');

const files = [
  './components/views/InventoryView.tsx',
  './components/views/OrdersView.tsx',
  './components/views/ShipmentsView.tsx',
  './components/views/AnalyticsView.tsx',
  './components/views/BillingView.tsx',
  './components/views/PnlView.tsx',
  './components/views/TaxView.tsx',
  './components/views/PurchasesView.tsx',
  './components/views/ScannerView.tsx',
  './components/views/SyncLogsView.tsx',
  './components/DashboardView.tsx',
];

const rules = [
  // 1. Slate backgrounds with any slash opacity
  { from: /\bbg-slate-900\/\d+\b/g, to: 'bg-[var(--surface)]' },
  { from: /\bbg-slate-950\/\d+\b/g, to: 'bg-[var(--surface)]' },
  { from: /\bbg-slate-800\/\d+\b/g, to: 'bg-[var(--surface-hover)]' },

  // 2. Active tab / button hardcoded dark styles
  { from: /"bg-slate-800 text-white shadow-sm font-semibold"/g, to: '"bg-[var(--accent)] text-white shadow-xs font-semibold"' },
  { from: /"bg-slate-800 text-white"/g, to: '"bg-[var(--accent)] text-white font-semibold"' },
  { from: /"bg-slate-800\b/g, to: '"bg-[var(--surface-hover)]' },
  { from: /\bbg-slate-800\b/g, to: 'bg-[var(--surface-hover)]' },

  // 3. Tab inactive text
  { from: /"text-slate-400 hover:text-slate-200"/g, to: '"text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--surface-hover)]"' },
  { from: /"text-slate-400 hover:text-white"/g, to: '"text-[var(--text-secondary)] hover:text-[var(--text-primary)]"' },
  { from: /"text-slate-400 hover:text-slate-300"/g, to: '"text-[var(--text-secondary)] hover:text-[var(--text-primary)]"' },

  // 4. Content titles and headers with hardcoded text-white
  { from: /<h1 className="([^"]*)\btext-white\b([^"]*)">/g, to: '<h1 className="$1text-[var(--text-primary)]$2">' },
  { from: /<h2 className="([^"]*)\btext-white\b([^"]*)">/g, to: '<h2 className="$1text-[var(--text-primary)]$2">' },
  { from: /<h3 className="([^"]*)\btext-white\b([^"]*)">/g, to: '<h3 className="$1text-[var(--text-primary)]$2">' },
  { from: /<h4 className="([^"]*)\btext-white\b([^"]*)">/g, to: '<h4 className="$1text-[var(--text-primary)]$2">' },

  // 5. Hardcoded text-white on metric numbers inside p tags
  { from: /<p className="text-xl font-bold text-white">/g, to: '<p className="text-xl font-bold text-[var(--text-primary)]">' },
  { from: /<p className="text-2xl font-bold text-white">/g, to: '<p className="text-2xl font-bold text-[var(--text-primary)]">' },
  { from: /<p className="text-lg font-bold text-white">/g, to: '<p className="text-lg font-bold text-[var(--text-primary)]">' },
  { from: /<p className="text-base font-bold text-white">/g, to: '<p className="text-base font-bold text-[var(--text-primary)]">' },
  { from: /<p className="text-3xl font-black text-white">/g, to: '<p className="text-3xl font-black text-[var(--text-primary)]">' },

  // 6. Generic inputs with text-white
  { from: /\btext-white placeholder-slate-500\b/g, to: 'text-[var(--text-primary)] placeholder:text-[var(--text-muted)]' },
  { from: /\btext-white placeholder-slate-400\b/g, to: 'text-[var(--text-primary)] placeholder:text-[var(--text-muted)]' },

  // 7. General slate labels
  { from: /\btext-slate-400\b/g, to: 'text-[var(--text-secondary)]' },
  { from: /\btext-slate-500\b/g, to: 'text-[var(--text-muted)]' },
  { from: /\btext-slate-300\b/g, to: 'text-[var(--text-secondary)]' },
];

let totalReplacements = 0;

for (const rel of files) {
  const full = path.resolve(rel);
  if (!fs.existsSync(full)) continue;

  let content = fs.readFileSync(full, 'utf8');
  let count = 0;

  for (const rule of rules) {
    const m = content.match(rule.from);
    if (m) {
      count += m.length;
      content = content.replace(rule.from, rule.to);
    }
  }

  if (count > 0) {
    fs.writeFileSync(full, content, 'utf8');
    console.log(`✓ ${rel}: ${count} parity fixes applied`);
    totalReplacements += count;
  }
}

console.log(`\nParity fix complete: ${totalReplacements} changes applied across views.`);
