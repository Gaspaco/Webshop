import type { APIEvent } from "@solidjs/start/server";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "~/db";
import { orders, payments } from "~/db/schema";
import { checkRateLimit } from "~/lib/rate-limit.server";
import { auth } from "~/lib/auth";
import { verifyGuestOrderToken } from "~/lib/guest-order-access";

const orderNumberSchema = z
  .string()
  .trim()
  .toUpperCase()
  .regex(/^TCG-[A-F0-9]{10}$/);

function json(data: unknown, init?: ResponseInit) {
  return Response.json(data, {
    ...init,
    headers: {
      "Cache-Control": "private, no-store",
      "X-Content-Type-Options": "nosniff",
      ...(init?.headers ?? {}),
    },
  });
}

export async function GET(event: APIEvent) {
  const parsed = orderNumberSchema.safeParse(
    new URL(event.request.url).searchParams.get("order"),
  );

  if (!parsed.success) {
    return json({ error: "The order reference is invalid." }, { status: 400 });
  }

  if (
    await checkRateLimit({ event, namespace: "checkout-status-total", identity: "all", limit: 120, windowMs: 10 * 60 * 1000 }) ||
    await checkRateLimit({
      event,
      namespace: "checkout-status",
      identity: parsed.data,
      limit: 60,
      windowMs: 10 * 60 * 1000,
    })
  ) {
    return json(
      { error: "Too many status checks. Please wait a moment." },
      { status: 429, headers: { "Retry-After": "60" } },
    );
  }

  const [order] = await db
    .select({
      orderNumber: orders.orderNumber,
      guestAccessHash: orders.guestAccessHash,
      userId: orders.userId,
      email: orders.email,
      orderStatus: orders.status,
      paymentStatus: payments.status,
      totalCents: orders.totalCents,
      creditAppliedCents: orders.creditAppliedCents,
      currency: orders.currency,
      createdAt: orders.createdAt,
    })
    .from(orders)
    .leftJoin(payments, eq(payments.orderId, orders.id))
    .where(eq(orders.orderNumber, parsed.data))
    .limit(1);

  const session = await auth.api.getSession({ headers: event.request.headers });
  const owned = order && session && (order.userId === session.user.id ||
    (!order.userId && session.user.emailVerified && order.email.toLowerCase() === session.user.email.toLowerCase()));
  const permitted = order && (owned || verifyGuestOrderToken(
    event.request.headers.get("x-order-access"), order.guestAccessHash,
  ));
  if (!permitted) {
    return json({ error: "This order could not be found." }, { status: 404 });
  }

  const { guestAccessHash: _hash, userId: _userId, email: _email, ...publicOrder } = order;
  return json({ order: publicOrder });
}
