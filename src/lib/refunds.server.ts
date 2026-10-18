import { and, eq, inArray, isNull, sql } from "drizzle-orm";
import { db } from "~/db";
import { orders, payments, refundRequests, returnRequests } from "~/db/schema";
import { getMollieClient } from "~/lib/mollie.server";
import { acquireOperationLease, releaseOperationLease } from "~/lib/operation-lease.server";
import { canReplayProviderRequest, mollieCredentialHash, providerDefinitivelyRejected } from "~/lib/provider-recovery.server";

const refundStates = new Set(["queued", "pending", "processing", "refunded", "failed", "canceled"]);
export const activeRefundStates = ["creating", "unknown", "queued", "pending", "processing", "refunded"];
export class RefundRequestError extends Error {}

/** Reserve the refund amount under the payment row lock before calling Mollie. */
export async function requestRefund(input: { orderId: string; amountCents: number; reason: string; actorId: string }) {
  if (!Number.isSafeInteger(input.amountCents) || input.amountCents < 1 || input.amountCents > 100_000_000) {
    throw new RefundRequestError("Enter a valid positive refund amount.");
  }
  const [identity] = await db.select({ id: payments.molliePaymentId }).from(payments).where(eq(payments.orderId, input.orderId)).limit(1);
  if (!identity) throw new RefundRequestError("Payment not found.");
  // The provider ledger is authoritative, including refunds made in its portal.
  // Fail closed if we cannot refresh it before reserving another refund.
  await syncPaymentRefunds(identity.id);
  const request = await db.transaction(async tx => {
    const [payment] = await tx.select().from(payments).where(eq(payments.orderId, input.orderId)).limit(1).for("update");
    if (!payment || payment.status !== "paid") throw new RefundRequestError("Only a confirmed paid payment can be refunded.");
    const [reserved] = await tx.select({ total: sql<number>`coalesce(sum(${refundRequests.amountCents}), 0)` })
      .from(refundRequests).where(and(eq(refundRequests.paymentId, payment.id), inArray(refundRequests.status, activeRefundStates)));
    if (input.amountCents > payment.amountCents - Number(reserved?.total ?? 0)) {
      throw new RefundRequestError("Refund amount exceeds the unrefunded balance, including refunds already pending.");
    }
    const [created] = await tx.insert(refundRequests).values({ paymentId: payment.id, orderId: input.orderId,
      amountCents: input.amountCents, reason: input.reason, requestedBy: input.actorId, credentialHash: mollieCredentialHash() }).returning();
    return { ...created!, molliePaymentId: payment.molliePaymentId };
  });
  return submitRefund(request, request.molliePaymentId);
}

async function submitRefund(request: typeof refundRequests.$inferSelect, paymentId: string) {
  const key = `refund-create:${request.id}`;
  const token = await acquireOperationLease(key);
  if (!token) throw new RefundRequestError("This refund is already being checked. Try again shortly.");
  try {
    const [current] = await db.select().from(refundRequests).where(eq(refundRequests.id, request.id)).limit(1);
    if (!current) throw new RefundRequestError("Refund request not found.");
    if (!["creating", "unknown"].includes(current.status)) return { refundId: current.mollieRefundId, refundStatus: current.status };
    await db.update(refundRequests).set({ status: "creating" }).where(eq(refundRequests.id, request.id));
    const refund = await getMollieClient().paymentRefunds.create({
      paymentId,
      amount: { currency: "EUR", value: (request.amountCents / 100).toFixed(2) },
      description: "TCGHaven refund",
      metadata: { refundRequestId: request.id },
      idempotencyKey: `refund-${request.id}`,
    });
    await recordRefund(request.id, refund);
    return { refundId: refund.id, refundStatus: refund.status };
  } catch (error) {
    // A timeout does not mean the refund failed. Hold the balance until an
    // authenticated reconciliation finds its metadata/idempotency identity.
    const definitive = providerDefinitivelyRejected(error) || Number((error as { statusCode?: number } | null)?.statusCode) === 503;
    await db.update(refundRequests).set({ status: definitive ? "failed" : "unknown" })
      .where(and(eq(refundRequests.id, request.id), eq(refundRequests.status, "creating")));
    throw new RefundRequestError(definitive ? "Mollie rejected the refund. Check the payment in Mollie before trying again." :
      "Refund status is uncertain. Do not submit another refund; use Check refund status or check Mollie first.");
  } finally { await releaseOperationLease(key, token); }
}

/** Reconcile first, then replay only inside the same credential/key window. */
export async function retryRefund(requestId: string, orderId: string) {
  const [identity] = await db.select().from(refundRequests).where(and(eq(refundRequests.id, requestId), eq(refundRequests.orderId, orderId))).limit(1);
  if (!identity) throw new RefundRequestError("Refund request not found.");
  const [payment] = await db.select().from(payments).where(eq(payments.id, identity.paymentId)).limit(1);
  if (!payment) throw new RefundRequestError("Payment not found.");
  await syncPaymentRefunds(payment.molliePaymentId);
  const [current] = await db.select().from(refundRequests).where(eq(refundRequests.id, requestId)).limit(1);
  if (!current) throw new RefundRequestError("Refund request not found.");
  if (!['creating', 'unknown'].includes(current.status)) return { refundId: current.mollieRefundId, refundStatus: current.status };
  if (!canReplayProviderRequest(current.createdAt, current.credentialHash)) {
    throw new RefundRequestError("The safe retry window has expired or the API key changed. Check Mollie and use Resolve missing refund after one hour; do not create a replacement blindly.");
  }
  return submitRefund(current, payment.molliePaymentId);
}

