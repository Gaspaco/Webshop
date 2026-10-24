// In-memory PostgreSQL only. Every payment, email and label provider is mocked.
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { mock } from "bun:test";
import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { eq } from "drizzle-orm";
import * as schema from "../src/db/schema";
import { DEFAULT_STORE_PROFILE } from "../src/lib/store-profile";

if (process.env.TCG_SHIPPING_WALLET_TEST !== "1") throw new Error("Use the isolated test wrapper.");
process.env.NODE_ENV = "production";
process.env.DATABASE_URL = "postgresql://isolated:isolated@127.0.0.1:1/no_real_database";
delete process.env.DATABASE_PUBLIC_URL;
process.env.BETTER_AUTH_SECRET = "isolated-wallet-test-secret-not-used-by-any-real-shop-123456789";
process.env.ORDER_RECOVERY_ENCRYPTION_KEY = "isolated-wallet-recovery-key-not-used-by-any-real-shop-123456789";
process.env.BETTER_AUTH_URL = "https://shop.test";
process.env.MOLLIE_API_KEY = "test_isolated_mock_only";
for (const key of ["SMTP_HOST", "SMTP_PORT", "SMTP_USER", "SMTP_PASS", "AUTH_EMAIL_FROM", "ORDER_NOTIFICATION_EMAIL"]) delete process.env[key];
globalThis.fetch = (async () => { throw new Error("External network is forbidden in this test."); }) as typeof fetch;
const pg = new PGlite();
const db = drizzle(pg, { schema });
for (const file of readdirSync("drizzle").filter(file => /^\d+.*\.sql$/.test(file)).sort()) {
  for (const statement of readFileSync(`drizzle/${file}`, "utf8").split("--> statement-breakpoint")) if (statement.trim()) await pg.exec(statement);
}
mock.module("../src/db/index.ts", () => ({ db }));
const profile = structuredClone(DEFAULT_STORE_PROFILE);
mock.module("../src/lib/store-profile.server.ts", () => ({ getStoreProfile: async () => profile }));
const [owner, buyer, other, unverified] = await db.insert(schema.user).values([
  { name: "Fixture owner", email: "owner@example.invalid", role: "admin", emailVerified: true },
  { name: "Fixture buyer", email: "buyer@example.invalid", role: "customer", emailVerified: true },
  { name: "Other buyer", email: "other@example.invalid", role: "customer", emailVerified: true },
  { name: "Unverified", email: "unverified@example.invalid", role: "customer", emailVerified: false },
]).returning();
let signedIn: typeof owner | null = owner;
mock.module("../src/lib/auth.ts", () => ({ auth: { api: { getSession: async () => signedIn ? { user: signedIn } : null } } }));
const noop = async () => {};
const deliveredEmails = new Map<string, number>();
mock.module("../src/lib/email.server.ts", () => ({ sendTransactionalEmail: async (message: { idempotencyKey: string }) => {
  deliveredEmails.set(message.idempotencyKey, (deliveredEmails.get(message.idempotencyKey) ?? 0) + 1);
}, sendNewSignInEmail: noop, sendVerificationEmail: noop, sendPasswordResetEmail: noop, sendTwoFactorCodeEmail: noop,
  escapeEmailHtml: (value: string) => value, renderTransactionalEmail: () => "", emailPanel: () => "", emailDetails: () => "",
  emailHighlight: () => "", emailCode: () => "", emailMessage: () => "", emailParagraphs: () => "", emailAddress: () => "", emailOrderItems: () => "", emailFallbackLink: () => "" }));
