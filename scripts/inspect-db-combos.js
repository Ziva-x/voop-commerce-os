const fs = require('fs');
const env = fs.readFileSync('.env', 'utf-8');
env.split('\n').forEach(line => {
  const [k, ...v] = line.split('=');
  if (k && v.length) process.env[k.trim()] = v.join('=').trim().replace(/^"(.*)"$/, '$1');
});
const { PrismaClient } = require('../lib/generated/client');
const prisma = new PrismaClient();

async function main() {
  const stockCombos = await prisma.stockItem.findMany({
    where: { type: 'COMBO' },
    include: { comboComponents: { include: { componentItem: true } } }
  });
  console.log('StockItem combos count:', stockCombos.length);
  const fmsStock = await prisma.stockItem.findFirst({ where: { sku: 'FMS' } });
  const fmsTax = await prisma.productTaxConfig.findFirst({ where: { sku: 'FMS' } });
  const snfStock = await prisma.stockItem.findFirst({ where: { sku: '1:10SNF200' } });
  const snfTax = await prisma.productTaxConfig.findFirst({ where: { sku: '1:10SNF200' } });
  const comboStock = await prisma.stockItem.findFirst({ where: { sku: 'FMS-1:10SNF200' } });
  const comboTax = await prisma.productTaxConfig.findFirst({ where: { sku: 'FMS-1:10SNF200' } });
  const comboInvoices = await prisma.comboInvoiceComponent.findMany({ where: { comboSku: 'FMS-1:10SNF200' } });

  console.log('FMS stock:', fmsStock?.sellingPrice, 'taxConfig:', fmsTax?.taxRate, fmsTax?.overridePrice);
  console.log('SNF stock:', snfStock?.sellingPrice, 'taxConfig:', snfTax?.taxRate, snfTax?.overridePrice);
  console.log('Combo stock:', comboStock?.sellingPrice, 'taxConfig:', comboTax?.taxRate, comboTax?.overridePrice);
  console.log('ComboInvoices:', comboInvoices);

  const allComboInvoices = await prisma.comboInvoiceComponent.findMany();
  console.log('\nComboInvoiceComponent count:', allComboInvoices.length);
  for (const ci of allComboInvoices) {
    console.log('  CI:', ci.comboSku, ci.componentSku, 'AllocVal:', ci.allocatedValue, 'GSTRate:', ci.gstRate, 'TaxMode:', ci.taxMode);
  }

  const taxConfigs = await prisma.productTaxConfig.findMany();
  console.log('\nProductTaxConfig count:', taxConfigs.length);
  for (const tc of taxConfigs) {
    console.log('  TC:', tc.sku, tc.title, 'TaxRate:', tc.taxRate, 'Price:', tc.overridePrice);
  }
}

main().finally(() => prisma.$disconnect());
