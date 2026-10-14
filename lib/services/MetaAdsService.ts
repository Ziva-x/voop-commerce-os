import prisma from "@/lib/prisma";

export class MetaAdsService {
  /**
   * Helper: Map VOOP period key to Meta date_preset
   */
  private static mapPeriodToDatePreset(period: string): string {
    switch (period) {
      case "today":
        return "today";
      case "yesterday":
        return "yesterday";
      case "30d":
        return "last_30d";
      case "7d":
      default:
        return "last_7d";
    }
  }

  /**
   * Sync campaigns and insights live from Meta Graph API
   */
  static async syncAccountData(account: any, period: string = "7d") {
    if (!account?.accessToken || !account?.adAccountId) {
      return null;
    }

    const storeId: string = account.storeId;
    const token = account.accessToken;
    const cleanAdAccountId = account.adAccountId.startsWith("act_")
      ? account.adAccountId
      : `act_${account.adAccountId}`;
    const datePreset = this.mapPeriodToDatePreset(period);

    let rawCampaigns: any[] = [];
    let campaignInsightsMap: Record<string, any> = {};
    let overallMetrics: any = {
      spend: 0,
      impressions: 0,
      clicks: 0,
      purchases: 0,
      revenue: 0,
      cpc: 0,
      cpm: 0,
      ctr: 0,
      cpp: 0,
      roas: 0,
    };

    // 1. Fetch live campaigns from Meta Graph API
    try {
      const campRes = await fetch(
        `https://graph.facebook.com/v19.0/${cleanAdAccountId}/campaigns?fields=id,name,status,objective,daily_budget,lifetime_budget,created_time,updated_time&limit=250&access_token=${token}`
      );
      if (campRes.ok) {
        const campData = await campRes.json();
        rawCampaigns = campData.data || [];

        // Save / Upsert campaigns into database
        for (const c of rawCampaigns) {
          const dailyBudget = c.daily_budget ? Number(c.daily_budget) / 100 : null;
          const lifetimeBudget = c.lifetime_budget ? Number(c.lifetime_budget) / 100 : null;

          await prisma.metaCampaign.upsert({
            where: { storeId_campaignId: { storeId, campaignId: c.id } },
            create: {
              storeId,
              metaAccountId: account.id,
              campaignId: c.id,
              name: c.name,
              status: c.status || "ACTIVE",
              objective: c.objective || "OUTCOME_SALES",
              dailyBudget,
              lifetimeBudget,
            },
            update: {
              name: c.name,
              status: c.status || "ACTIVE",
              objective: c.objective || "OUTCOME_SALES",
              dailyBudget,
              lifetimeBudget,
            },
          });
        }
      }
    } catch (e) {
      console.error("Failed to fetch Meta campaigns:", e);
    }

    // 2. Fetch campaign-level insights
    try {
      const insightsRes = await fetch(
        `https://graph.facebook.com/v19.0/${cleanAdAccountId}/insights?date_preset=${datePreset}&fields=campaign_id,campaign_name,spend,impressions,clicks,cpc,cpm,ctr,actions,action_values,purchase_roas&level=campaign&limit=250&access_token=${token}`
      );
      if (insightsRes.ok) {
        const insData = await insightsRes.json();
        const insList = insData.data || [];

        for (const item of insList) {
          const spend = parseFloat(item.spend || "0");
          const impressions = parseInt(item.impressions || "0", 10);
          const clicks = parseInt(item.clicks || "0", 10);
          const cpc = parseFloat(item.cpc || "0");
          const cpm = parseFloat(item.cpm || "0");
          const ctr = parseFloat(item.ctr || "0");

          // Extract purchases count
          const purchaseAction = (item.actions || []).find(
            (a: any) =>
              a.action_type === "omni_purchase" ||
              a.action_type === "purchase" ||
              a.action_type === "offsite_conversion.fb_pixel_purchase"
          );
          const purchases = purchaseAction ? parseInt(purchaseAction.value || "0", 10) : 0;

          // Extract revenue
          const revAction = (item.action_values || []).find(
            (a: any) =>
              a.action_type === "omni_purchase" ||
              a.action_type === "purchase" ||
              a.action_type === "offsite_conversion.fb_pixel_purchase"
          );
          const revenue = revAction ? parseFloat(revAction.value || "0") : 0;

          // Extract ROAS
          let roas = 0;
          if (item.purchase_roas && item.purchase_roas.length > 0) {
            roas = parseFloat(item.purchase_roas[0].value || "0");
          } else if (spend > 0 && revenue > 0) {
            roas = revenue / spend;
          }

          const cpp = purchases > 0 ? spend / purchases : 0;

          campaignInsightsMap[item.campaign_id] = {
            spend,
            impressions,
            clicks,
            purchases,
            revenue,
            cpc,
            cpm,
            ctr,
            cpp,
            roas,
          };
        }
      }
    } catch (e) {
      console.error("Failed to fetch Meta campaign insights:", e);
    }

    // 3. Fetch account-level total insights
    try {
      const accountInsRes = await fetch(
        `https://graph.facebook.com/v19.0/${cleanAdAccountId}/insights?date_preset=${datePreset}&fields=spend,impressions,clicks,cpc,cpm,ctr,actions,action_values,purchase_roas&access_token=${token}`
      );
      if (accountInsRes.ok) {
        const accData = await accountInsRes.json();
        if (accData.data && accData.data.length > 0) {
          const item = accData.data[0];
          const spend = parseFloat(item.spend || "0");
          const impressions = parseInt(item.impressions || "0", 10);
          const clicks = parseInt(item.clicks || "0", 10);
          const cpc = parseFloat(item.cpc || (clicks > 0 ? (spend / clicks).toFixed(2) : "0"));
          const cpm = parseFloat(item.cpm || (impressions > 0 ? ((spend / impressions) * 1000).toFixed(2) : "0"));
          const ctr = parseFloat(item.ctr || (impressions > 0 ? ((clicks / impressions) * 100).toFixed(2) : "0"));

          const purchaseAction = (item.actions || []).find(
            (a: any) =>
              a.action_type === "omni_purchase" ||
              a.action_type === "purchase" ||
              a.action_type === "offsite_conversion.fb_pixel_purchase"
          );
          const purchases = purchaseAction ? parseInt(purchaseAction.value || "0", 10) : 0;

          const revAction = (item.action_values || []).find(
            (a: any) =>
              a.action_type === "omni_purchase" ||
              a.action_type === "purchase" ||
              a.action_type === "offsite_conversion.fb_pixel_purchase"
          );
          const revenue = revAction ? parseFloat(revAction.value || "0") : 0;

          let roas = 0;
          if (item.purchase_roas && item.purchase_roas.length > 0) {
            roas = parseFloat(item.purchase_roas[0].value || "0");
          } else if (spend > 0 && revenue > 0) {
            roas = revenue / spend;
          }

          const cpp = purchases > 0 ? spend / purchases : 0;

          overallMetrics = {
            spend,
            impressions,
            clicks,
            purchases,
            revenue,
            cpc,
            cpm,
            ctr,
            cpp,
            roas,
          };
        }
      }
    } catch (e) {
      console.error("Failed to fetch account total insights:", e);
    }

    // Update lastSyncedAt on account
    await prisma.metaAccount.update({
      where: { id: account.id },
      data: { lastSyncedAt: new Date() },
    });

    // Keep adDailyMetric in sync for omnichannel analytics
    try {
      const adPlatformAcc = await prisma.adPlatformAccount.findFirst({
        where: {
          storeId,
          OR: [
            { accountId: account.adAccountId },
            { accountId: `act_${account.adAccountId.replace(/^act_/, "")}` },
            { accountId: account.adAccountId.replace(/^act_/, "") }
          ]
        },
      });
      if (adPlatformAcc && (overallMetrics.spend > 0 || period === "today")) {
        const todayStr = new Date().toISOString().split("T")[0];
        await prisma.adDailyMetric.upsert({
          where: {
            storeId_accountId_date: {
              storeId,
              accountId: adPlatformAcc.id,
              date: todayStr,
            },
          },
          create: {
            storeId,
            accountId: adPlatformAcc.id,
            platform: "META",
            date: todayStr,
            spend: overallMetrics.spend,
            impressions: overallMetrics.impressions,
            clicks: overallMetrics.clicks,
            conversions: overallMetrics.purchases,
            revenue: overallMetrics.revenue,
            cpc: overallMetrics.cpc,
            cpm: overallMetrics.cpm,
            ctr: overallMetrics.ctr,
            roas: overallMetrics.roas,
          },
          update: {
            spend: overallMetrics.spend,
            impressions: overallMetrics.impressions,
            clicks: overallMetrics.clicks,
            conversions: overallMetrics.purchases,
            revenue: overallMetrics.revenue,
            cpc: overallMetrics.cpc,
            cpm: overallMetrics.cpm,
            ctr: overallMetrics.ctr,
            roas: overallMetrics.roas,
          },
        });
      }
    } catch (metricErr) {
      console.error("[META_AD_DAILY_METRIC_UPSERT_ERROR]", metricErr);
    }

    return {
      rawCampaigns,
      campaignInsightsMap,
      overallMetrics,
    };
  }