const remotePayments = new Map<string, any>();
const remoteRefunds = new Map<string, any>();
const paymentKeys = new Map<string, any>();
let paymentNumber = 0, refundNumber = 0;
let failPayment: "reject" | "timeout" | null = null;
mock.module("../src/lib/mollie.server.ts", () => ({ getMollieClient: () => ({
  payments: {
    create: async (params: any) => {
      if (failPayment) { const failure = failPayment; failPayment = null; throw Object.assign(new Error("Fixture failure"), failure === "reject" ? { statusCode: 422 } : {}); }
      if (paymentKeys.has(params.idempotencyKey)) return paymentKeys.get(params.idempotencyKey);
      const id = `tr_test${String(++paymentNumber).padStart(8, "0")}`;
      const payment = { ...params, id, status: "open", getCheckoutUrl: () => "https://mollie.example.invalid/checkout" };
      remotePayments.set(id, payment); paymentKeys.set(params.idempotencyKey, payment); return payment;
    },
    get: async (id: string) => remotePayments.get(id),
    cancel: async (id: string) => { remotePayments.get(id).status = "canceled"; },
    iterate: async function* () { yield* remotePayments.values(); },
  },
  paymentRefunds: {
    create: async (params: any) => { const refund = { ...params, id: `re_test${++refundNumber}`, status: "queued" }; remoteRefunds.set(refund.id, refund); return refund; },
    iterate: async function* ({ paymentId }: { paymentId: string }) { for (const refund of remoteRefunds.values()) if (refund.paymentId === paymentId) yield refund; },
  },
}) }));
const { POST: createProduct, PATCH: patchProduct } = await import("../src/routes/api/admin/products");
const { POST: duplicate } = await import("../src/routes/api/admin/duplicate-product");
const { PUT: saveStoreProfile } = await import("../src/routes/api/admin/store-profile");
const { POST: shippingQuote } = await import("../src/routes/api/checkout/shipping-quote");
const { POST: checkoutApi } = await import("../src/routes/api/checkout/create-payment");
const { GET: adminWallet, POST: adjustApi } = await import("../src/routes/api/admin/wallet");
const { GET: accountWallet } = await import("../src/routes/api/account/wallet");
const { DELETE: removeCustomer } = await import("../src/routes/api/admin/customers");
const { POST: orderAction, PATCH: updateOrder } = await import("../src/routes/api/admin/orders");
const { GET: invoice } = await import("../src/routes/api/admin/invoice");
const { createCheckoutPayment, calculateTrustedCheckout, syncMolliePaymentStatus } = await import("../src/lib/checkout.server");
const { requestRefund, syncPaymentRefunds } = await import("../src/lib/refunds.server");
const { adjustWallet, walletOverview } = await import("../src/lib/wallet.server");
function event(path: string, body?: unknown, method = body === undefined ? "GET" : "POST", origin = "https://shop.test") {
  return { request: new Request(`https://shop.test${path}`, { method, headers: { Origin: origin, "Content-Type": "application/json", "x-real-ip": "127.0.0.1" }, ...(body === undefined ? {} : { body: JSON.stringify(body) }) }) } as any;
}
const sealedShipping = profile.shippingSettings.presets.find(row => row.id === "yugioh-box")!;
const configuredProfile = structuredClone(profile);
configuredProfile.shippingSettings.packagingWeightGrams = 35;
assert.equal((await saveStoreProfile(event("/api/admin/store-profile", configuredProfile, "PUT"))).status, 200);
assert.equal(((await db.select().from(schema.storefrontContent).where(eq(schema.storefrontContent.key, "business")))[0]!.value as any).shippingSettings.packagingWeightGrams, 35);
configuredProfile.shippingSettings.singlesTiers = [{ maxQuantity: 10, weightGrams: 20 }];
assert.equal((await saveStoreProfile(event("/api/admin/store-profile", configuredProfile, "PUT"))).status, 400);
const response = await createProduct(event("/api/admin/products", { name: "Measured box", slug: "measured-box", game: "yugioh", productType: "sealed", status: "active", priceCents: 500, stock: 100, shipping: sealedShipping }));
assert.equal(response.status, 201, await response.clone().text());
const { product, variant } = await response.json();
assert.equal(product.metadata.shipping.weightGrams, 500);
assert.equal((await patchProduct(event("/api/admin/products", { id: product.id, variantId: variant.id, shipping: { ...sealedShipping, weightGrams: -5 } }, "PATCH"))).status, 400);
assert.equal((await patchProduct(event("/api/admin/products", { id: product.id, variantId: variant.id, shipping: { ...sealedShipping, weightGrams: 600 } }, "PATCH"))).status, 200);
assert.equal((await duplicate(event("/api/admin/duplicate-product", { id: product.id }))).status, 201);
const copied = (await db.select().from(schema.products)).find(row => row.id !== product.id)!;
assert.equal((copied.metadata.shipping as any).weightGrams, 600);
const customer = { email: buyer!.email, firstName: "Fixture", lastName: "Buyer", address: "Teststraat 1", postalCode: "1000AA", city: "Test", country: "Netherlands" };
const payload = () => ({ items: [{ id: product.slug, variantId: variant.id, quantity: 1 }], customer, shippingMethod: "local_pickup", paymentMethod: "mollie", useStoreCredit: true, creditRequestId: crypto.randomUUID() });
await calculateTrustedCheckout(payload());
const quote = await shippingQuote(event("/api/checkout/shipping-quote", { items: payload().items, country: "NL", weightGrams: 1, priceCents: 1 }));
assert.equal(quote.status, 200, await quote.clone().text());
const quoteBody = await quote.json(); assert.equal(quoteBody.shipment.weightGrams, 620); assert.equal(quoteBody.subtotalCents, 500);
assert.equal(quoteBody.options.some((row: any) => row.value === "postnl_letterbox"), false);
await assert.rejects(() => calculateTrustedCheckout({ ...payload(), shippingMethod: "postnl_letterbox" }), /does not fit/);
console.log("PASS persisted measurements, duplicate snapshots, authoritative quotes and letterbox restrictions");

