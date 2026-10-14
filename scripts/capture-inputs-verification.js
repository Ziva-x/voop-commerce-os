const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');

const ARTIFACTS_DIR = 'C:\\Users\\A\\.gemini\\antigravity-ide\\brain\\5c3a2971-949b-4e4a-abe2-9380bedd0348\\screenshots';
const chromePath = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';

if (!fs.existsSync(ARTIFACTS_DIR)) {
  fs.mkdirSync(ARTIFACTS_DIR, { recursive: true });
}

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

async function capturePage(cdp, sessionToken, route, mode, outName, actions = null) {
  const targetUrl = `http://localhost:3000${route}?theme=${mode}`;
  console.log(`\nCapturing [${mode.toUpperCase()}] ${outName}: ${targetUrl}`);

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

    if (sessionToken) {
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
    }

    await sendPage('Page.navigate', { url: targetUrl });
    await new Promise((r) => setTimeout(r, 2000));

    if (actions) {
      await actions(sendPage);
      await new Promise((r) => setTimeout(r, 800));
    }

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
    '--remote-debugging-port=9226',
    'about:blank',
  ]);

  await new Promise((r) => setTimeout(r, 2000));

  try {
    const vRes = await fetch('http://127.0.0.1:9226/json/version');
    const version = await vRes.json();
    const cdp = new CDPClient(version.webSocketDebuggerUrl);
    await cdp.waitOpen();

    const storeId = '3cutHLawBmKBbSMl';

    // 1. LOGIN PAGE: Populate Email & Password to show zero overlap with Mail & Lock/Eye icons
    const fillLogin = async (sendPage) => {
      await sendPage('Runtime.evaluate', {
        expression: `
          const emailInput = document.getElementById('email') || document.querySelector('input[type="text"], input[type="email"]');
          if (emailInput) {
            emailInput.value = 'operations@monkeygarage.com';
            emailInput.dispatchEvent(new Event('input', { bubbles: true }));
          }
          const passInput = document.getElementById('password') || document.querySelector('input[type="password"]');
          if (passInput) {
            passInput.value = 'SuperSecret2026!';
            passInput.dispatchEvent(new Event('input', { bubbles: true }));
          }
        `,
      });
    };

    await capturePage(cdp, null, '/login', 'light', 'input_fix_login', fillLogin);
    await capturePage(cdp, null, '/login', 'dark', 'input_fix_login', fillLogin);

    // 2. REGISTER PAGE: Populate Full Name, Username (@), Email, Password, Company, Phone
    const fillRegister = async (sendPage) => {
      await sendPage('Runtime.evaluate', {
        expression: `
          const setVal = (name, val) => {
            const el = document.querySelector(\`input[name="\${name}"]\`);
            if (el) {
              el.value = val;
              el.dispatchEvent(new Event('input', { bubbles: true }));
            }
          };
          setVal('name', 'Vikram Malhotra');
          setVal('username', 'vikram_m');
          setVal('email', 'vikram@monkeygarage.com');
          setVal('password', 'SecurePass99#');
          setVal('companyName', 'Monkey Garage Logistics Ltd');
          setVal('contactNo', '+91 98765 43210');
        `,
      });
    };

    await capturePage(cdp, null, '/register', 'light', 'input_fix_register', fillRegister);
    await capturePage(cdp, null, '/register', 'dark', 'input_fix_register', fillRegister);

    // 3. ONBOARDING PAGE: Account mode
    const fillOnboarding = async (sendPage) => {
      await sendPage('Runtime.evaluate', {
        expression: `
          const setVal = (name, val) => {
            const el = document.querySelector(\`input[name="\${name}"]\`);
            if (el) {
              el.value = val;
              el.dispatchEvent(new Event('input', { bubbles: true }));
            }
          };
          setVal('name', 'Karan Johar');
          setVal('contactNo', '+91 91234 56789');
          setVal('companyName', 'Dharma Retail');
          setVal('email', 'karan@dharma.com');
          setVal('password', 'Dharma2026!');
        `,
      });
    };

    await capturePage(cdp, null, '/onboarding', 'light', 'input_fix_onboarding', fillOnboarding);
    await capturePage(cdp, null, '/onboarding', 'dark', 'input_fix_onboarding', fillOnboarding);

    // 4. DASHBOARD SIDEBAR: Search input filled with "Inventory"
    const fillSidebar = async (sendPage) => {
      await sendPage('Runtime.evaluate', {
        expression: `
          const searchInput = document.querySelector('input[placeholder="Search menu..."]');
          if (searchInput) {
            searchInput.value = 'Inventory Tracking';
            searchInput.dispatchEvent(new Event('input', { bubbles: true }));
          }
        `,
      });
    };

    await capturePage(cdp, sessionToken, `/app/${storeId}`, 'light', 'input_fix_sidebar_search', fillSidebar);
    await capturePage(cdp, sessionToken, `/app/${storeId}`, 'dark', 'input_fix_sidebar_search', fillSidebar);

    // 5. ORDERS VIEW: Search input filled with search query
    const fillOrders = async (sendPage) => {
      await sendPage('Runtime.evaluate', {
        expression: `
          const searchInput = document.querySelector('input[placeholder*="Search order"]');
          if (searchInput) {
            searchInput.value = 'DEL-99210-MG';
            searchInput.dispatchEvent(new Event('input', { bubbles: true }));
          }
        `,
      });
    };

    await capturePage(cdp, sessionToken, `/app/${storeId}/orders`, 'light', 'input_fix_orders_search', fillOrders);
    await capturePage(cdp, sessionToken, `/app/${storeId}/orders`, 'dark', 'input_fix_orders_search', fillOrders);

    cdp.close();
    console.log('\n✓ All input verification screenshots successfully captured!');
  } finally {
    chromeProc.kill();
  }
}

main().catch(console.error);
