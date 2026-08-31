import type { APIEvent } from "@solidjs/start/server";
import { and, eq, or } from "drizzle-orm";
import { z } from "zod";
import { db } from "~/db";
import { orders, returnRequests } from "~/db/schema";
import { auth } from "~/lib/auth";
import { escapeEmailHtml, sendTransactionalEmail } from "~/lib/email.server";
import { checkRateLimit } from "~/lib/rate-limit.server";
import { validateJsonRequest } from "~/lib/request-security.server";

const requestSchema = z.object({
  orderNumber: z.string().trim().min(5).max(40).transform(value => value.toUpperCase()),
  email: z.string().trim().email().max(254).optional(),
  reason: z.string().trim().max(1000).optional().default(""),
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

export async function POST(event: APIEvent) {
  try {
    const invalidRequest = validateJsonRequest(event, { maxBytes: 8_000 });
    if (invalidRequest) return invalidRequest;

    const input = requestSchema.parse(await event.request.json());
    const session = await auth.api.getSession({ headers: event.request.headers });
    const identity = session?.user.id ?? input.email ?? "guest";

    if (await checkRateLimit({
      event,
      namespace: "returns",
      identity,
      limit: 5,
      windowMs: 60 * 60 * 1000,
    })) {
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
      return json({ ok: true, status: existing.status, reference: existing.id });
    }

    const [created] = await db
      .insert(returnRequests)
      .values({
        orderId: order.id,
        status: "requested",
        reason: input.reason || "No reason provided.",
      })
      .returning({ id: returnRequests.id, status: returnRequests.status });
    if (!created) throw new Error("Return request was not created.");

    let confirmationSent = true;
    try {
      await sendTransactionalEmail({
        to: order.email,
        subject: `Withdrawal or return request received for ${order.orderNumber}`,
        text: `We received your withdrawal or return request for ${order.orderNumber}. Reference: ${created.id}. The shop owner will review it and contact you with the next step. Do not send an item back until you receive return instructions.`,
        html: `<p>We received your withdrawal or return request for <strong>${escapeEmailHtml(order.orderNumber)}</strong>.</p><p>Reference: <strong>${escapeEmailHtml(created.id)}</strong></p><p>The shop owner will review it and contact you with the next step. Do not send an item back until you receive return instructions.</p>`,
        idempotencyKey: `return-request-${created.id}`,
      });
    } catch {
      confirmationSent = false;
      console.error("Return confirmation email delivery failed.");
    }

    return json(
      {
        ok: true,
        status: created.status,
        reference: created.id,
        confirmationSent,
      },
      { status: 201 },
    );
  } catch (error) {
    if (error instanceof z.ZodError) {
      return json({ error: error.issues[0]?.message ?? "Check the return request." }, { status: 400 });
    }
    console.error("Customer return request failed", error);
    return json({ error: "The request could not be saved. Please try again." }, { status: 500 });
  }
}
