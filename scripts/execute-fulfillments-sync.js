const { PrismaClient } = require('../lib/generated/client');
const prisma = new PrismaClient();

const fs = require('fs');
const path = require('path');
const ts = require('typescript');

// Hook TypeScript
require.extensions['.ts'] = function(module, filename) {
  let content = fs.readFileSync(filename, 'utf8');
  content = content.replace(/from\s+["']@\/([^"']+)["']/g, (match, p1) => {
    const rel = path.relative(path.dirname(filename), path.join(__dirname, '..', p1)).replace(/\\/g, '/');
    return `from "${rel.startsWith('.') ? rel : './' + rel}"`;
  }).replace(/require\(["']@\/([^"']+)["']\)/g, (match, p1) => {
    const rel = path.relative(path.dirname(filename), path.join(__dirname, '..', p1)).replace(/\\/g, '/');
    return `require("${rel.startsWith('.') ? rel : './' + rel}")`;
  });

  const transpiled = ts.transpileModule(content, {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2020,
      esModuleInterop: true,
    },
  });
  module._compile(transpiled.outputText, filename);
};

const { ShipmentSyncService } = require('../lib/services/ShipmentSyncService');

async function run() {
  const store = await prisma.shopifyStore.findFirst({ where: { isConnected: true } });
  console.log(`Starting fulfillment & shipment sync for store: ${store.shopDomain} (${store.id})...`);

  const initialFulfillments = await prisma.shopifyFulfillment.count({ where: { storeId: store.id } });
  const initialShipments = await prisma.shipment.count({ where: { storeId: store.id } });
  console.log(`Initial DB State: ${initialFulfillments} shopifyFulfillments, ${initialShipments} shipments`);

  const result = await ShipmentSyncService.syncAllStoreFulfillments(store.id, { fetchFromShopifyApi: true });
  console.log('Sync Result:', result);

  const finalFulfillments = await prisma.shopifyFulfillment.count({ where: { storeId: store.id } });
  const finalShipments = await prisma.shipment.count({ where: { storeId: store.id } });
  console.log(`Final DB State: ${finalFulfillments} shopifyFulfillments, ${finalShipments} shipments`);

  // Check top 10 orders to confirm fulfillments are populated with carrier and AWB
  const orders = await prisma.shopifyOrder.findMany({
    where: { storeId: store.id, fulfillmentStatus: 'FULFILLED' },
    take: 10,
    orderBy: { createdAt: 'desc' },
    include: { fulfillments: true }
  });

  console.log('\n--- SAMPLE FULFILLED ORDERS IN DB ---');
  for (const o of orders) {
    console.log(`Order #${o.orderNumber}: fulfillments count = ${o.fulfillments.length}`);
    for (const f of o.fulfillments) {
      console.log(`   Carrier: ${f.trackingCompany} | AWB: ${f.trackingNumber} | URL: ${f.trackingUrl} | Status: ${f.deliveryStatus}`);
    }
  }

  await prisma.$disconnect();
}

run().catch(console.error);
