const { PrismaClient } = require('../lib/generated/client');
const prisma = new PrismaClient();

async function check() {
  const store = await prisma.shopifyStore.findFirst();
  const delhivery = await prisma.delhiveryConfig.findFirst({ where: { storeId: store.id } });
  const company = await prisma.storeSetting.findFirst({ where: { storeId: store.id } });
  const fulfillment = await prisma.shopifyFulfillment.findFirst({
    where: { storeId: store.id },
    include: { order: true }
  });
  const shipment = await prisma.shipment.findFirst({
    where: { storeId: store.id }
  });

  console.log('--- DELHIVERY CONFIG ---');
  console.log(delhivery);

  console.log('--- COMPANY / STORE SETTING ---');
  console.log(company);

  console.log('--- SHIPMENT SAMPLE ---');
  console.log(shipment ? {
    awb: shipment.awb,
    orderNumber: shipment.orderNumber,
    date: shipment.date,
    pickupDate: shipment.pickupDate,
    statusLocation: shipment.statusLocation,
    createdAt: shipment.createdAt
  } : null);

  console.log('--- FULFILLMENT & ORDER SAMPLE ---');
  console.log(fulfillment ? {
    trackingNumber: fulfillment.trackingNumber,
    createdAt: fulfillment.createdAt,
    pickupDate: fulfillment.pickupDate,
    orderNumber: fulfillment.order?.orderNumber,
    orderCreatedAt: fulfillment.order?.createdAt,
    orderProcessedAt: fulfillment.order?.processedAt,
    shippingAddress: fulfillment.order?.shippingAddress
  } : null);

  // Let's also check if rawTrackingPayload on shipment has origin/destination info!
  const shipmentWithPayload = await prisma.shipment.findFirst({
    where: { storeId: store.id, rawTrackingPayload: { not: null } }
  });
  if (shipmentWithPayload && shipmentWithPayload.rawTrackingPayload) {
    try {
      const parsed = JSON.parse(shipmentWithPayload.rawTrackingPayload);
      console.log('--- RAW TRACKING PAYLOAD SAMPLE ---');
      console.log('origin / destination fields:', {
        origin: parsed.origin || parsed.origin_city || parsed.pickup_location || parsed.ShipmentData?.[0]?.Shipment?.Origin,
        destination: parsed.destination || parsed.destination_city || parsed.ShipmentData?.[0]?.Shipment?.Destination,
        pickupdate: parsed.ShipmentData?.[0]?.Shipment?.PickUpDate,
        status: parsed.ShipmentData?.[0]?.Shipment?.Status
      });
    } catch (e) {
      console.log('Failed to parse rawTrackingPayload');
    }
  }

  // Also check rawPayload of ShopifyOrder
  const orderSample = await prisma.shopifyOrder.findFirst({
    where: { storeId: store.id, rawPayload: { not: null } }
  });
  if (orderSample && orderSample.rawPayload) {
    try {
      const parsed = JSON.parse(orderSample.rawPayload);
      console.log('--- SHOPIFY ORDER SAMPLE ---');
      console.log('shipping_address:', parsed.shipping_address);
      console.log('billing_address:', parsed.billing_address);
      console.log('fulfillments:', parsed.fulfillments?.map(f => ({
        id: f.id,
        created_at: f.created_at,
        updated_at: f.updated_at,
        location_id: f.location_id,
        tracking_company: f.tracking_company,
        tracking_number: f.tracking_number,
        origin_address: f.origin_address
      })));
    } catch (e) {
      console.log('Failed to parse order rawPayload');
    }
  }
}

check()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
