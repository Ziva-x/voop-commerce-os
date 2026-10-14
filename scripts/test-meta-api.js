const { PrismaClient } = require('../lib/generated/client');
const prisma = new PrismaClient();

async function main() {
  const metaAcc = await prisma.metaAccount.findFirst({
    where: { status: 'ACTIVE' }
  });
  console.log('MetaAccount:', metaAcc ? {
    id: metaAcc.id,
    storeId: metaAcc.storeId,
    adAccountId: metaAcc.adAccountId,
    name: metaAcc.name,
    tokenPreview: metaAcc.accessToken ? `${metaAcc.accessToken.slice(0, 10)}...${metaAcc.accessToken.slice(-6)}` : null,
    length: metaAcc.accessToken?.length
  } : 'None');

  const adPlatformAccs = await prisma.adPlatformAccount.findMany();
  console.log('AdPlatformAccounts:', adPlatformAccs.map(a => ({
    id: a.id,
    platform: a.platform,
    accountId: a.accountId,
    accountName: a.accountName,
    status: a.status,
    tokenPreview: a.accessToken ? `${a.accessToken.slice(0, 10)}...${a.accessToken.slice(-6)}` : null,
    extraConfig: a.extraConfig
  })));

  if (metaAcc && metaAcc.accessToken) {
    const actId = metaAcc.adAccountId.startsWith('act_') ? metaAcc.adAccountId : `act_${metaAcc.adAccountId}`;
    console.log(`Testing Meta Graph API for ${actId}...`);
    try {
      const url = `https://graph.facebook.com/v19.0/${actId}?fields=id,name,account_status,currency,amount_spent&access_token=${metaAcc.accessToken}`;
      const res = await fetch(url);
      const data = await res.json();
      console.log('Account Details:', data);

      // Check insights for different presets: last_30d, maximum, last_7d
      for (const preset of ['last_7d', 'last_30d', 'last_90d', 'maximum']) {
        const insightsUrl = `https://graph.facebook.com/v19.0/${actId}/insights?date_preset=${preset}&fields=spend,impressions,clicks,cpc,cpm,ctr,actions,action_values,purchase_roas,date_start,date_stop&access_token=${metaAcc.accessToken}`;
        const iRes = await fetch(insightsUrl);
        const iData = await iRes.json();
        console.log(`Insights [${preset}]:`, JSON.stringify(iData, null, 2));
      }
    } catch (e) {
      console.error('Meta API call failed:', e);
    }
  }

  await prisma.$disconnect();
}

main().catch(console.error);
