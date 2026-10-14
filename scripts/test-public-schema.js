const { Client } = require('pg');

const projectRef = 'tslnmcvlfehosyjblnpm';
const password = 'V9+x#VW6_WWqKiz';
const encodedPassword = encodeURIComponent(password);
const host = 'aws-0-ap-south-1.pooler.supabase.com';
const uri = `postgresql://postgres.${projectRef}:${encodedPassword}@${host}:5432/postgres`;

async function check() {
  const client = new Client({ connectionString: uri, ssl: { rejectUnauthorized: false } });
  await client.connect();

  // Reset search_path to public
  await client.query("SET search_path TO public;");

  const tables = await client.query("SELECT table_schema, table_name FROM information_schema.tables WHERE table_schema = 'public' ORDER BY table_name;");
  console.log('Total tables in public schema:', tables.rows.length);
  for (const t of tables.rows) {
    console.log('-', t.table_name);
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

  console.log("\nParity verification with search_path = public:");
  const results = [];
  let allMatched = true;

  for (const [table, expected] of Object.entries(expectedCounts)) {
    try {
      const res = await client.query(`SELECT count(*)::int AS count FROM public."${table}";`);
      const actual = res.rows[0].count;
      const matched = actual === expected;
      if (!matched) allMatched = false;
      results.push({
        Entity: table,
        "Source (Fly.io)": expected,
        "Dest (Supabase)": actual,
        Status: matched ? "✅ PASS" : "❌ MISMATCH"
      });
    } catch (err) {
      allMatched = false;
      results.push({
        Entity: table,
        "Source (Fly.io)": expected,
        "Dest (Supabase)": "ERROR",
        Status: `❌ ${err.message}`
      });
    }
  }

  console.table(results);
  if (allMatched) {
    console.log("\n🎉 PERFECT 100% PARITY! Every single table matches production Fly.io exactly!");
  }

  await client.end();
}

check().catch(console.error);
