// This runner deliberately owns an in-memory PostgreSQL instance and mocks all
// providers. Run in a child process: Bun module mocks must not leak to other tests.
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { mock } from "bun:test";
import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { eq } from "drizzle-orm";
import * as schema from "../src/db/schema";
import { DEFAULT_STORE_PROFILE } from "../src/lib/store-profile";

if (process.env.TCG_SECURITY_INTEGRATION !== "1") throw new Error("Run through the isolated security test wrapper.");
process.env.NODE_ENV = "production";
process.env.BETTER_AUTH_SECRET = "isolated-security-test-secret-not-used-by-any-real-account-123456789";
process.env.ORDER_RECOVERY_ENCRYPTION_KEY = "isolated-payment-recovery-key-not-used-by-any-real-shop-123456789";
process.env.BETTER_AUTH_URL = "https://shop.test";
// Even a broken module mock must not fall back to production credentials.
process.env.DATABASE_URL = "postgresql://isolated:isolated@127.0.0.1:1/security_test";
delete process.env.DATABASE_PUBLIC_URL;
delete process.env.MOLLIE_API_KEY;
process.env.MOLLIE_API_KEY = "test_isolated_provider_mock_only";
for (const key of ["POSTNL_API_KEY", "POSTNL_CUSTOMER_NUMBER", "POSTNL_CUSTOMER_CODE", "POSTNL_COLLECTION_LOCATION"]) delete process.env[key];
for (const key of ["SMTP_HOST", "SMTP_PORT", "SMTP_USER", "SMTP_PASS", "AUTH_EMAIL_FROM", "ORDER_NOTIFICATION_EMAIL"]) delete process.env[key];

const pg = new PGlite();
const db = drizzle(pg, { schema });
for (const file of readdirSync("drizzle").filter(name => /^\d+.*\.sql$/.test(name)).sort()) {
  for (const statement of readFileSync(`drizzle/${file}`, "utf8").split("--> statement-breakpoint")) {
    if (statement.trim()) await pg.exec(statement);
  }
}
mock.module("../src/db/index.ts", () => ({ db }));
mock.module("../src/lib/store-profile.server.ts", () => ({ getStoreProfile: async () => DEFAULT_STORE_PROFILE }));
const noop = async () => {};
const deliveredEmails = new Map<string, number>();
let failOwnerEmail = false;
mock.module("../src/lib/email.server.ts", () => ({ sendTransactionalEmail: async (message: { idempotencyKey: string }) => {
  if (failOwnerEmail && message.idempotencyKey.startsWith("paid-owner-")) { failOwnerEmail = false; throw new Error("Isolated SMTP outage"); }
  deliveredEmails.set(message.idempotencyKey, (deliveredEmails.get(message.idempotencyKey) ?? 0) + 1);
}, sendNewSignInEmail: noop,
  sendVerificationEmail: noop, sendPasswordResetEmail: noop, sendTwoFactorCodeEmail: noop,
  escapeEmailHtml: (value: string) => value, renderTransactionalEmail: () => "" }));
const remotePayments = new Map<string, any>();
const remoteRefunds = new Map<string, any>();
let paymentNumber = 0;
let refundNumber = 0;
let timeoutNextRefund = false;
let timeoutBeforeRefund = false;
let timeoutPayment: "before" | "after" | null = null;
let paymentReads = 0;
let cancelBecomesPaid = false;
const paymentKeys = new Map<string, any>();
const refundKeys = new Map<string, any>();
mock.module("../src/lib/mollie.server.ts", () => ({ getMollieClient: () => ({
  payments: {
    create: async (params: any) => {
      if (timeoutPayment === "before") { timeoutPayment = null; throw new Error("Response lost before acceptance"); }
      const key = `${process.env.MOLLIE_API_KEY}:${params.idempotencyKey}`;
      if (paymentKeys.has(key)) return paymentKeys.get(key);
      const id = `tr_test${String(++paymentNumber).padStart(8, "0")}`;
      const payment = { ...params, id, status: "open", getCheckoutUrl: () => "https://mollie.example.invalid/checkout" };
      remotePayments.set(id, payment); paymentKeys.set(key, payment);
      if (timeoutPayment === "after") { timeoutPayment = null; throw new Error("Response lost after acceptance"); }
      return payment;
    },
    get: async (id: string) => { paymentReads++; const payment = remotePayments.get(id); if (!payment) throw Object.assign(new Error("Not found"), { statusCode: 404 }); return payment; },
    cancel: async (id: string) => {
      if (cancelBecomesPaid) { cancelBecomesPaid = false; remotePayments.get(id).status = "paid"; throw Object.assign(new Error("Already paid"), { statusCode: 422 }); }
      remotePayments.get(id).status = "canceled";
    },
    iterate: async function* () { yield* remotePayments.values(); },
  },
  paymentRefunds: {
    create: async (params: any) => {
      if (timeoutBeforeRefund) { timeoutBeforeRefund = false; throw new Error("Refund never accepted"); }
      const key = `${process.env.MOLLIE_API_KEY}:${params.idempotencyKey}`;
      if (refundKeys.has(key)) return refundKeys.get(key);
      const refund = { ...params, id: `re_test${++refundNumber}`, status: "queued" };
      remoteRefunds.set(refund.id, refund);
      refundKeys.set(key, refund);
      if (timeoutNextRefund) { timeoutNextRefund = false; throw new Error("Simulated response loss after provider acceptance"); }
      return refund;
    },
    iterate: async function* ({ paymentId }: { paymentId: string }) {
      for (const refund of remoteRefunds.values()) if (refund.paymentId === paymentId) yield refund;
    },
  },
}) }));
// Any unintended network call fails this test instead of reaching a real service.
globalThis.fetch = (() => { throw new Error("External network is forbidden in security integration tests."); }) as unknown as typeof fetch;

