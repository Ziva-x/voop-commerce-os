const { createServer } = require("http");
const { parse } = require("url");
const next = require("next");

const dev = process.env.NODE_ENV !== "production";
const hostname = "localhost";
const port = parseInt(process.env.PORT || "3000", 10);
const app = next({ dev, hostname, port });
const handle = app.getRequestHandler();

app.prepare().then(() => {
  createServer(async (req, res) => {
    try {
      // Clean Shopify double-slash: //? -> /?
      if (req.url && req.url.startsWith("//")) {
        req.url = req.url.replace(/^\/+/, "/");
      }
      const parsedUrl = parse(req.url, true);
      await handle(req, res, parsedUrl);
    } catch (err) {
      console.error("Error occurred handling", req.url, err);
      res.statusCode = 500;
      res.end("internal server error");
    }
  }).listen(port, () => {
    console.log(`> Ready on http://${hostname}:${port}`);
    // Trigger auto-sync daemon warmup on boot
    setTimeout(() => {
      fetch(`http://localhost:${port}/api/cron/sync`).catch(() => {});
    }, 2000);
  });
});
