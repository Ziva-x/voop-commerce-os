import prisma from "@/lib/prisma";

export interface ConnectAccountInput {
  storeId: string;
  platform: "META" | "GOOGLE" | "SNAPCHAT" | "REDDIT";
  accountId: string;
  accountName: string;
  accessToken?: string;
  refreshToken?: string;
  clientId?: string;
  clientSecret?: string;
  developerToken?: string;
  organizationId?: string;
  pixelId?: string;
  currency?: string;
  extraConfig?: string;
}

export class AdPlatformService {
  /**
   * Get all connected ad accounts for a store
   */
  static async getAllAccounts(storeId: string) {
    // 1. Fetch from unified AdPlatformAccount
    const accounts = await prisma.adPlatformAccount.findMany({
      where: { storeId },
      orderBy: [{ platform: "asc" }, { accountName: "asc" }],
    });

    // 2. Also check legacy MetaAccount and auto-migrate if not in AdPlatformAccount
    try {
      const legacyMetaAccounts = await prisma.metaAccount.findMany({ where: { storeId } });
      for (const lma of legacyMetaAccounts) {
        const cleanId = lma.adAccountId.startsWith("act_") ? lma.adAccountId : `act_${lma.adAccountId}`;
        const exists = accounts.some((a) => a.platform === "META" && a.accountId === cleanId);
        if (!exists) {
          const created = await prisma.adPlatformAccount.create({
            data: {
              storeId,
              platform: "META",
              accountId: cleanId,
              accountName: lma.name || `Meta Ad Account (${cleanId})`,
              currency: lma.currency || "INR",
              status: lma.status || "ACTIVE",
              accessToken: lma.accessToken,
              lastSyncedAt: lma.lastSyncedAt || new Date(),
            },
          });
          accounts.push(created);
        }
      }
    } catch (e) {
      // Non-blocking
    }

    return accounts;
  }

  /**
   * Connect or update an ad account
   */
  static async connectAccount(input: ConnectAccountInput) {
    const { storeId } = input;
    const platform = input.platform.toUpperCase() as "META" | "GOOGLE" | "SNAPCHAT" | "REDDIT";
    let accountId = input.accountId.trim();
    const accountName = input.accountName.trim() || `${platform} Ad Account`;

    if (!accountId) {
      throw new Error("Ad Account ID is required.");
    }

    if (platform === "META" && !accountId.startsWith("act_") && !accountId.startsWith("ACT_")) {
      accountId = `act_${accountId}`;
    }

    let status = "ACTIVE";
    let currency = input.currency || "INR";

    // Platform-specific verification
    if (platform === "META" && input.accessToken) {
      try {
        const verifyUrl = `https://graph.facebook.com/v19.0/${accountId}?fields=id,name,account_status,currency&access_token=${input.accessToken.trim()}`;
        const res = await fetch(verifyUrl);
        if (res.ok) {
          const data = await res.json();
          currency = data.currency || currency;
          status = data.account_status === 1 ? "ACTIVE" : "PAUSED";
        }
      } catch (e) {
        // Fallback to active
      }
    }

    const account = await prisma.adPlatformAccount.upsert({
      where: {
        storeId_platform_accountId: {
          storeId,
          platform,
          accountId,
        },
      },
      create: {
        storeId,
        platform,
        accountId,
        accountName,
        currency,
        status,
        accessToken: input.accessToken?.trim() || null,
        refreshToken: input.refreshToken?.trim() || null,
        clientId: input.clientId?.trim() || null,
        clientSecret: input.clientSecret?.trim() || null,
        developerToken: input.developerToken?.trim() || null,
        organizationId: input.organizationId?.trim() || null,
        pixelId: input.pixelId?.trim() || null,
        extraConfig: input.extraConfig || "{}",
        lastSyncedAt: new Date(),
      },
      update: {
        accountName,
        currency,
        status,
        accessToken: input.accessToken?.trim() || undefined,
        refreshToken: input.refreshToken?.trim() || undefined,
        clientId: input.clientId?.trim() || undefined,
        clientSecret: input.clientSecret?.trim() || undefined,
        developerToken: input.developerToken?.trim() || undefined,
        organizationId: input.organizationId?.trim() || undefined,
        pixelId: input.pixelId?.trim() || undefined,
        extraConfig: input.extraConfig || undefined,
        lastSyncedAt: new Date(),
      },
    });

    // Also sync to legacy MetaAccount if it is META
    if (platform === "META") {
      try {
        await prisma.metaAccount.upsert({
          where: { storeId_adAccountId: { storeId, adAccountId: accountId } },
          create: {
            storeId,
            adAccountId: accountId,
            name: accountName,
            currency,
            status,
            accessToken: input.accessToken?.trim() || null,
            lastSyncedAt: new Date(),
          },
          update: {
            name: accountName,
            currency,
            status,
            accessToken: input.accessToken?.trim() || undefined,
            lastSyncedAt: new Date(),
          },
        });
      } catch (e) {
        // Non-blocking
      }
    }

    return account;
  }

