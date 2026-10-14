const { spawn } = require('child_process');

async function debugAnalyticsLight() {
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
  const sessionToken = setCookie.match(/next-auth\.session-token=([^;]+)/)[1];

  const chromeProc = spawn('C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe', [
    '--headless',
    '--disable-gpu',
    '--remote-debugging-port=9224',
    'about:blank',
  ]);

  await new Promise((r) => setTimeout(r, 2000));

  try {
    const vRes = await fetch('http://127.0.0.1:9224/json/version');
    const version = await vRes.json();
    const ws = new WebSocket(version.webSocketDebuggerUrl);
    await new Promise((res) => (ws.onopen = res));

    let id = 1;
    function send(method, params = {}) {
      return new Promise((res) => {
        const curId = id++;
        const handler = (event) => {
          const data = JSON.parse(event.data);
          if (data.id === curId) {
            ws.removeEventListener('message', handler);
            res(data.result);
          }
        };
        ws.addEventListener('message', handler);
        ws.send(JSON.stringify({ id: curId, method, params }));
      });
    }

    const { targetId } = await send('Target.createTarget', { url: 'about:blank' });
    const { sessionId } = await send('Target.attachToTarget', { targetId, flatten: true });

    function sendPage(method, params = {}) {
      return new Promise((res) => {
        const curId = id++;
        const handler = (event) => {
          const data = JSON.parse(event.data);
          if (data.sessionId === sessionId && data.id === curId) {
            ws.removeEventListener('message', handler);
            res(data.result);
          }
        };
        ws.addEventListener('message', handler);
        ws.send(JSON.stringify({ id: curId, sessionId, method, params }));
      });
    }

    ws.addEventListener('message', (event) => {
      const data = JSON.parse(event.data);
      if (data.method === 'Runtime.consoleAPICalled') {
        console.log('[BROWSER CONSOLE]', data.params.type, data.params.args.map((a) => a.value || a.description).join(' '));
      }
      if (data.method === 'Runtime.exceptionThrown') {
        console.error('[BROWSER EXCEPTION]', data.params.exceptionDetails.text, data.params.exceptionDetails.exception?.description);
      }
    });

    await sendPage('Page.enable');
    await sendPage('Runtime.enable');
    await sendPage('Network.enable');

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

    console.log('Navigating directly to light analytics...');
    await sendPage('Page.navigate', { url: 'http://localhost:3000/app/3cutHLawBmKBbSMl/analytics?theme=light' });

    for (let i = 0; i < 15; i++) {
      await new Promise((r) => setTimeout(r, 2000));
      const evalRes = await sendPage('Runtime.evaluate', {
        expression: `JSON.stringify({
          url: window.location.href,
          pathname: window.location.pathname,
          sessionStorage: Object.keys(sessionStorage).map(k => [k, sessionStorage.getItem(k)]),
          hasAnalyticsLoaded: !!document.querySelector('[data-analytics-loaded="true"]'),
          hasDashboardLoaded: !!document.querySelector('[data-dashboard-loaded="true"]'),
          text: document.body.innerText.slice(0, 200).replace(/\\n/g, ' ')
        })`,
        returnByValue: true,
      });
      console.log(`Poll ${(i + 1) * 2}s:`, evalRes?.result?.value);
      const parsed = JSON.parse(evalRes?.result?.value || '{}');
      if (parsed.hasAnalyticsLoaded) {
        console.log('SUCCESS! Analytics loaded in light mode!');
        break;
      }
    }

    ws.close();
  } finally {
    chromeProc.kill();
  }
}
debugAnalyticsLight().catch(console.error);
