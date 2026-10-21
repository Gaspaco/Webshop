// All data, email and provider calls in this runner are isolated test fixtures.
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { mock } from "bun:test";
import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { eq, like } from "drizzle-orm";
import sharp from "sharp";
import * as schema from "../src/db/schema";
import type { APIEvent } from "@solidjs/start/server";

if (process.env.TCG_PUBLIC_SECURITY_TEST !== "1") throw new Error("Run through the isolated test wrapper.");
process.env.NODE_ENV = "production";
process.env.DATABASE_URL = "postgresql://isolated:isolated@127.0.0.1:1/no_real_database";
delete process.env.DATABASE_PUBLIC_URL;
const pg = new PGlite();
const db = drizzle(pg, { schema });
for (const file of readdirSync("drizzle").filter(file => /^\d+.*\.sql$/.test(file)).sort()) {
  for (const statement of readFileSync(`drizzle/${file}`, "utf8").split("--> statement-breakpoint")) if (statement.trim()) await pg.exec(statement);
}
mock.module("../src/db/index.ts", () => ({ db }));
type TestUser = { id: string; role: string; email: string; emailVerified: boolean };
let signedIn: TestUser | null = null;
mock.module("../src/lib/auth.ts", () => ({ auth: { api: { getSession: async () => signedIn ? { user: signedIn } : null } } }));
type TestMail = { to: string; subject: string; text: string };
const emails: TestMail[] = [];
let mailFailure = false;
mock.module("../src/lib/email.server.ts", () => ({
  emailDetails: () => "", emailMessage: () => "", emailFallbackLink: () => "", renderTransactionalEmail: () => "",
  sendTransactionalEmail: async (message: TestMail) => { if (mailFailure) throw new Error("Mock SMTP unavailable"); emails.push(message); },
}));
const limits = { CARD_SCAN_MINUTE_LIMIT: 3, CARD_SCAN_DAILY_LIMIT: 5, CARD_SCAN_MAX_CONCURRENT: 2 };
mock.module("../src/lib/env.server.ts", () => ({
  getVisionEnv: () => ({ GOOGLE_VISION_API_KEY: "isolated-test-key-not-a-real-credential", ...limits }),
  getAuthEnv: () => ({ BETTER_AUTH_URL: "https://shop.test" }),
}));
mock.module("../src/lib/catalog-search.server.ts", () => ({ searchCatalog: async () => [] }));
let providerCalls = 0;
let providerFailure = false;
globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
  assert.equal(String(input), "https://vision.googleapis.com/v1/images:annotate");
  assert.equal(init?.redirect, "error"); assert.ok(init.signal instanceof AbortSignal);
  providerCalls++;
  if (providerFailure) throw new Error("Mock ambiguous provider timeout");
  return Response.json({ responses: [{ fullTextAnnotation: { text: "Dark Magician" } }] });
}) as typeof fetch;
const getEvent = (path: string) => ({ request: new Request(`https://shop.test${path}`) }) as APIEvent;
let client = 1;
const postEvent = (path: string, body: unknown, ip = `192.0.2.${client++}`) => ({
  request: new Request(`https://shop.test${path}`, { method: "POST", headers: { Origin: "https://shop.test", "Content-Type": "application/json", "x-real-ip": ip }, body: JSON.stringify(body) }),
}) as APIEvent;
const { GET: image } = await import("../src/routes/api/catalog/image");
const { GET: ownerImage } = await import("../src/routes/api/admin/product-image");
const { POST: returns } = await import("../src/routes/api/returns");
const { POST: scan } = await import("../src/routes/api/catalog/scan");
const { createGuestReturnChallenge } = await import("../src/lib/return-confirmation.server");