  /**
   * Disconnect / Delete an ad account
   */
  static async disconnectAccount(id: string, storeId: string) {
    const acc = await prisma.adPlatformAccount.findFirst({ where: { id, storeId } });
    if (acc) {
      if (acc.platform === "META") {
        await prisma.metaAccount.deleteMany({
          where: { storeId, adAccountId: acc.accountId },
        }).catch(() => {});
      }
      await prisma.adPlatformAccount.delete({ where: { id } });
    }
    return { success: true };
  }

  /**
   * Toggle account status (ACTIVE vs PAUSED)
   */
  static async toggleAccountStatus(id: string, status: "ACTIVE" | "PAUSED") {
    return prisma.adPlatformAccount.update({
      where: { id },
      data: { status },
    });
  }

  /**
   * Sync a single ad account across its provider API (META, GOOGLE, SNAPCHAT, REDDIT)
   */
  static async syncAccount(accountId: string, storeId: string) {
    const account = await prisma.adPlatformAccount.findFirst({
      where: { id: accountId, storeId },
    });

    if (!account) {
      throw new Error(`Ad Account not found: ${accountId}`);
    }

    let recordsSynced = 0;
    let totalSpend = 0;
    let totalRevenue = 0;

    // 1. META ADS SYNC
    if (account.platform === "META" && account.accessToken) {
      const cleanActId = account.accountId.startsWith("act_") ? account.accountId : `act_${account.accountId}`;
      try {
        const url = `https://graph.facebook.com/v19.0/${cleanActId}/insights?date_preset=last_90d&time_increment=1&fields=spend,impressions,clicks,cpc,cpm,ctr,actions,action_values,purchase_roas,date_start,date_stop&limit=100&access_token=${account.accessToken.trim()}`;
        const res = await fetch(url);
        if (res.ok) {
          const data = await res.json();
          const items = data.data || [];

          // ALSO fetch today's live insights because Meta's last_90d excludes the current day
          try {
            const todayUrl = `https://graph.facebook.com/v19.0/${cleanActId}/insights?date_preset=today&fields=spend,impressions,clicks,cpc,cpm,ctr,actions,action_values,purchase_roas,date_start,date_stop&access_token=${account.accessToken.trim()}`;
            const todayRes = await fetch(todayUrl);
            if (todayRes.ok) {
              const todayData = await todayRes.json();
              if (todayData.data && todayData.data.length > 0) {
                const todayItem = todayData.data[0];
                if (!todayItem.date_start) {
                  todayItem.date_start = new Date().toISOString().split("T")[0];
                }
                const existingIdx = items.findIndex((it: any) => it.date_start === todayItem.date_start);
                if (existingIdx >= 0) {
                  items[existingIdx] = todayItem;
                } else {
                  items.push(todayItem);
                }
              }
            }
          } catch (todayErr) {
            console.error("[META_TODAY_SYNC_ERROR]", todayErr);
          }

          for (const day of items) {
            const dateStr = day.date_start; // "YYYY-MM-DD"
            const spend = parseFloat(day.spend || "0");
            const impressions = parseInt(day.impressions || "0", 10);
            const clicks = parseInt(day.clicks || "0", 10);
            const cpc = parseFloat(day.cpc || "0");
            const cpm = parseFloat(day.cpm || "0");
            const ctr = parseFloat(day.ctr || "0");

            const actions = day.actions || [];
            const purchaseAction = actions.find(
              (a: any) =>
                a.action_type === "omni_purchase" ||
                a.action_type === "purchase" ||
                a.action_type === "offsite_conversion.fb_pixel_purchase"
            );
            const purchases = purchaseAction ? parseInt(purchaseAction.value || "0", 10) : 0;

            const actionValues = day.action_values || [];
            const revAction = actionValues.find(
              (a: any) =>
                a.action_type === "omni_purchase" ||
                a.action_type === "purchase" ||
                a.action_type === "offsite_conversion.fb_pixel_purchase"
            );
            const revenue = revAction ? parseFloat(revAction.value || "0") : 0;

            let roas = 0;
            if (day.purchase_roas && day.purchase_roas.length > 0) {
              roas = parseFloat(day.purchase_roas[0].value || "0");
            } else if (spend > 0 && revenue > 0) {
              roas = revenue / spend;
            }

            totalSpend += spend;
            totalRevenue += revenue;

            await prisma.adDailyMetric.upsert({
              where: {
                storeId_accountId_date: {
                  storeId,
                  accountId: account.id,
                  date: dateStr,
                },
              },
              create: {
                storeId,
                accountId: account.id,
                platform: "META",
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
              },
            });
            recordsSynced++;
          }
        }
      } catch (e) {
        console.error(`[META_SYNC_ERROR] ${account.accountId}:`, e);
      }
    }

    // 2. GOOGLE ADS SYNC
    else if (account.platform === "GOOGLE") {
      const cleanCustomerId = account.accountId.replace(/-/g, "").trim();
      let accessToken = account.accessToken?.trim();

      // Refresh token if needed
      if (!accessToken && account.refreshToken && account.clientId && account.clientSecret) {
        try {
          const tokenRes = await fetch("https://oauth2.googleapis.com/token", {
            method: "POST",
            headers: { "Content-Type": "application/x-www-form-urlencoded" },
            body: new URLSearchParams({
              client_id: account.clientId,
              client_secret: account.clientSecret,
              refresh_token: account.refreshToken,
              grant_type: "refresh_token",
            }),
          });
          if (tokenRes.ok) {
            const tokenData = await tokenRes.json();
            accessToken = tokenData.access_token;
          }
        } catch (e) {
          console.error("[GOOGLE_TOKEN_REFRESH_ERROR]:", e);
        }
      }

      if (accessToken && account.developerToken) {
        try {
          const query = `
            SELECT segments.date, metrics.cost_micros, metrics.impressions, metrics.clicks, metrics.conversions, metrics.conversions_value
            FROM customer
            WHERE segments.date DURING LAST_30_DAYS
            ORDER BY segments.date DESC
          `;
          const res = await fetch(
            `https://googleads.googleapis.com/v17/customers/${cleanCustomerId}/googleAds:searchStream`,
            {
              method: "POST",
              headers: {
                Authorization: `Bearer ${accessToken}`,
                "developer-token": account.developerToken.trim(),
                "Content-Type": "application/json",
              },
              body: JSON.stringify({ query }),
            }
          );

          if (res.ok) {
            const streams = await res.json();
            for (const batch of streams) {
              for (const row of batch.results || []) {
                const dateStr = row.segments.date;
                const spend = (row.metrics.costMicros || 0) / 1000000;
                const impressions = parseInt(row.metrics.impressions || "0", 10);
                const clicks = parseInt(row.metrics.clicks || "0", 10);
                const conversions = Math.round(row.metrics.conversions || 0);
                const revenue = row.metrics.conversionsValue || 0;
                const roas = spend > 0 ? revenue / spend : 0;
                const cpc = clicks > 0 ? spend / clicks : 0;
                const cpm = impressions > 0 ? (spend / impressions) * 1000 : 0;
                const ctr = impressions > 0 ? (clicks / impressions) * 100 : 0;

                totalSpend += spend;
                totalRevenue += revenue;

                await prisma.adDailyMetric.upsert({
                  where: {
                    storeId_accountId_date: {
                      storeId,
                      accountId: account.id,
                      date: dateStr,
                    },
                  },
                  create: {
                    storeId,
                    accountId: account.id,
                    platform: "GOOGLE",
                    date: dateStr,
                    spend,
                    impressions,
                    clicks,
                    conversions,
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
                    conversions,
                    revenue,
                    cpc,
                    cpm,
                    ctr,
                    roas,
                  },
                });
                recordsSynced++;
              }
            }
          }
        } catch (e) {
          console.error(`[GOOGLE_SYNC_ERROR] ${cleanCustomerId}:`, e);
        }
      }
    }

    // 3. SNAPCHAT ADS SYNC
    else if (account.platform === "SNAPCHAT" && account.accessToken) {
      try {
        const url = `https://adsapi.snapchat.com/v1/adaccounts/${account.accountId}/stats?granularity=DAY&fields=spend,impressions,swipes,conversion_purchases,conversion_purchases_value`;
        const res = await fetch(url, {
          headers: { Authorization: `Bearer ${account.accessToken.trim()}` },
        });

        if (res.ok) {
          const snapData = await res.json();
          const timeseries = snapData.timeseries_stats || [];

          for (const item of timeseries) {
            const dateStr = item.start_time?.split("T")[0];
            if (!dateStr) continue;

            const stats = item.stats || {};
            // Snapchat spend in micro-currency
            const spend = (stats.spend || 0) / 1000000;
            const impressions = stats.impressions || 0;
            const clicks = stats.swipes || 0;
            const conversions = stats.conversion_purchases || 0;
            const revenue = (stats.conversion_purchases_value || 0) / 1000000;
            const roas = spend > 0 ? revenue / spend : 0;
            const cpc = clicks > 0 ? spend / clicks : 0;
            const cpm = impressions > 0 ? (spend / impressions) * 1000 : 0;
            const ctr = impressions > 0 ? (clicks / impressions) * 100 : 0;

            totalSpend += spend;
            totalRevenue += revenue;

            await prisma.adDailyMetric.upsert({
              where: {
                storeId_accountId_date: {
                  storeId,
                  accountId: account.id,
                  date: dateStr,
                },
              },
              create: {
                storeId,
                accountId: account.id,
                platform: "SNAPCHAT",
                date: dateStr,
                spend,
                impressions,
                clicks,
                conversions,
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
                conversions,
                revenue,
                cpc,
                cpm,
                ctr,
                roas,
              },
            });
            recordsSynced++;
          }
        }
      } catch (e) {
        console.error(`[SNAPCHAT_SYNC_ERROR] ${account.accountId}:`, e);
      }
    }

    // 4. REDDIT ADS SYNC
    else if (account.platform === "REDDIT" && account.accessToken) {
      try {
        const url = `https://ads-api.reddit.com/api/v2.0/accounts/${account.accountId}/reports?unit=DAY`;
        const res = await fetch(url, {
          headers: { Authorization: `Bearer ${account.accessToken.trim()}` },
        });

        if (res.ok) {
          const redditData = await res.json();
          const rows = redditData.data || [];

          for (const row of rows) {
            const dateStr = row.date;
            if (!dateStr) continue;

            const spend = parseFloat(row.spend || "0");
            const impressions = parseInt(row.impressions || "0", 10);
            const clicks = parseInt(row.clicks || "0", 10);
            const conversions = parseInt(row.conversion_purchases || "0", 10);
            const revenue = parseFloat(row.conversion_purchases_value || "0");
            const roas = spend > 0 ? revenue / spend : 0;
            const cpc = clicks > 0 ? spend / clicks : 0;
            const cpm = impressions > 0 ? (spend / impressions) * 1000 : 0;
            const ctr = impressions > 0 ? (clicks / impressions) * 100 : 0;

            totalSpend += spend;
            totalRevenue += revenue;

            await prisma.adDailyMetric.upsert({
              where: {
                storeId_accountId_date: {
                  storeId,
                  accountId: account.id,
                  date: dateStr,
                },
              },
              create: {
                storeId,
                accountId: account.id,
                platform: "REDDIT",
                date: dateStr,
                spend,
                impressions,
                clicks,
                conversions,
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
                conversions,
                revenue,
                cpc,
                cpm,
                ctr,
                roas,
              },
            });
            recordsSynced++;
          }
        }
      } catch (e) {
        console.error(`[REDDIT_SYNC_ERROR] ${account.accountId}:`, e);
      }
    }

    // Recalculate this month's totals
    const thisMonthStart = new Date();
    thisMonthStart.setDate(1);
    const thisMonthStr = thisMonthStart.toISOString().split("T")[0];

    const monthMetrics = await prisma.adDailyMetric.findMany({
      where: {
        storeId,
        accountId: account.id,
        date: { gte: thisMonthStr },
      },
    });

    const monthSpend = monthMetrics.reduce((s, m) => s + (m.spend || 0), 0);
    const monthRevenue = monthMetrics.reduce((s, m) => s + (m.revenue || 0), 0);
    const monthRoas = monthSpend > 0 ? monthRevenue / monthSpend : 0;

    await prisma.adPlatformAccount.update({
      where: { id: account.id },
      data: {
        spendThisMonth: Number(monthSpend.toFixed(2)),
        roas: Number(monthRoas.toFixed(2)),
        lastSyncedAt: new Date(),
      },
    });

    return {
      accountId: account.accountId,
      platform: account.platform,
      accountName: account.accountName,
      recordsSynced,
      totalSpend: Number(totalSpend.toFixed(2)),
      totalRevenue: Number(totalRevenue.toFixed(2)),
    };
  }

