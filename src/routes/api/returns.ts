import type { APIEvent } from "@solidjs/start/server";
import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "~/db";
import { orders } from "~/db/schema";
import { auth } from "~/lib/auth";
import { customerOrderAccess } from "~/lib/order-access";
import { logServerError } from "~/lib/server-log";
import {
  emailDetails,
  emailMessage,
  emailFallbackLink,
  renderTransactionalEmail,
  sendTransactionalEmail,
} from "~/lib/email.server";
import { checkRateLimit } from "~/lib/rate-limit.server";
import { validateJsonRequest } from "~/lib/request-security.server";
import { getAuthEnv } from "~/lib/env.server";
import { rateLimitMutation } from "~/lib/rate-limit-query";
import { confirmGuestReturn, createGuestReturnChallenge, createVerifiedReturn, returnConfirmationTokenSchema } from "~/lib/return-confirmation.server";

const requestSchema = z.object({
  action: z.literal("request").optional(),
  orderNumber: z.string().trim().min(5).max(40).transform(value => value.toUpperCase()),
  email: z.string().trim().email().max(254).optional(),
  reason: z.string().trim().max(1000).optional().default(""),
  confirmation: z.literal(true),
});
const confirmSchema = z.object({ action: z.literal("confirm"), token: returnConfirmationTokenSchema });

const json = (data: unknown, init?: ResponseInit) =>
  Response.json(data, {
    ...init,
    headers: {
      "Cache-Control": "private, no-store",
      "X-Content-Type-Options": "nosniff",
      "Referrer-Policy": "no-referrer",
      ...(init?.headers ?? {}),
    },
  });

const checkEmail = () => json({
  ok: true, verificationRequired: true,
  message: "If these details match an order, we will email a confirmation link. Open it within 15 minutes to finish your request. If no email arrives, contact the shop.",
}, { status: 202 });

async function completeReturn(result: Awaited<ReturnType<typeof createVerifiedReturn>>) {
  if (!result) return json({ error: "The order or confirmation link is unavailable. Please submit a new request." }, { status: 400 });
  if (!result.isNew) return json({ ok: true, status: result.status, reference: result.id });
  let confirmationSent = true;
  try {
    await sendTransactionalEmail({
      to: result.email,
      subject: `Withdrawal or return request received for ${result.orderNumber}`,
      text: `We received your withdrawal or return request for ${result.orderNumber}. Reference: ${result.id}. The shop owner will review it and contact you with the next step. Do not send an item back until you receive return instructions.`,
      html: renderTransactionalEmail({
        preheader: `We received your return request for ${result.orderNumber}.`,
        label: "Request received", heading: "We are reviewing your return",
        intro: "Your request is saved. The shop owner will review the details and contact you with the next step.",
        contentHtml: emailDetails([{ label: "Order", value: result.orderNumber }, { label: "Return reference", value: result.id }]),
        notice: "Please do not send anything back yet. Wait until you receive return instructions from TCGHaven.",
      }),
      idempotencyKey: `return-request-${result.id}`,
    });
  } catch {
    confirmationSent = false;
    console.error("Return confirmation email delivery failed.");
  }
  return json({ ok: true, status: result.status, reference: result.id, confirmationSent }, { status: 201 });
}

export async function POST(event: APIEvent) {
  try {
    const invalidRequest = await validateJsonRequest(event, { maxBytes: 8_000 });
    if (invalidRequest) return invalidRequest;

    if (await checkRateLimit({ event, namespace: "returns-total", identity: "all", limit: 15, windowMs: 60 * 60_000 })) {
      return json({ error: "Too many requests. Please wait before trying again." }, { status: 429, headers: { "Retry-After": "3600" } });
    }
    const body = await event.request.json();
    if (body?.action === "confirm") {
      const input = confirmSchema.parse(body);
      return completeReturn(await confirmGuestReturn(input.token));
    }
    const input = requestSchema.parse(body);
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
      ? customerOrderAccess(session.user)
      : eq(orders.email, input.email!.toLowerCase());
    const [order] = await db
      .select()
      .from(orders)
      .where(and(eq(orders.orderNumber, input.orderNumber), ownership))
      .limit(1);

    if (!session) {
      // Matching an email is not proof of ownership. Do not create a return,
      // disclose whether the order exists, or expose a reference until the
      // customer explicitly confirms the one-time email link.
      if (!order) return checkEmail();
      const now = Date.now();
      if (!(await rateLimitMutation(db, `return-email:order:${order.id}`, 1, 5 * 60_000, now)).length ||
          !(await rateLimitMutation(db, "return-email:global", 30, 60 * 60_000, now)).length) return checkEmail();
      try {
        const token = await createGuestReturnChallenge(order.id, input.reason);
        const link = new URL("/returns", getAuthEnv().BETTER_AUTH_URL);
        // Fragments are not sent to web servers or in Referer headers.
        link.hash = new URLSearchParams({ confirm: token }).toString();
        const url = link.toString();
        await sendTransactionalEmail({
          to: order.email,
          subject: `Confirm your return request for ${order.orderNumber}`,
          text: `A return request was started for ${order.orderNumber}.\n\nItems and optional reason:\n${input.reason || "No reason provided."}\n\nIf you requested this, open this link and press Confirm return request within 15 minutes:\n${url}\n\nIf you did not request this, ignore this email. No return has been created.`,
          html: renderTransactionalEmail({
            preheader: "Confirm your request before it is sent to the shop.", label: "Confirm your request", heading: "Did you request a return?",
            intro: `A return request was started for order ${order.orderNumber}. Review the details before confirming.`,
            contentHtml: emailMessage("Items and optional reason", input.reason || "No reason provided."),
            action: { label: "Review return request", url, showArrow: false }, afterActionHtml: emailFallbackLink(url),
            notice: "This link expires in 15 minutes and can be used once. If this was not you, ignore this email. No return has been created.",
          }),
          idempotencyKey: `return-confirm-${order.id}-${now}`,
        });
      } catch (error) { logServerError("Guest return confirmation delivery failed.", error); }
      return checkEmail();
    }
    if (!order) {
      return json(
        { error: "We could not match that order and email address. Check both values and try again." },
        { status: 404 },
      );
    }

    return completeReturn(await createVerifiedReturn(order.id, input.reason));
  } catch (error) {
    if (error instanceof z.ZodError) {
      return json({ error: error.issues[0]?.message ?? "Check the return request." }, { status: 400 });
    }
    logServerError("Customer return request failed.", error);
    return json({ error: "The request could not be saved. Please try again." }, { status: 500 });
  }
}
