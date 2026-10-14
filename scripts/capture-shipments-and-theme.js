const { spawn } = require('child_process');
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

async function captureShipmentsAndTheme(cdp, sessionToken, mode = 'light') {
  console.log(`\nCapturing Shipments View & Theme Modal in ${mode.toUpperCase()} mode...`);
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
    await sendPage('Runtime.enable');
    await sendPage('Network.enable');

    sendPage('Runtime.evaluate', {
      expression: `
        window.addEventListener('error', e => console.error('PAGE ERROR:', e.message));
        window.addEventListener('unhandledrejection', e => console.error('PROMISE REJECTION:', e.reason));
      `
    });

    await sendPage('Emulation.setDeviceMetricsOverride', {
      width: 1440,
      height: 900,
      deviceScaleFactor: 2,
      mobile: false,
    });

    const initScript = `
      try {
        localStorage.setItem("voop_user_mode", "${mode}");
        localStorage.setItem("voop_user_style", "modern");
        sessionStorage.setItem("voop.tab_mode", "${mode}");
        sessionStorage.setItem("voop.tab_style", "modern");
        sessionStorage.setItem("voop.publicStoreRef", "3cutHLawBmKBbSMl");
        document.documentElement.setAttribute("data-theme", "${mode}");
        document.documentElement.setAttribute("data-mode", "${mode}");
        document.documentElement.setAttribute("data-style", "modern");
        if ("${mode}" === "dark") {
          document.documentElement.classList.add("dark");
          document.documentElement.classList.remove("light");
        } else {
          document.documentElement.classList.remove("dark");
          document.documentElement.classList.add("light");
        }
      } catch (e) {}
    `;
    await sendPage('Page.addScriptToEvaluateOnNewDocument', { source: initScript });

    await sendPage('Network.setCookie', {
      name: 'next-auth.session-token',
      value: sessionToken,
      url: 'http://localhost:3000',
      domain: 'localhost',
      path: '/',
    });

    await sendPage('Network.setCookie', {
      name: 'voop_active_store',
      value: 'cmton0z2a01g264enx5tcmo1y',
      url: 'http://localhost:3000',
      domain: 'localhost',
      path: '/',
    });

    const storeId = '3cutHLawBmKBbSMl';
    await sendPage('Page.navigate', { url: `http://localhost:3000/app/${storeId}/shipments` });

    // Wait for table rows or data to render
    let loaded = false;
    const start = Date.now();
    while (Date.now() - start < 30000) {
      const evalRes = await sendPage('Runtime.evaluate', {
        expression: `(function(){
          const rows = document.querySelectorAll('table tbody tr');
          const skeleton = document.querySelector('.animate-pulse');
          return { rowCount: rows.length, hasSkeleton: !!skeleton };
        })()`,
        returnByValue: true,
      });
      const val = evalRes?.result?.value;
      if (val && val.rowCount > 0 && !val.hasSkeleton) {
        loaded = true;
        console.log(`   ✓ Shipments table rendered ${val.rowCount} rows in ${Date.now() - start}ms`);
        break;
      }
      await new Promise((r) => setTimeout(r, 800));
    }

    if (!loaded) {
      console.log(`   ⚠️ Timeout waiting for shipments table rows, current state will be captured.`);
    }

    // Suppress Next.js dev overlays
    await sendPage('Runtime.evaluate', {
      expression: `
        const s = document.createElement('style');
        s.textContent = 'nextjs-portal, #nextjs__container, [data-nextjs-toast], [data-nextjs-dialog-overlay] { display: none !important; }';
        document.head.appendChild(s);
      `,
    });

    await new Promise((r) => setTimeout(r, 1000));

    // Capture Shipments Table
    const { data: tableData } = await sendPage('Page.captureScreenshot', { format: 'png' });
    const tableFile = path.join(ARTIFACTS_DIR, `shipments_verified_${mode}.png`);
    fs.writeFileSync(tableFile, Buffer.from(tableData, 'base64'));
    console.log(`   ✓ Saved shipments screenshot: ${tableFile}`);

    // Now click the Theme button: button[title="Appearance & Theme"]
    console.log(`   Clicking Theme toggle button...`);
    const clickRes = await sendPage('Runtime.evaluate', {
      expression: `
        (function(){
          const btn = document.querySelector('button[title="Appearance & Theme"]');
          if (btn) {
            btn.click();
            return true;
          }
          const allBtns = Array.from(document.querySelectorAll('button'));
          const themeBtn = allBtns.find(b => b.innerText.includes('Theme'));
          if (themeBtn) {
            themeBtn.click();
            return true;
          }
          return false;
        })()
      `,
      returnByValue: true,
    });
    console.log(`   Theme button clicked:`, clickRes?.result?.value);

    // Wait for bottom sheet to open
    await new Promise((r) => setTimeout(r, 1500));

    // Capture Theme Modal
    const { data: modalData } = await sendPage('Page.captureScreenshot', { format: 'png' });
    const modalFile = path.join(ARTIFACTS_DIR, `theme_modal_verified_${mode}.png`);
    fs.writeFileSync(modalFile, Buffer.from(modalData, 'base64'));
    console.log(`   ✓ Saved theme modal screenshot: ${modalFile}`);

  } finally {
    cdp.ws.removeEventListener('message', listener);
    await cdp.send('Target.closeTarget', { targetId }).catch(() => {});
  }
}

async function main() {
  const sessionToken = await getAuthCookie();
  console.log('Got auth cookie successfully.');

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

    await captureShipmentsAndTheme(cdp, sessionToken, 'light');
    await captureShipmentsAndTheme(cdp, sessionToken, 'dark');

    cdp.close();
  } finally {
    chromeProc.kill();
  }
}

main().catch(console.error);