  /**
   * Get Meta Ads connection status & performance summary
   */
  static async getOverview(storeId: string, period: string = "7d") {
    const account = await prisma.metaAccount.findFirst({
      where: { storeId, status: "ACTIVE" },
      include: {
        campaigns: {
          include: {
            adSets: {
              include: {
                ads: true,
              },
            },
          },
        },
      },
    });

    if (!account) {
      return {
        isConnected: false,
        account: null,
        metrics: null,
        campaigns: [],
      };
    }

    // Live sync from Meta Graph API
    let liveData: any = null;
    try {
      liveData = await this.syncAccountData(account, period);
    } catch (e) {
      console.error("Live sync error:", e);
    }

    // Combine database campaigns with live insights
    const dbCampaigns = await prisma.metaCampaign.findMany({
      where: { storeId, metaAccountId: account.id },
      orderBy: { createdAt: "desc" },
    });

    const enrichedCampaigns = (liveData?.rawCampaigns?.length ? liveData.rawCampaigns : dbCampaigns).map((c: any) => {
      const insight = liveData?.campaignInsightsMap?.[c.id || c.campaignId] || {};
      const dailyBudget = c.daily_budget
        ? Number(c.daily_budget) / 100
        : c.dailyBudget || 0;
      const lifetimeBudget = c.lifetime_budget
        ? Number(c.lifetime_budget) / 100
        : c.lifetimeBudget || 0;

      return {
        id: c.id || c.campaignId,
        campaignId: c.id || c.campaignId,
        name: c.name,
        status: c.status || "ACTIVE",
        objective: c.objective || "OUTCOME_SALES",
        dailyBudget,
        lifetimeBudget,
        spend: insight.spend || 0,
        impressions: insight.impressions || 0,
        clicks: insight.clicks || 0,
        purchases: insight.purchases || 0,
        revenue: insight.revenue || 0,
        roas: insight.roas || 0,
        cpc: insight.cpc || 0,
        cpp: insight.cpp || 0,
      };
    });

    // If overall metrics are available from live query, use them; otherwise aggregate
    const metrics = liveData?.overallMetrics || {
      spend: enrichedCampaigns.reduce((acc: number, c: any) => acc + (c.spend || 0), 0),
      impressions: enrichedCampaigns.reduce((acc: number, c: any) => acc + (c.impressions || 0), 0),
      clicks: enrichedCampaigns.reduce((acc: number, c: any) => acc + (c.clicks || 0), 0),
      purchases: enrichedCampaigns.reduce((acc: number, c: any) => acc + (c.purchases || 0), 0),
      revenue: enrichedCampaigns.reduce((acc: number, c: any) => acc + (c.revenue || 0), 0),
      cpc: 0,
      cpm: 0,
      ctr: 0,
      cpp: 0,
      roas: 0,
    };

    if (metrics.clicks > 0 && !metrics.cpc) {
      metrics.cpc = metrics.spend / metrics.clicks;
    }
    if (metrics.impressions > 0 && !metrics.cpm) {
      metrics.cpm = (metrics.spend / metrics.impressions) * 1000;
    }
    if (metrics.impressions > 0 && !metrics.ctr) {
      metrics.ctr = (metrics.clicks / metrics.impressions) * 100;
    }
    if (metrics.purchases > 0 && !metrics.cpp) {
      metrics.cpp = metrics.spend / metrics.purchases;
    }
    if (metrics.spend > 0 && !metrics.roas) {
      metrics.roas = metrics.revenue / metrics.spend;
    }

    return {
      isConnected: true,
      account: {
        adAccountId: account.adAccountId,
        name: account.name,
        currency: account.currency,
        lastSyncedAt: new Date(),
      },
      metrics,
      campaigns: enrichedCampaigns,
    };
  }

