const { PrismaClient } = require('../lib/generated/client');
const prisma = new PrismaClient();

async function main() {
  const order = await prisma.shopifyOrder.findFirst({
    where: {
      OR: [
        { orderNumber: '1926' },
        { orderNumber: '#1926' },
        { orderNumber: '#2026-1926' },
        { shopifyOrderNumber: '1926' },
        { name: '#2026-1926' },
        { name: '#1926' }
      ]
    },
    include: {
      items: true
    }
  });

  if (!order) {
    console.log('Order not found');
    return;
  }

  console.log('Order found:');
  console.log('ID:', order.id);
  console.log('OrderNumber:', order.orderNumber, 'Name:', order.name, 'ShopifyOrderNumber:', order.shopifyOrderNumber);
  console.log('totalPrice:', order.totalPrice, 'subtotalPrice:', order.subtotalPrice, 'totalDiscounts:', order.totalDiscounts, 'totalTax:', order.totalTax);
  console.log('Items count:', order.items.length);
  for (const item of order.items) {
    console.log('Item:', item.productTitle, 'SKU:', item.sku, 'Qty:', item.quantity, 'UnitPrice:', item.unitPrice, 'DiscountTotal:', item.discountTotal, 'TotalPrice:', item.totalPrice);
    if (item.rawPayload) {
      try {
        const raw = JSON.parse(item.rawPayload);
        console.log('Item rawPayload.price:', raw.price, 'total_discount:', raw.total_discount, 'discount_allocations:', JSON.stringify(raw.discount_allocations));
      } catch (e) {
        console.log('Could not parse rawPayload');
      }
    }
  }

  if (order.rawPayload) {
    try {
      const oRaw = JSON.parse(order.rawPayload);
      console.log('Order discount_codes:', JSON.stringify(oRaw.discount_codes));
      console.log('Order discount_applications:', JSON.stringify(oRaw.discount_applications));
    } catch (e) {}
  }
}

main().finally(() => prisma.$disconnect());