const { createCheckoutPayment, syncMolliePaymentStatus, recoverCheckoutPayment, resolveMissingCheckoutPayment, cancelCheckoutOrder, retryPaidOrderEmails, processPaidOrderEmails } = await import("../src/lib/checkout.server");
const { requestRefund, syncPaymentRefunds, retryRefund, resolveMissingRefund } = await import("../src/lib/refunds.server");
const { createLabelOnce } = await import("../src/lib/fulfilment.server");
const { auth } = await import("../src/lib/auth");
const { requireAdmin } = await import("../src/lib/admin.server");
const { GET: getStatus } = await import("../src/routes/api/checkout/order-status");
const { POST: approveOwner } = await import("../src/routes/api/admin/security");
const { POST: ownerOrderAction } = await import("../src/routes/api/admin/orders");
const { DELETE: ownerRemoveCustomer } = await import("../src/routes/api/admin/customers");
const { POST: webhook } = await import("../src/routes/api/payments/mollie-webhook");
assert.equal((await webhook(event(new Request("https://shop.test/api/payments/mollie-webhook", {
  method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" }, body: "x=" + "a".repeat(2000),
})))).status, 413);
assert.equal((await webhook(event(new Request("https://shop.test/api/payments/mollie-webhook", {
  method: "POST", headers: { "Content-Type": "application/json" }, body: "{}",
})))).status, 400);

const [product] = await db.insert(schema.products).values({ name: "Test card", slug: "isolated-card", game: "yugioh", productType: "single", status: "active" }).returning();
const [variant] = await db.insert(schema.productVariants).values({ productId: product!.id, name: "Test", sku: "TEST-ONLY", priceCents: 500, stock: 100 }).returning();
const customer = { email: "buyer@example.invalid", firstName: "Test", lastName: "Buyer", address: "Teststraat 1", postalCode: "1000AA", city: "Test", country: "Netherlands" };
const payload = (discountCode = "") => ({ items: [{ id: product!.slug, variantId: variant!.id, quantity: 1 }], customer, shippingMethod: "local_pickup", paymentMethod: "mollie", discountCode });
function event(request: Request) { return { request } as any; }
const request = (path: string, body?: unknown, cookie = "") => new Request(`https://shop.test${path}`, {
  method: body === undefined ? "GET" : "POST", headers: { Origin: "https://shop.test", "Content-Type": "application/json", Cookie: cookie, "x-real-ip": "127.0.0.1" },
  ...(body === undefined ? {} : { body: JSON.stringify(body) }),
});

// Parallel callers cannot over-claim one discount slot.
await db.insert(schema.discountCodes).values({ code: "ONE-USE", type: "fixed", value: 100, maximumUses: 1 });
const attempts = await Promise.allSettled([createCheckoutPayment(payload("ONE-USE")), createCheckoutPayment(payload("ONE-USE"))]);
assert.equal(attempts.filter(result => result.status === "fulfilled").length, 1);
const discountedPayment = [...remotePayments.values()][0];
discountedPayment.status = "expired";
await syncMolliePaymentStatus(discountedPayment.id);
await syncMolliePaymentStatus(discountedPayment.id);
const [discount] = await db.select().from(schema.discountCodes).where(eq(schema.discountCodes.code, "ONE-USE"));
assert.equal(discount!.usedCount, 0);
console.log("PASS discount claims are atomic and canceled reservations are released exactly once");

