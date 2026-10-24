import { and, desc, eq, inArray, sql } from "drizzle-orm";
import { db } from "~/db";
import { orders, user, walletAccounts, walletEntries, adminAuditLog } from "~/db/schema";
type Transaction = Parameters<Parameters<typeof db.transaction>[0]>[0];
export class WalletError extends Error {
  constructor(message: string, public readonly code?: string) { super(message); }
}

export async function walletOverview(userId: string) {
  const [account] = await db.select({ balanceCents: walletAccounts.balanceCents }).from(walletAccounts).where(eq(walletAccounts.userId, userId));
  const entries = await db.select({ id: walletEntries.id, amountCents: walletEntries.amountCents, balanceCents: walletEntries.balanceCents,
    kind: walletEntries.kind, reason: walletEntries.reason, createdAt: walletEntries.createdAt, orderNumber: orders.orderNumber })
    .from(walletEntries).leftJoin(orders, eq(orders.id, walletEntries.orderId)).where(eq(walletEntries.userId, userId))
    .orderBy(desc(walletEntries.createdAt), desc(walletEntries.id)).limit(100);
  return { balanceCents: account?.balanceCents ?? 0, currency: "EUR", entries };
}

/** Take this lock before stock/discount locks during checkout. */
export async function lockWallet(tx: Transaction, userId: string) {
  await tx.insert(walletAccounts).values({ userId }).onConflictDoNothing();
  const [wallet] = await tx.select().from(walletAccounts).where(eq(walletAccounts.userId, userId)).for("update");
  return wallet!;
}
async function entry(tx: Transaction, input: { userId: string; amountCents: number; kind: string; reason: string; requestId?: string; actorId?: string; orderId?: string }) {
  const wallet = await lockWallet(tx, input.userId);
  const balance = wallet.balanceCents + input.amountCents;
  if (balance < 0) throw new WalletError("Store credit balance is too low. Refresh checkout and try again.");
  if (balance > 100_000_000) throw new WalletError("Store credit balance exceeds the account limit.");
  await tx.update(walletAccounts).set({ balanceCents: balance }).where(eq(walletAccounts.userId, input.userId));
  await tx.insert(walletEntries).values({ ...input, requestId: input.requestId ?? crypto.randomUUID(), balanceCents: balance });
  return balance;
}

export async function adjustWallet(input: { userId: string; actorId: string; amountCents: number; reason: string; requestId: string }) {
  if (!Number.isSafeInteger(input.amountCents) || input.amountCents === 0 || Math.abs(input.amountCents) > 1_000_000) throw new WalletError("Enter a credit adjustment between €0.01 and €10,000.");
  return db.transaction(async tx => {
    const [customer] = await tx.select({ id: user.id }).from(user).where(and(eq(user.id, input.userId), eq(user.role, "customer")));
    if (!customer) throw new WalletError("Customer account not found.");
    const wallet = await lockWallet(tx, input.userId);
    const [prior] = await tx.select().from(walletEntries).where(eq(walletEntries.requestId, input.requestId));
    if (prior) {
      if (prior.userId !== input.userId || prior.actorId !== input.actorId || prior.amountCents !== input.amountCents || prior.reason !== input.reason || prior.kind !== "adjustment") throw new WalletError("This adjustment reference was already used. Refresh before starting a new adjustment.");
      return { balanceCents: prior.balanceCents, repeated: true };
    }
    const [liability] = await tx.select({ total: sql<number>`coalesce(sum(${orders.creditAppliedCents}), 0)` }).from(orders)
      .where(and(eq(orders.userId, input.userId), inArray(orders.creditState, ["reserved", "spent"])));
    if (input.amountCents > 0 && wallet.balanceCents + Number(liability?.total ?? 0) + input.amountCents > 100_000_000) throw new WalletError("The balance including refundable order credit would exceed the account limit.");
    const balanceCents = await entry(tx, { ...input, kind: "adjustment" });
    await tx.insert(adminAuditLog).values({ actorId: input.actorId, action: "wallet.adjusted", entityType: "customer", entityId: input.userId,
      summary: "Customer store credit adjusted.", metadata: { amountCents: input.amountCents, balanceCents, reason: input.reason, requestId: input.requestId } });
    return { balanceCents, repeated: false };
  });
}

export async function reserveOrderCredit(tx: Transaction, orderId: string, userId: string, amountCents: number) {
  if (amountCents <= 0) return;
  await entry(tx, { userId, amountCents: -amountCents, kind: "reservation", reason: "Store credit used for an order", orderId });
}

/** Caller holds the order lock. State CAS prevents duplicate cancellation/refund credits. */
export async function releaseOrderCredit(tx: Transaction, orderId: string) {
  const [order] = await tx.select().from(orders).where(eq(orders.id, orderId)).for("update");
  if (!order || order.creditState !== "reserved" || !order.userId || order.creditAppliedCents <= 0) return;
  await entry(tx, { userId: order.userId, amountCents: order.creditAppliedCents, kind: "release", reason: "Credit returned after cancelled payment", orderId });
  await tx.update(orders).set({ creditState: "released" }).where(eq(orders.id, orderId));
}

export async function refundOrderCredit(tx: Transaction, orderId: string, actorId?: string) {
  const [order] = await tx.select().from(orders).where(eq(orders.id, orderId)).for("update");
  if (!order || order.creditState !== "spent" || !order.userId || order.creditAppliedCents <= 0) return false;
  await entry(tx, { userId: order.userId, amountCents: order.creditAppliedCents, kind: "refund", reason: "Order store credit refunded", orderId, actorId });
  await tx.update(orders).set({ creditState: "refunded", ...(order.creditAppliedCents === order.totalCents ? { status: "refunded" as const } : {}) }).where(eq(orders.id, orderId));
  return true;
}
