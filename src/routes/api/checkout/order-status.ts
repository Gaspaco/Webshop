import type { APIEvent } from "@solidjs/start/server";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "~/db";
import { orders, payments } from "~/db/schema";
import { checkRateLimit } from "~/lib/rate-limit.server";

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
      orderStatus: orders.status,
      paymentStatus: payments.status,
      totalCents: orders.totalCents,
      currency: orders.currency,
      createdAt: orders.createdAt,
    })
    .from(orders)
    .leftJoin(payments, eq(payments.orderId, orders.id))
    .where(eq(orders.orderNumber, parsed.data))
    .limit(1);

  if (!order) {
    return json({ error: "This order could not be found." }, { status: 404 });
  }

  return json({ order });
}
