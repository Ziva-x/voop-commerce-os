const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');

const ARTIFACTS_DIR = 'C:\\Users\\A\\.gemini\\antigravity-ide\\brain\\5c3a2971-949b-4e4a-abe2-9380bedd0348\\screenshots';
if (!fs.existsSync(ARTIFACTS_DIR)) {
  fs.mkdirSync(ARTIFACTS_DIR, { recursive: true });
}

// 1. Get auth session cookie
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
  if (!match) {
    throw new Error('Failed to get session token from login: ' + setCookie);
  }
  return match[1];
}

// 2. Simple CDP Client using native WebSocket
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

async function main() {
  console.log('1. Authenticating with local server...');
  const sessionToken = await getAuthCookie();
  console.log('   Authenticated successfully.');

  console.log('2. Launching Chrome with remote debugging...');
  const chromePath = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
  const chromeProc = spawn(chromePath, [
    '--headless',
    '--disable-gpu',
    '--remote-debugging-port=9222',
    '--window-size=1280,850',
    'about:blank',
  ]);

  await new Promise((r) => setTimeout(r, 2000));

  try {
    const vRes = await fetch('http://127.0.0.1:9222/json/version');
    const version = await vRes.json();
    const wsUrl = version.webSocketDebuggerUrl;

    console.log('3. Connecting to Chrome via CDP...');
    const cdp = new CDPClient(wsUrl);
    await cdp.waitOpen();

    // Create a new target/page
    const { targetId } = await cdp.send('Target.createTarget', { url: 'about:blank' });
    const { sessionId } = await cdp.send('Target.attachToTarget', { targetId, flatten: true });

    let pageMsgId = 100;
    const pageCallbacks = new Map();
    cdp.ws.onmessage = (event) => {
      const data = JSON.parse(event.data);
      if (data.sessionId === sessionId && data.id && pageCallbacks.has(data.id)) {
        const { resolve, reject } = pageCallbacks.get(data.id);
        pageCallbacks.delete(data.id);
        if (data.error) reject(data.error);
        else resolve(data.result);
      }
    };

    function sendPage(method, params = {}) {
      const id = pageMsgId++;
      return new Promise((resolve, reject) => {
        pageCallbacks.set(id, { resolve, reject });
        cdp.ws.send(JSON.stringify({ id, sessionId, method, params }));
      });
    }

    await sendPage('Page.enable');
    await sendPage('Network.enable');
    await sendPage('Emulation.setDeviceMetricsOverride', {
      width: 1280,
      height: 850,
      deviceScaleFactor: 1,
      mobile: false,
    });

    // Set auth cookie for localhost
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

    console.log('4. Capturing side-by-side screenshots for major views...');

    const storeId = '3cutHLawBmKBbSMl';
    const views = [
      { name: 'dashboard', route: `/app/${storeId}` },
      { name: 'orders', route: `/app/${storeId}/orders` },
      { name: 'shipments', route: `/app/${storeId}/shipments` },
      { name: 'analytics', route: `/app/${storeId}/analytics` },
      { name: 'inventory', route: `/app/${storeId}/inventory` },
      { name: 'billing', route: `/app/${storeId}/billing` },
      { name: 'tax', route: `/app/${storeId}/tax` },
      { name: 'settings', route: `/app/${storeId}/settings` },
    ];

    for (const v of views) {
      for (const mode of ['light', 'dark']) {
        const targetUrl = `http://localhost:3000${v.route}?theme=${mode}`;
        console.log(`   Navigating to [${mode.toUpperCase()}] ${v.name}: ${targetUrl}`);

        await sendPage('Page.navigate', { url: targetUrl });
        // Wait for page data & charts to hydrate (longer for analytics)
        const waitMs = v.name === 'analytics' ? 7000 : 4500;
        await new Promise((r) => setTimeout(r, waitMs));

        // Suppress Next.js dev overlays/toasts if present
        await sendPage('Runtime.evaluate', {
          expression: `
            const s = document.createElement('style');
            s.textContent = 'nextjs-portal, #nextjs__container, [data-nextjs-toast], [data-nextjs-dialog-overlay] { display: none !important; }';
            document.head.appendChild(s);
          `,
        });

        await new Promise((r) => setTimeout(r, 500));

        const { data } = await sendPage('Page.captureScreenshot', { format: 'png' });
        const outFile = path.join(ARTIFACTS_DIR, `${v.name}_${mode}.png`);
        fs.writeFileSync(outFile, Buffer.from(data, 'base64'));
        console.log(`   ✓ Saved: ${outFile} (${Math.round(data.length / 1024)} KB)`);
      }
    }

    console.log('\nAll screenshots captured successfully!');
    cdp.close();
  } finally {
    chromeProc.kill();
  }
}

main().catch(console.error);
