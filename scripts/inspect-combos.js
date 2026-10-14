// Load env using node --env-file=.env
const { PrismaClient } = require('../lib/generated/client');
const prisma = new PrismaClient();

async function main() {
  const stockItems = await prisma.stockItem.findMany({
    include: {
      comboComponents: {
        include: { componentItem: true }
      }
    }
  });
  console.log('Stock items count:', stockItems.length);
  for (const item of stockItems) {
    console.log(item.type, item.sku, item.name, 'Price:', item.sellingPrice, 'Components:', item.comboComponents.map(c => `${c.componentSku} x${c.quantity}`).join(', '));
  }

  const taxConfigs = await prisma.productTaxConfig.findMany();
  console.log('\nProductTaxConfigs count:', taxConfigs.length);
  for (const tc of taxConfigs) {
    console.log(tc.sku, 'Rate:', tc.taxRate, 'Inclusive:', tc.isTaxInclusive, 'OverridePrice:', tc.overridePrice, 'HSN:', tc.hsnCode);
  }
}

main().finally(() => prisma.$disconnect());
