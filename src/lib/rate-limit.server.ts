import type { APIEvent } from "@solidjs/start/server";
import { and, eq, inArray, lt } from "drizzle-orm";
import { db } from "~/db";
import { rateLimit } from "~/db/schema";
import { rateLimitMutation } from "~/lib/rate-limit-query";
import { logServerError } from "~/lib/server-log";

let lastCleanupAt = 0;

async function pruneExpiredCounters(now: number) {
  if (now - lastCleanupAt < 5 * 60_000) return;
  lastCleanupAt = now;
  // Retain a full day, longer than every configured window, and bound each
  // cleanup batch so rate-limit records cannot grow forever or stall login.
  const expired = lt(rateLimit.lastRequest, now - 24 * 60 * 60_000);
  try {
    await db.delete(rateLimit).where(and(
      expired,
      inArray(rateLimit.id, db.select({ id: rateLimit.id }).from(rateLimit).where(expired).limit(500)),
    ));
  } catch (error) {
    logServerError("Expired rate-limit counter cleanup failed.", error);
  }
}

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
  const forwarded = input.event.request.headers.get("x-real-ip")?.trim() ??
    input.event.request.headers.get("x-forwarded-for")?.split(",")[0]?.trim();
  const key = `${input.namespace}:${await fingerprint(`${forwarded ?? "unknown"}:${input.identity}`)}`;
  const now = Date.now();

  const allowed = await rateLimitMutation(db, key, input.limit, input.windowMs, now);
  await pruneExpiredCounters(now);
  return allowed.length === 0;
}

// Better Auth's default database cleanup uses the global window, which is
// shorter than our reset/email rules and the storefront's hourly limits.
// Own the storage so an unrelated auth request cannot clear those counters.
export const authRateLimitStorage = {
  async get(key: string) {
    const [row] = await db.select().from(rateLimit)
      .where(eq(rateLimit.key, `auth:${await fingerprint(key)}`)).limit(1);
    return row ?? null;
  },
  async set(key: string, value: { count: number; lastRequest: number }) {
    await db.insert(rateLimit)
      .values({ key: `auth:${await fingerprint(key)}`, count: value.count, lastRequest: value.lastRequest })
      .onConflictDoUpdate({ target: rateLimit.key, set: { count: value.count, lastRequest: value.lastRequest } });
  },
  async consume(key: string, rule: { max: number; window: number }) {
    const allowed = await rateLimitMutation(
      db, `auth:${await fingerprint(key)}`, rule.max, rule.window * 1000, Date.now(),
    );
    await pruneExpiredCounters(Date.now());
    return { allowed: allowed.length > 0, retryAfter: allowed.length ? null : rule.window };
  },
};