const photo = await sharp({ create: { width: 10, height: 10, channels: 3, background: "#123456" } }).png().toBuffer();
const dataUrl = `data:image/png;base64,${photo.toString("base64")}`;
const fixtures: Array<{ product: string; variant: string }> = [];
for (const status of ["draft", "archived", "active"] as const) {
  const [product] = await db.insert(schema.products).values({ name: `${status} fixture`, slug: `fixture-${status}`, status, imageUrls: [dataUrl] }).returning();
  const [variant] = await db.insert(schema.productVariants).values({ productId: product!.id, sku: `TEST-${status}`, name: "Test", priceCents: 100, stock: 1, imageUrl: dataUrl }).returning();
  fixtures.push({ product: product!.id, variant: variant!.id });
  for (const param of [`product=${product!.id}`, `variant=${variant!.id}`]) {
    const response = await image(getEvent(`/api/catalog/image?${param}`));
    assert.equal(response.status, status === "active" ? 200 : 404);
    assert.equal(response.headers.get("Cache-Control"), "private, no-store");
    assert.equal(response.headers.get("CDN-Cache-Control"), "no-store");
    if (status === "active") assert.ok(Buffer.from(await response.arrayBuffer()).equals(photo));
  }
}
// The exact same URL stops working immediately after unpublishing.
await db.update(schema.products).set({ status: "draft" }).where(eq(schema.products.id, fixtures[2]!.product));
assert.equal((await image(getEvent(`/api/catalog/image?variant=${fixtures[2]!.variant}`))).status, 404);
// Owner previews are still private and functional through their existing route.
signedIn = { id: crypto.randomUUID(), role: "admin", email: "owner@example.invalid", emailVerified: true };
assert.equal((await ownerImage(getEvent(`/api/admin/product-image?product=${fixtures[0]!.product}`))).status, 200);
signedIn = null;
assert.equal((await ownerImage(getEvent(`/api/admin/product-image?product=${fixtures[0]!.product}`))).status, 401);
await db.update(schema.products).set({ status: "active", imageUrls: ["https://images.example.invalid/fixture.png"] }).where(eq(schema.products.id, fixtures[2]!.product));
const redirect = await image(getEvent(`/api/catalog/image?product=${fixtures[2]!.product}`));
assert.equal(redirect.status, 302); assert.equal(redirect.headers.get("Cache-Control"), "private, no-store");

const [customer] = await db.insert(schema.user).values({ name: "Customer", email: "customer@example.invalid", emailVerified: true }).returning();
async function makeOrder(number: string, owner: string | null = customer!.id) {
  const [order] = await db.insert(schema.orders).values({ orderNumber: number, userId: owner, email: customer!.email, status: "paid", subtotalCents: 100, totalCents: 100, billingAddress: {}, shippingAddress: {} }).returning();
  return order!;
}
const order = await makeOrder("TCG-1111111111");
const input = { orderNumber: order.orderNumber, email: order.email, reason: "One test card", confirmation: true };
const started = await returns(postEvent("/api/returns", input));
assert.equal(started.status, 202);
const startedBody = await started.json();
assert.equal(startedBody.verificationRequired, true); assert.equal(startedBody.reference, undefined);
assert.equal((await db.select().from(schema.returnRequests)).length, 0);
assert.equal(emails.length, 1); assert.equal(emails[0]!.to, customer!.email);
const link = new URL(emails[0]!.text.match(/https:\/\/shop\.test\/returns[^\s]+/)![0]);
assert.equal(link.search, "");
const token = new URLSearchParams(link.hash.slice(1)).get("confirm")!;
const [stored] = await db.select().from(schema.verification);
assert.ok(stored?.value.includes("tokenHash")); assert.ok(!stored?.value.includes(token.split(".")[1]!));
assert.ok(stored!.expiresAt.getTime() <= Date.now() + 15 * 60_000);
// Unknown orders get the same answer and do not trigger mail or store a return.
const unknown = await returns(postEvent("/api/returns", { ...input, orderNumber: "TCG-9999999999" }));
assert.equal(unknown.status, 202); assert.deepEqual(await unknown.json(), startedBody); assert.equal(emails.length, 1);
const wrongEmail = await returns(postEvent("/api/returns", { ...input, email: "not-owner@example.invalid" }));
assert.equal(wrongEmail.status, 202); assert.deepEqual(await wrongEmail.json(), startedBody);
// Per-order mail suppression is shared even when the IP changes.
assert.equal((await returns(postEvent("/api/returns", input))).status, 202); assert.equal(emails.length, 1);
const badToken = token.slice(0, -1) + (token.endsWith("A") ? "B" : "A");
assert.equal((await returns(postEvent("/api/returns", { action: "confirm", token: badToken }))).status, 400);
assert.equal((await db.select().from(schema.returnRequests)).length, 0);
// One token can be consumed only once even when confirmation requests race.
const confirmations = await Promise.all(Array.from({ length: 3 }, () => returns(postEvent("/api/returns", { action: "confirm", token, reason: "Must not replace the emailed reason" }))));
assert.deepEqual(confirmations.map(response => response.status).sort(), [201, 400, 400]);
const [saved] = await db.select().from(schema.returnRequests);
assert.equal(saved!.reason, input.reason); assert.equal((await db.select().from(schema.returnRequests)).length, 1);
assert.equal((await returns(postEvent("/api/returns", { action: "confirm", token }))).status, 400);
// Resends invalidate the previous challenge. Expired tokens cannot save requests.
const secondOrder = await makeOrder("TCG-2222222222", null);
const oldToken = await createGuestReturnChallenge(secondOrder.id, "Old reason");
const freshToken = await createGuestReturnChallenge(secondOrder.id, "Updated reason");
assert.equal((await returns(postEvent("/api/returns", { action: "confirm", token: oldToken }))).status, 400);
await db.update(schema.verification).set({ expiresAt: new Date(Date.now() - 1000) }).where(eq(schema.verification.identifier, `return-confirm:${secondOrder.id}`));
assert.equal((await returns(postEvent("/api/returns", { action: "confirm", token: freshToken }))).status, 400);
assert.equal((await db.select().from(schema.returnRequests)).length, 1);
// Logged-in customers can still return their own orders directly, but cannot
// claim an order assigned to somebody else, even with a verified matching email.
signedIn = { id: crypto.randomUUID(), role: "customer", email: customer!.email, emailVerified: true };
assert.equal((await returns(postEvent("/api/returns", input))).status, 404);
signedIn = { id: customer!.id, role: "customer", email: customer!.email, emailVerified: true };
const thirdOrder = await makeOrder("TCG-3333333333");
const ownInput = { ...input, orderNumber: thirdOrder.orderNumber };
assert.equal((await returns(postEvent("/api/returns", ownInput))).status, 201);
assert.equal((await returns(postEvent("/api/returns", ownInput))).status, 200);
signedIn = null;
// SMTP failure does not create an unverified return or disclose order existence.
mailFailure = true;
const fourthOrder = await makeOrder("TCG-4444444444");
const outage = await returns(postEvent("/api/returns", { ...input, orderNumber: fourthOrder.orderNumber }));
assert.equal(outage.status, 202); assert.deepEqual(await outage.json(), startedBody);
assert.equal((await db.select().from(schema.returnRequests)).length, 2);
mailFailure = false;
// Cross-site confirmations are rejected before token use.
const crossSite = postEvent("/api/returns", { action: "confirm", token });
crossSite.request.headers.set("Origin", "https://evil.example.invalid");
assert.equal((await returns(crossSite)).status, 403);

