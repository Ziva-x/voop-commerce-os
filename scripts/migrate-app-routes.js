const fs = require('fs');
const path = require('path');

const targetFiles = [
  './app/app/[storeId]/collaborations/page.tsx',
  './app/app/[storeId]/form-builder/page.tsx',
  './app/app/[storeId]/orders/invoices/bulk/page.tsx',
  './app/app/[storeId]/orders/[id]/invoice/page.tsx',
  './app/app/[storeId]/settings/ads/page.tsx',
  './app/app/[storeId]/settings/company/page.tsx',
  './app/app/[storeId]/settings/couriers/page.tsx',
  './app/app/[storeId]/settings/shopify/page.tsx',
  './app/orders/invoices/bulk/page.tsx',
  './app/orders/[id]/invoice/page.tsx',
  './app/settings/ads/page.tsx',
  './app/settings/company/page.tsx',
  './app/settings/couriers/page.tsx',
  './app/settings/shopify/page.tsx',
  './app/settings/voop/page.tsx',
  './app/subscribe/page.tsx',
  './app/pricing/page.tsx',
  './app/admin/AdminLoginForm.tsx',
  './app/admin/page.tsx',
];

const replacementRules = [
  { from: /\bbg-white dark:bg-slate-950\b/g, to: 'bg-[var(--surface)]' },
  { from: /\bbg-white dark:bg-slate-900\b/g, to: 'bg-[var(--surface)]' },
  { from: /\bbg-slate-100 dark:bg-slate-900\b/g, to: 'bg-[var(--bg-secondary)]' },
  { from: /\bbg-slate-100 dark:bg-slate-950\b/g, to: 'bg-[var(--bg-secondary)]' },
  { from: /\bbg-slate-50 dark:bg-slate-950\b/g, to: 'bg-[var(--bg-secondary)]' },
  { from: /\bbg-slate-50 dark:bg-slate-900\b/g, to: 'bg-[var(--bg-secondary)]' },
  { from: /\bborder-slate-200 dark:border-slate-800\b/g, to: 'border-[var(--border)]' },
  { from: /\bborder-slate-300 dark:border-slate-800\b/g, to: 'border-[var(--border)]' },
  { from: /\bborder-slate-300 dark:border-slate-700\b/g, to: 'border-[var(--border)]' },
  { from: /\bdivide-slate-200 dark:divide-slate-800\/60\b/g, to: 'divide-[var(--border)]' },
  { from: /\bdivide-slate-200 dark:divide-slate-800\b/g, to: 'divide-[var(--border)]' },
  { from: /\btext-slate-900 dark:text-white\b/g, to: 'text-[var(--text-primary)]' },
  { from: /\btext-slate-800 dark:text-slate-100\b/g, to: 'text-[var(--text-primary)]' },
  { from: /\btext-slate-700 dark:text-slate-200\b/g, to: 'text-[var(--text-primary)]' },
  { from: /\btext-slate-700 dark:text-slate-300\b/g, to: 'text-[var(--text-secondary)]' },
  { from: /\btext-slate-600 dark:text-slate-300\b/g, to: 'text-[var(--text-secondary)]' },
  { from: /\btext-slate-600 dark:text-slate-400\b/g, to: 'text-[var(--text-secondary)]' },
  { from: /\btext-slate-500 dark:text-slate-400\b/g, to: 'text-[var(--text-muted)]' },
  { from: /\bhover:text-slate-900 dark:hover:text-white\b/g, to: 'hover:text-[var(--text-primary)]' },
  { from: /\bhover:bg-slate-200 dark:hover:bg-slate-700\b/g, to: 'hover:bg-[var(--surface-hover)]' },
  { from: /\bhover:bg-slate-100 dark:hover:bg-slate-800\b/g, to: 'hover:bg-[var(--surface-hover)]' },
  { from: /\bbg-slate-900\/60\b/g, to: 'bg-[var(--surface)]' },
  { from: /\bbg-slate-900\/80\b/g, to: 'bg-[var(--surface)]' },
  { from: /\bbg-slate-900\/40\b/g, to: 'bg-[var(--bg-secondary)]' },
  { from: /\bbg-slate-950\/60\b/g, to: 'bg-[var(--bg-secondary)]' },
  { from: /\bbg-slate-950\/40\b/g, to: 'bg-[var(--bg-secondary)]' },
  { from: /\bborder-slate-800\/60\b/g, to: 'border-[var(--border)]' },
  { from: /\bborder-slate-800\b/g, to: 'border-[var(--border)]' },
  { from: /\bborder-slate-700\b/g, to: 'border-[var(--border)]' },
  { from: /\bhover:bg-slate-800\/60\b/g, to: 'hover:bg-[var(--surface-hover)]' },
  { from: /\bhover:bg-slate-800\b/g, to: 'hover:bg-[var(--surface-hover)]' },
  { from: /\bfocus:border-indigo-500\b/g, to: 'focus:border-[var(--accent)]' },
  { from: /\bfocus:border-cyan-500\b/g, to: 'focus:border-[var(--accent)]' },
  { from: /\bfocus:border-sky-500\b/g, to: 'focus:border-[var(--accent)]' },
];

let totalReplacements = 0;
let filesModified = 0;

for (const relPath of targetFiles) {
  const fullPath = path.resolve(relPath);
  if (!fs.existsSync(fullPath)) {
    console.warn(`Skipping missing file: ${relPath}`);
    continue;
  }

  let content = fs.readFileSync(fullPath, 'utf8');
  let fileReplacements = 0;

  for (const rule of replacementRules) {
    const matches = content.match(rule.from);
    if (matches) {
      fileReplacements += matches.length;
      content = content.replace(rule.from, rule.to);
    }
  }

  if (fileReplacements > 0) {
    fs.writeFileSync(fullPath, content, 'utf8');
    console.log(`✓ ${relPath}: ${fileReplacements} tokens migrated`);
    totalReplacements += fileReplacements;
    filesModified++;
  } else {
    console.log(`  ${relPath}: clean (0 migrations needed)`);
  }
}

console.log(`\n========================================`);
console.log(`APP ROUTES: ${totalReplacements} tokens migrated across ${filesModified} files.`);
console.log(`========================================\n`);
