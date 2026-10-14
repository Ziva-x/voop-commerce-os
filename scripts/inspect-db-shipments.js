const fs = require('fs');
const env = fs.readFileSync('.env', 'utf-8');
env.split('\n').forEach(line => {
  const [k, ...v] = line.split('=');
  if (k && v.length) process.env[k.trim()] = v.join('=').trim().replace(/^"(.*)"$/, '$1');
});
const { PrismaClient } = require('../lib/generated/client');
const prisma = new PrismaClient();

async function main() {
  const shipments = await prisma.shipment.findMany({
    take: 10,
    orderBy: { createdAt: 'desc' },
    select: {
      awb: true,
      carrier: true,
      status: true,
      normalizedStatus: true,
      rawStatus: true,
      statusLocation: true,
      statusTimestamp: true,
      pickupDate: true,
      deliveryDate: true,
      scans: { take: 4, orderBy: { timestamp: 'desc' } }
    }
  });

  console.log('Sample shipments:');
  for (const s of shipments) {
    console.log(s.awb, '|', s.carrier, '|', s.status, '| norm:', s.normalizedStatus, '| raw:', s.rawStatus, '| pickupDate:', s.pickupDate);
    if (s.scans.length) {
      console.log('  Scans:', s.scans.map(sc => `${sc.timestamp.toISOString().slice(0,16)}: ${sc.status} (${sc.statusType || ''}) - ${sc.instructions || ''}`));
    }
  }

  const statusCounts = await prisma.shipment.groupBy({
    by: ['normalizedStatus'],
    _count: { id: true }
  });
  console.log('\nStatus counts in DB:', statusCounts);
}

main().finally(() => prisma.$disconnect());