const created = await createCheckoutPayment(payload());
const paidPayment = [...remotePayments.values()].at(-1)!;
paidPayment.status = "paid";
await syncMolliePaymentStatus(paidPayment.id);
const [paidOrder] = await db.select().from(schema.orders).where(eq(schema.orders.orderNumber, created.orderNumber));
await db.update(schema.orders).set({ status: "shipped" }).where(eq(schema.orders.id, paidOrder!.id));
await syncMolliePaymentStatus(paidPayment.id);
const [shippedOrder] = await db.select().from(schema.orders).where(eq(schema.orders.id, paidOrder!.id));
assert.equal(shippedOrder!.status, "shipped");
console.log("PASS repeated paid webhooks preserve shipping progress");

const token = new URL(paidPayment.redirectUrl).searchParams.get("access")!;
const url = `/api/checkout/order-status?order=${created.orderNumber}`;
assert.equal((await getStatus(event(request(url)))).status, 404);
const authorizedRequest = request(url); authorizedRequest.headers.set("x-order-access", token);
const authorized = await getStatus(event(authorizedRequest));
assert.equal(authorized.status, 200);
const returned = await authorized.json();
assert.equal(returned.order.guestAccessHash, undefined);
assert.equal(returned.order.userId, undefined);
assert.equal(returned.order.email, undefined);
const wrongToken = request(url); wrongToken.headers.set("x-order-access", new URL(discountedPayment.redirectUrl).searchParams.get("access")!);
assert.equal((await getStatus(event(wrongToken))).status, 404);
console.log("PASS order references alone reveal nothing; guest token authorizes only matching order");

await db.update(schema.orders).set({ status: "paid" }).where(eq(schema.orders.id, paidOrder!.id));
const first = await requestRefund({ orderId: paidOrder!.id, amountCents: 400, reason: "Isolated test", actorId: null as any });
assert.equal(first.refundStatus, "queued");
assert.equal((await db.select().from(schema.returnRequests)).length, 0);
assert.equal((await db.select().from(schema.payments).where(eq(schema.payments.molliePaymentId, paidPayment.id)))[0]!.status, "paid");
await assert.rejects(() => requestRefund({ orderId: paidOrder!.id, amountCents: 200, reason: "Over limit", actorId: null as any }));
remoteRefunds.get(first.refundId).status = "refunded";
await syncPaymentRefunds(paidPayment.id); await syncPaymentRefunds(paidPayment.id);
assert.equal((await db.select().from(schema.returnRequests)).length, 1);
const second = await requestRefund({ orderId: paidOrder!.id, amountCents: 100, reason: "Remainder", actorId: null as any });
remoteRefunds.get(second.refundId).status = "refunded";
await syncPaymentRefunds(paidPayment.id);
assert.equal((await db.select().from(schema.orders).where(eq(schema.orders.id, paidOrder!.id)))[0]!.status, "refunded");
console.log("PASS queued refunds do not count as completed, available balance is reserved, and completion is idempotent");

const labelOrderNumber = (await createCheckoutPayment(payload())).orderNumber;
const [labelOrder] = await db.select().from(schema.orders).where(eq(schema.orders.orderNumber, labelOrderNumber));
await db.update(schema.orders).set({ status: "paid" }).where(eq(schema.orders.id, labelOrder!.id));
let labelCalls = 0;
const labelProvider = async () => { labelCalls++; return { barcode: "TEST123456", trackingUrl: "https://postnl.example.invalid/track" }; };
const labels = await Promise.allSettled([createLabelOnce(labelOrder!.id, labelProvider), createLabelOnce(labelOrder!.id, labelProvider)]);
assert.equal(labels.filter(result => result.status === "fulfilled").length, 1);
assert.equal(labelCalls, 1);
console.log("PASS parallel shipping-label requests call the provider only once");

const uncertain = await createCheckoutPayment(payload());
const uncertainPayment = [...remotePayments.values()].at(-1)!; uncertainPayment.status = "paid";
await syncMolliePaymentStatus(uncertainPayment.id);
const [uncertainOrder] = await db.select().from(schema.orders).where(eq(schema.orders.orderNumber, uncertain.orderNumber));
timeoutNextRefund = true;
await assert.rejects(() => requestRefund({ orderId: uncertainOrder!.id, amountCents: 500, reason: "Timeout test", actorId: null as any }));
assert.equal((await db.select().from(schema.refundRequests).where(eq(schema.refundRequests.orderId, uncertainOrder!.id)))[0]!.status, "unknown");
await assert.rejects(() => requestRefund({ orderId: uncertainOrder!.id, amountCents: 500, reason: "Unsafe retry", actorId: null as any }));
await syncPaymentRefunds(uncertainPayment.id);
assert.equal((await db.select().from(schema.refundRequests).where(eq(schema.refundRequests.orderId, uncertainOrder!.id)))[0]!.status, "queued");
let uncertainLabels = 0;
await assert.rejects(() => createLabelOnce(uncertainOrder!.id, async () => { uncertainLabels++; throw new Error("Provider response lost"); }));
await assert.rejects(() => createLabelOnce(uncertainOrder!.id, async () => { uncertainLabels++; return { barcode: "duplicate", trackingUrl: "https://invalid.example" }; }));
assert.equal(uncertainLabels, 1);
console.log("PASS uncertain refunds and labels cannot be retried into duplicate operations");

