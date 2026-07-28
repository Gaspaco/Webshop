import type { APIEvent } from "@solidjs/start/server";
import { desc, eq, inArray, or } from "drizzle-orm";
import { db } from "~/db";
import {
  orderItems,
  orders,
  payments,
  products,
  wishlistItems,
} from "~/db/schema";
import { auth } from "~/lib/auth";

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
  const session = await auth.api.getSession({
    headers: event.request.headers,
  });

  if (!session) {
    return json({ error: "Authentication required." }, { status: 401 });
  }

  const customerOrders = await db
    .select({
      id: orders.id,
      orderNumber: orders.orderNumber,
      status: orders.status,
      currency: orders.currency,
      totalCents: orders.totalCents,
      shippingAddress: orders.shippingAddress,
      createdAt: orders.createdAt,
    })
    .from(orders)
    .where(
      or(
        eq(orders.userId, session.user.id),
        eq(orders.email, session.user.email),
      ),
    )
    .orderBy(desc(orders.createdAt))
    .limit(20);

  const itemRows = customerOrders.length
    ? await db
        .select({
          orderId: orderItems.orderId,
          name: orderItems.name,
          quantity: orderItems.quantity,
        })
        .from(orderItems)
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

  const itemsByOrder = new Map<
    string,
    Array<{ name: string; quantity: number }>
  >();

  for (const item of itemRows) {
    const current = itemsByOrder.get(item.orderId) ?? [];
    current.push({ name: item.name, quantity: item.quantity });
    itemsByOrder.set(item.orderId, current);
  }

  const wishlist = await db
    .select({
      id: products.id,
      slug: products.slug,
      name: products.name,
      game: products.game,
      imageUrls: products.imageUrls,
      createdAt: wishlistItems.createdAt,
    })
    .from(wishlistItems)
    .innerJoin(products, eq(wishlistItems.productId, products.id))
    .where(eq(wishlistItems.userId, session.user.id))
    .orderBy(desc(wishlistItems.createdAt))
    .limit(24);

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
      image: item.imageUrls[0] ?? null,
      createdAt: item.createdAt,
    })),
    payments: paymentRows,
    latestAddress: customerOrders[0]?.shippingAddress ?? null,
  });
}
