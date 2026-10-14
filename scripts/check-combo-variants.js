const { PrismaClient } = require('../lib/generated/client');
const prisma = new PrismaClient();

async function main() {
  const combos = await prisma.stockItem.findMany({
    where: { type: "COMBO" },
    include: { comboComponents: { include: { componentItem: true } } }
  });

  for (const c of combos) {
    const v = await prisma.shopifyVariant.findFirst({
      where: { sku: c.sku },
      include: { product: true }
    });
    console.log('Combo SKU:', c.sku, 'Found variant:', !!v, 'Product:', v?.product?.title, 'Variant:', v?.title);
  }
}

main().finally(() => prisma.$disconnect());
