import { safeApiResponse } from "~/lib/request-security.server";
import type { APIEvent } from "@solidjs/start/server";
import { desc, eq, inArray, sql } from "drizzle-orm";
import { db } from "~/db";
import {
  customerAddresses,
  orderItems,
  orders,
  payments,
  products,
  productVariants,
  wishlistItems,
} from "~/db/schema";
import { auth } from "~/lib/auth";
import { customerOrderAccess } from "~/lib/order-access";

function json(data: unknown, init?: ResponseInit) {
  return Response.json(data, {
    ...init,
    headers: {
      "Cache-Control": "private, no-store",
      ...(init?.headers ?? {}),
    },
  });
}

export async function GET(event: APIEvent) {
  return safeApiResponse(async () => {
  const session = await auth.api.getSession({
    headers: event.request.headers,
  });

  if (!session) {
    return json({ error: "Authentication required." }, { status: 401 });
  }
  if ((session.user as { role?: string }).role === "admin") {
    return json(
      { error: "Owner accounts use the admin dashboard." },
      { status: 403 },
    );
  }

  const customerOrders = await db
    .select({
      id: orders.id,
      orderNumber: orders.orderNumber,
      status: orders.status,
      currency: orders.currency,
      totalCents: orders.totalCents,
      shippingAddress: orders.shippingAddress,
      trackingNumber: orders.trackingNumber,
      trackingUrl: orders.trackingUrl,
      shippedAt: orders.shippedAt,
      createdAt: orders.createdAt,
    })
    .from(orders)
    .where(customerOrderAccess(session.user))
    .orderBy(desc(orders.createdAt))
    .limit(20);

  const itemRows = customerOrders.length
    ? await db
        .select({
          orderId: orderItems.orderId,
          name: orderItems.name,
          quantity: orderItems.quantity,
          variantId: orderItems.variantId,
          productId: products.id,
          slug: products.slug,
          // Only whether a photo exists: images are served by the catalog
          // image endpoint, never embedded in this response.
          variantHasImage: sql<boolean>`coalesce(${productVariants.imageUrl} <> '', false)`,
          productHasImage: sql<boolean>`coalesce(jsonb_array_length(${products.imageUrls}) > 0, false)`,
        })
        .from(orderItems)
        .leftJoin(productVariants, eq(orderItems.variantId, productVariants.id))
        .leftJoin(products, eq(productVariants.productId, products.id))
        .where(inArray(orderItems.orderId, customerOrders.map(order => order.id)))
    : [];

  const paymentRows = customerOrders.length
    ? await db
        .select({
          id: payments.id,
          orderId: payments.orderId,
          orderNumber: orders.orderNumber,
          status: payments.status,
          method: payments.method,
          amountCents: payments.amountCents,
          createdAt: payments.createdAt,
        })
        .from(payments)
        .innerJoin(orders, eq(payments.orderId, orders.id))
        .where(inArray(payments.orderId, customerOrders.map(order => order.id)))
        .orderBy(desc(payments.createdAt))
        .limit(20)
    : [];

  type AccountOrderItem = {
    name: string;
    quantity: number;
    slug: string | null;
    image: string | null;
  };
  const itemsByOrder = new Map<string, AccountOrderItem[]>();

  for (const item of itemRows) {
    const current = itemsByOrder.get(item.orderId) ?? [];
    current.push({
      name: item.name,
      quantity: item.quantity,
      slug: item.slug,
      image:
        item.variantId && item.variantHasImage
          ? `/api/catalog/image?variant=${encodeURIComponent(item.variantId)}`
          : item.productId && item.productHasImage
            ? `/api/catalog/image?product=${encodeURIComponent(item.productId)}`
            : null,
    });
    itemsByOrder.set(item.orderId, current);
  }

  const wishlist = await db
    .select({
      id: products.id,
      slug: products.slug,
      name: products.name,
      game: products.game,
      hasImage: sql<boolean>`jsonb_array_length(${products.imageUrls}) > 0`,
      createdAt: wishlistItems.createdAt,
    })
    .from(wishlistItems)
    .innerJoin(products, eq(wishlistItems.productId, products.id))
    .where(eq(wishlistItems.userId, session.user.id))
    .orderBy(desc(wishlistItems.createdAt))
    .limit(24);

  const [savedAddress] = await db
    .select({
      firstName: customerAddresses.firstName,
      lastName: customerAddresses.lastName,
      streetAndHouseNumber: customerAddresses.streetAndHouseNumber,
      postalCode: customerAddresses.postalCode,
      city: customerAddresses.city,
      country: customerAddresses.country,
    })
    .from(customerAddresses)
    .where(eq(customerAddresses.userId, session.user.id))
    .limit(1);

  return json({
    orders: customerOrders.map(order => ({
      ...order,
      items: itemsByOrder.get(order.id) ?? [],
    })),
    wishlist: wishlist.map(item => ({
      id: item.id,
      slug: item.slug,
      name: item.name,
      game: item.game,
      image: item.hasImage
        ? `/api/catalog/image?product=${encodeURIComponent(item.id)}`
        : null,
      createdAt: item.createdAt,
    })),
    payments: paymentRows,
    latestAddress:
      savedAddress ?? customerOrders[0]?.shippingAddress ?? null,
    hasSavedAddress: Boolean(savedAddress),
  });
  });
}
