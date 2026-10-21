import { db } from "~/db";
import { acquireOperationLease, releaseOperationLease } from "~/lib/operation-lease.server";
import { rateLimitMutation } from "~/lib/rate-limit-query";

export type CardScanLimits = {
  CARD_SCAN_MINUTE_LIMIT: number;
  CARD_SCAN_DAILY_LIMIT: number;
  CARD_SCAN_MAX_CONCURRENT: number;
};

/** Shared across all visitors and serverless instances, not keyed by client IP. */
export async function consumeCardScanBudget(limits: CardScanLimits) {
  const now = Date.now();
  const day = new Date(now).toISOString().slice(0, 10);
  const minute = Math.floor(now / 60_000);
  if (!(await rateLimitMutation(db, `card-scan:minute:${minute}`, limits.CARD_SCAN_MINUTE_LIMIT, 60_000, now)).length) {
    return { allowed: false, retryAfter: 60 };
  }
  if (!(await rateLimitMutation(db, `card-scan:day:${day}`, limits.CARD_SCAN_DAILY_LIMIT, 86_400_000, now)).length) {
    return { allowed: false, retryAfter: Math.ceil((Date.parse(`${day}T00:00:00Z`) + 86_400_000 - now) / 1000) };
  }
  // Count attempts, including ambiguous timeouts: never refund a potentially
  // billed call. Daily buckets reset at UTC midnight and old rows are pruned
  // by the existing rate-limit cleanup.
  return { allowed: true, retryAfter: 0 };
}

export async function withCardScanCapacity(limits: CardScanLimits, operation: () => Promise<Response>) {
  for (let index = 0; index < limits.CARD_SCAN_MAX_CONCURRENT; index++) {
    const key = `card-scan:slot:${index}`;
    const token = await acquireOperationLease(key, 60_000);
    if (!token) continue;
    try { return await operation(); }
    finally {
      // If storage fails, the lease expires; never mask a completed response
      // or allow a fresh request to bypass the shared capacity limit.
      await releaseOperationLease(key, token).catch(() => {});
    }
  }
  return Response.json({ error: "Card scanning is busy. Please try again shortly." }, {
    status: 503, headers: { "Cache-Control": "no-store", "Retry-After": "5", "X-Content-Type-Options": "nosniff" },
  });
}