// Late label responses cannot undo a newer refund or dispatch.
const labelRaceNumber = (await createCheckoutPayment(payload())).orderNumber;
const [labelRace] = await db.select().from(schema.orders).where(eq(schema.orders.orderNumber, labelRaceNumber));
await db.update(schema.orders).set({ status: "paid" }).where(eq(schema.orders.id, labelRace!.id));
await createLabelOnce(labelRace!.id, async () => {
  await db.update(schema.orders).set({ status: "refunded", trackingNumber: "NEWER-TRACKING", trackingUrl: "https://postnl.example.invalid/newer" }).where(eq(schema.orders.id, labelRace!.id));
  return { barcode: "OLDER-TRACKING", trackingUrl: "https://postnl.example.invalid/older" };
});
const [labelRaceAfter] = await db.select().from(schema.orders).where(eq(schema.orders.id, labelRace!.id));
assert.equal(labelRaceAfter!.status, "refunded"); assert.equal(labelRaceAfter!.trackingNumber, "NEWER-TRACKING");
console.log("PASS label responses preserve newer order status and tracking");

// Refunds from the Mollie portal are imported, reserve balance, and complete once.
const portalNumber = (await createCheckoutPayment(payload())).orderNumber;
const portalPayment = [...remotePayments.values()].at(-1)!; portalPayment.status = "paid";
await syncMolliePaymentStatus(portalPayment.id);
const [portalOrder] = await db.select().from(schema.orders).where(eq(schema.orders.orderNumber, portalNumber));
remoteRefunds.set("re_portal", { id: "re_portal", paymentId: portalPayment.id, status: "processing", amount: { currency: "EUR", value: "5.00" } });
await syncPaymentRefunds(portalPayment.id);
await assert.rejects(() => requestRefund({ orderId: portalOrder!.id, amountCents: 1, reason: "Over balance", actorId: null as any }));
remoteRefunds.get("re_portal").status = "refunded";
await Promise.all([syncPaymentRefunds(portalPayment.id), syncPaymentRefunds(portalPayment.id)]);
assert.equal((await db.select().from(schema.refundRequests).where(eq(schema.refundRequests.orderId, portalOrder!.id))).length, 1);
assert.equal((await db.select().from(schema.returnRequests).where(eq(schema.returnRequests.orderId, portalOrder!.id))).length, 1);
assert.equal((await db.select().from(schema.orders).where(eq(schema.orders.id, portalOrder!.id)))[0]!.status, "refunded");
console.log("PASS provider-portal refunds reconcile without duplicate ledger entries");

// One recipient failing must not lose the other recipient's successful delivery.
const mailNumber = (await createCheckoutPayment(payload())).orderNumber;
const mailPayment = [...remotePayments.values()].at(-1)!; mailPayment.status = "paid";
failOwnerEmail = true; await syncMolliePaymentStatus(mailPayment.id);
const [mailOrder] = await db.select().from(schema.orders).where(eq(schema.orders.orderNumber, mailNumber));
assert.equal(deliveredEmails.get(`paid-customer-${mailOrder!.id}`), 1);
assert.equal(deliveredEmails.get(`paid-owner-${mailOrder!.id}`), undefined);
assert.equal((await db.select().from(schema.orderEmailJobs).where(eq(schema.orderEmailJobs.orderId, mailOrder!.id))).filter(job => job.status === "failed").length, 1);
await Promise.all([retryPaidOrderEmails(mailOrder!.id), retryPaidOrderEmails(mailOrder!.id)]);
await processPaidOrderEmails(mailOrder!.id);
assert.equal(deliveredEmails.get(`paid-customer-${mailOrder!.id}`), 1);
assert.equal(deliveredEmails.get(`paid-owner-${mailOrder!.id}`), 1);
console.log("PASS failed confirmation emails persist, retry, and do not resend successful recipients");

