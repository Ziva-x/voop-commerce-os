const { spawn } = require('child_process');
const http = require('http');

async function main() {
  const chromePath = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
  const chromeProc = spawn(chromePath, [
    '--headless',
    '--disable-gpu',
    '--remote-debugging-port=9222',
    '--window-size=1280,800',
    'about:blank'
  ]);

  // Wait 1.5s for port 9222 to be ready
  await new Promise(r => setTimeout(r, 1500));

  try {
    const res = await fetch('http://127.0.0.1:9222/json/version');
    const version = await res.json();
    console.log('Chrome CDP Version:', version);
  } finally {
    chromeProc.kill();
  }
}

main().catch(console.error);
