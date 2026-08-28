import type { APIEvent } from "@solidjs/start/server";
import { z } from "zod";
import { auth } from "~/lib/auth";
import { createCheckoutPayment } from "~/lib/checkout.server";

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
    const payload = await event.request.json();
    const session = await auth.api.getSession({
      headers: event.request.headers,
    });
    const result = await createCheckoutPayment(payload, session?.user.id);

    if (!result.checkoutUrl) {
      return json(
        { error: "Payment could not be created. Please try again." },
        { status: 502 },
      );
    }

    return json(result, { status: 201 });
  } catch (error) {
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

    console.error("Checkout payment creation failed", error);

    return json(
      { error: "Checkout is unavailable right now. Please try again later." },
      { status: 500 },
    );
  }
}