// Lost payment responses keep stock held and recover the original provider ID.
timeoutPayment = "after";
const paymentCountBefore = remotePayments.size;
await assert.rejects(() => createCheckoutPayment(payload()));
const orphanPayment = [...remotePayments.values()].at(-1)!;
const orphanId = orphanPayment.metadata.orderId;
assert.equal((await db.select().from(schema.orders).where(eq(schema.orders.id, orphanId)))[0]!.status, "pending");
const recoveredPayment = await recoverCheckoutPayment(orphanId);
assert.equal(recoveredPayment.id, orphanPayment.id); assert.equal(remotePayments.size, paymentCountBefore + 1);
orphanPayment.status = "paid"; await syncMolliePaymentStatus(orphanPayment.id);
assert.equal((await db.select().from(schema.orders).where(eq(schema.orders.id, orphanId)))[0]!.status, "paid");
// Also recover directly from an authenticated webhook before any owner retry.
timeoutPayment = "after"; await assert.rejects(() => createCheckoutPayment(payload()));
const webhookOrphan = [...remotePayments.values()].at(-1)!; webhookOrphan.status = "paid";
await syncMolliePaymentStatus(webhookOrphan.id);
assert.equal((await db.select().from(schema.orders).where(eq(schema.orders.id, webhookOrphan.metadata.orderId)))[0]!.status, "paid");
// A credential rotation must never create a second payment using an old key.
timeoutPayment = "after"; await assert.rejects(() => createCheckoutPayment(payload()));
const rotatedPayment = [...remotePayments.values()].at(-1)!;
const originalCredential = process.env.MOLLIE_API_KEY;
process.env.MOLLIE_API_KEY = "test_rotated_isolated_mock_only";
assert.equal((await recoverCheckoutPayment(rotatedPayment.metadata.orderId)).id, rotatedPayment.id);
process.env.MOLLIE_API_KEY = originalCredential;
console.log("PASS payment response loss, webhook recovery, and credential rotation cannot create duplicate payments");

// Unaccepted old attempts require explicit owner review, then release atomically.
timeoutPayment = "before"; await assert.rejects(() => createCheckoutPayment(payload()));
const missingPaymentOrder = (await db.select().from(schema.orders)).find(row => row.paymentCreationState === "unknown" && row.id !== orphanId)!;
assert.ok(missingPaymentOrder);
await assert.rejects(() => resolveMissingCheckoutPayment(missingPaymentOrder.id));
await db.update(schema.orders).set({ paymentCreationStartedAt: new Date(Date.now() - 61 * 60_000) }).where(eq(schema.orders.id, missingPaymentOrder.id));
const heldBeforeResolve = (await db.select().from(schema.productVariants).where(eq(schema.productVariants.id, variant!.id)))[0]!.reservedStock;
await resolveMissingCheckoutPayment(missingPaymentOrder.id);
assert.equal((await db.select().from(schema.orders).where(eq(schema.orders.id, missingPaymentOrder.id)))[0]!.status, "cancelled");
assert.equal((await db.select().from(schema.productVariants).where(eq(schema.productVariants.id, variant!.id)))[0]!.reservedStock, heldBeforeResolve - 1);
await assert.rejects(() => resolveMissingCheckoutPayment(missingPaymentOrder.id));
console.log("PASS aged missing payments resolve only after provider review, with one stock release");

const { sealPaymentParameters, openPaymentParameters } = await import("../src/lib/provider-recovery.server");
const encrypted = sealPaymentParameters({ redirectUrl: "https://shop.test/checkout?access=SECRET-GUEST-TOKEN" });
assert.ok(!encrypted.includes("SECRET-GUEST-TOKEN"));
assert.equal(openPaymentParameters<any>(encrypted).redirectUrl, "https://shop.test/checkout?access=SECRET-GUEST-TOKEN");
assert.throws(() => openPaymentParameters(encrypted.slice(0, -10) + "AAAAAAAAAA"));
console.log("PASS durable payment payloads are authenticated-encrypted, including guest tokens");

// Cancel at the provider, and only then release the reservation exactly once.
const cancelNumber = (await createCheckoutPayment(payload())).orderNumber;
const [cancelOrder] = await db.select().from(schema.orders).where(eq(schema.orders.orderNumber, cancelNumber));
const cancelProvider = [...remotePayments.values()].at(-1)!;
const stockBeforeCancel = (await db.select().from(schema.productVariants).where(eq(schema.productVariants.id, variant!.id)))[0]!.reservedStock;
await cancelCheckoutOrder(cancelOrder!.id); await cancelCheckoutOrder(cancelOrder!.id);
assert.equal(cancelProvider.status, "canceled");
assert.equal((await db.select().from(schema.productVariants).where(eq(schema.productVariants.id, variant!.id)))[0]!.reservedStock, stockBeforeCancel - 1);
assert.equal((await db.select().from(schema.orders).where(eq(schema.orders.id, cancelOrder!.id)))[0]!.status, "cancelled");
const cancelRaceNumber = (await createCheckoutPayment(payload())).orderNumber;
const [cancelRace] = await db.select().from(schema.orders).where(eq(schema.orders.orderNumber, cancelRaceNumber));
cancelBecomesPaid = true;
await assert.rejects(() => cancelCheckoutOrder(cancelRace!.id));
assert.equal((await db.select().from(schema.orders).where(eq(schema.orders.id, cancelRace!.id)))[0]!.status, "paid");
console.log("PASS cancellation requires Mollie confirmation and concurrent successful payment wins");

