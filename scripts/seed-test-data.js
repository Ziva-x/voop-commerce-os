const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
  console.log('Seeding VOOP Shopify Sync initial data and test cases...');

  // 1. Create or update connected Shopify Store
  const store = await prisma.shopifyStore.upsert({
    where: { shopDomain: 'monkey-garage.myshopify.com' },
    create: {
      shopDomain: 'monkey-garage.myshopify.com',
      accessToken: 'shpat_test_mock_token_for_verification',
      storeName: 'MonkeyGarage Official',
      email: 'adithziva12@gmail.com',
      currency: 'INR',
      isConnected: true,
      lastProductSyncAt: new Date(),
      lastOrderSyncAt: new Date(),
      lastFullSyncAt: new Date(),
    },
    update: {
      storeName: 'MonkeyGarage Official',
      isConnected: true,
      lastProductSyncAt: new Date(),
      lastOrderSyncAt: new Date(),
      lastFullSyncAt: new Date(),
    },
  });

  // 2. Create Test Product: "Foam Sprayer"
  const product = await prisma.shopifyProduct.upsert({
    where: {
      storeId_shopifyProductId: {
        storeId: store.id,
        shopifyProductId: '12345',
      },
    },
    create: {
      storeId: store.id,
      shopifyProductId: '12345',
      title: 'Foam Sprayer',
      handle: 'foam-sprayer',
      productType: 'Auto Care',
      vendor: 'MonkeyGarage',
      status: 'ACTIVE',
      tags: 'sprayer, foam, wash',
    },
    update: {
      title: 'Foam Sprayer',
      handle: 'foam-sprayer',
      status: 'ACTIVE',
    },
  });

  // 3. Create Variants: FS, FSL, FSLG (with exact Variant ID: 84739203)
  const variants = [
    {
      shopifyVariantId: '84739201',
      title: 'Foam Sprayer Only',
      sku: 'FS',
      price: 399.0,
      inventoryItemId: 'inv_84739201',
    },
    {
      shopifyVariantId: '84739202',
      title: 'Foam Sprayer + Liquid',
      sku: 'FSL',
      price: 499.0,
      inventoryItemId: 'inv_84739202',
    },
    {
      shopifyVariantId: '84739203', // CRITICAL TEST VARIANT ID
      title: 'Foam Sprayer + Liquid + Glove',
      sku: 'FSLG',
      price: 599.0,
      inventoryItemId: 'inv_84739203',
    },
  ];

  for (const v of variants) {
    await prisma.shopifyVariant.upsert({
      where: {
        storeId_shopifyVariantId: {
          storeId: store.id,
          shopifyVariantId: v.shopifyVariantId,
        },
      },
      create: {
        storeId: store.id,
        productId: product.id,
        shopifyProductId: product.shopifyProductId,
        shopifyVariantId: v.shopifyVariantId,
        title: v.title,
        sku: v.sku,
        price: v.price,
        inventoryItemId: v.inventoryItemId,
      },
      update: {
        productId: product.id,
        shopifyProductId: product.shopifyProductId,
        title: v.title,
        sku: v.sku,
        price: v.price,
        inventoryItemId: v.inventoryItemId,
      },
    });
  }

  // 4. Create Test Order: #10542 with 2× FSLG
  const order = await prisma.shopifyOrder.upsert({
    where: {
      storeId_shopifyOrderId: {
        storeId: store.id,
        shopifyOrderId: '987654',
      },
    },
    create: {
      storeId: store.id,
      shopifyOrderId: '987654',
      orderNumber: '10542',
      name: '#10542',
      email: 'customer@example.com',
      phone: '+919876543210',
      currency: 'INR',
      totalPrice: 1198.0,
      subtotalPrice: 1198.0,
      totalDiscounts: 0.0,
      totalTax: 0.0,
      financialStatus: 'PAID',
      fulfillmentStatus: 'FULFILLED',
      processedAt: new Date(),
      shippingAddress: JSON.stringify({
        name: 'Rahul Sharma',
        address1: '123 Main Road',
        city: 'Bengaluru',
        province: 'Karnataka',
        zip: '560001',
        country: 'India',
      }),
    },
    update: {
      orderNumber: '10542',
      name: '#10542',
      totalPrice: 1198.0,
      financialStatus: 'PAID',
      fulfillmentStatus: 'FULFILLED',
    },
  });

  // 5. Create Line Item: 2× FSLG with Variant ID 84739203
  await prisma.shopifyOrderItem.upsert({
    where: {
      orderId_shopifyLineItemId: {
        orderId: order.id,
        shopifyLineItemId: '123456',
      },
    },
    create: {
      storeId: store.id,
      orderId: order.id,
      shopifyOrderId: order.shopifyOrderId,
      shopifyLineItemId: '123456',
      shopifyProductId: '12345',
      shopifyVariantId: '84739203', // CRITICAL: Variant ID for BOM
      productTitle: 'Foam Sprayer',
      variantTitle: 'Foam Sprayer + Liquid + Glove',
      sku: 'FSLG',
      quantity: 2,
      unitPrice: 599.0,
      discountTotal: 0.0,
      totalPrice: 1198.0,
    },
    update: {
      shopifyVariantId: '84739203',
      sku: 'FSLG',
      quantity: 2,
      unitPrice: 599.0,
      totalPrice: 1198.0,
    },
  });

  // 6. Create Fulfillment record (Delhivery Tracking)
  await prisma.shopifyFulfillment.upsert({
    where: {
      orderId_shopifyFulfillmentId: {
        orderId: order.id,
        shopifyFulfillmentId: 'ful_987654_1',
      },
    },
    create: {
      storeId: store.id,
      orderId: order.id,
      shopifyOrderId: order.shopifyOrderId,
      shopifyFulfillmentId: 'ful_987654_1',
      status: 'SUCCESS',
      trackingCompany: 'Delhivery',
      trackingNumber: 'AWB984712049',
      trackingUrl: 'https://www.delhivery.com/track/package/AWB984712049',
    },
    update: {
      status: 'SUCCESS',
      trackingCompany: 'Delhivery',
      trackingNumber: 'AWB984712049',
    },
  });

  // 7. Create Sync Log sample
  await prisma.syncLog.create({
    data: {
      storeId: store.id,
      type: 'FULL_SYNC',
      status: 'SUCCESS',
      recordsCount: 4,
      durationMs: 1240,
      details: 'Initial seed synchronization completed successfully.',
      completedAt: new Date(),
    },
  });

  console.log('Seed completed successfully!');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
