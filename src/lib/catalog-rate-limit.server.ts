import type { APIEvent } from "@solidjs/start/server";
import { db } from "~/db";
import { checkRateLimit } from "~/lib/rate-limit.server";
import { rateLimitMutation } from "~/lib/rate-limit-query";

/** A changing query or spoofed/rotating address cannot bypass the shared budget. */
export async function limitCatalogRead(event: APIEvent, kind: "search" | "products") {
  const limit = kind === "search" ? 60 : 120;
  const limited = await checkRateLimit({ event, namespace: `catalog-${kind}`, identity: "public", limit, windowMs: 60_000 });
  const global = limited ? [] : await rateLimitMutation(db, `catalog-${kind}:global`, limit * 10, 60_000, Date.now());
  if (limited || !global.length) return Response.json(
    { error: "Too many requests. Please wait a minute and try again." },
    { status: 429, headers: { "Retry-After": "60", "Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff" } },
  );
  return null;
}