// An unaccepted refund is recoverable with its ORIGINAL key, not a new refund.
timeoutBeforeRefund = true;
await assert.rejects(() => requestRefund({ orderId: orphanId, amountCents: 100, reason: "Unaccepted refund", actorId: null as any }));
const [missingRefund] = await db.select().from(schema.refundRequests).where(eq(schema.refundRequests.orderId, orphanId));
const recoveredRefund = await retryRefund(missingRefund!.id, orphanId);
assert.equal(recoveredRefund.refundStatus, "queued");
assert.equal((await retryRefund(missingRefund!.id, orphanId)).refundId, recoveredRefund.refundId);
timeoutBeforeRefund = true;
await assert.rejects(() => requestRefund({ orderId: orphanId, amountCents: 100, reason: "Expired missing refund", actorId: null as any }));
const expiredRefund = (await db.select().from(schema.refundRequests).where(eq(schema.refundRequests.orderId, orphanId))).find(row => row.status === "unknown")!;
await assert.rejects(() => resolveMissingRefund(expiredRefund.id, orphanId));
await db.update(schema.refundRequests).set({ createdAt: new Date(Date.now() - 61 * 60_000) }).where(eq(schema.refundRequests.id, expiredRefund.id));
await assert.rejects(() => retryRefund(expiredRefund.id, orphanId));
await resolveMissingRefund(expiredRefund.id, orphanId);
assert.equal((await db.select().from(schema.refundRequests).where(eq(schema.refundRequests.id, expiredRefund.id)))[0]!.status, "failed");
console.log("PASS uncertain refunds have bounded same-key recovery and explicit aged owner resolution");

// A burst causes a single provider read; skipped updates remain retryable.
const readsBefore = paymentReads;
const burst = await Promise.all(Array.from({ length: 20 }, () => webhook(event(new Request("https://shop.test/api/payments/mollie-webhook", {
  method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" }, body: `id=${mailPayment.id}`,
})))));
assert.equal(burst.filter(response => response.status === 200).length, 1);
assert.equal(burst.filter(response => response.status === 503).length, 19);
assert.equal(paymentReads - readsBefore, 1);
console.log("PASS webhook bursts coalesce across instances and return retryable responses, not false success");

const { GET: recoveryJob } = await import("../src/routes/api/jobs/order-recovery");
delete process.env.CRON_SECRET;
assert.equal((await recoveryJob(event(request("/api/jobs/order-recovery")))).status, 401);
process.env.CRON_SECRET = "isolated-order-job-secret-not-used-in-production-1234";
const wrongJob = request("/api/jobs/order-recovery"); wrongJob.headers.set("authorization", "Bearer incorrect");
assert.equal((await recoveryJob(event(wrongJob))).status, 401);
const authorizedJob = request("/api/jobs/order-recovery"); authorizedJob.headers.set("authorization", `Bearer ${process.env.CRON_SECRET}`);
assert.equal((await recoveryJob(event(authorizedJob))).status, 200);
console.log("PASS scheduled recovery is disabled without a secret and rejects invalid credentials");

