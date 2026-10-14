const { PrismaClient } = require('../lib/generated/client');
const prisma = new PrismaClient();

async function main() {
  const metaAcc = await prisma.metaAccount.findFirst({
    where: { status: 'ACTIVE' }
  });

  const actId = metaAcc.adAccountId.startsWith('act_') ? metaAcc.adAccountId : `act_${metaAcc.adAccountId}`;
  
  // Daily insights breakdown for last 90 days
  const url = `https://graph.facebook.com/v19.0/${actId}/insights?date_preset=last_90d&time_increment=1&fields=spend,impressions,clicks,cpc,cpm,ctr,actions,action_values,purchase_roas,date_start,date_stop&limit=100&access_token=${metaAcc.accessToken}`;
  const res = await fetch(url);
  const data = await res.json();
  
  console.log(`Found ${data.data?.length || 0} daily breakdown records for last 90d.`);
  if (data.data && data.data.length > 0) {
    console.log('Earliest date:', data.data[0].date_start);
    console.log('Latest date:', data.data[data.data.length - 1].date_start);
    console.log('Sample day:', data.data[data.data.length - 1]);
  } else {
    console.log('Data:', data);
  }

  await prisma.$disconnect();
}

main().catch(console.error);
