import prisma from "@/lib/prisma";

export class MetaPixelService {
  /**
   * Helper: Calculate date range filter
   */
  private static getDateRange(period: string, customStart?: string, customEnd?: string) {
    const now = new Date();
    const todayStr = now.toISOString().split("T")[0];

    if (customStart && customEnd) {
      return { startDate: customStart, endDate: customEnd };
    }

    switch (period) {
      case "today": {
        return { startDate: todayStr, endDate: todayStr };
      }
      case "yesterday": {
        const y = new Date(now.getTime() - 24 * 60 * 60 * 1000);
        const yStr = y.toISOString().split("T")[0];
        return { startDate: yStr, endDate: yStr };
      }
      case "30d": {
        const d30 = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
        return { startDate: d30.toISOString().split("T")[0], endDate: todayStr };
      }
      case "7d":
      default: {
        const d7 = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
        return { startDate: d7.toISOString().split("T")[0], endDate: todayStr };
      }
    }
  }

  /**
   * Get current Meta Pixel status & event counts for a specific date range
   */
  static async getOverview(storeId: string, period: string = "7d", customStart?: string, customEnd?: string) {
    const pixel = await prisma.metaPixel.findFirst({
      where: { storeId, status: "ACTIVE" },
    });

    if (!pixel) {
      return {
        isConnected: false,
        pixel: null,
        period,
        stats: {
          totalEvents: 0,
          purchases: 0,
          add_to_cart: 0,
          initiate_checkout: 0,
          page_views: 0,
        },
        dailyBreakdown: [],
        recentEvents: [],
      };
    }

    const { startDate, endDate } = this.getDateRange(period, customStart, customEnd);

    // Fetch events in range
    const events = await prisma.metaPixelEvent.findMany({
      where: {
        storeId,
        pixelId: pixel.pixelId,
        date: {
          gte: startDate,
          lte: endDate,
        },
      },
      orderBy: { date: "desc" },
    });

    // Also get order conversion count in this period for cross-verification
    const ordersCount = await prisma.shopifyOrder.count({
      where: {
        storeId,
        createdAt: {
          gte: new Date(`${startDate}T00:00:00.000Z`),
          lte: new Date(`${endDate}T23:59:59.999Z`),
        },
      },
    });

    // Calculate aggregated metrics
    const purchases = events
      .filter((e) => e.eventName === "Purchase")
      .reduce((acc, e) => acc + e.eventCount, 0);

    const add_to_cart = events
      .filter((e) => e.eventName === "AddToCart")
      .reduce((acc, e) => acc + e.eventCount, 0);

    const initiate_checkout = events
      .filter((e) => e.eventName === "InitiateCheckout")
      .reduce((acc, e) => acc + e.eventCount, 0);

    const page_views = events
      .filter((e) => e.eventName === "PageView")
      .reduce((acc, e) => acc + e.eventCount, 0);

    const totalEvents = events.reduce((acc, e) => acc + e.eventCount, 0);

    // Group events by day for the daily breakdown table
    const daysMap: Record<string, { date: string; total: number; purchases: number; add_to_cart: number; page_views: number; other: number }> = {};

    events.forEach((ev) => {
      if (!daysMap[ev.date]) {
        daysMap[ev.date] = {
          date: ev.date,
          total: 0,
          purchases: 0,
          add_to_cart: 0,
          page_views: 0,
          other: 0,
        };
      }
      daysMap[ev.date].total += ev.eventCount;
      if (ev.eventName === "Purchase") daysMap[ev.date].purchases += ev.eventCount;
      else if (ev.eventName === "AddToCart") daysMap[ev.date].add_to_cart += ev.eventCount;
      else if (ev.eventName === "PageView") daysMap[ev.date].page_views += ev.eventCount;
      else daysMap[ev.date].other += ev.eventCount;
    });

    const dailyBreakdown = Object.values(daysMap).sort((a, b) => b.date.localeCompare(a.date));

    return {
      isConnected: true,
      period,
      startDate,
      endDate,
      pixel: {
        pixelId: pixel.pixelId,
        name: pixel.name || "Facebook Pixel",
        status: pixel.status,
        lastFiredAt: pixel.lastFiredAt,
        lastSyncedAt: pixel.lastSyncedAt,
        testEventCode: pixel.testEventCode,
      },
      stats: {
        totalEvents,
        purchases: purchases || ordersCount, // Align with synced store orders
        add_to_cart,
        initiate_checkout,
        page_views,
        ordersCount,
      },
      dailyBreakdown,
      recentEvents: events.slice(0, 50),
    };
  }

