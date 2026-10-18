import type { APIEvent } from "@solidjs/start/server";
import { syncMolliePaymentStatus } from "~/lib/checkout.server";
import { limitJsonBody } from "~/lib/request-security.server";
import { logServerError } from "~/lib/server-log";
import { acquireOperationLease, releaseOperationLease } from "~/lib/operation-lease.server";
import { rateLimitMutation } from "~/lib/rate-limit-query";
import { db } from "~/db";
import { createHash } from "node:crypto";

export async function POST(event: APIEvent) {
  const bounded = await limitJsonBody(event.request, 1024);
  if (bounded instanceof Response) return bounded;
  let formData: FormData;
  try { formData = await bounded.formData(); }
  catch { return new Response("Invalid webhook body", { status: 400 }); }
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
    // Do not trust sender IPs or suppress an update with a cached 200: Mollie
    // must retry if a newer state arrives while this payment is being synced.
    const budget = await rateLimitMutation(db, "mollie-webhook:global", 240, 60_000, Date.now());
    if (!budget.length) return new Response("Please retry", { status: 503, headers: { "Retry-After": "60" } });
    // Bounded buckets also prevent random IDs from growing the lease table.
    // A collision returns a retryable response, never silently drops an event.
    const bucket = createHash("sha256").update(paymentId).digest().readUInt16BE(0) % 2048;
    const key = `mollie-webhook:${bucket}`;
    const token = await acquireOperationLease(key);
    if (!token) return new Response("Please retry", { status: 503, headers: { "Retry-After": "5" } });
    try { await syncMolliePaymentStatus(paymentId); }
    finally { await releaseOperationLease(key, token, 5000); }
    return new Response("OK", {
      status: 200,
      headers: {
        "Cache-Control": "no-store",
      },
    });
  } catch (error) {
    logServerError("Mollie webhook synchronization failed.", error);
    return new Response("Temporary webhook failure", {
      status: 500,
      headers: {
        "Cache-Control": "no-store",
      },
    });
  }
}