  /**
   * Connect Meta Ad Account with system token (Server-Side only)
   */
  static async connectAccount(data: {
    storeId: string;
    adAccountId: string;
    accountName: string;
    accessToken: string;
  }) {
    const { storeId } = data;
    const rawId = (data.adAccountId || "").trim();
    const cleanToken = (data.accessToken || "").trim();

    if (!cleanToken) {
      throw new Error("Access Token is required.");
    }

    // Try auto-discovering ad accounts assigned to this token first
    let discoveredAdAccount: any = null;
    try {
      const myAccountsRes = await fetch(
        `https://graph.facebook.com/v19.0/me/adaccounts?fields=id,account_id,name,currency,account_status&access_token=${cleanToken}`
      );
      if (myAccountsRes.ok) {
        const myAccountsData = await myAccountsRes.json();
        const accountsList = myAccountsData.data || [];

        if (accountsList.length > 0) {
          const match = accountsList.find(
            (a: any) =>
              a.id === rawId ||
              a.id === `act_${rawId}` ||
              a.account_id === rawId ||
              a.name?.toLowerCase() === rawId.toLowerCase()
          );
          discoveredAdAccount = match || (accountsList.length === 1 ? accountsList[0] : null);
        }
      }
    } catch (e) {
      // Fall through to direct query
    }

    // Determine target Ad Account ID
    let cleanAdAccountId = discoveredAdAccount?.id || (rawId.startsWith("act_") ? rawId : `act_${rawId}`);

    if (!cleanAdAccountId || cleanAdAccountId === "act_") {
      throw new Error("Ad Account ID is required. Please specify your Ad Account ID (e.g. act_123456789).");
    }

    // Verify token & account access against Meta Graph API
    const verifyUrl = `https://graph.facebook.com/v19.0/${cleanAdAccountId}?fields=id,name,account_status,currency,timezone_name&access_token=${cleanToken}`;
    const res = await fetch(verifyUrl);

    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      const errorMsg =
        err.error?.message ||
        err.error?.error_user_msg ||
        "Invalid Meta Ad Account ID or Access Token.";
      const errorSubcode = err.error?.error_subcode ? ` (subcode ${err.error.error_subcode})` : "";
      
      let hint = "";
      if (errorMsg.includes("API access blocked") || err.error?.code === 100 || err.error?.code === 200) {
        hint = "\n\nTroubleshooting Steps:\n1. In Meta Business Settings > System users > adithkv, click 'Generate token'.\n2. Select your App ('analyse of dashboard') and check: 'ads_read' and 'read_insights'.\n3. Ensure the 'Marketing API' product is added to your App in developers.facebook.com.\n4. Click 'Open in Ads Manager' next to MonkeyGarage in Assigned assets to verify the exact act_... ID in the browser URL.";
      }

      throw new Error(`Meta API error (${res.status}): ${errorMsg}${errorSubcode}.${hint}`);
    }