  /**
   * Live Sync Pixel events with Meta Graph API and Shopify orders
   */
  static async syncPixelData(storeId: string, period: string = "7d") {
    const pixel = await prisma.metaPixel.findFirst({
      where: { storeId, status: "ACTIVE" },
    });

    if (!pixel) {
      throw new Error("No active Meta Pixel found to sync.");
    }

    const { startDate } = this.getDateRange(period);

    // 1. Fetch live pixel stats from Meta Graph API if available
    try {
      const statsRes = await fetch(
        `https://graph.facebook.com/v19.0/${pixel.pixelId}/stats?access_token=${pixel.accessToken}&aggregation=event`
      );
      if (statsRes.ok) {
        const statsData = await statsRes.json();
        const dataList = statsData.data || [];

        for (const item of dataList) {
          const eventName = item.value || item.event;
          const count = parseInt(item.count || "0", 10);
          if (eventName && count > 0) {
            const todayStr = new Date().toISOString().split("T")[0];
            await prisma.metaPixelEvent.upsert({
              where: {
                storeId_pixelId_eventName_date: {
                  storeId,
                  pixelId: pixel.pixelId,
                  eventName,
                  date: todayStr,
                },
              },
              create: {
                storeId,
                pixelId: pixel.pixelId,
                eventName,
                date: todayStr,
                eventCount: count,
              },
              update: {
                eventCount: count,
              },
            });
          }
        }
      }
    } catch (e) {
      console.error("Meta Pixel API stats sync error:", e);
    }

    // 2. Synchronize store orders into CAPI Purchase event timeline
    const recentOrders = await prisma.shopifyOrder.findMany({
      where: {
        storeId,
        createdAt: {
          gte: new Date(`${startDate}T00:00:00.000Z`),
        },
      },
    });

    // Group orders by creation date
    const ordersByDate: Record<string, number> = {};
    recentOrders.forEach((o) => {
      const d = new Date(o.createdAt).toISOString().split("T")[0];
      ordersByDate[d] = (ordersByDate[d] || 0) + 1;
    });

    for (const [d, count] of Object.entries(ordersByDate)) {
      await prisma.metaPixelEvent.upsert({
        where: {
          storeId_pixelId_eventName_date: {
            storeId,
            pixelId: pixel.pixelId,
            eventName: "Purchase",
            date: d,
          },
        },
        create: {
          storeId,
          pixelId: pixel.pixelId,
          eventName: "Purchase",
          date: d,
          eventCount: count,
        },
        update: {
          eventCount: count,
        },
      });
    }

    await prisma.metaPixel.update({
      where: { id: pixel.id },
      data: { lastSyncedAt: new Date() },
    });

    return this.getOverview(storeId, period);
  }