const adjustment = { userId: buyer!.id, actorId: owner!.id, amountCents: 1000, reason: "Fixture credit", requestId: crypto.randomUUID() };
assert.equal((await adjustWallet(adjustment)).balanceCents, 1000);
assert.equal((await adjustWallet(adjustment)).repeated, true);
await assert.rejects(() => adjustWallet({ ...adjustment, amountCents: 999 }), /already used/);
await assert.rejects(() => adjustWallet({ ...adjustment, requestId: crypto.randomUUID(), amountCents: -1001 }), /too low/);
assert.equal((await walletOverview(buyer!.id)).balanceCents, 1000);
signedIn = buyer;
assert.equal((await adjustApi(event("/api/admin/wallet", adjustment))).status, 403);
assert.equal((await adminWallet(event(`/api/admin/wallet?userId=${other!.id}`))).status, 403);
const own = await accountWallet(event(`/api/account/wallet?userId=${other!.id}`));
assert.equal((await own.json()).balanceCents, 1000);
signedIn = null;
assert.equal((await accountWallet(event("/api/account/wallet"))).status, 401);
assert.equal((await checkoutApi(event("/api/checkout/create-payment", payload()))).status, 403);
signedIn = unverified;
assert.equal((await checkoutApi(event("/api/checkout/create-payment", payload()))).status, 403);
signedIn = owner;
assert.equal((await adjustApi(event("/api/admin/wallet", adjustment, "POST", "https://evil.test"))).status, 403);
assert.equal((await removeCustomer(event("/api/admin/customers", { id: buyer!.id, confirmation: "REMOVE" }, "DELETE"))).status, 409);
console.log("PASS wallet authorization, CSRF checks, identity-scoped reads, adjustment retries and no overdraft");

const creditInput = payload();
const full = await createCheckoutPayment(creditInput, buyer!.id);
assert.equal(paymentNumber, 0, "fully covered order must never call Mollie");
const orderByNumber = async (number: string) => (await db.select().from(schema.orders).where(eq(schema.orders.orderNumber, number)))[0]!;
const paid = await orderByNumber(full.orderNumber);
assert.equal(paid.totalCents, 500); assert.equal(paid.creditAppliedCents, 500); assert.equal(paid.status, "paid"); assert.equal(paid.creditState, "spent");
assert.equal(paid.shipment!.weightGrams, 620); assert.equal((await walletOverview(buyer!.id)).balanceCents, 500);
await db.update(schema.products).set({ metadata: { shipping: { ...sealedShipping, weightGrams: 900 } } }).where(eq(schema.products.id, product.id));
assert.equal((await orderByNumber(full.orderNumber)).shipment!.weightGrams, 620, "later measurements must not rewrite a placed order");
assert.equal((await db.select().from(schema.payments)).length, 0);
assert.equal((await db.select().from(schema.inventoryMovements).where(eq(schema.inventoryMovements.reference, paid.id))).length, 1);
assert.equal(deliveredEmails.get(`paid-customer-${paid.id}`), 1); assert.equal(deliveredEmails.get(`paid-owner-${paid.id}`), 1);
assert.equal((await createCheckoutPayment(creditInput, buyer!.id)).orderNumber, full.orderNumber);
assert.equal((await walletOverview(buyer!.id)).balanceCents, 500);
await assert.rejects(() => createCheckoutPayment({ ...creditInput, customer: { ...customer, city: "Changed" } }, buyer!.id), /different details/);
const invoiceResponse = await invoice(event(`/api/admin/invoice?id=${paid.id}`));
assert.match(await invoiceResponse.text(), /Store credit/);
assert.equal((await updateOrder(event("/api/admin/orders", { id: paid.id, status: "processing" }, "PATCH"))).status, 200);
assert.equal((await updateOrder(event("/api/admin/orders", { id: paid.id, status: "completed" }, "PATCH"))).status, 200);
assert.equal((await orderAction(event("/api/admin/orders", { action: "refund_credit", id: paid.id, confirmation: "REFUND_CREDIT" }))).status, 200);
assert.equal((await orderAction(event("/api/admin/orders", { action: "refund_credit", id: paid.id, confirmation: "REFUND_CREDIT" }))).status, 200);
assert.equal((await walletOverview(buyer!.id)).balanceCents, 1000);
assert.equal((await orderByNumber(full.orderNumber)).status, "refunded");
assert.equal((await updateOrder(event("/api/admin/orders", { id: paid.id, status: "processing" }, "PATCH"))).status, 409);
console.log("PASS credit-only checkout, one debit on replay, real stock sale, confirmation emails and one credit-only refund");