/** Explicit owner-reviewed resolution, never an automatic timeout-to-failed. */
export async function resolveMissingRefund(requestId: string, orderId: string) {
  const [request] = await db.select().from(refundRequests).where(and(eq(refundRequests.id, requestId), eq(refundRequests.orderId, orderId))).limit(1);
  if (!request || Date.now() - request.createdAt.getTime() < 60 * 60_000) throw new RefundRequestError("Wait at least one hour and check Mollie before resolving a missing refund.");
  const [payment] = await db.select().from(payments).where(eq(payments.id, request.paymentId)).limit(1);
  if (!payment) throw new RefundRequestError("Payment not found.");
  await syncPaymentRefunds(payment.molliePaymentId);
  await db.transaction(async tx => {
    await tx.select({ id: payments.id }).from(payments).where(eq(payments.id, payment.id)).for("update");
    const [resolved] = await tx.update(refundRequests).set({ status: "failed" }).where(and(
      eq(refundRequests.id, requestId), inArray(refundRequests.status, ["creating", "unknown"]), isNull(refundRequests.mollieRefundId),
    )).returning({ id: refundRequests.id });
    if (!resolved) throw new RefundRequestError("The refund exists in Mollie or is already resolved. Refresh its status.");
  });
}

type ProviderRefund = { id: string; status: string; amount: { currency: string; value: string }; metadata?: unknown };

async function recordRefund(requestId: string, refund: ProviderRefund) {
  if (!refundStates.has(refund.status)) throw new Error("Unknown refund state.");
  await db.transaction(async tx => {
    // Same lock order as payment webhooks and refund reservations.
    const [identity] = await tx.select().from(refundRequests).where(eq(refundRequests.id, requestId)).limit(1);
    if (!identity) return;
    const [payment] = await tx.select().from(payments).where(eq(payments.id, identity.paymentId)).limit(1).for("update");
    const [request] = await tx.select().from(refundRequests).where(eq(refundRequests.id, requestId)).limit(1).for("update");
    if (!payment || !request || refund.amount.currency !== "EUR" || Math.round(Number(refund.amount.value) * 100) !== request.amountCents) {
      throw new Error("Refund amount mismatch.");
    }
    // Completed refunds cannot regress on a delayed response.
    if (request.status === "refunded") return;
    if (request.mollieRefundId && request.mollieRefundId !== refund.id) throw new Error("Refund identity mismatch.");
    await tx.update(refundRequests).set({ status: refund.status, mollieRefundId: refund.id }).where(eq(refundRequests.id, requestId));
    if (refund.status !== "refunded") return;
    await tx.insert(returnRequests).values({ orderId: request.orderId, status: "refunded", reason: request.reason,
      amountCents: request.amountCents, mollieRefundId: refund.id, adminNote: `Mollie refund ${refund.id}`,
      resolvedBy: request.requestedBy, resolvedAt: new Date() }).onConflictDoNothing({ target: returnRequests.mollieRefundId });
    const [totals] = await tx.select({ total: sql<number>`coalesce(sum(${refundRequests.amountCents}), 0)` })
      .from(refundRequests).where(and(eq(refundRequests.paymentId, request.paymentId), eq(refundRequests.status, "refunded")));
    if (Number(totals?.total ?? 0) >= payment.amountCents) {
      await tx.update(payments).set({ status: "refunded" }).where(eq(payments.id, payment.id));
      await tx.update(orders).set({ status: "refunded" }).where(eq(orders.id, request.orderId));
    }
  });
}

/** Called by authenticated provider webhooks and an owner reconciliation action. */
export async function syncPaymentRefunds(molliePaymentId: string) {
  const [payment] = await db.select().from(payments).where(eq(payments.molliePaymentId, molliePaymentId)).limit(1);
  if (!payment) return;
  const requests = await db.select().from(refundRequests).where(eq(refundRequests.paymentId, payment.id));
  let count = 0;
  for await (const refund of getMollieClient().paymentRefunds.iterate({ paymentId: molliePaymentId })) {
    if (++count > 1000) throw new Error("Refund reconciliation page limit reached.");
    const metadata = refund.metadata as { refundRequestId?: string } | null;
    let request = requests.find(item => item.mollieRefundId === refund.id || item.id === metadata?.refundRequestId);
    if (!request) {
      const amountCents = Math.round(Number(refund.amount.value) * 100);
      if (refund.amount.currency !== "EUR" || !Number.isSafeInteger(amountCents) || amountCents <= 0 || !refundStates.has(refund.status)) throw new Error("Invalid provider refund.");
      request = await db.transaction(async tx => {
        await tx.select({ id: payments.id }).from(payments).where(eq(payments.id, payment.id)).for("update");
        const [existing] = await tx.select().from(refundRequests).where(eq(refundRequests.mollieRefundId, refund.id)).limit(1);
        if (existing) return existing;
        // Adopt identifiable pre-upgrade ledger entries without duplicating them.
        const legacy = await tx.select().from(returnRequests).where(and(eq(returnRequests.orderId, payment.orderId), isNull(returnRequests.mollieRefundId)));
        const old = legacy.find(item => item.amountCents === amountCents && item.adminNote?.match(/\bre_[A-Za-z0-9]+\b/g)?.includes(refund.id));
        if (old) await tx.update(returnRequests).set({ mollieRefundId: refund.id }).where(eq(returnRequests.id, old.id));
        const [created] = await tx.insert(refundRequests).values({ paymentId: payment.id, orderId: payment.orderId,
          mollieRefundId: refund.id, status: "importing", amountCents, reason: "Refund recorded in Mollie" }).returning();
        return created!;
      });
      requests.push(request);
    }
    if (request) await recordRefund(request.id, refund);
  }
}