  /**
   * Sync all connected ad accounts across all providers
   */
  static async syncAllConnectedAccounts(storeId: string) {
    const accounts = await this.getAllAccounts(storeId);
    const activeAccounts = accounts.filter((a) => a.status === "ACTIVE");

    const results: any[] = [];
    let totalSpendSynced = 0;
    let totalRecordsSynced = 0;

    for (const acc of activeAccounts) {
      try {
        const res = await this.syncAccount(acc.id, storeId);
        results.push({ ...res, status: "SUCCESS" });
        totalSpendSynced += res.totalSpend || 0;
        totalRecordsSynced += res.recordsSynced || 0;
      } catch (e: any) {
        results.push({
          accountId: acc.accountId,
          platform: acc.platform,
          accountName: acc.accountName,
          status: "FAILED",
          error: e.message,
        });
      }
    }

    return {
      syncedCount: activeAccounts.length,
      totalSpendSynced: Number(totalSpendSynced.toFixed(2)),
      totalRecordsSynced,
      results,
    };
  }

  /**
   * Omnichannel Overview: Aggregates metrics across all connected accounts
   */
  static async getOmnichannelOverview(storeId: string, period: string = "7d", platformFilter?: string) {
    const accounts = await this.getAllAccounts(storeId);
    const filteredAccounts = platformFilter && platformFilter !== "ALL"
      ? accounts.filter((a) => a.platform.toUpperCase() === platformFilter.toUpperCase())
      : accounts;

    // Determine date boundary
    const now = new Date();
    let dateGte = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
    if (period === "today") {
      dateGte = new Date(now.setHours(0, 0, 0, 0));
    } else if (period === "yesterday") {
      const y = new Date(Date.now() - 24 * 60 * 60 * 1000);
      dateGte = new Date(y.setHours(0, 0, 0, 0));
    } else if (period === "30d") {
      dateGte = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
    } else if (period === "90d") {
      dateGte = new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000);
    }
    const dateGteStr = dateGte.toISOString().split("T")[0];

