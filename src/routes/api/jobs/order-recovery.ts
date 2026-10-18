import type { APIEvent } from "@solidjs/start/server";
import { createHash, timingSafeEqual } from "node:crypto";
import { runOrderRecovery } from "~/lib/order-recovery.server";
import { logServerError } from "~/lib/server-log";

export async function GET(event: APIEvent) {
  const secret = process.env.CRON_SECRET;
  const authorization = event.request.headers.get("authorization") ?? "";
  if (!secret || secret.length < 32 || !timingSafeEqual(
    createHash("sha256").update(authorization).digest(),
    createHash("sha256").update(`Bearer ${secret}`).digest(),
  )) return new Response("Unauthorized", { status: 401, headers: { "Cache-Control": "no-store" } });
  try { return Response.json(await runOrderRecovery(), { headers: { "Cache-Control": "private, no-store" } }); }
  catch (error) {
    logServerError("Order recovery worker failed.", error);
    return new Response("Retry later", { status: 503, headers: { "Cache-Control": "no-store" } });
  }
}
