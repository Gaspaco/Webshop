import type { APIEvent } from "@solidjs/start/server";
import { eq } from "drizzle-orm";
import { db } from "~/db";
import { rateLimit } from "~/db/schema";

async function fingerprint(value: string) {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return Array.from(new Uint8Array(digest))
    .map(byte => byte.toString(16).padStart(2, "0"))
    .join("")
    .slice(0, 32);
}

export async function checkRateLimit(input: {
  event: APIEvent;
  namespace: string;
  identity: string;
  limit: number;
  windowMs: number;
}) {
  const forwarded = input.event.request.headers
    .get("x-forwarded-for")
    ?.split(",")[0]
    ?.trim();
  const key = `${input.namespace}:${await fingerprint(`${forwarded ?? "unknown"}:${input.identity}`)}`;
  const now = Date.now();

  return db.transaction(async tx => {
    const [current] = await tx
      .select()
      .from(rateLimit)
      .where(eq(rateLimit.key, key))
      .limit(1)
      .for("update");

    if (!current) {
      await tx.insert(rateLimit).values({ key, count: 1, lastRequest: now });
      return false;
    }
    if (now - current.lastRequest >= input.windowMs) {
      await tx.update(rateLimit).set({ count: 1, lastRequest: now }).where(eq(rateLimit.id, current.id));
      return false;
    }
    if (current.count >= input.limit) return true;
    await tx
      .update(rateLimit)
      .set({ count: current.count + 1, lastRequest: now })
      .where(eq(rateLimit.id, current.id));
    return false;
  });
}
