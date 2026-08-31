import type { APIEvent } from "@solidjs/start/server";
import { syncMolliePaymentStatus } from "~/lib/checkout.server";

export async function POST(event: APIEvent) {
  const contentLength = Number(event.request.headers.get("content-length"));
  if (Number.isFinite(contentLength) && contentLength > 1_024) {
    return new Response("Payload too large", {
      status: 413,
      headers: { "Cache-Control": "no-store" },
    });
  }

  const formData = await event.request.formData();
  const paymentId = formData.get("id");

  if (
    typeof paymentId !== "string" ||
    !/^tr_[A-Za-z0-9]{8,64}$/.test(paymentId)
  ) {
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
    console.error(
      "Mollie webhook synchronization failed.",
      error instanceof Error ? error.name : "Unknown error",
    );
    return new Response("Temporary webhook failure", {
      status: 500,
      headers: {
        "Cache-Control": "no-store",
      },
    });
  }
}
