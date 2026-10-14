const { PrismaClient } = require('./lib/generated/client');
const prisma = new PrismaClient();

async function main() {
  const store = await prisma.shopifyStore.findFirst({ where: { voopStoreId: 'VOOP-H2GDGBVA' } });
  const shipment = await prisma.shipment.findFirst({
    where: { storeId: store.id, rawTrackingPayload: { not: null } },
  });
  if (shipment && shipment.rawTrackingPayload) {
    const parsed = JSON.parse(shipment.rawTrackingPayload);
    console.log('Shipment raw payload keys:', Object.keys(parsed));
    console.log('Status object:', parsed.Status);
    console.log('Scans (first 3):', (parsed.Scans || []).slice(0, 3));
    console.log('Consignee / Receiver:', {
      Consignee: parsed.Consignee,
      Address: parsed.Address,
      Destination: parsed.Destination,
      Pin: parsed.Pin,
      City: parsed.City,
      State: parsed.State,
      ReferenceNo: parsed.ReferenceNo
    });
  } else {
    console.log('No raw payload found');
  }
}

main().finally(() => prisma.$disconnect());
