const fs = require('fs');
const path = require('path');

const targetFile = path.join(__dirname, '../components/views/AnalyticsView.tsx');
let content = fs.readFileSync(targetFile, 'utf8');

// 1. Add useParams import if not present
if (!content.includes('useParams')) {
  content = content.replace(
    'import { useStoreRoute } from "@/lib/routes";',
    'import { useStoreRoute } from "@/lib/routes";\nimport { useParams } from "next/navigation";'
  );
  if (!content.includes('useParams')) {
    content = content.replace(
      'import { RouteGuard } from "@/components/auth/RouteGuard";',
      'import { RouteGuard } from "@/components/auth/RouteGuard";\nimport { useParams } from "next/navigation";'
    );
  }
}

// 2. Update AnalyticsView component signature to accept targetVoopStoreId
content = content.replace(
  'export default function AnalyticsView() {',
  `export default function AnalyticsView({ targetVoopStoreId }: { targetVoopStoreId?: string } = {}) {
  const params = useParams();
  const activeStoreId = targetVoopStoreId || (params?.storeId as string | undefined);`
);

// 3. Update loadAnalytics to pass store context
content = content.replace(
  'let url = `/api/analytics?period=${period}&comparison=${comparison}`;',
  `let url = \`/api/analytics?period=\${period}&comparison=\${comparison}\`;
      if (activeStoreId) {
        url += \`&storeRef=\${encodeURIComponent(activeStoreId)}\`;
      }
      const headers: Record<string, string> = {};
      if (activeStoreId) {
        if (activeStoreId.toUpperCase().startsWith("VOOP-")) {
          headers["x-voop-store-id"] = activeStoreId.toUpperCase();
        } else {
          headers["x-public-store-ref"] = activeStoreId;
        }
      }`
);

content = content.replace(
  'const res = await appFetch(url);',
  'const res = await appFetch(url, { headers });'
);

// 4. Token migrations for bg-white
// bg-white p-5 rounded-2xl border border-[var(--border)] -> bg-[var(--surface)] p-5 rounded-2xl border border-[var(--border)]
content = content.replace(/bg-white p-5 rounded-2xl border border-\[var\(--border\)\]/g, 'bg-[var(--surface)] p-5 rounded-2xl border border-[var(--border)]');

// bg-white hover:bg-[var(--surface-hover)]
content = content.replace(/bg-white hover:bg-\[var\(--surface-hover\)\]/g, 'bg-[var(--surface)] hover:bg-[var(--surface-hover)]');

// Popover: bg-white border border-[var(--border)] rounded-2xl
content = content.replace(/bg-white border border-\[var\(--border\)\] rounded-2xl/g, 'bg-[var(--surface)] border border-[var(--border)] rounded-2xl');

// Dropdown container: bg-white border border-[var(--border)] rounded-xl
content = content.replace(/bg-white border border-\[var\(--border\)\] rounded-xl/g, 'bg-[var(--surface)] border border-[var(--border)] rounded-xl');

// Loading Skeletons
content = content.replace(/<div className="h-28 bg-white border border-\[var\(--border\)\] rounded-2xl" \/>/g, '<div className="h-28 bg-[var(--surface)] border border-[var(--border)] rounded-2xl" />');
content = content.replace(/<div key={i} className="h-24 bg-white border border-\[var\(--border\)\] rounded-2xl" \/>/g, '<div key={i} className="h-24 bg-[var(--surface)] border border-[var(--border)] rounded-2xl" />');
content = content.replace(/<div className="h-72 bg-white border border-\[var\(--border\)\] rounded-2xl" \/>/g, '<div className="h-72 bg-[var(--surface)] border border-[var(--border)] rounded-2xl" />');

// Active tab highlights
content = content.replace(/"bg-white text-\[var\(--text-primary\)\] shadow-2xs"/g, '"bg-[var(--surface)] text-[var(--text-primary)] shadow-2xs"');

// Hover states and remaining
content = content.replace(/hover:bg-white\b/g, 'hover:bg-[var(--surface)]');
content = content.replace(/bg-white\/60/g, 'bg-[var(--surface)]/60');
content = content.replace(/bg-white border/g, 'bg-[var(--surface)] border');
content = content.replace(/bg-white rounded-xl/g, 'bg-[var(--surface)] rounded-xl');
content = content.replace(/bg-white p-4/g, 'bg-[var(--surface)] p-4');
content = content.replace(/bg-white p-5/g, 'bg-[var(--surface)] p-5');

// Slate cleanup
content = content.replace(/bg-slate-100/g, 'bg-[var(--bg-secondary)]');
content = content.replace(/border-slate-200/g, 'border-[var(--border)]');
content = content.replace(/border-slate-700/g, 'border-[var(--border)]');
content = content.replace(/hover:bg-slate-200/g, 'hover:bg-[var(--surface-hover)]');

fs.writeFileSync(targetFile, content, 'utf8');
console.log('✓ Successfully migrated AnalyticsView.tsx tokens and added store scoping!');