    // Fetch Shopify live sales for store-level true ROAS & MER
    let storeRevenue = 0;
    let storeOrdersCount = 0;

    try {
      const shopifyOrders = await prisma.shopifyOrder.findMany({
        where: {
          storeId,
          createdAt: { gte: dateGte },
          cancelledAt: null,
          NOT: [{ financialStatus: "VOIDED" }, { financialStatus: "CANCELLED" }],
        },
        select: { totalPrice: true },
      });

      storeRevenue = shopifyOrders.reduce((sum, o) => sum + (o.totalPrice || 0), 0);
      storeOrdersCount = shopifyOrders.length;
    } catch (e) {
      console.error("Failed to query Shopify orders for MER:", e);
    }

    // Query DB daily metrics for precision and speed
    const allMetrics = await prisma.adDailyMetric.findMany({
      where: {
        storeId,
        date: { gte: dateGteStr },
      },
    });

    // Provider Breakdown tracking for Google, Meta, Snapchat, Reddit
    const byProvider: Record<
      string,
      {
        platform: string;
        displayName: string;
        connected: boolean;
        accountsCount: number;
        spend: number;
        revenue: number;
        roas: number;
        impressions: number;
        clicks: number;
        purchases: number;
        cpc: number;
        cpm: number;
        ctr: number;
      }
    > = {
      META: {
        platform: "META",
        displayName: "Meta (Facebook & Instagram)",
        connected: accounts.some((a) => a.platform === "META" && a.status === "ACTIVE"),
        accountsCount: accounts.filter((a) => a.platform === "META").length,
        spend: 0,
        revenue: 0,
        roas: 0,
        impressions: 0,
        clicks: 0,
        purchases: 0,
        cpc: 0,
        cpm: 0,
        ctr: 0,
      },
      GOOGLE: {
        platform: "GOOGLE",
        displayName: "Google Ads",
        connected: accounts.some((a) => a.platform === "GOOGLE" && a.status === "ACTIVE"),
        accountsCount: accounts.filter((a) => a.platform === "GOOGLE").length,
        spend: 0,
        revenue: 0,
        roas: 0,
        impressions: 0,
        clicks: 0,
        purchases: 0,
        cpc: 0,
        cpm: 0,
        ctr: 0,
      },
      SNAPCHAT: {
        platform: "SNAPCHAT",
        displayName: "Snapchat Ads",
        connected: accounts.some((a) => a.platform === "SNAPCHAT" && a.status === "ACTIVE"),
        accountsCount: accounts.filter((a) => a.platform === "SNAPCHAT").length,
        spend: 0,
        revenue: 0,
        roas: 0,
        impressions: 0,
        clicks: 0,
        purchases: 0,
        cpc: 0,
        cpm: 0,
        ctr: 0,
      },
      REDDIT: {
        platform: "REDDIT",
        displayName: "Reddit Ads",
        connected: accounts.some((a) => a.platform === "REDDIT" && a.status === "ACTIVE"),
        accountsCount: accounts.filter((a) => a.platform === "REDDIT").length,
        spend: 0,
        revenue: 0,
        roas: 0,
        impressions: 0,
        clicks: 0,
        purchases: 0,
        cpc: 0,
        cpm: 0,
        ctr: 0,
      },
    };

