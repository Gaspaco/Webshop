import type { APIEvent } from "@solidjs/start/server";
import { z } from "zod";
import { calculateTrustedCheckout } from "~/lib/checkout.server";
import { checkRateLimit } from "~/lib/rate-limit.server";
import { validateJsonRequest, safeApiResponse } from "~/lib/request-security.server";
import { apiJson } from "~/lib/admin.server";
import { findShippingDestination } from "~/lib/shipping";

export async function POST(event: APIEvent) {
  return safeApiResponse(async () => {
    const invalid = await validateJsonRequest(event, { maxBytes: 32000 }); if (invalid) return invalid;
    if (await checkRateLimit({ event, namespace: "shipping-quote", identity: "public", limit: 60, windowMs: 60_000 })) return apiJson({ error: "Please wait before refreshing shipping prices." }, { status: 429 });
    try {
      const input = z.object({ items: z.array(z.object({ id: z.string().trim().min(1).max(120), variantId: z.string().uuid().optional(), quantity: z.number().int().min(1).max(99) })).min(1).max(100), country: z.string().min(2).max(80) }).parse(await event.request.json());
      const destination = findShippingDestination(input.country);
      if (!destination) return apiJson({ error: "Shipping is not configured for this country." }, { status: 400 });
      const quote = await calculateTrustedCheckout({ items: input.items, customer: { email: "quote@example.invalid", firstName: "Quote", lastName: "Only", address: "Quote Street 1", postalCode: "0000AA", city: "Quote", country: destination.code },
        shippingMethod: destination.code === "NL" ? "postnl_parcel" : "postnl_international", paymentMethod: "mollie" }, true);
      return apiJson({ shipment: quote.shipment, options: quote.shippingOptions, subtotalCents: quote.subtotalCents });
    } catch (error) {
      if (error instanceof z.ZodError) return apiJson({ error: "Check the cart and delivery country." }, { status: 400 });
      if (error instanceof Error && /^(Product is not purchasable|Shipping )/.test(error.message)) return apiJson({ error: "Some items or quantities are unavailable. Refresh your cart." }, { status: 409 });
      throw error;
    }
  });
}