// Exercise the real Better Auth enrollment and server authorization boundary.
const password = "Test-Only-Unused-482!";
const signedUp = await auth.handler(request("/api/auth/sign-up/email", { name: "Test Owner", email: "owner@example.invalid", password }));
assert.equal(signedUp.status, 200);
await db.update(schema.user).set({ role: "admin", emailVerified: true }).where(eq(schema.user.email, "owner@example.invalid"));
const cookies = new Map<string, string>();
function remember(response: Response) {
  for (const value of response.headers.getSetCookie()) { const pair = value.split(";", 1)[0]!; const index = pair.indexOf("="); cookies.set(pair.slice(0, index), pair.slice(index + 1)); }
}
const cookie = () => [...cookies].map(([name, value]) => `${name}=${value}`).join("; ");
const login = await auth.handler(request("/api/auth/sign-in/email", { email: "owner@example.invalid", password }));
assert.equal(login.status, 200); remember(login);
const otherLogin = await auth.handler(request("/api/auth/sign-in/email", { email: "owner@example.invalid", password }));
const oldCookie = otherLogin.headers.getSetCookie().map(value => value.split(";", 1)[0]).join("; ");
assert.equal((await requireAdmin(event(request("/api/admin/dashboard", undefined, cookie())))).response?.status, 403);
assert.equal((await requireAdmin(event(request("/api/admin/security", undefined, cookie())), { allowEnrollment: true })).response, null);
const enrollment = await auth.handler(request("/api/auth/two-factor/enable", { password }, cookie()));
assert.equal(enrollment.status, 200);
remember(enrollment);
const enrollmentData = await enrollment.json();
const secret = new URL(enrollmentData.totpURI).searchParams.get("secret")!;
const bits = [...secret].map(char => "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567".indexOf(char).toString(2).padStart(5, "0")).join("");
const rawSecret = new TextDecoder().decode(Uint8Array.from(bits.match(/.{8}/g)!, byte => Number.parseInt(byte, 2)));
const otp = (await auth.api.generateTOTP({ body: { secret: rawSecret } })).code;
const confirmed = await auth.handler(request("/api/auth/two-factor/verify-totp", { code: otp }, cookie()));
assert.equal(confirmed.status, 200, await confirmed.clone().text()); remember(confirmed);
assert.equal((await requireAdmin(event(request("/api/admin/dashboard", undefined, cookie())))).response, null);
assert.equal((await requireAdmin(event(request("/api/admin/dashboard", undefined, oldCookie)))).response?.status, 403);
// Enabling MFA does not authorize unrelated pre-existing sessions. Removing
// this proof emulates an old session that never completed a factor challenge.
await db.delete(schema.adminSessionApprovals);
assert.equal((await requireAdmin(event(request("/api/admin/dashboard", undefined, cookie())))).response?.status, 403);
assert.equal((await requireAdmin(event(request("/api/admin/orders", undefined, cookie())), { fresh: true })).response?.status, 403);
const wrong = await approveOwner(event(request("/api/admin/security", { password: "wrong-password", code: otp }, cookie())));
assert.equal(wrong.status, 400);
const wrongFactor = await approveOwner(event(request("/api/admin/security", { password, code: otp === "000000" ? "111111" : "000000" }, cookie())));
assert.equal(wrongFactor.status, 400);
const approval = await approveOwner(event(request("/api/admin/security", { password, code: otp }, cookie())));
assert.equal(approval.status, 200);
assert.equal((await requireAdmin(event(request("/api/admin/orders", undefined, cookie())), { fresh: true })).response, null);
const refusedRefund = await ownerOrderAction(event(request("/api/admin/orders", { action: "refund", id: paidOrder!.id, amountCents: 100, reason: "Already refunded", confirmation: "REFUND" }, cookie())));
assert.equal(refusedRefund.status, 409);
const ownerUser = (await db.select().from(schema.user).where(eq(schema.user.email, "owner@example.invalid")))[0]!;
const selfRemoval = await ownerRemoveCustomer(event(new Request("https://shop.test/api/admin/customers", {
  method: "DELETE", headers: { "Content-Type": "application/json", Origin: "https://shop.test", Cookie: cookie() },
  body: JSON.stringify({ id: ownerUser.id, confirmation: "REMOVE" }),
})));
assert.equal(selfRemoval.status, 400);

// The dashboard must never materialize embedded artwork in its JSON. Display
// handles must stay private and must not overwrite or break stored images.
const { GET: ownerDashboard } = await import("../src/routes/api/admin/dashboard");
const { GET: ownerImage } = await import("../src/routes/api/admin/product-image");
const { PATCH: editProduct } = await import("../src/routes/api/admin/products");
const { PATCH: editVariant, POST: addVariant } = await import("../src/routes/api/admin/variants");
const { loadAdminCatalogue } = await import("../src/lib/admin-catalogue.server");
const productPhoto = `data:image/png;base64,${Buffer.alloc(150_000, 42).toString("base64")}`;
const variantPhoto = `data:image/png;base64,${Buffer.alloc(150_000, 43).toString("base64")}`;
const [imageProduct] = await db.insert(schema.products).values({ name: "Image regression", slug: "image-regression", game: "yugioh", status: "draft", imageUrls: [productPhoto, variantPhoto] }).returning();
const [imageVariant] = await db.insert(schema.productVariants).values({ productId: imageProduct!.id, name: "English", sku: "IMAGE-TEST", imageUrl: variantPhoto, priceCents: 500, stock: 0, language: "English", condition: "Near Mint", finish: "" }).returning();
const compactDashboard = await ownerDashboard(event(request("/api/admin/dashboard", undefined, cookie())));
assert.equal(compactDashboard.status, 200);
const compactText = await compactDashboard.text();
assert.ok(!compactText.includes(productPhoto)); assert.ok(!compactText.includes(variantPhoto));
const compactProduct = JSON.parse(compactText).products.find((product: any) => product.id === imageProduct!.id);
assert.equal(compactProduct.imageUrls[0], `/api/admin/product-image?product=${imageProduct!.id}&image=0`);
assert.equal(compactProduct.variants[0].imageUrl, `/api/admin/product-image?variant=${imageVariant!.id}`);
assert.equal((await ownerImage(event(request(compactProduct.imageUrls[0])))).status, 401);
const downloadedImage = await ownerImage(event(request(compactProduct.imageUrls[0], undefined, cookie())));
assert.equal(downloadedImage.status, 200); assert.equal((await downloadedImage.arrayBuffer()).byteLength, 150_000);
const patch = (path: string, body: unknown) => event(new Request(`https://shop.test${path}`, { method: "PATCH",
  headers: { "Content-Type": "application/json", Origin: "https://shop.test", Cookie: cookie() }, body: JSON.stringify(body) }));
