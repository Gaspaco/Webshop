import type { APIEvent } from "@solidjs/start/server";
import { and, eq, or } from "drizzle-orm";
import { z } from "zod";
import { db } from "~/db";
import { orders, rateLimit, returnRequests } from "~/db/schema";
import { auth } from "~/lib/auth";
import { escapeEmailHtml, sendTransactionalEmail } from "~/lib/email.server";

const requestSchema = z.object({
  orderNumber: z.string().trim().min(5).max(40).transform(value => value.toUpperCase()),
  email: z.string().trim().email().max(254).optional(),
  reason: z.string().trim().min(10).max(1000),
  confirmation: z.literal(true),
});

const json = (data: unknown, init?: ResponseInit) =>
  Response.json(data, {
    ...init,
    headers: {
      "Cache-Control": "private, no-store",
      "X-Content-Type-Options": "nosniff",
      ...(init?.headers ?? {}),
    },
  });

async function fingerprint(value: string) {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return Array.from(new Uint8Array(digest))
    .map(byte => byte.toString(16).padStart(2, "0"))
    .join("")
    .slice(0, 32);
}

async function isRateLimited(event: APIEvent, identity: string) {
  const forwarded = event.request.headers.get("x-forwarded-for")?.split(",")[0]?.trim();
  const key = `returns:${await fingerprint(`${forwarded ?? "unknown"}:${identity}`)}`;
  const now = Date.now();
  const windowMs = 60 * 60 * 1000;

  return db.transaction(async tx => {
    const [current] = await tx
      .select()
      .from(rateLimit)
      .where(eq(rateLimit.key, key))
      .limit(1)
      .for("update");

    if (!current) {
      await tx.insert(rateLimit).values({ key, count: 1, lastRequest: now });
      return false;
    }
    if (now - current.lastRequest >= windowMs) {
      await tx.update(rateLimit).set({ count: 1, lastRequest: now }).where(eq(rateLimit.id, current.id));
      return false;
    }
    if (current.count >= 5) return true;
    await tx
      .update(rateLimit)
      .set({ count: current.count + 1, lastRequest: now })
      .where(eq(rateLimit.id, current.id));
    return false;
  });
}

export async function POST(event: APIEvent) {
  try {
    const input = requestSchema.parse(await event.request.json());
    const session = await auth.api.getSession({ headers: event.request.headers });
    const identity = session?.user.id ?? input.email ?? "guest";

    if (await isRateLimited(event, identity)) {
      return json(
        { error: "Too many requests. Please wait before trying again." },
        { status: 429, headers: { "Retry-After": "3600" } },
      );
    }
    if (!session && !input.email) {
      return json({ error: "Enter the email address used for this order." }, { status: 400 });
    }

    const ownership = session
      ? or(
          eq(orders.userId, session.user.id),
          eq(orders.email, session.user.email.toLowerCase()),
        )
      : eq(orders.email, input.email!.toLowerCase());
    const [order] = await db
      .select()
      .from(orders)
      .where(and(eq(orders.orderNumber, input.orderNumber), ownership))
      .limit(1);

    if (!order) {
      return json(
        { error: "We could not match that order and email address. Check both values and try again." },
        { status: 404 },
      );
    }

    const [existing] = await db
      .select({ id: returnRequests.id, status: returnRequests.status })
      .from(returnRequests)
      .where(eq(returnRequests.orderId, order.id))
      .limit(1);
    if (existing && ["requested", "approved"].includes(existing.status)) {
      return json({ ok: true, status: existing.status });
    }

    const [created] = await db
      .insert(returnRequests)
      .values({ orderId: order.id, status: "requested", reason: input.reason })
      .returning({ id: returnRequests.id, status: returnRequests.status });
    if (!created) throw new Error("Return request was not created.");

    void sendTransactionalEmail({
      to: order.email,
      subject: `Return request received for ${order.orderNumber}`,
      text: `We received your cancellation or return request for ${order.orderNumber}. The shop owner will review it and contact you with the next step. Do not send an item back until you receive return instructions.`,
      html: `<p>We received your cancellation or return request for <strong>${escapeEmailHtml(order.orderNumber)}</strong>.</p><p>The shop owner will review it and contact you with the next step. Do not send an item back until you receive return instructions.</p>`,
      idempotencyKey: `return-request-${created.id}`,
    }).catch(() => console.error("Return confirmation email delivery failed."));

    return json({ ok: true, status: created.status }, { status: 201 });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return json({ error: error.issues[0]?.message ?? "Check the return request." }, { status: 400 });
    }
    console.error("Customer return request failed", error);
    return json({ error: "The request could not be saved. Please try again." }, { status: 500 });
  }
}