    const metaData = await res.json();

    // Save account in database
    const account = await prisma.metaAccount.upsert({
      where: { storeId_adAccountId: { storeId, adAccountId: cleanAdAccountId } },
      create: {
        storeId,
        adAccountId: cleanAdAccountId,
        name: metaData.name || data.accountName || cleanAdAccountId,
        currency: metaData.currency || "INR",
        accessToken: cleanToken,
        status: "ACTIVE",
        lastSyncedAt: new Date(),
      },
      update: {
        name: metaData.name || data.accountName || cleanAdAccountId,
        currency: metaData.currency || "INR",
        accessToken: cleanToken,
        status: "ACTIVE",
        lastSyncedAt: new Date(),
      },
    });

    // Immediate initial sync
    try {
      await this.syncAccountData(account, "7d");
    } catch (e) {
      console.error("Initial Meta Ads sync failed:", e);
    }

    return { success: true, account };
  }

  /**
   * Disconnect Meta Account
   */
  static async disconnectAccount(storeId: string, adAccountId: string) {
    const cleanAdAccountId = adAccountId.trim().startsWith("act_")
      ? adAccountId.trim()
      : `act_${adAccountId.trim()}`;
    return prisma.metaAccount.deleteMany({
      where: {
        storeId,
        OR: [{ adAccountId: cleanAdAccountId }, { adAccountId: adAccountId.trim() }],
      },
    });
  }
}
