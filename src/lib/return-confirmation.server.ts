import { and, eq, inArray, like, lte } from "drizzle-orm";
import { z } from "zod";
import { db } from "~/db";
import { orders, returnRequests, verification } from "~/db/schema";
import { hashGuestOrderToken, makeGuestOrderToken, verifyGuestOrderToken } from "~/lib/guest-order-access";

const PREFIX = "return-confirm:";
const pendingSchema = z.object({
  tokenHash: z.string().regex(/^[a-f0-9]{64}$/),
  reason: z.string().max(1000),
  submittedAt: z.iso.datetime(),
});
export const returnConfirmationTokenSchema = z.string()
  .regex(/^[a-f0-9-]{36}\.[A-Za-z0-9_-]{43}$/i)
  .refine(value => z.string().uuid().safeParse(value.split(".")[0]).success);
type Transaction = Parameters<Parameters<typeof db.transaction>[0]>[0];

async function saveReturn(tx: Transaction, orderId: string, reason: string, submittedAt: Date) {
  // All callers lock the parent order first. Serialize requests from multiple
  // tabs/tokens so a retry cannot create duplicate open returns.
  const [existing] = await tx.select({ id: returnRequests.id, status: returnRequests.status })
    .from(returnRequests).where(and(eq(returnRequests.orderId, orderId), inArray(returnRequests.status, ["requested", "approved"]))).limit(1);
  if (existing) return { ...existing, isNew: false };
  const [created] = await tx.insert(returnRequests).values({
    orderId, status: "requested", reason: reason || "No reason provided.", createdAt: submittedAt,
  }).returning({ id: returnRequests.id, status: returnRequests.status });
  if (!created) throw new Error("Return request could not be saved.");
  return { ...created, isNew: true };
}

export async function createVerifiedReturn(orderId: string, reason: string) {
  return db.transaction(async tx => {
    const [order] = await tx.select({ id: orders.id, email: orders.email, orderNumber: orders.orderNumber })
      .from(orders).where(eq(orders.id, orderId)).for("update").limit(1);
    if (!order) return null;
    return { ...await saveReturn(tx, order.id, reason, new Date()), email: order.email, orderNumber: order.orderNumber };
  });
}

export async function createGuestReturnChallenge(orderId: string, reason: string) {
  const secret = makeGuestOrderToken();
  const now = new Date();
  const identifier = `${PREFIX}${orderId}`;
  const expired = and(like(verification.identifier, `${PREFIX}%`), lte(verification.expiresAt, now));
  await db.delete(verification).where(inArray(verification.id,
    db.select({ id: verification.id }).from(verification).where(expired).limit(100)));
  await db.transaction(async tx => {
    const [order] = await tx.select({ id: orders.id }).from(orders).where(eq(orders.id, orderId)).for("update").limit(1);
    if (!order) throw new Error("Order no longer exists.");
    // Resending replaces the previous token. Only a hash is stored, and this
    // namespace is separate from password resets and account verification.
    await tx.delete(verification).where(eq(verification.identifier, identifier));
    await tx.insert(verification).values({
      identifier, value: JSON.stringify({ tokenHash: hashGuestOrderToken(secret), reason, submittedAt: now.toISOString() }),
      expiresAt: new Date(now.getTime() + 15 * 60_000),
    });
  });
  return `${orderId}.${secret}`;
}

export async function confirmGuestReturn(token: string) {
  if (!returnConfirmationTokenSchema.safeParse(token).success) return null;
  const [orderId, secret] = token.split(".");
  return db.transaction(async tx => {
    const [order] = await tx.select({ id: orders.id, email: orders.email, orderNumber: orders.orderNumber })
      .from(orders).where(eq(orders.id, orderId!)).for("update").limit(1);
    if (!order) return null;
    const [pending] = await tx.select().from(verification).where(eq(verification.identifier, `${PREFIX}${orderId}`)).limit(1);
    if (!pending || pending.expiresAt <= new Date()) return null;
    let value: unknown;
    try { value = JSON.parse(pending.value); } catch { return null; }
    const parsed = pendingSchema.safeParse(value);
    if (!parsed.success || !verifyGuestOrderToken(secret!, parsed.data.tokenHash)) return null;
    // Consume and save in the same transaction. Failed saves roll the token
    // back; concurrent confirmations can create at most one return.
    await tx.delete(verification).where(eq(verification.id, pending.id));
    return {
      ...await saveReturn(tx, order.id, parsed.data.reason, new Date(parsed.data.submittedAt)),
      email: order.email, orderNumber: order.orderNumber,
    };
  });
}