// Spend only the available €2, charging the remaining €3 through Mollie.
await adjustWallet({ ...adjustment, requestId: crypto.randomUUID(), amountCents: -800 });
const mixedInput = payload(); const mixed = await createCheckoutPayment(mixedInput, buyer!.id);
const mixedOrder = await orderByNumber(mixed.orderNumber);
const mixedPayment = [...remotePayments.values()].at(-1)!;
assert.equal(mixedPayment.amount.value, "3.00"); assert.equal(mixedOrder.creditAppliedCents, 200); assert.equal(mixedOrder.creditState, "reserved");
assert.equal((await walletOverview(buyer!.id)).balanceCents, 0);
await createCheckoutPayment(mixedInput, buyer!.id); assert.equal(paymentNumber, 1);
mixedPayment.status = "canceled";
await syncMolliePaymentStatus(mixedPayment.id); await syncMolliePaymentStatus(mixedPayment.id);
assert.equal((await walletOverview(buyer!.id)).balanceCents, 200);
assert.equal((await orderByNumber(mixed.orderNumber)).creditState, "released");
await assert.rejects(() => createCheckoutPayment(mixedInput, buyer!.id), /closed/);
console.log("PASS mixed cash amount, pending checkout replay and exactly-once cancellation credit release");

const refundable = await createCheckoutPayment(payload(), buyer!.id);
const refundableOrder = await orderByNumber(refundable.orderNumber);
const payment = [...remotePayments.values()].at(-1)!; payment.status = "paid";
await syncMolliePaymentStatus(payment.id); await syncMolliePaymentStatus(payment.id);
assert.equal((await orderByNumber(refundable.orderNumber)).creditState, "spent");
const firstRefund = await requestRefund({ orderId: refundableOrder.id, amountCents: 100, reason: "Fixture partial", actorId: owner!.id });
remoteRefunds.get(firstRefund.refundId).status = "refunded";
await syncPaymentRefunds(payment.id); assert.equal((await walletOverview(buyer!.id)).balanceCents, 0);
const finalRefund = await requestRefund({ orderId: refundableOrder.id, amountCents: 200, reason: "Fixture remainder", actorId: owner!.id });
remoteRefunds.get(finalRefund.refundId).status = "refunded";
await syncPaymentRefunds(payment.id); await syncPaymentRefunds(payment.id);
assert.equal((await walletOverview(buyer!.id)).balanceCents, 200);
assert.equal((await orderByNumber(refundable.orderNumber)).creditState, "refunded");
console.log("PASS partial cash refunds retain credit; complete cash refunds return it once");

failPayment = "reject";
await assert.rejects(() => createCheckoutPayment(payload(), buyer!.id));
assert.equal((await walletOverview(buyer!.id)).balanceCents, 200);
const ambiguousInput = payload(); failPayment = "timeout";
await assert.rejects(() => createCheckoutPayment(ambiguousInput, buyer!.id));
assert.equal((await walletOverview(buyer!.id)).balanceCents, 0, "uncertain payment must retain its hold");
const recovered = await createCheckoutPayment(ambiguousInput, buyer!.id);
assert.ok(recovered.checkoutUrl);
assert.equal((await walletOverview(buyer!.id)).entries.filter(row => row.orderNumber === recovered.orderNumber && row.kind === "reservation").length, 1);
console.log("PASS definite provider rejection releases credit; uncertain payments recover without another debit");