    // Aggregate per account
    const accountSummaries: Array<{
      id: string;
      platform: string;
      accountId: string;
      accountName: string;
      status: string;
      currency: string;
      spend: number;
      revenue: number;
      roas: number;
      impressions: number;
      clicks: number;
      purchases: number;
      cpc: number;
      cpm: number;
      ctr: number;
      cpa: number;
      lastSyncedAt: Date | null;
    }> = [];

    for (const acc of filteredAccounts) {
      const accMetrics = allMetrics.filter((m) => m.accountId === acc.id);
      let spend = accMetrics.reduce((sum, m) => sum + (m.spend || 0), 0);
      let revenue = accMetrics.reduce((sum, m) => sum + (m.revenue || 0), 0);
      let impressions = accMetrics.reduce((sum, m) => sum + (m.impressions || 0), 0);
      let clicks = accMetrics.reduce((sum, m) => sum + (m.clicks || 0), 0);
      let purchases = accMetrics.reduce((sum, m) => sum + (m.conversions || 0), 0);

      // If DB metrics are 0 and account is Meta with live token, fallback to live query
      if (spend === 0 && acc.platform === "META" && acc.accessToken) {
        try {
          const datePreset = period === "today" ? "today" : period === "yesterday" ? "yesterday" : period === "30d" ? "last_30d" : "last_7d";
          const res = await fetch(
            `https://graph.facebook.com/v19.0/${acc.accountId}/insights?date_preset=${datePreset}&fields=spend,impressions,clicks,cpc,cpm,ctr,actions,action_values,purchase_roas&access_token=${acc.accessToken}`
          );
          if (res.ok) {
            const data = await res.json();
            const insight = data.data?.[0];
            if (insight) {
              spend = parseFloat(insight.spend || "0");
              impressions = parseInt(insight.impressions || "0", 10);
              clicks = parseInt(insight.clicks || "0", 10);

              const actions = insight.actions || [];
              const pAction = actions.find(
                (a: any) =>
                  a.action_type === "purchase" ||
                  a.action_type === "omni_purchase" ||
                  a.action_type === "offsite_conversion.fb_pixel_purchase"
              );
              purchases = pAction ? parseInt(pAction.value || "0", 10) : 0;

              const actionValues = insight.action_values || [];
              const revVal = actionValues.find(
                (a: any) =>
                  a.action_type === "purchase" ||
                  a.action_type === "omni_purchase" ||
                  a.action_type === "offsite_conversion.fb_pixel_purchase"
              );
              revenue = revVal ? parseFloat(revVal.value || "0") : 0;
            }
          }
        } catch (_) {}
      }

      const roas = spend > 0 ? (revenue > 0 ? revenue / spend : (storeRevenue > 0 ? (storeRevenue / (filteredAccounts.length || 1)) / spend : 0)) : 0;
      const cpc = clicks > 0 ? spend / clicks : 0;
      const cpm = impressions > 0 ? (spend / impressions) * 1000 : 0;
      const ctr = impressions > 0 ? (clicks / impressions) * 100 : 0;
      const cpa = purchases > 0 ? spend / purchases : (storeOrdersCount > 0 ? spend / storeOrdersCount : 0);

      // Add to provider breakdown
      const provKey = acc.platform.toUpperCase();
      if (byProvider[provKey]) {
        byProvider[provKey].spend += spend;
        byProvider[provKey].revenue += revenue;
        byProvider[provKey].impressions += impressions;
        byProvider[provKey].clicks += clicks;
        byProvider[provKey].purchases += purchases;
      }

      accountSummaries.push({
        id: acc.id,
        platform: acc.platform,
        accountId: acc.accountId,
        accountName: acc.accountName,
        status: acc.status,
        currency: acc.currency,
        spend: Number(spend.toFixed(2)),
        revenue: Number(revenue.toFixed(2)),
        roas: Number(roas.toFixed(2)),
        impressions,
        clicks,
        purchases,
        cpc: Number(cpc.toFixed(2)),
        cpm: Number(cpm.toFixed(2)),
        ctr: Number(ctr.toFixed(2)),
        cpa: Number(cpa.toFixed(2)),
        lastSyncedAt: acc.lastSyncedAt,
      });
    }