assert.equal((await editProduct(patch("/api/admin/products", { id: imageProduct!.id, variantId: imageVariant!.id, image: compactProduct.imageUrls[0], priceCents: 700 }))).status, 200);
assert.deepEqual((await db.select().from(schema.products).where(eq(schema.products.id, imageProduct!.id)))[0]!.imageUrls, [productPhoto, variantPhoto]);
assert.equal((await db.select().from(schema.productVariants).where(eq(schema.productVariants.id, imageVariant!.id)))[0]!.imageUrl, variantPhoto);
const variantInput = { ...imageVariant, barcode: "", language: "English", condition: "Near Mint", finish: "", imageUrl: compactProduct.variants[0].imageUrl, priceCents: 800 };
assert.equal((await editVariant(patch("/api/admin/variants", variantInput))).status, 200);
assert.equal((await db.select().from(schema.productVariants).where(eq(schema.productVariants.id, imageVariant!.id)))[0]!.imageUrl, variantPhoto);
const copied = await addVariant(event(request("/api/admin/variants", { ...variantInput, sku: "IMAGE-TEST-FR", language: "French" }, cookie())));
assert.equal(copied.status, 201);
const copiedVariant = (await copied.json()).variant;
assert.equal(copiedVariant.imageUrl, variantPhoto); assert.ok(!copiedVariant.imageUrl.startsWith("/api/admin/"));
const allCatalogueIds = new Set<string>(); let catalogueOffset: number | null = 0;
do {
  const page = await loadAdminCatalogue({ limit: 2, offset: catalogueOffset });
  assert.ok(page.products.length <= 2);
  for (const product of page.products) { assert.ok(!allCatalogueIds.has(product.id)); allCatalogueIds.add(product.id); }
  catalogueOffset = page.nextOffset;
} while (catalogueOffset !== null);
assert.equal(allCatalogueIds.size, (await db.select({ id: schema.products.id }).from(schema.products)).length);
const catalogueResponse = await ownerDashboard(event(request("/api/admin/dashboard?catalogueOnly=1&offset=0", undefined, cookie())));
assert.equal(catalogueResponse.status, 200);
assert.ok((await catalogueResponse.json()).products.every((product: any) => product.variants.every((variant: any) => !variant.imageUrl?.startsWith("data:"))));
console.log("PASS dashboard catalogue pagination and private image handles preserve galleries, variant photos, and language copies without embedded image payloads");

const ownerSession = await auth.api.getSession({ headers: new Headers({ Cookie: cookie() }) });
await db.update(schema.adminSessionApprovals).set({ verifiedAt: new Date(Date.now() - 6 * 60_000) }).where(eq(schema.adminSessionApprovals.sessionId, ownerSession!.session.id));
assert.equal((await requireAdmin(event(request("/api/admin/orders", undefined, cookie())), { fresh: true })).response?.status, 403);
for (const action of [
  { action: "recover_payment", id: orphanId },
  { action: "resolve_missing_payment", id: missingPaymentOrder.id, confirmation: "CHECKED_MOLLIE_NO_PAYMENT" },
  { action: "retry_refund", id: orphanId, requestId: missingRefund!.id },
  { action: "resolve_missing_refund", id: orphanId, requestId: expiredRefund.id, confirmation: "CHECKED_MOLLIE_NO_REFUND" },
]) {
  assert.equal((await ownerOrderAction(event(request("/api/admin/orders", action, cookie())))).status, 403);
}
const disabled = await auth.handler(request("/api/auth/two-factor/disable", { password }, cookie()));
assert.equal(disabled.status, 403);
console.log("PASS owner MFA enrollment, mandatory MFA, password+TOTP reauthentication, expiry, and disable prevention");

await pg.close();
console.log("SECURITY INTEGRATION PASSED; no production database or provider was contacted");