// Independent simultaneous purchases can spend the balance only once.
await adjustWallet({ ...adjustment, userId: other!.id, requestId: crypto.randomUUID(), amountCents: 500 });
const parallel = await Promise.all([createCheckoutPayment(payload(), other!.id), createCheckoutPayment(payload(), other!.id)]);
const parallelOrders = await Promise.all(parallel.map(row => orderByNumber(row.orderNumber)));
assert.equal(parallelOrders.reduce((total, row) => total + row.creditAppliedCents, 0), 500);
assert.equal((await walletOverview(other!.id)).balanceCents, 0);
console.log("PASS concurrent purchases cannot overdraw store credit");

// A stocked catalogue placeholder must never become a zero-price order.
await db.update(schema.productVariants).set({ priceCents: 0 }).where(eq(schema.productVariants.id, variant.id));
await assert.rejects(() => createCheckoutPayment(payload(), buyer!.id), /not purchasable/);
await db.update(schema.productVariants).set({ priceCents: 500 }).where(eq(schema.productVariants.id, variant.id));

// Leave room to return every pending/spent credit, even near the account cap.
const [limitBuyer] = await db.insert(schema.user).values({ name: "Limit fixture", email: "limit@example.invalid", role: "customer", emailVerified: true }).returning();
await db.insert(schema.walletAccounts).values({ userId: limitBuyer!.id, balanceCents: 99_999_900 });
const limitOrder = await createCheckoutPayment(payload(), limitBuyer!.id);
await assert.rejects(() => adjustWallet({ ...adjustment, userId: limitBuyer!.id, requestId: crypto.randomUUID(), amountCents: 200 }), /including refundable/);
const limitStored = await orderByNumber(limitOrder.orderNumber);
assert.equal((await orderAction(event("/api/admin/orders", { action: "refund_credit", id: limitStored.id, confirmation: "REFUND_CREDIT" }))).status, 200);
assert.equal((await walletOverview(limitBuyer!.id)).balanceCents, 99_999_900);
console.log("PASS zero-price placeholders are blocked and refund headroom is preserved at balance limits");

const { createPostnlLabel, postnlDimensions } = await import("../src/lib/postnl.server");
assert.deepEqual(postnlDimensions({ lengthCm: 8, widthCm: 21, heightCm: 13 }), { Length: 210, Width: 130, Height: 80 });
assert.throws(() => postnlDimensions({ lengthCm: 10 }));
process.env.POSTNL_API_KEY = "fixture-sandbox-not-a-real-key";
process.env.POSTNL_CUSTOMER_NUMBER = "1234567"; process.env.POSTNL_CUSTOMER_CODE = "TEST";
process.env.POSTNL_COLLECTION_LOCATION = "123456"; process.env.POSTNL_MODE = "sandbox";
let postnlCalls = 0; let captured: any;
globalThis.fetch = (async (url: string | URL | Request, init?: RequestInit) => {
  assert.match(String(url), /^https:\/\/api-sandbox\.postnl\.nl\//); postnlCalls++;
  if (String(url).includes("/barcode")) return Response.json({ Barcode: "3SFIXTURE123456" });
  captured = JSON.parse(String(init!.body));
  return Response.json({ ResponseShipments: [{ Barcode: "3SFIXTURE123456", Labels: [{ Content: Buffer.from("fixture PDF").toString("base64") }] }] });
}) as typeof fetch;
const labelInput = { orderNumber: "FIXTURE", customerEmail: buyer!.email,
  shippingAddress: { firstName: "Fixture", lastName: "Buyer", streetAndHouseNumber: "Teststraat 1", postalCode: "1000AA", city: "Test", countryCode: "NL" },
  senderAddress: { companyName: "Fixture shop", email: "owner@example.invalid", streetAndHouseNumber: "Teststraat 2", postalCodeAndCity: "1000AA Test" },
  weightGrams: 620, productCode: "3085", lengthCm: 16, widthCm: 15, heightCm: 6 };
await assert.rejects(() => createPostnlLabel({ ...labelInput, heightCm: -1 })); assert.equal(postnlCalls, 0);
await createPostnlLabel(labelInput);
assert.deepEqual(captured.Shipments[0].Dimension, { Weight: 620, Length: 160, Width: 150, Height: 60 });
assert.equal(postnlCalls, 2);
console.log("PASS label payload carries grams and millimetres; invalid dimensions fail before provider calls");
await pg.close();
console.log("SHIPPING WALLET INTEGRATION PASSED");
