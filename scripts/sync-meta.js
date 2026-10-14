const { PrismaClient } = require('../lib/generated/client');
const prisma = new PrismaClient();

async function syncMeta() {
  const account = await prisma.metaAccount.findFirst({
    where: { status: 'ACTIVE' }
  });

  if (!account || !account.accessToken) {
    console.log('No active Meta account with token.');
    return;
  }

  const actId = account.adAccountId.startsWith('act_') ? account.adAccountId : `act_${account.adAccountId}`;
  console.log(`Syncing Meta insights for ${actId}...`);

  // Ensure AdPlatformAccount exists
  const adPlatAccount = await prisma.adPlatformAccount.upsert({
    where: {
      storeId_platform_accountId: {
        storeId: account.storeId,
        platform: 'META',
        accountId: actId,
      }
    },
    create: {
      storeId: account.storeId,
      platform: 'META',
      accountId: actId,
      accountName: account.name || 'Meta Ad Account',
      currency: account.currency || 'INR',
      status: 'ACTIVE',
      accessToken: account.accessToken,
      lastSyncedAt: new Date(),
    },
    update: {
      accessToken: account.accessToken,
      status: 'ACTIVE',
      lastSyncedAt: new Date(),
    }
  });

  // Query 90 days of daily breakdown
  const url = `https://graph.facebook.com/v19.0/${actId}/insights?date_preset=last_90d&time_increment=1&fields=spend,impressions,clicks,cpc,cpm,ctr,actions,action_values,purchase_roas,date_start,date_stop&limit=100&access_token=${account.accessToken}`;
  const res = await fetch(url);
  const data = await res.json();

  if (!data.data || data.data.length === 0) {
    console.log('No daily insight records found:', data);
    return;
  }

  console.log(`Fetched ${data.data.length} daily insight records from Meta API.`);
  let totalSpend = 0;
  let totalRevenue = 0;

  for (const day of data.data) {
    const dateStr = day.date_start; // "YYYY-MM-DD"
    const spend = parseFloat(day.spend || '0');
    const impressions = parseInt(day.impressions || '0', 10);
    const clicks = parseInt(day.clicks || '0', 10);
    const cpc = parseFloat(day.cpc || '0');
    const cpm = parseFloat(day.cpm || '0');
    const ctr = parseFloat(day.ctr || '0');

    // Purchases
    const actions = day.actions || [];
    const purchaseAction = actions.find(
      (a) =>
        a.action_type === 'omni_purchase' ||
        a.action_type === 'purchase' ||
        a.action_type === 'offsite_conversion.fb_pixel_purchase'
    );
    const purchases = purchaseAction ? parseInt(purchaseAction.value || '0', 10) : 0;

    // Revenue
    const actionValues = day.action_values || [];
    const revAction = actionValues.find(
      (a) =>
        a.action_type === 'omni_purchase' ||
        a.action_type === 'purchase' ||
        a.action_type === 'offsite_conversion.fb_pixel_purchase'
    );
    const revenue = revAction ? parseFloat(revAction.value || '0') : 0;

    let roas = 0;
    if (day.purchase_roas && day.purchase_roas.length > 0) {
      roas = parseFloat(day.purchase_roas[0].value || '0');
    } else if (spend > 0 && revenue > 0) {
      roas = revenue / spend;
    }

    totalSpend += spend;
    totalRevenue += revenue;

    // Upsert into AdDailyMetric
    await prisma.adDailyMetric.upsert({
      where: {
        storeId_accountId_date: {
          storeId: account.storeId,
          accountId: adPlatAccount.id,
          date: dateStr,
        }
      },
      create: {
        storeId: account.storeId,
        accountId: adPlatAccount.id,
        platform: 'META',
        date: dateStr,
        spend,
        impressions,
        clicks,
        conversions: purchases,
        revenue,
        cpc,
        cpm,
        ctr,
        roas,
      },
      update: {
        spend,
        impressions,
        clicks,
        conversions: purchases,
        revenue,
        cpc,
        cpm,
        ctr,
        roas,
      }
    });

    // AdDailyMetric is the primary omnichannel model
    // It cleanly stores daily metrics per store, account and date
    // for all providers: META, GOOGLE, SNAPCHAT, REDDIT
  }

  // Update AdPlatformAccount
  const thisMonthStart = new Date();
  thisMonthStart.setDate(1);
  const thisMonthStartStr = thisMonthStart.toISOString().split('T')[0];
  const monthMetrics = await prisma.adDailyMetric.findMany({
    where: {
      storeId: account.storeId,
      accountId: adPlatAccount.id,
      date: { gte: thisMonthStartStr }
    }
  });
  const spendThisMonth = monthMetrics.reduce((s, m) => s + m.spend, 0);
  const revThisMonth = monthMetrics.reduce((s, m) => s + m.revenue, 0);
  const monthRoas = spendThisMonth > 0 ? revThisMonth / spendThisMonth : 0;

  await prisma.adPlatformAccount.update({
    where: { id: adPlatAccount.id },
    data: {
      spendThisMonth: Number(spendThisMonth.toFixed(2)),
      roas: Number(monthRoas.toFixed(2)),
      lastSyncedAt: new Date(),
    }
  });

  console.log(`✓ Successfully synced ${data.data.length} days of Meta ad metrics! Total spend: ₹${totalSpend.toFixed(2)}, Revenue: ₹${totalRevenue.toFixed(2)}`);
  await prisma.$disconnect();
}

syncMeta().catch(console.error);
