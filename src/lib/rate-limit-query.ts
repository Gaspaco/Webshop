import { sql } from "drizzle-orm";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";
import { rateLimit } from "../db/schema";

/** One PostgreSQL upsert serializes both first requests and later increments. */
export function rateLimitMutation(
  database: Pick<NodePgDatabase, "insert">,
  key: string,
  limit: number,
  windowMs: number,
  now: number,
) {
  const expired = sql`${rateLimit.lastRequest} <= ${now - windowMs}`;
  return database
    .insert(rateLimit)
    .values({ key, count: 1, lastRequest: now })
    .onConflictDoUpdate({
      target: rateLimit.key,
      set: {
        count: sql`case when ${expired} then 1 else ${rateLimit.count} + 1 end`,
        lastRequest: now,
      },
      setWhere: sql`${expired} or ${rateLimit.count} < ${limit}`,
    })
    .returning({ count: rateLimit.count });
}
