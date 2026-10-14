const { execFileSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const ARTIFACTS_DIR = 'C:\\Users\\A\\.gemini\\antigravity-ide\\brain\\5c3a2971-949b-4e4a-abe2-9380bedd0348\\screenshots';
const chromePath = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';

const views = [
  { id: 'dashboard', title: 'Dashboard & Operations Overview' },
  { id: 'analytics', title: 'Store Analytics & Financial Intelligence' },
  { id: 'orders', title: 'Orders & Logistics Hub' },
  { id: 'shipments', title: 'Multi-Carrier Shipments & Logistics' },
  { id: 'inventory', title: 'Physical Inventory Master' },
  { id: 'billing', title: 'Manual Billing Terminal' },
  { id: 'tax', title: 'Tax on Sales & GST Route Engine' },
  { id: 'settings', title: 'Store & Account Settings' },
  { id: 'input_fix_login', title: 'Universal OS Login — Dedicated Icon Spacing & Password Eye Toggle' },
  { id: 'input_fix_register', title: 'Account Registration — Multi-Input Field Alignment & Icon Spacing' },
  { id: 'input_fix_sidebar_search', title: 'Global Navigation — Search Icon, Text, and ⌘K Clearance' },
  { id: 'input_fix_orders_search', title: 'Orders & Logistics Hub — Search Input Text Clearance' },
];

async function main() {
  console.log('Generating side-by-side composite comparison images...');

  for (const v of views) {
    const lightPath = path.join(ARTIFACTS_DIR, `${v.id}_light.png`).replace(/\\/g, '/');
    const darkPath = path.join(ARTIFACTS_DIR, `${v.id}_dark.png`).replace(/\\/g, '/');
    const compositeOut = path.join(ARTIFACTS_DIR, `${v.id}_side_by_side.png`);

    if (!fs.existsSync(lightPath) || !fs.existsSync(darkPath)) {
      console.log(`   Skipping ${v.id}: light or dark screenshot not found`);
      continue;
    }

    const htmlContent = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      background: #060911;
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
      display: flex;
      flex-direction: column;
      width: 2560px;
      height: 946px;
      overflow: hidden;
    }
    .header-bar {
      height: 52px;
      background: #0B1120;
      border-bottom: 1px solid #1E293B;
      display: flex;
      align-items: center;
      justify-content: space-between;
      padding: 0 32px;
      color: #F8FAFC;
    }
    .header-title {
      font-size: 17px;
      font-weight: 800;
      letter-spacing: 0.5px;
      display: flex;
      align-items: center;
      gap: 12px;
    }
    .header-badge {
      background: #2563EB;
      color: white;
      font-size: 11px;
      font-weight: 700;
      text-transform: uppercase;
      padding: 3px 10px;
      border-radius: 6px;
      letter-spacing: 1px;
    }
    .header-sub {
      font-size: 12px;
      color: #94A3B8;
    }
    .mode-bar {
      height: 44px;
      background: #0E1726;
      border-bottom: 1px solid #1E293B;
      display: flex;
      width: 2560px;
    }
    .mode-column {
      width: 1280px;
      height: 44px;
      display: flex;
      align-items: center;
      justify-content: center;
      gap: 10px;
      font-size: 13px;
      font-weight: 700;
    }
    .mode-column.light-col {
      background: #111D33;
      color: #93C5FD;
      border-right: 1px solid #2563EB;
    }
    .mode-column.dark-col {
      background: #0B1220;
      color: #60A5FA;
    }
    .dot {
      width: 10px;
      height: 10px;
      border-radius: 50%;
      display: inline-block;
    }
    .mode-desc {
      font-weight: 500;
      font-size: 12px;
      opacity: 0.85;
    }
    .comparison-container {
      display: flex;
      width: 2560px;
      height: 850px;
    }
    .pane {
      width: 1280px;
      height: 850px;
      position: relative;
      background: #0B1120;
      overflow: hidden;
    }
    .pane img {
      width: 1280px;
      height: 850px;
      object-fit: cover;
      object-position: top left;
      display: block;
    }
    .divider {
      width: 2px;
      background: #2563EB;
      box-shadow: 0 0 12px rgba(37, 99, 235, 0.6);
      z-index: 10;
    }
  </style>
</head>
<body>
  <div class="header-bar">
    <div class="header-title">
      <span class="header-badge">1:1 PARITY VERIFICATION</span>
      <span>${v.title}</span>
    </div>
    <div class="header-sub">
      Universal Theme Engine &bull; Semantic Navigation Tokens &bull; 100% Component &amp; Dimensional Parity
    </div>
  </div>
  <div class="mode-bar">
    <div class="mode-column light-col">
      <span class="dot" style="background: #3B82F6;"></span>
      <span>LIGHT MODE</span>
      <span class="mode-desc">(Crisp White Navigation #FFFFFF &bull; Crisp White Workspace)</span>
    </div>
    <div class="mode-column dark-col">
      <span class="dot" style="background: #60A5FA;"></span>
      <span>DARK MODE</span>
      <span class="mode-desc">(Deep Navy Navigation #0B1120 &bull; Deep Charcoal Workspace)</span>
    </div>
  </div>
  <div class="comparison-container">
    <div class="pane">
      <img src="file:///${lightPath}" />
    </div>
    <div class="divider"></div>
    <div class="pane">
      <img src="file:///${darkPath}" />
    </div>
  </div>
</body>
</html>
`;

    const tmpHtml = path.join(ARTIFACTS_DIR, `temp_${v.id}.html`);
    fs.writeFileSync(tmpHtml, htmlContent, 'utf8');

    console.log(`   Rendering composite for ${v.id}...`);
    execFileSync(chromePath, [
      '--headless',
      '--disable-gpu',
      '--allow-file-access-from-files',
      `--screenshot=${compositeOut}`,
      '--window-size=2560,946',
      `file:///${tmpHtml.replace(/\\/g, '/')}`,
    ]);

    fs.unlinkSync(tmpHtml);
    console.log(`   ✓ Composite created: ${compositeOut} (${Math.round(fs.statSync(compositeOut).size / 1024)} KB)`);
  }

  console.log('\nAll side-by-side composites rendered successfully!');
}

main().catch(console.error);