    // Finalize provider level ROAS, CPC, CPM, CTR
    Object.keys(byProvider).forEach((key) => {
      const p = byProvider[key];
      p.spend = Number(p.spend.toFixed(2));
      p.revenue = Number(p.revenue.toFixed(2));
      p.roas = p.spend > 0 ? Number((p.revenue / p.spend).toFixed(2)) : 0;
      p.cpc = p.clicks > 0 ? Number((p.spend / p.clicks).toFixed(2)) : 0;
      p.cpm = p.impressions > 0 ? Number(((p.spend / p.impressions) * 1000).toFixed(2)) : 0;
      p.ctr = p.impressions > 0 ? Number(((p.clicks / p.impressions) * 100).toFixed(2)) : 0;
    });

    // Total Blended Metrics
    const totalSpend = accountSummaries.reduce((sum, a) => sum + a.spend, 0);
    const totalRevenue = accountSummaries.reduce((sum, a) => sum + a.revenue, 0);
    const totalImpressions = accountSummaries.reduce((sum, a) => sum + a.impressions, 0);
    const totalClicks = accountSummaries.reduce((sum, a) => sum + a.clicks, 0);
    const totalPurchases = accountSummaries.reduce((sum, a) => sum + a.purchases, 0);

    const blendedRoas = totalSpend > 0 ? (totalRevenue > 0 ? totalRevenue / totalSpend : storeRevenue / totalSpend) : 0;
    const blendedCpc = totalClicks > 0 ? totalSpend / totalClicks : 0;
    const blendedCpm = totalImpressions > 0 ? (totalSpend / totalImpressions) * 1000 : 0;
    const blendedCtr = totalImpressions > 0 ? (totalClicks / totalImpressions) * 100 : 0;
    const blendedCpa = totalPurchases > 0 ? totalSpend / totalPurchases : (storeOrdersCount > 0 ? totalSpend / storeOrdersCount : 0);
    const mer = totalSpend > 0 && storeRevenue > 0 ? storeRevenue / totalSpend : 0;

