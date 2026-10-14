const { spawn, execFileSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const ARTIFACTS_DIR = 'C:\\Users\\A\\.gemini\\antigravity-ide\\brain\\5c3a2971-949b-4e4a-abe2-9380bedd0348\\screenshots';
const chromePath = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';

async function getAuthCookie() {
  const csrfRes = await fetch('http://localhost:3000/api/auth/csrf');
  const csrfData = await csrfRes.json();
  const csrfCookie = csrfRes.headers.get('set-cookie');

  const loginRes = await fetch('http://localhost:3000/api/auth/callback/credentials', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      'Cookie': csrfCookie,
    },
    body: new URLSearchParams({
      csrfToken: csrfData.csrfToken,
      email: 'admin',
      password: 'admin',
      redirect: 'false',
    }),
    redirect: 'manual',
  });

  const setCookie = loginRes.headers.get('set-cookie');
  const match = setCookie && setCookie.match(/next-auth\.session-token=([^;]+)/);
  if (!match) throw new Error('No session token');
  return match[1];
}

class CDPClient {
  constructor(wsUrl) {
    this.ws = new WebSocket(wsUrl);
    this.msgId = 1;
    this.callbacks = new Map();
    this.ws.onmessage = (event) => {
      const data = JSON.parse(event.data);
      if (data.id && this.callbacks.has(data.id)) {
        const { resolve, reject } = this.callbacks.get(data.id);
        this.callbacks.delete(data.id);
        if (data.error) reject(data.error);
        else resolve(data.result);
      }
    };
  }

  waitOpen() {
    if (this.ws.readyState === WebSocket.OPEN) return Promise.resolve();
    return new Promise((resolve) => {
      this.ws.onopen = () => resolve();
    });
  }

  send(method, params = {}) {
    const id = this.msgId++;
    return new Promise((resolve, reject) => {
      this.callbacks.set(id, { resolve, reject });
      this.ws.send(JSON.stringify({ id, method, params }));
    });
  }

  close() {
    this.ws.close();
  }
}

async function captureSingle(cdp, sessionToken, route, mode, waitSelector, maxWaitMs, outName) {
  const targetUrl = `http://localhost:3000${route}?theme=${mode}`;
  console.log(`\nCapturing [${mode.toUpperCase()}] ${outName}: ${targetUrl}`);

  // Create a brand new clean target
  const { targetId } = await cdp.send('Target.createTarget', { url: 'about:blank' });
  const { sessionId } = await cdp.send('Target.attachToTarget', { targetId, flatten: true });

  let pageMsgId = 1;
  const pageCallbacks = new Map();
  const listener = (event) => {
    const data = JSON.parse(event.data);
    if (data.sessionId === sessionId && data.id && pageCallbacks.has(data.id)) {
      const { resolve, reject } = pageCallbacks.get(data.id);
      pageCallbacks.delete(data.id);
      if (data.error) reject(data.error);
      else resolve(data.result);
    }
  };
  cdp.ws.addEventListener('message', listener);

  function sendPage(method, params = {}) {
    const id = pageMsgId++;
    return new Promise((resolve, reject) => {
      pageCallbacks.set(id, { resolve, reject });
      cdp.ws.send(JSON.stringify({ id, sessionId, method, params }));
    });
  }

  try {
    await sendPage('Page.enable');
    await sendPage('Network.enable');
    await sendPage('Runtime.enable');

    await sendPage('Emulation.setDeviceMetricsOverride', {
      width: 1280,
      height: 850,
      deviceScaleFactor: 1,
      mobile: false,
    });

    // Set auth cookie
    await sendPage('Network.setCookie', {
      name: 'next-auth.session-token',
      value: sessionToken,
      url: 'http://localhost:3000',
      domain: 'localhost',
      path: '/',
      httpOnly: true,
      sameSite: 'Lax',
    });

    await sendPage('Network.setCookie', {
      name: 'voop_active_store',
      value: 'cmton0z2a01g264enx5tcmo1y',
      url: 'http://localhost:3000',
      domain: 'localhost',
      path: '/',
    });

    await sendPage('Page.navigate', { url: targetUrl });

    const startTime = Date.now();
    let loaded = false;

    while (Date.now() - startTime < maxWaitMs) {
      const evalResult = await sendPage('Runtime.evaluate', {
        expression: `!!document.querySelector('${waitSelector}')`,
        returnByValue: true,
      });

      if (evalResult?.result?.value === true) {
        loaded = true;
        console.log(`   ✓ Found ${waitSelector} after ${Date.now() - startTime} ms`);
        break;
      }

      // Check text
      const progressRes = await sendPage('Runtime.evaluate', {
        expression: `document.body ? document.body.innerText.slice(0, 120).replace(/\\n/g, ' ') : ''`,
        returnByValue: true,
      });
      const text = progressRes?.result?.value || '';
      if ((Date.now() - startTime) % 5000 < 700) {
        console.log(`   [Waiting ${Math.round((Date.now() - startTime) / 1000)}s]: ${text.slice(0, 60)}...`);
      }

      await new Promise((r) => setTimeout(r, 600));
    }

    if (!loaded) {
      console.warn(`   ⚠️ Timeout waiting for ${waitSelector}, capturing current state...`);
    }

    // Wait 2000ms for charts to stabilize
    await new Promise((r) => setTimeout(r, 2000));

    // Suppress dev toasts
    await sendPage('Runtime.evaluate', {
      expression: `
        const s = document.createElement('style');
        s.textContent = 'nextjs-portal, #nextjs__container, [data-nextjs-toast], [data-nextjs-dialog-overlay] { display: none !important; }';
        document.head.appendChild(s);
      `,
    });

    const { data } = await sendPage('Page.captureScreenshot', { format: 'png' });
    const outFile = path.join(ARTIFACTS_DIR, `${outName}_${mode}.png`);
    fs.writeFileSync(outFile, Buffer.from(data, 'base64'));
    console.log(`   ✓ Saved: ${outFile} (${Math.round(data.length / 1024)} KB)`);
  } finally {
    cdp.ws.removeEventListener('message', listener);
    await cdp.send('Target.closeTarget', { targetId }).catch(() => {});
  }
}

