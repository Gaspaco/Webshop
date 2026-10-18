import { and, asc, eq, gt, inArray, lt } from "drizzle-orm";
import { db } from "~/db";
import { orders, payments } from "~/db/schema";
import { recoverCheckoutPayment, processPaidOrderEmails, syncMolliePaymentStatus } from "~/lib/checkout.server";
import { logServerError } from "~/lib/server-log";
import { acquireOperationLease, releaseOperationLease } from "~/lib/operation-lease.server";
import { IDEMPOTENT_RETRY_MS } from "~/lib/provider-recovery.server";

/** Bounded worker, safe on multiple instances and after process restarts. */
export async function runOrderRecovery() {
  const token = await acquireOperationLease("order-recovery:worker", 90_000);
  if (!token) return { busy: true };
  const started = Date.now();
  let recovered = 0;
  try {
    const attempts = await db.select({ id: orders.id }).from(orders).where(and(
      eq(orders.status, "pending"), inArray(orders.paymentCreationState, ["creating", "unknown"]),
      gt(orders.paymentCreationStartedAt, new Date(Date.now() - IDEMPOTENT_RETRY_MS)),
      lt(orders.updatedAt, new Date(Date.now() - 60_000)),
    )).orderBy(asc(orders.createdAt)).limit(5);
    for (const order of attempts) {
      if (Date.now() - started > 35_000) break;
      try { const payment = await recoverCheckoutPayment(order.id); await syncMolliePaymentStatus(payment.id); recovered++; }
      catch (error) { logServerError("Payment creation recovery deferred.", error); }
    }
    // Recover missed status notifications as well as retries of failed emails.
    const pending = await db.select({ id: payments.molliePaymentId }).from(payments)
      .where(inArray(payments.status, ["open", "pending", "authorized"]))
      .orderBy(asc(payments.updatedAt)).limit(10);
    for (const payment of pending) {
      if (Date.now() - started > 35_000) break;
      try { await syncMolliePaymentStatus(payment.id); }
      catch (error) { logServerError("Payment status recovery deferred.", error); }
    }
    if (Date.now() - started < 35_000) await processPaidOrderEmails(undefined, 10);
    return { busy: false, recovered };
  } finally { await releaseOperationLease("order-recovery:worker", token); }
}