  /**
   * Connect or Update Meta Pixel & CAPI Access Token
   */
  static async connectPixel(
    storeId: string,
    data: {
      pixelId: string;
      name?: string;
      accessToken: string;
      testEventCode?: string;
    }
  ) {
    const cleanPixelId = (data.pixelId || "").trim();
    if (!cleanPixelId) {
      throw new Error("Pixel ID is required.");
    }

    const cleanToken = (data.accessToken || "").trim();
    if (!cleanToken) {
      throw new Error("Access Token is required.");
    }

    // Verify Pixel ID with Meta Graph API
    let pixelName = data.name || "Facebook Pixel";
    try {
      const verifyRes = await fetch(
        `https://graph.facebook.com/v19.0/${cleanPixelId}?fields=id,name,creation_time,last_fired_time&access_token=${cleanToken}`
      );
      if (verifyRes.ok) {
        const verifyData = await verifyRes.json();
        if (verifyData.name) {
          pixelName = verifyData.name;
        }
      }
    } catch (e) {
      // Allow saving even if offline
    }

    const pixel = await prisma.metaPixel.upsert({
      where: {
        storeId_pixelId: {
          storeId,
          pixelId: cleanPixelId,
        },
      },
      create: {
        storeId,
        pixelId: cleanPixelId,
        name: pixelName,
        accessToken: cleanToken,
        testEventCode: data.testEventCode?.trim() || null,
        status: "ACTIVE",
        lastSyncedAt: new Date(),
      },
      update: {
        name: pixelName,
        accessToken: cleanToken,
        testEventCode: data.testEventCode?.trim() || null,
        status: "ACTIVE",
        lastSyncedAt: new Date(),
      },
    });

    // Run initial sync
    try {
      await this.syncPixelData(storeId, "7d");
    } catch (e) {}

    return { success: true, pixel };
  }

  /**
   * Send a Server-Side Event via Conversions API (CAPI)
   */
  static async sendCapiEvent(
    storeId: string,
    params: {
      pixelId?: string;
      eventName: "PageView" | "ViewContent" | "AddToCart" | "InitiateCheckout" | "Purchase" | string;
      eventId?: string;
      eventSourceUrl?: string;
      userData?: {
        em?: string;
        ph?: string;
        client_ip_address?: string;
        client_user_agent?: string;
      };
      customData?: {
        currency?: string;
        value?: number;
        order_id?: string;
        content_ids?: string[];
        num_items?: number;
      };
    }
  ) {
    const pixel = params.pixelId
      ? await prisma.metaPixel.findUnique({
          where: {
            storeId_pixelId: {
              storeId,
              pixelId: params.pixelId,
            },
          },
        })
      : await prisma.metaPixel.findFirst({
          where: {
            storeId,
            status: "ACTIVE",
          },
        });

    if (!pixel) {
      throw new Error("No active Meta Pixel configured.");
    }

    const nowSeconds = Math.floor(Date.now() / 1000);
    const todayStr = new Date().toISOString().split("T")[0];

    const payload: any = {
      data: [
        {
          event_name: params.eventName,
          event_time: nowSeconds,
          action_source: "website",
          event_id: params.eventId || `voop_${Date.now()}_${Math.random().toString(36).substring(7)}`,
          event_source_url: params.eventSourceUrl || "https://monkeygarage.in",
          user_data: params.userData || {
            client_ip_address: "127.0.0.1",
            client_user_agent: "VOOP-Commerce-Server/1.0",
          },
          custom_data: params.customData || {},
        },
      ],
    };

    if (pixel.testEventCode) {
      payload.test_event_code = pixel.testEventCode;
    }

    const res = await fetch(`https://graph.facebook.com/v19.0/${pixel.pixelId}/events?access_token=${pixel.accessToken}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });

    const resData = await res.json().catch(() => ({}));

    // Record event locally
    await prisma.metaPixelEvent.upsert({
      where: {
        storeId_pixelId_eventName_date: {
          storeId,
          pixelId: pixel.pixelId,
          eventName: params.eventName,
          date: todayStr,
        },
      },
      create: {
        storeId,
        pixelId: pixel.pixelId,
        eventName: params.eventName,
        date: todayStr,
        eventCount: 1,
      },
      update: {
        eventCount: { increment: 1 },
      },
    });

    await prisma.metaPixel.update({
      where: { id: pixel.id },
      data: { lastFiredAt: new Date() },
    });

    if (!res.ok) {
      throw new Error(`CAPI dispatch error: ${resData.error?.message || "Failed to send event"}`);
    }

    return {
      success: true,
      events_received: resData.events_received || 1,
      fbtrace_id: resData.fbtrace_id,
    };
  }

  /**
   * Disconnect Pixel
   */
  static async disconnectPixel(storeId: string, pixelId: string) {
    return prisma.metaPixel.deleteMany({
      where: {
        storeId,
        OR: [{ pixelId }, { pixelId: pixelId.trim() }],
      },
    });
  }
}
