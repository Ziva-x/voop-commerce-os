const { Client } = require('pg');

const connectionString = process.argv[2] || process.env.DATABASE_URL;

if (!connectionString) {
  console.error("Usage: node verify-parity-remote.js <DATABASE_URL>");
  process.exit(1);
}

const expectedCounts = {
  shopify_stores: 8,
  users: 6,
  shopify_products: 16,
  shopify_variants: 33,
  shopify_orders: 459,
  shopify_order_items: 473,
  shopify_fulfillments: 382,
  shipments: 385,
  shipment_scans: 11419,
  voop_stock_items: 47,
  voop_inventory_ledger: 501,
  shopify_webhook_events: 3333,
  sync_logs: 11342,
};

async function verify() {
  const client = new Client({
    connectionString,
    ssl: connectionString.includes('sslmode=disable') ? false : { rejectUnauthorized: false }
  });

  try {
    await client.connect();
    console.log("✓ Connected to database successfully.");

    const results = [];
    let allMatched = true;

    for (const [table, expected] of Object.entries(expectedCounts)) {
      try {
        const res = await client.query(`SELECT count(*)::int AS count FROM "${table}";`);
        const actual = res.rows[0].count;
        const matched = actual === expected;
        if (!matched) allMatched = false;
        results.push({
          Entity: table,
          Source: expected,
          Destination: actual,
          Status: matched ? "✅ PASS" : "❌ MISMATCH"
        });
      } catch (err) {
        allMatched = false;
        results.push({
          Entity: table,
          Source: expected,
          Destination: "ERROR",
          Status: `❌ ${err.message}`
        });
      }
    }

    console.table(results);

    if (allMatched) {
      console.log("\n🎉 PERFECT PARITY: All 13 tables match production Fly.io exactly!");
    } else {
      console.error("\n⚠️ Verification failed: Some tables do not match expected production counts.");
      process.exit(1);
    }
  } catch (err) {
    console.error("Connection error:", err.message);
    process.exit(1);
  } finally {
    await client.end().catch(() => {});
  }
}

verify();
