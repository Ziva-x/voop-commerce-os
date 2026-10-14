const fs = require('fs');
const path = require('path');

const target = path.resolve('./components/DashboardView.tsx');
let content = fs.readFileSync(target, 'utf8');

const replacements = [
  // Card backgrounds
  { from: /\bbg-white\b/g, to: 'bg-[var(--surface)]' },
  { from: /\bbg-slate-50\b/g, to: 'bg-[var(--bg-secondary)]' },
  { from: /\bhover:bg-slate-50\/80\b/g, to: 'hover:bg-[var(--surface-hover)]' },
  { from: /\bhover:bg-slate-50\b/g, to: 'hover:bg-[var(--surface-hover)]' },
  { from: /\bbg-slate-100\b/g, to: 'bg-[var(--surface-hover)]' },

  // Borders
  { from: /\bborder-slate-200\/90\b/g, to: 'border-[var(--border)]' },
  { from: /\bborder-slate-200\b/g, to: 'border-[var(--border)]' },
  { from: /\bborder-slate-100\b/g, to: 'border-[var(--border)]' },
  { from: /\bhover:border-slate-300\b/g, to: 'hover:border-[var(--border-strong)]' },

  // Text
  { from: /\btext-slate-900\b/g, to: 'text-[var(--text-primary)]' },
  { from: /\btext-slate-800\b/g, to: 'text-[var(--text-primary)]' },
  { from: /\btext-slate-700\b/g, to: 'text-[var(--text-secondary)]' },
  { from: /\btext-slate-600\b/g, to: 'text-[var(--text-secondary)]' },
  { from: /\bhover:text-slate-900\b/g, to: 'hover:text-[var(--text-primary)]' },
  { from: /\bhover:text-slate-700\b/g, to: 'hover:text-[var(--text-primary)]' },
  { from: /\bhover:text-slate-600\b/g, to: 'hover:text-[var(--text-primary)]' },
];

let total = 0;
for (const r of replacements) {
  const m = content.match(r.from);
  if (m) {
    total += m.length;
    content = content.replace(r.from, r.to);
  }
}

fs.writeFileSync(target, content, 'utf8');
console.log(`✓ DashboardView.tsx: ${total} tokens migrated to master design system!`);