const scanRequest = () => postEvent("/api/catalog/scan", { image: dataUrl });
for (let index = 0; index < 3; index++) assert.equal((await scan(scanRequest())).status, 200);
const minuteLimit = await scan(scanRequest());
assert.equal(minuteLimit.status, 429); assert.equal(minuteLimit.headers.get("Retry-After"), "60"); assert.equal(providerCalls, 3);
await db.delete(schema.rateLimit).where(like(schema.rateLimit.key, "card-scan:minute:%"));
for (let index = 0; index < 2; index++) assert.equal((await scan(scanRequest())).status, 200);
const dailyLimit = await scan(scanRequest());
assert.equal(dailyLimit.status, 429); assert.equal(providerCalls, 5);
assert.ok(Number(dailyLimit.headers.get("Retry-After")) > 0);
await db.delete(schema.rateLimit).where(like(schema.rateLimit.key, "card-scan:%"));
// Shared concurrency remains enforced when another instance owns every slot.
for (let index = 0; index < 2; index++) {
  await db.insert(schema.providerOperationLeases).values({ key: `card-scan:slot:${index}`, token: crypto.randomUUID(), leaseUntil: new Date(Date.now() + 60_000) })
    .onConflictDoUpdate({ target: schema.providerOperationLeases.key, set: { token: crypto.randomUUID(), leaseUntil: new Date(Date.now() + 60_000) } });
}
const busy = await scan(scanRequest());
assert.equal(busy.status, 503); assert.equal(busy.headers.get("Retry-After"), "5"); assert.equal(providerCalls, 5);
await db.delete(schema.providerOperationLeases).where(like(schema.providerOperationLeases.key, "card-scan:%"));
providerFailure = true;
assert.equal((await scan(scanRequest())).status, 502); assert.equal(providerCalls, 6);
const day = new Date().toISOString().slice(0, 10);
assert.equal((await db.select().from(schema.rateLimit).where(eq(schema.rateLimit.key, `card-scan:day:${day}`)))[0]!.count, 1, "Ambiguous failures must still consume the daily budget");
assert.ok((await db.select().from(schema.providerOperationLeases).where(like(schema.providerOperationLeases.key, "card-scan:%"))).every(row => row.leaseUntil <= new Date()));
providerFailure = false;
// Boundaries fail closed on DB failure and do not disclose raw SQL/errors.
await pg.close();
assert.equal((await scan(scanRequest())).status, 503);
assert.equal((await image(getEvent(`/api/catalog/image?product=${fixtures[0]!.product}`))).status, 503);
assert.equal(providerCalls, 6);
console.log("PUBLIC SECURITY INTEGRATION PASSED");
