import { prisma } from "../prisma";
import { shopifyGraphQL, syncAll, syncProducts, syncOrders } from "../shopify";

export class ShopifyService {
  /**
   * Get store sync summary and health
   */
  static async getStoreSummary() {
    const store = await prisma.shopifyStore.findFirst({
      where: { isConnected: true },
    });

    if (!store) return null;

    const [productCount, variantCount, orderCount] = await Promise.all([
      prisma.shopifyProduct.count({ where: { storeId: store.id } }),
      prisma.shopifyVariant.count({ where: { storeId: store.id } }),
      prisma.shopifyOrder.count({ where: { storeId: store.id } }),
    ]);

    return {
      store,
      counts: {
        products: productCount,
        variants: variantCount,
        orders: orderCount,
      },
    };
  }

  /**
   * Fetch paginated orders with detailed line items
   */
  static async getOrders(params: {
    page?: number;
    limit?: number;
    search?: string;
    financialStatus?: string;
    fulfillmentStatus?: string;
  }) {
    const page = Math.max(1, Number(params.page) || 1);
    const limit = Math.min(100, Math.max(1, Number(params.limit) || 25));
    const skip = (page - 1) * limit;

    const where: any = {};
    if (params.financialStatus && params.financialStatus !== "ALL") {
      where.financialStatus = params.financialStatus;
    }
    if (params.fulfillmentStatus && params.fulfillmentStatus !== "ALL") {
      where.fulfillmentStatus = params.fulfillmentStatus;
    }
    if (params.search) {
      where.OR = [
        { name: { contains: params.search } },
        { orderNumber: { contains: params.search } },
        { email: { contains: params.search } },
      ];
    }

    const [orders, total] = await Promise.all([
      prisma.shopifyOrder.findMany({
        where,
        skip,
        take: limit,
        orderBy: { createdAt: "desc" },
        include: {
          items: true,
          fulfillments: true,
        },
      }),
      prisma.shopifyOrder.count({ where }),
    ]);

    return {
      orders,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    };
  }

  /**
   * Fetch single order details by orderNumber or ID
   */
  static async getOrderDetail(orderNumberOrId: string) {
    return prisma.shopifyOrder.findFirst({
      where: {
        OR: [
          { orderNumber: orderNumberOrId },
          { id: orderNumberOrId },
          { shopifyOrderId: orderNumberOrId },
        ],
      },
      include: {
        items: true,
        fulfillments: true,
      },
    });
  }

  /**
   * Trigger full store sync
   */
  static async triggerFullSync() {
    return syncAll();
  }
}
