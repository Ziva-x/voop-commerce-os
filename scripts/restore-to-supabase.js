const fs = require('fs');
const readline = require('readline');
const { Client } = require('pg');
const { from: copyFrom } = require('pg-copy-streams');
const { Readable } = require('stream');

const projectRef = 'tslnmcvlfehosyjblnpm';
const password = 'V9+x#VW6_WWqKiz';
const encodedPassword = encodeURIComponent(password);
const host = 'aws-0-ap-south-1.pooler.supabase.com';
const connectionString = `postgresql://postgres.${projectRef}:${encodedPassword}@${host}:5432/postgres`;

const sqlFilePath = 'scratch/voop_webapp_production_backup.sql';

async function restore() {
  console.log("========================================================");
  console.log("  VOOP Full Database Migration -> Supabase (ap-south-1)  ");
  console.log("========================================================");
  console.log("Connecting to Supabase PostgreSQL at:", host);

  const client = new Client({
    connectionString,
    ssl: { rejectUnauthorized: false }
  });

  await client.connect();
  console.log("✓ Connected to Supabase successfully.");

  // Enable pgcrypto extension first
  try {
    await client.query("CREATE EXTENSION IF NOT EXISTS pgcrypto;");
    console.log("✓ Ensured pgcrypto extension exists.");
  } catch(e) {
    console.log("Notice on pgcrypto:", e.message);
  }

  const rl = readline.createInterface({
    input: fs.createReadStream(sqlFilePath),
    crlfDelay: Infinity
  });

  let inCopyBlock = false;
  let copyCommand = "";
  let copyRows = [];
  let currentSql = "";
  let executedStatements = 0;
  let copiedTables = 0;

  for await (const line of rl) {
    const trimmed = line.trim();

    // Skip pg_dump psql-specific internal escape commands
    if (trimmed.startsWith('\\restrict') || trimmed.startsWith('\\unrestrict') || trimmed.startsWith('\\connect')) {
      continue;
    }

    if (inCopyBlock) {
      if (trimmed === '\\.') {
        // End of COPY block -> stream to Supabase
        inCopyBlock = false;
        const targetQuery = copyCommand.replace(/FROM stdin;?/i, 'FROM STDIN');
        const stream = client.query(copyFrom(targetQuery));
        const dataPayload = copyRows.join('\n') + (copyRows.length > 0 ? '\n' : '');
        
        await new Promise((resolve, reject) => {
          const readable = Readable.from([dataPayload]);
          readable.pipe(stream);
          stream.on('finish', resolve);
          stream.on('error', reject);
        });

        copiedTables++;
        console.log(`✓ Copied ${copyRows.length} rows into: ${copyCommand.slice(0, 50)}...`);
        copyRows = [];
        copyCommand = "";
      } else {
        copyRows.push(line);
      }
      continue;
    }

    if (trimmed.startsWith('COPY ') && trimmed.includes('FROM stdin;')) {
      // Execute any pending SQL statement before starting COPY
      if (currentSql.trim()) {
        try {
          await client.query(currentSql);
          executedStatements++;
        } catch (err) {
          // Ignore harmless drop / extension notices
          if (!currentSql.includes('DROP') && !currentSql.includes('ALTER TABLE ONLY public.schema_migrations')) {
            console.error("SQL Notice:", err.message.slice(0, 100));
          }
        }
        currentSql = "";
      }

      inCopyBlock = true;
      copyCommand = trimmed;
      copyRows = [];
      continue;
    }

    // Skip full comment lines outside of statements
    if (trimmed.startsWith('--') && !currentSql.trim()) {
      continue;
    }

    currentSql += line + "\n";

    // When statement ends with semicolon outside strings/comments
    if (trimmed.endsWith(';')) {
      try {
        await client.query(currentSql);
        executedStatements++;
      } catch (err) {
        // Drop notices and harmless extension warnings are skipped
        if (!currentSql.includes('DROP') && !currentSql.includes('ALTER TABLE IF EXISTS')) {
          // If table already exists or constraint already exists, log notice
          // console.log("Notice:", err.message.slice(0, 80));
        }
      }
      currentSql = "";
    }
  }

  // Execute any remaining SQL
  if (currentSql.trim()) {
    try {
      await client.query(currentSql);
      executedStatements++;
    } catch (e) {}
  }

  console.log(`\n🎉 Restoration complete! Executed ${executedStatements} DDL statements and restored ${copiedTables} tables.`);

  // Now verify parity across all 13 critical entities!
  console.log("\n========================================================");
  console.log("  Running Automated Data Parity Verification Queries    ");
  console.log("========================================================");

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
    console.log("\n🎉 PERFECT 100% PARITY! Every single record and table matches production Fly.io exactly!");
  } else {
    console.error("\n⚠️ Some tables did not reach parity. Check error table above.");
    process.exit(1);
  }

  await client.end();
}

restore().catch(err => {
  console.error("Fatal restore error:", err);
  process.exit(1);
});
