const { generateInvoiceForOrder } = require('../lib/invoice-generator');
const { PrismaClient } = require('../lib/generated/client');
const prisma = new PrismaClient();

async function main() {
  try {
    const inv = await generateInvoiceForOrder('cmts2r4r509ate7lqujj14okv');
    console.log('Generated Invoice:');
    console.log('InvoiceNumber:', inv.invoiceNumber);
    console.log('Items:', inv.items);
    console.log('Summary:', inv.summary);
  } catch (err) {
    console.error('Invoice error:', err);
  }
}

main().finally(() => prisma.$disconnect());
