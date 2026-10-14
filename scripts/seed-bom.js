const { PrismaClient } = require('../lib/generated/prisma');
const prisma = new PrismaClient();

async function main() {
  console.log('Seeding initial BOM and components for The Draft Snowboard...');

  // 1. Create Raw Materials & Packaging
  const core = await prisma.componentInventory.upsert({
    where: { sku: 'MG-CORE-WOOD-01' },
    create: {
      sku: 'MG-CORE-WOOD-01',
      name: 'Poplar Wood Board Core',
      category: 'RAW_MATERIAL',
      currentStock: 150,
      availableStock: 150,
      minStockLevel: 20,
      reorderLevel: 50,
      unit: 'pcs',
      unitCost: 650,
      supplier: 'TimberTech Co',
    },
    update: {},
  });

  const edges = await prisma.componentInventory.upsert({
    where: { sku: 'MG-STEEL-EDGE-01' },
    create: {
      sku: 'MG-STEEL-EDGE-01',
      name: 'Stainless Steel Edge Strips',
      category: 'COMPONENT',
      currentStock: 220,
      availableStock: 220,
      minStockLevel: 40,
      reorderLevel: 80,
      unit: 'pcs',
      unitCost: 120,
      supplier: 'Apex Metals',
    },
    update: {},
  });

  const topSheet = await prisma.componentInventory.upsert({
    where: { sku: 'MG-GRAPHIC-TOP-01' },
    create: {
      sku: 'MG-GRAPHIC-TOP-01',
      name: 'Sublimated Top Graphic Sheet',
      category: 'RAW_MATERIAL',
      currentStock: 85,
      availableStock: 85,
      minStockLevel: 15,
      reorderLevel: 30,
      unit: 'pcs',
      unitCost: 280,
      supplier: 'ColorPrint Labs',
    },
    update: {},
  });

  const box = await prisma.componentInventory.upsert({
    where: { sku: 'MG-BOX-SNOW-01' },
    create: {
      sku: 'MG-BOX-SNOW-01',
      name: 'Heavy-Duty Snowboard Shipping Box',
      category: 'PACKAGING',
      currentStock: 95,
      availableStock: 95,
      minStockLevel: 25,
      reorderLevel: 50,
      unit: 'box',
      unitCost: 110,
      supplier: 'BoxPack India',
    },
    update: {},
  });

  // 2. Map to Variant: The Draft Snowboard (53317868192111)
  const variantId = '53317868192111';
  const variant = await prisma.shopifyVariant.findUnique({
    where: { shopifyVariantId: variantId },
    include: { product: true },
  });

  if (variant) {
    const totalCost = 650 * 1 + 120 * 2 + 280 * 1 + 110 * 1; // 650 + 240 + 280 + 110 = 1280

    const bom = await prisma.bom.upsert({
      where: { shopifyVariantId: variantId },
      create: {
        shopifyVariantId: variantId,
        variantSku: variant.sku || '',
        productTitle: variant.product.title,
        variantTitle: variant.title,
        totalCost,
        notes: 'Standard production formula for The Draft Snowboard',
      },
      update: {
        totalCost,
      },
    });

    await prisma.bomItem.deleteMany({ where: { bomId: bom.id } });

    await prisma.bomItem.createMany({
      data: [
        {
          bomId: bom.id,
          componentId: core.id,
          componentSku: core.sku,
          componentName: core.name,
          quantityRequired: 1,
          unit: 'pcs',
          unitCost: 650,
          totalCost: 650,
        },
        {
          bomId: bom.id,
          componentId: edges.id,
          componentSku: edges.sku,
          componentName: edges.name,
          quantityRequired: 2,
          unit: 'pcs',
          unitCost: 120,
          totalCost: 240,
        },
        {
          bomId: bom.id,
          componentId: topSheet.id,
          componentSku: topSheet.sku,
          componentName: topSheet.name,
          quantityRequired: 1,
          unit: 'pcs',
          unitCost: 280,
          totalCost: 280,
        },
        {
          bomId: bom.id,
          componentId: box.id,
          componentSku: box.sku,
          componentName: box.name,
          quantityRequired: 1,
          unit: 'box',
          unitCost: 110,
          totalCost: 110,
        },
      ],
    });

    console.log(`✅ Seeded BOM for "${variant.product.title}" (Total COGS: ₹${totalCost})`);
  }
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