    return {
      success: true,
      period,
      platformFilter: platformFilter || "ALL",
      summary: {
        totalAccounts: accounts.length,
        activeAccounts: accounts.filter((a) => a.status === "ACTIVE").length,
        metaAccounts: accounts.filter((a) => a.platform === "META").length,
        googleAccounts: accounts.filter((a) => a.platform === "GOOGLE").length,
        snapchatAccounts: accounts.filter((a) => a.platform === "SNAPCHAT").length,
        redditAccounts: accounts.filter((a) => a.platform === "REDDIT").length,
        totalSpend: Number(totalSpend.toFixed(2)),
        totalRevenue: Number(totalRevenue.toFixed(2)),
        storeRevenue: Number(storeRevenue.toFixed(2)),
        storeOrdersCount,
        blendedRoas: Number(blendedRoas.toFixed(2)),
        mer: Number(mer.toFixed(2)),
        totalImpressions,
        totalClicks,
        totalPurchases,
        blendedCpc: Number(blendedCpc.toFixed(2)),
        blendedCpm: Number(blendedCpm.toFixed(2)),
        blendedCtr: Number(blendedCtr.toFixed(2)),
        blendedCpa: Number(blendedCpa.toFixed(2)),
      },
      byProvider,
      accounts: accountSummaries,
    };
  }
}
