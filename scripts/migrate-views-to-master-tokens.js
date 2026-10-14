const fs = require('fs');
const path = require('path');

const targetFiles = [
  'components/views/ShipmentsView.tsx',
  'components/views/BillingView.tsx',
  'components/views/AnalyticsView.tsx',
  'components/views/ProductsView.tsx',
  'components/DashboardView.tsx',
  'components/settings/ProfileTab.tsx',
  'components/settings/SecurityTab.tsx',
  'components/settings/StoreTab.tsx',
];

const replacements = [
  // Hard-coded dark card backgrounds
  { from: /bg-white dark:bg-\[#0B0F17\]/g, to: 'bg-[var(--surface)]' },
  { from: /bg-white dark:bg-\[#0F172A\]/g, to: 'bg-[var(--surface)]' },
  { from: /dark:bg-\[#0B0F17\]/g, to: 'dark:bg-[var(--surface)]' },
  { from: /dark:bg-\[#070A10\]/g, to: 'dark:bg-[var(--bg-primary)]' },
  { from: /bg-\[#0B0F17\]/g, to: 'bg-[var(--surface)]' },
  { from: /bg-\[#070A10\]/g, to: 'bg-[var(--bg-primary)]' },

  // Text colors
  { from: /text-\[#111217\] dark:text-white/g, to: 'text-[var(--text-primary)]' },
  { from: /text-\[#111217\] dark:text-slate-200/g, to: 'text-[var(--text-primary)]' },
  { from: /text-\[#111217\]/g, to: 'text-[var(--text-primary)]' },
  { from: /text-\[#686B78\] dark:text-slate-400/g, to: 'text-[var(--text-secondary)]' },
  { from: /text-\[#686B78\]/g, to: 'text-[var(--text-secondary)]' },
  { from: /text-\[#989BA7\] dark:text-slate-400/g, to: 'text-[var(--text-muted)]' },
  { from: /text-\[#989BA7\]/g, to: 'text-[var(--text-muted)]' },

  // Borders & hover
  { from: /border-\[#E7E8ED\] dark:border-slate-800/g, to: 'border-[var(--border)]' },
  { from: /border-\[#E7E8ED\] dark:border-slate-700/g, to: 'border-[var(--border)]' },
  { from: /border-\[#E7E8ED\]/g, to: 'border-[var(--border)]' },
  { from: /hover:bg-\[#FAFAFC\] dark:hover:bg-slate-800/g, to: 'hover:bg-[var(--surface-hover)]' },
  { from: /bg-\[#F7F8FA\] dark:bg-slate-800/g, to: 'bg-[var(--surface-secondary)]' },
  { from: /hover:bg-\[#E7E8ED\] dark:hover:bg-slate-800/g, to: 'hover:bg-[var(--surface-hover)]' },
  { from: /bg-\[#FAFAFC\]/g, to: 'bg-[var(--surface-hover)]' },

  // Inputs focus
  { from: /focus:border-cyan-500/g, to: 'focus:border-[var(--accent)]' },
  { from: /focus:border-purple-500/g, to: 'focus:border-[var(--accent)]' },
  { from: /focus:border-emerald-500/g, to: 'focus:border-[var(--accent)]' },
  { from: /focus:ring-cyan-500/g, to: 'focus:ring-[var(--accent)]/20' },
  { from: /focus:ring-emerald-500/g, to: 'focus:ring-[var(--accent)]/20' },

  // Primary modern alias
  { from: /var\(--primary-modern\)/g, to: 'var(--accent)' },
  { from: /var\(--primary-hover-modern\)/g, to: 'var(--accent-hover)' },
];

console.log('MIGRATING COMPONENTS TO AUTHORITATIVE DESIGN TOKENS...');
let totalReplacements = 0;

for (const relPath of targetFiles) {
  const fullPath = path.join(process.cwd(), relPath);
  if (!fs.existsSync(fullPath)) {
    console.log(`Skipping (not found): ${relPath}`);
    continue;
  }
  let content = fs.readFileSync(fullPath, 'utf8');
  let fileChanges = 0;

  for (const { from, to } of replacements) {
    const matches = content.match(from);
    if (matches) {
      fileChanges += matches.length;
      content = content.replace(from, to);
    }
  }

  // AnalyticsView specific SVG stroke
  if (relPath.includes('AnalyticsView.tsx')) {
    if (content.includes('stroke="#FFFFFF"')) {
      content = content.replace(/stroke="#FFFFFF"/g, 'stroke="var(--surface)"');
      fileChanges++;
    }
  }

  if (fileChanges > 0) {
    fs.writeFileSync(fullPath, content, 'utf8');
    console.log(`✓ ${relPath}: applied ${fileChanges} token replacements`);
    totalReplacements += fileChanges;
  } else {
    console.log(`- ${relPath}: already clean`);
  }
}

console.log(`\nCompleted migration! Total token replacements: ${totalReplacements}`);
