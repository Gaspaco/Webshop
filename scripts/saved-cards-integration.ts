import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { mock } from "bun:test";
import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { eq } from "drizzle-orm";
import type { APIEvent } from "@solidjs/start/server";
import * as schema from "../src/db/schema";

if (process.env.TCG_SAVED_CARDS_TEST !== "1") throw new Error("Use the isolated test wrapper.");
process.env.NODE_ENV = "production";
process.env.DATABASE_URL = "postgresql://isolated:isolated@127.0.0.1:1/no_real_database";
delete process.env.DATABASE_PUBLIC_URL;
process.env.MOLLIE_API_KEY = "test_isolated_key_not_a_real_credential";
const pg = new PGlite();
const db = drizzle(pg, { schema });
for (const file of readdirSync("drizzle").filter(file => /^\d+.*\.sql$/.test(file)).sort()) {
  for (const statement of readFileSync(`drizzle/${file}`, "utf8").split("--> statement-breakpoint")) if (statement.trim()) await pg.exec(statement);
}
mock.module("../src/db/index.ts", () => ({ db }));
mock.module("../src/lib/env.server.ts", () => ({ getMollieEnv: () => ({ MOLLIE_API_KEY: process.env.MOLLIE_API_KEY }) }));
globalThis.fetch = (async () => { throw new Error("External network is forbidden in saved-card tests."); }) as typeof fetch;
const [alice, bob, unverified] = await db.insert(schema.user).values([
  { name: "Alice", email: "alice@example.invalid", emailVerified: true },
  { name: "Bob", email: "bob@example.invalid", emailVerified: true },
  { name: "Unverified", email: "unverified@example.invalid" },
]).returning();
let signedIn: typeof alice | null = alice!;
mock.module("../src/lib/auth.ts", () => ({ auth: { api: { getSession: async () => signedIn ? { user: signedIn } : null } } }));
let creations = 0, pages = 0, revocations = 0;
let outage = false;
let lateUserId = "";
const mandates = new Map<string, any[]>();
mock.module("../src/lib/mollie.server.ts", () => ({ getMollieClient: () => ({
  profiles: { getCurrent: async () => ({ id: "pfl_isolated" }) },
  customers: { create: async (input: any) => {
    if (outage) throw new Error("Mock provider outage with private data that must not be returned.");
    assert.equal(input.email, undefined); assert.equal(input.name, undefined);
    assert.equal(input.idempotencyKey, `payment-customer:${input.metadata.setupId}`);
    const id = `cst_isolated${++creations}`; mandates.set(id, []);
    if (lateUserId) await db.update(schema.paymentCustomers).set({ customerId: "cst_settled" }).where(eq(schema.paymentCustomers.userId, lateUserId));
    return { id };
  } },
  customerMandates: {
    page: async (input: any) => { pages++; assert.deepEqual(input["scopes[]"], ["customer-present"]); assert.equal(input.scopes, undefined); assert.equal(new URLSearchParams({ "scopes[]": String(input["scopes[]"]) }).toString(), "scopes%5B%5D=customer-present"); assert.equal(input.limit, 250); return mandates.get(input.customerId) ?? []; },
    revoke: async (id: string, input: any) => { revocations++; mandates.set(input.customerId, (mandates.get(input.customerId) ?? []).filter(row => row.id !== id)); return true; },
  },
}) }));
const { savedCardPaymentParameters, listSavedCards, removeSavedCard } = await import("../src/lib/saved-cards.server");
const { GET, DELETE } = await import("../src/routes/api/account/payment-methods");
const { DELETE: deleteCustomer } = await import("../src/routes/api/admin/customers");
const { GET: search } = await import("../src/routes/api/catalog/search");
const { GET: products } = await import("../src/routes/api/catalog/products");
const { contentSecurityPolicy } = await import("../src/lib/content-security-policy");
let searches = 0, catalogReads = 0;
mock.module("../src/lib/catalog-search.server.ts", () => ({ searchCatalog: async () => { searches++; return []; } }));
mock.module("../src/lib/catalog-query.server.ts", () => ({ loadDatabaseCatalogRows: async () => { catalogReads++; return { products: [], hasMore: false }; } }));
const event = (path = "/api/account/payment-methods", method = "GET", body?: unknown, ip = "192.0.2.1", origin = "https://shop.test") => ({ request: new Request(`https://shop.test${path}`, {
  method, headers: { "Content-Type": "application/json", Origin: origin, "x-real-ip": ip },
  ...(body === undefined ? {} : { body: JSON.stringify(body) }),
}) }) as APIEvent;
assert.deepEqual(await savedCardPaymentParameters(undefined, { rememberCard: false }), {});
assert.equal(creations, 0);
await assert.rejects(savedCardPaymentParameters(undefined, { rememberCard: true }), /Sign in/);
await assert.rejects(savedCardPaymentParameters(unverified!.id, { rememberCard: true }), /Verify/);
assert.equal(creations, 0);
assert.deepEqual(await listSavedCards(alice!.id), []); assert.equal(creations, 0);
const first = await savedCardPaymentParameters(alice!.id, { rememberCard: true });
assert.equal(first.customerId, "cst_isolated1"); assert.equal(first.sequenceType, "oneoff");
assert.equal(first.storeCredentials, undefined); assert.equal(first.cardToken, undefined);
assert.deepEqual(await savedCardPaymentParameters(alice!.id, { rememberCard: true }), first); assert.equal(creations, 1);
const [stored] = await db.select().from(schema.paymentCustomers).where(eq(schema.paymentCustomers.userId, alice!.id));
assert.ok(stored!.consentedAt instanceof Date); assert.equal(stored!.consentVersion, "hosted-one-click-2026-11-17");
await assert.rejects(db.delete(schema.user).where(eq(schema.user.id, alice!.id)), undefined, "Provider mappings must not be lost on account deletion");
signedIn = { ...bob!, role: "admin" };
assert.equal((await deleteCustomer(event("/api/admin/customers", "DELETE", { id: alice!.id, confirmation: "REMOVE" }))).status, 409);
assert.equal((await db.select().from(schema.paymentCustomers).where(eq(schema.paymentCustomers.userId, alice!.id))).length, 1);
signedIn = alice!;
const valid = { id: "mdt_alice", status: "valid", method: "creditcard", mode: "test", scopes: ["customer-present"], details: { cardNumberLast4: "1234", cardNumber: "private-card-number-must-never-leak", cardHolder: "Private Name", cardLabel: "Visa", cardExpiryDate: "2030-04-30", cardFingerprint: "private-fingerprint" } };
mandates.set(first.customerId!, [valid,
  { ...valid, id: "mdt_pending", status: "pending" }, { ...valid, id: "mdt_bank", method: "directdebit" },
  { ...valid, id: "mdt_recurring", scopes: ["customer-not-present"] }, { ...valid, id: "mdt_legacy", scopes: undefined },
  { ...valid, id: "mdt_wrongmode", mode: "live" }, { ...valid, id: "mdt_badnumber", details: { cardNumberLast4: "4111111111111111" } },
]);
assert.deepEqual(await listSavedCards(alice!.id), [{ id: "mdt_alice", label: "Visa", last4: "1234", expires: "2030-04-30" }]);
const selected = await savedCardPaymentParameters(alice!.id, { rememberCard: false, savedCardId: "mdt_alice" });
assert.equal(selected.customerId, first.customerId); assert.equal(selected.mandateId, "mdt_alice"); assert.equal(selected.sequenceType, "oneoff"); assert.equal(selected.method, "creditcard");
await assert.rejects(savedCardPaymentParameters(bob!.id, { rememberCard: false, savedCardId: "mdt_alice" }), /no longer available/);
await assert.rejects(removeSavedCard(bob!.id, "mdt_alice"), /no longer available/); assert.equal(revocations, 0);
const listing = await GET(event()); assert.equal(listing.status, 200); assert.equal(listing.headers.get("Cache-Control"), "private, no-store");
const serialized = await listing.text(); for (const secret of ["private-card", "Private Name", "private-fingerprint", "cst_isolated", "userId"]) assert.ok(!serialized.includes(secret));
assert.equal((await DELETE(event(undefined, "DELETE", { id: "mdt_alice" }, undefined, "https://evil.test"))).status, 403);
assert.equal((await DELETE(event(undefined, "DELETE", { id: "mdt_alice", customerId: "cst_attacker" }))).status, 400);
assert.equal((await DELETE(event(undefined, "DELETE", { id: "https://evil.test/" }))).status, 400);
signedIn = bob!;
assert.equal((await DELETE(event(undefined, "DELETE", { id: "mdt_alice" }))).status, 404); assert.equal(revocations, 0);
signedIn = null;
assert.equal((await GET(event())).status, 401); assert.equal((await DELETE(event(undefined, "DELETE", { id: "mdt_alice" }))).status, 401);
signedIn = unverified!; assert.equal((await GET(event())).status, 403);
signedIn = alice!;
process.env.MOLLIE_API_KEY = "live_isolated_key_not_a_real_credential";
assert.deepEqual(await listSavedCards(alice!.id), []);
await assert.rejects(savedCardPaymentParameters(alice!.id, { rememberCard: false, savedCardId: "mdt_alice" }), /no longer available/);
const live = await savedCardPaymentParameters(alice!.id, { rememberCard: true }); assert.notEqual(live.customerId, first.customerId);
process.env.MOLLIE_API_KEY = "test_rotated_key_same_profile_not_real";
assert.equal((await savedCardPaymentParameters(alice!.id, { rememberCard: true })).customerId, first.customerId, "key rotation on the same profile preserves ownership");
assert.equal((await DELETE(event(undefined, "DELETE", { id: "mdt_alice" }))).status, 200); assert.equal(revocations, 1);
await assert.rejects(savedCardPaymentParameters(alice!.id, { rememberCard: false, savedCardId: "mdt_alice" }), /no longer available/);
outage = true; signedIn = bob!;
await assert.rejects(savedCardPaymentParameters(bob!.id, { rememberCard: true }), /Mock provider outage/);
const pendingProfiles = await db.select().from(schema.paymentCustomers).where(eq(schema.paymentCustomers.userId, bob!.id));
assert.equal(pendingProfiles.length, 1); assert.equal(pendingProfiles[0]!.customerId, null, "A provider failure keeps a durable setup reference for retry/cleanup");
outage = false;
await savedCardPaymentParameters(bob!.id, { rememberCard: true });
const beforePages = pages;
for (let index = 0; index < 20; index++) await GET(event(undefined, "GET", undefined, "192.0.2.99"));
const blocked = await GET(event(undefined, "GET", undefined, "192.0.2.99")); assert.equal(blocked.status, 429); assert.equal(pages - beforePages, 20);
// A global catalogue budget also applies when an attacker changes addresses/queries.
await db.delete(schema.rateLimit);
for (let index = 0; index < 60; index++) assert.equal((await search(event(`/api/catalog/search?q=card${index}`))).status, 200);
assert.equal((await search(event("/api/catalog/search?q=other"))).status, 429); assert.equal(searches, 60);
await db.insert(schema.rateLimit).values({ key: "catalog-search:global", count: 600, lastRequest: Date.now() }).onConflictDoUpdate({ target: schema.rateLimit.key, set: { count: 600, lastRequest: Date.now() } });
assert.equal((await search(event("/api/catalog/search?q=rotating", "GET", undefined, "192.0.2.200"))).status, 429); assert.equal(searches, 60);
assert.equal((await products(event("/api/catalog/products?offset=100001"))).status, 400); assert.equal(catalogReads, 0);
assert.equal((await products(event("/api/catalog/products?slug=" + "x".repeat(201)))).status, 400);
assert.equal((await products(event("/api/catalog/products?limit=500"))).status, 200); assert.equal(catalogReads, 1);
// No production script policy authorizes arbitrary inline handlers or scripts.
assert.ok(!contentSecurityPolicy(true).match(/script-src[^;]*unsafe-inline/));
const csp = contentSecurityPolicy(true, "abcdefghijklmnopqrstuvwx"); assert.ok(csp.includes("'nonce-abcdefghijklmnopqrstuvwx'")); assert.ok(csp.includes("script-src-attr 'none'"));
assert.throws(() => contentSecurityPolicy(true, "' unsafe-inline"));
const [lateOwner] = await db.insert(schema.user).values({ name: "Late fixture", email: "late@example.invalid", emailVerified: true }).returning();
lateUserId = lateOwner!.id;
assert.equal((await savedCardPaymentParameters(lateOwner!.id, { rememberCard: true })).customerId, "cst_settled");
assert.equal((await db.select().from(schema.paymentCustomers).where(eq(schema.paymentCustomers.userId, lateUserId)))[0]!.customerId, "cst_settled", "Late responses cannot replace a settled payment profile");
await pg.close();
console.log("SAVED CARDS INTEGRATION PASSED; isolated DB and mocked Mollie only");
