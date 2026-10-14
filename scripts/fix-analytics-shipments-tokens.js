const fs = require('fs');
const path = require('path');

const targetFiles = [
  'components/views/AnalyticsView.tsx',
  'components/views/ShipmentsView.tsx',
];

const replacements = [
  { from: /bg-\[#F7F8FA\]/g, to: 'bg-[var(--bg-secondary)]' },
  { from: /hover:bg-\[#F7F8FA\]/g, to: 'hover:bg-[var(--surface-hover)]' },
  { from: /divide-\[#E7E8ED\]/g, to: 'divide-[var(--border)]' },
  { from: /stroke="#E7E8ED"/g, to: 'stroke="var(--border)"' },
  { from: /text-\[#E5484D\]/g, to: 'text-[var(--error)]' },
  { from: /text-\[#16A34A\]/g, to: 'text-[var(--success)]' },
  { from: /bg-\[#989BA7\]/g, to: 'bg-[var(--text-muted)]' },
  { from: /bg-\[#111217\] dark:bg-white/g, to: 'bg-[var(--text-primary)]' },
  { from: /text-\[#E7E8ED\] dark:text-slate-700/g, to: 'text-[var(--border)]' },
  { from: /bg-\[#111217\] text-white/g, to: 'bg-[var(--surface-elevated)] text-[var(--text-primary)] border border-[var(--border)]' },
];

for (const relPath of targetFiles) {
  const fullPath = path.join(process.cwd(), relPath);
  if (!fs.existsSync(fullPath)) continue;
  let content = fs.readFileSync(fullPath, 'utf8');
  let changes = 0;

  for (const { from, to } of replacements) {
    const m = content.match(from);
    if (m) {
      changes += m.length;
      content = content.replace(from, to);
    }
  }

  if (changes > 0) {
    fs.writeFileSync(fullPath, content, 'utf8');
    console.log(`✓ ${relPath}: applied ${changes} additional fixes`);
  }
}