async function main() {
  console.log('1. Authenticating...');
  const sessionToken = await getAuthCookie();

  console.log('2. Launching Chrome...');
  const chromeProc = spawn(chromePath, [
    '--headless',
    '--disable-gpu',
    '--remote-debugging-port=9225',
    'about:blank',
  ]);

  await new Promise((r) => setTimeout(r, 2000));

  try {
    const vRes = await fetch('http://127.0.0.1:9225/json/version');
    const version = await vRes.json();
    const cdp = new CDPClient(version.webSocketDebuggerUrl);
    await cdp.waitOpen();

    const storeId = '3cutHLawBmKBbSMl';

    // Warm up analytics API
    console.log('3. Warming up analytics API...');
    try {
      await fetch(`http://localhost:3000/api/analytics?period=30d&storeRef=${storeId}`, {
        headers: {
          Cookie: `next-auth.session-token=${sessionToken}; voop_active_store=cmton0z2a01g264enx5tcmo1y`,
          'x-public-store-ref': storeId,
        },
      });
      console.log('   ✓ Analytics API warm.');
    } catch (_e) {}

    // Dashboard
    await captureSingle(cdp, sessionToken, `/app/${storeId}`, 'light', '[data-dashboard-loaded="true"]', 20000, 'dashboard');
    await captureSingle(cdp, sessionToken, `/app/${storeId}`, 'dark', '[data-dashboard-loaded="true"]', 20000, 'dashboard');

    // Analytics
    await captureSingle(cdp, sessionToken, `/app/${storeId}/analytics`, 'light', '[data-analytics-loaded="true"]', 60000, 'analytics');
    await captureSingle(cdp, sessionToken, `/app/${storeId}/analytics`, 'dark', '[data-analytics-loaded="true"]', 60000, 'analytics');

    // Settings (Shopify Store Details)
    await captureSingle(cdp, sessionToken, `/app/${storeId}/settings/shopify`, 'light', 'h2', 20000, 'settings');
    await captureSingle(cdp, sessionToken, `/app/${storeId}/settings/shopify`, 'dark', 'h2', 20000, 'settings');

    // Shipments & Couriers
    await captureSingle(cdp, sessionToken, `/app/${storeId}/shipments`, 'light', 'table, .glass-panel', 20000, 'shipments');
    await captureSingle(cdp, sessionToken, `/app/${storeId}/shipments`, 'dark', 'table, .glass-panel', 20000, 'shipments');

    cdp.close();

    console.log('\n4. Rendering side-by-side composites...');
    execFileSync('node', ['scripts/render-side-by-side-composites.js'], { cwd: process.cwd(), stdio: 'inherit' });
  } finally {
    chromeProc.kill();
  }
}

main().catch(console.error);
