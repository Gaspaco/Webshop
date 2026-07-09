import type { APIEvent } from "@solidjs/start/server";
import { syncMolliePaymentStatus } from "~/lib/checkout.server";

export async function POST(event: APIEvent) {
  const formData = await event.request.formData();
  const paymentId = formData.get("id");

  if (typeof paymentId !== "string" || !paymentId.startsWith("tr_")) {
    return new Response("Missing payment id", {
      status: 400,
      headers: {
        "Cache-Control": "no-store",
      },
    });
  }

  try {
    await syncMolliePaymentStatus(paymentId);
    return new Response("OK", {
      status: 200,
      headers: {
        "Cache-Control": "no-store",
      },
    });
  } catch (error) {
    console.error("Mollie webhook sync failed", error);
    return new Response("Webhook accepted", {
      status: 202,
      headers: {
        "Cache-Control": "no-store",
      },
    });
  }
}
