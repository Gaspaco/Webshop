import { eq } from "drizzle-orm";
import { db } from "~/db";
import { adminSessionApprovals } from "~/db/schema";

export const ADMIN_APPROVAL_MS = 5 * 60_000;
export function approvalIsFresh(verifiedAt: Date | null, now = Date.now()) {
  const age = verifiedAt ? now - new Date(verifiedAt).getTime() : Infinity;
  return age >= 0 && age < ADMIN_APPROVAL_MS;
}
export async function hasFreshAdminApproval(sessionId: string) {
  const [approval] = await db.select().from(adminSessionApprovals)
    .where(eq(adminSessionApprovals.sessionId, sessionId)).limit(1);
  return approvalIsFresh(approval?.verifiedAt ?? null);
}

export async function hasAdminApproval(sessionId: string) {
  const [approval] = await db.select().from(adminSessionApprovals)
    .where(eq(adminSessionApprovals.sessionId, sessionId)).limit(1);
  return Boolean(approval && new Date(approval.verifiedAt).getTime() <= Date.now());
}
