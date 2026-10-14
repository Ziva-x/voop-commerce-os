const { PrismaClient } = require('../lib/generated/client');
const prisma = new PrismaClient();

// Inline CourierService and ShipmentSyncService logic to test backfill
function detectCourier(trackingCompany, trackingNumber) {
  const comp = (trackingCompany || '').toLowerCase();
  const num = (trackingNumber || '').trim();
  if (comp.includes('delhivery') || /^(\d{12,14}|14\d{10})$/.test(num)) {
    return { code: 'DELHIVERY', displayName: 'Delhivery' };
  }
  if (comp.includes('bluedart') || comp.includes('blue dart')) {
    return { code: 'BLUEDART', displayName: 'Blue Dart' };
  }
  if (comp.includes('xpressbees')) {
    return { code: 'XPRESSBEES', displayName: 'XpressBees' };
  }
  if (comp.includes('ecom') || comp.includes('ecomexpress')) {
    return { code: 'ECOM_EXPRESS', displayName: 'Ecom Express' };
  }
  if (comp.includes('ekart')) {
    return { code: 'EKART', displayName: 'Ekart Logistics' };
  }
  if (comp.includes('shadowfax')) {
    return { code: 'SHADOWFAX', displayName: 'Shadowfax' };
  }
  return { code: 'UNKNOWN', displayName: trackingCompany || 'Other Courier' };
}

async function simulateBackfill() {
  const store = await prisma.shopifyStore.findFirst({ where: { isConnected: true } });
  console.log('Store:', store.shopDomain);

  const orders = await prisma.shopifyOrder.findMany({
    where: { storeId: store.id },
    include: { items: true, fulfillments: true }
  });

  console.log('Total orders:', orders.length);

  let fulfillmentsToCreate = 0;
  let shipmentsToCreate = 0;

  for (const order of orders) {
    let rawFulfillments = [];
    if (order.rawPayload) {
      try {
        const raw = JSON.parse(order.rawPayload);
        if (Array.isArray(raw.fulfillments)) {
          rawFulfillments = raw.fulfillments;
        }
      } catch (e) {}
    }

    for (const f of rawFulfillments) {
      const trackingNumber = f.tracking_number || (Array.isArray(f.tracking_numbers) ? f.tracking_numbers[0] : null);
      const trackingCompany = f.tracking_company || null;
      const trackingUrl = f.tracking_url || (Array.isArray(f.tracking_urls) ? f.tracking_urls[0] : null);

      if (trackingNumber || trackingCompany) {
        fulfillmentsToCreate++;
        if (trackingNumber) {
          shipmentsToCreate++;
        }
      }
    }
  }

  console.log('Fulfillments found across rawPayload:', fulfillmentsToCreate);
  console.log('Shipments with tracking numbers that will be created:', shipmentsToCreate);

  await prisma.$disconnect();
}

simulateBackfill().catch(console.error);
