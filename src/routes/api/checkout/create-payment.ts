import type { APIEvent } from "@solidjs/start/server";
import { z } from "zod";
import { auth } from "~/lib/auth";
import { createCheckoutPayment } from "~/lib/checkout.server";
import { checkRateLimit } from "~/lib/rate-limit.server";
import { validateJsonRequest } from "~/lib/request-security.server";
import { logServerError } from "~/lib/server-log";
import { WalletError } from "~/lib/wallet.server";
import { SavedCardError } from "~/lib/saved-cards.server";
import { db } from "~/db";
import { rateLimitMutation } from "~/lib/rate-limit-query";

function json(data: unknown, init?: ResponseInit) {
  return Response.json(data, {
    ...init,
    headers: {
      "Cache-Control": "no-store",
      ...(init?.headers ?? {}),
    },
  });
}

export async function POST(event: APIEvent) {
  try {
    const invalidRequest = await validateJsonRequest(event, { maxBytes: 64_000 });
    if (invalidRequest) return invalidRequest;

    const session = await auth.api.getSession({
      headers: event.request.headers,
    });
    if (
      await checkRateLimit({
        event,
        namespace: "checkout",
        identity: session?.user.id ?? "guest",
        limit: 10,
        windowMs: 10 * 60 * 1000,
      })
    ) {
      return json(
        { error: "Too many checkout attempts. Please wait before trying again." },
        { status: 429, headers: { "Retry-After": "600" } },
      );
    }

    const payload = await event.request.json();
    // Shared across guests, accounts and application instances. Reject before
    // reserving inventory or contacting a payment provider.
    if (!(await rateLimitMutation(db, "checkout:create:global", 120, 60_000, Date.now())).length) {
      return json({ error: "Checkout is busy. Please wait a minute and try again." }, { status: 429, headers: { "Retry-After": "60" } });
    }
    if (((payload as { rememberCard?: boolean; savedCardId?: string })?.rememberCard || (payload as { savedCardId?: string })?.savedCardId) && !session?.user.emailVerified) return json({ error: "Sign in and verify your email before using saved cards." }, { status: 403 });
    if ((payload as { useStoreCredit?: boolean })?.useStoreCredit && !session?.user.emailVerified) return json({ error: "Verify your email before using store credit." }, { status: 403 });
    const result = await createCheckoutPayment(payload, session?.user.id);

    if (!result.checkoutUrl) {
      return json(
        { error: "Payment could not be created. Please try again." },
        { status: 502 },
      );
    }

    return json(result, { status: 201 });
  } catch (error) {
    if (error instanceof SavedCardError) return json({ error: error.message }, { status: error.status });
    if (error instanceof WalletError) return json({ error: error.message, code: error.code }, { status: 409 });
    if (error instanceof z.ZodError) {
      return json(
        {
          error:
            error.issues[0]?.message ??
            "Check your checkout details and try again.",
        },
        { status: 400 },
      );
    }

    if (
      error instanceof Error &&
      error.message.startsWith("Discount code")
    ) {
      return json({ error: error.message }, { status: 400 });
    }

    if (
      error instanceof Error &&
      (error.message.startsWith("Product is not purchasable") ||
        error.message.startsWith("Product is no longer available"))
    ) {
      return json(
        { error: "One of these items is no longer available in that quantity. Refresh your cart and try again." },
        { status: 409 },
      );
    }

    if (
      error instanceof Error &&
      (error.message.startsWith("Shipping ") ||
        error.message.startsWith("The selected shipping method"))
    ) {
      return json({ error: error.message }, { status: 400 });
    }

    logServerError("Checkout payment creation failed.", error);

    return json(
      { error: "Checkout is unavailable right now. Please try again later." },
      { status: 500 },
    );
  }
}
