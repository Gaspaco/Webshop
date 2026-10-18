import { and, eq, lte } from "drizzle-orm";
import { db } from "~/db";
import { providerOperationLeases } from "~/db/schema";

export async function acquireOperationLease(key: string, durationMs = 90_000) {
  const token = crypto.randomUUID();
  const now = new Date();
  const rows = await db.insert(providerOperationLeases).values({ key, token, leaseUntil: new Date(now.getTime() + durationMs) })
    .onConflictDoUpdate({ target: providerOperationLeases.key,
      set: { token, leaseUntil: new Date(now.getTime() + durationMs) },
      setWhere: lte(providerOperationLeases.leaseUntil, now) }).returning({ token: providerOperationLeases.token });
  return rows.length ? token : null;
}
export async function releaseOperationLease(key: string, token: string, cooldownMs = 0) {
  await db.update(providerOperationLeases).set({ leaseUntil: new Date(Date.now() + cooldownMs) })
    .where(and(eq(providerOperationLeases.key, key), eq(providerOperationLeases.token, token)));
}
