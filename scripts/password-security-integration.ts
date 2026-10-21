// Real auth hooks, an isolated PostgreSQL instance, and mock email only.
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync, readdirSync } from "node:fs";
import { mock } from "bun:test";
import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { and, eq, like } from "drizzle-orm";
import { hashPassword } from "better-auth/crypto";
import * as schema from "../src/db/schema";

if (process.env.TCG_PASSWORD_SECURITY_TEST !== "1") throw new Error("Run through the isolated test wrapper.");
process.env.NODE_ENV = "production";
process.env.DATABASE_URL = "postgresql://isolated:isolated@127.0.0.1:1/no_real_database";
delete process.env.DATABASE_PUBLIC_URL;
process.env.BETTER_AUTH_URL = "https://shop.test";
process.env.BETTER_AUTH_SECRET = "isolated-security-test-secret-not-used-by-any-real-account-123456789";
process.env.SMTP_HOST = "smtp.example.invalid";
process.env.SMTP_PORT = "465";
process.env.SMTP_USER = "fake@example.invalid";
process.env.SMTP_PASS = "isolated-test-password";
process.env.AUTH_EMAIL_FROM = "Shop <no-reply@example.invalid>";
delete process.env.ORDER_NOTIFICATION_EMAIL;
const pg = new PGlite();
const db = drizzle(pg, { schema });
for (const file of readdirSync("drizzle").filter(file => /^\d+.*\.sql$/.test(file)).sort()) {
  for (const statement of readFileSync(`drizzle/${file}`, "utf8").split("--> statement-breakpoint")) if (statement.trim()) await pg.exec(statement);
}
mock.module("../src/db/index.ts", () => ({ db }));
const emails: Array<{ email: string; token: string }> = [];
let emailFailure = false;
mock.module("../src/lib/email.server.ts", () => ({
  sendNewSignInEmail: async () => {}, sendVerificationEmail: async () => {}, sendTwoFactorCodeEmail: async () => {},
  sendPasswordResetEmail: async (value: { email: string; token: string }) => {
    if (emailFailure) throw new Error("Mock SMTP outage"); emails.push(value);
  },
}));
globalThis.fetch = (async () => { throw new Error("External network is forbidden in password tests."); }) as unknown as typeof fetch;
const { auth } = await import("../src/lib/auth");
const { POST: publicAuth } = await import("../src/routes/api/auth/[...auth]");
const { claimPasswordOperation, finishPasswordOperation } = await import("../src/lib/password-security.server");
async function makeUser(email: string, role: "customer" | "admin" = "customer") {
  const [person] = await db.insert(schema.user).values({ email, name: "Isolated user", emailVerified: true, role, twoFactorEnabled: false }).returning();
  await db.insert(schema.account).values({ userId: person!.id, accountId: person!.id, providerId: "credential", password: await hashPassword("Initial-test-password!") });
  return person!;
}
const person = await makeUser("customer@example.invalid");
const other = await makeUser("other@example.invalid");
let client = 1;
const request = (path: string, body: unknown, cookie = "", ip = `192.0.2.${client++}`) => new Request(`https://shop.test/api/auth${path}`, {
  method: "POST", headers: { Origin: "https://shop.test", "Content-Type": "application/json", "x-real-ip": ip, Cookie: cookie }, body: JSON.stringify(body),
});
const post = (path: string, body: unknown, cookie = "", ip?: string) => auth.handler(request(path, body, cookie, ip));
const cookie = (response: Response) => response.headers.getSetCookie().map(value => value.split(";", 1)[0]).join("; ");
const login = (email: string, password: string) => post("/sign-in/email", { email, password });
const reset = (token: string, password = "Newer-test-password!") => post("/reset-password", { token, newPassword: password });
async function seedToken(owner = person.id, expiresAt = new Date(Date.now() + 3600_000)) {
  const token = crypto.randomUUID();
  await db.insert(schema.verification).values({ identifier: `reset-password:${token}`, value: owner, expiresAt });
  return token;
}
const resetRows = () => db.select().from(schema.verification).where(and(eq(schema.verification.value, person.id), like(schema.verification.identifier, "reset-password:%")));
const originalLogin = await login(person.email, "Initial-test-password!");
assert.equal(originalLogin.status, 200);
const oldCookie = cookie(originalLogin);
const old = await seedToken(); const newer = await seedToken(); const otherToken = await seedToken(other.id);
await db.insert(schema.verification).values({ identifier: "return-confirm:unrelated", value: person.id, expiresAt: new Date(Date.now() + 3600_000) });
assert.equal((await reset(newer)).status, 200);
assert.equal((await reset(old, "Stolen-link-password!")).status, 400);
assert.equal((await reset(newer)).status, 400);
assert.equal((await resetRows()).length, 0);
assert.equal((await db.select().from(schema.verification).where(eq(schema.verification.identifier, `reset-password:${otherToken}`))).length, 1);
assert.equal((await db.select().from(schema.verification).where(eq(schema.verification.identifier, "return-confirm:unrelated"))).length, 1);
assert.equal(await (await auth.handler(new Request("https://shop.test/api/auth/get-session", { headers: { Cookie: oldCookie } }))).json(), null);
assert.equal((await login(person.email, "Newer-test-password!")).status, 200);

// Weak/invalid requests and wrong current passwords cannot destroy valid links.
const valid = await seedToken(); const expired = await seedToken(person.id, new Date(Date.now() - 1000));
assert.equal((await reset(expired)).status, 400);
assert.equal((await reset(valid, "weak")).status, 400);
assert.equal((await post("/reset-password", { token: valid, newPassword: 12345 })).status, 400);
assert.equal((await db.select().from(schema.verification).where(eq(schema.verification.identifier, `reset-password:${valid}`))).length, 1);
const currentLogin = await login(person.email, "Newer-test-password!");
const currentCookie = cookie(currentLogin);
assert.equal((await post("/change-password", { currentPassword: "Incorrect!", newPassword: "Changed-test-password!", revokeOtherSessions: true }, currentCookie)).status, 400);
assert.equal((await db.select().from(schema.verification).where(eq(schema.verification.identifier, `reset-password:${valid}`))).length, 1);
assert.equal((await post("/change-password", { currentPassword: "Newer-test-password!", newPassword: "Changed-test-password!", revokeOtherSessions: true }, currentCookie)).status, 200);
assert.equal((await reset(valid)).status, 400);
assert.equal((await login(person.email, "Changed-test-password!")).status, 200);

// Different outstanding links cannot both reset the same account concurrently.
const firstConcurrent = await seedToken(); const secondConcurrent = await seedToken();
const competing = await Promise.all([reset(firstConcurrent, "Concurrent-first!"), reset(secondConcurrent, "Concurrent-second!")]);
assert.equal(competing.filter(response => response.status === 200).length, 1);
assert.ok(competing.every(response => [200, 400, 409].includes(response.status)));
assert.equal((await resetRows()).length, 0);
// The query-token and direct server API forms use the same hooks, not just the
// frontend's usual body-token request shape.
const queryOld = await seedToken(); const queryCurrent = await seedToken();
assert.equal((await post(`/reset-password?token=${encodeURIComponent(queryCurrent)}`, { newPassword: "Query-token-password!" })).status, 200);
assert.equal((await reset(queryOld)).status, 400);
const directOld = await seedToken(); const directCurrent = await seedToken();
assert.equal((await auth.api.resetPassword({ body: { token: directCurrent, newPassword: "Direct-api-password!" } })).status, true);
await assert.rejects(auth.api.resetPassword({ body: { token: directOld, newPassword: "Must-not-work-password!" } }));
// A separate instance/admin setup operation shares this same lock.
const held = await claimPasswordOperation(person.id);
const busyRequest = await post("/request-password-reset", { email: person.email });
assert.equal(busyRequest.status, 200);
assert.ok((await busyRequest.json()).message.includes("If this email exists"));
await finishPasswordOperation(held);

// Requests from many IPs receive generic success, but only one recipient email
// is sent during the cooldown. Suppressed tokens are not left active in storage.
await db.delete(schema.rateLimit).where(like(schema.rateLimit.key, "reset-email:%"));
const before = emails.length;
for (let index = 0; index < 9; index++) {
  const result = await post("/request-password-reset", { email: index % 2 ? person.email.toUpperCase() : person.email, redirectTo: "https://shop.test/reset-password" });
  assert.equal(result.status, 200);
  assert.ok((await result.json()).message.includes("If this email exists"));
}
assert.equal(emails.length - before, 1); assert.equal((await resetRows()).length, 1);
const recipient = createHash("sha256").update(person.email).digest("hex");
const cooldownKey = `reset-email:cooldown:${recipient}`;
for (let index = 0; index < 3; index++) {
  await db.update(schema.rateLimit).set({ lastRequest: Date.now() - 61_000 }).where(eq(schema.rateLimit.key, cooldownKey));
  assert.equal((await post("/request-password-reset", { email: person.email })).status, 200);
}
assert.equal(emails.length - before, 3, "Recipient hourly limit applies even after cooldown expires");
assert.equal((await resetRows()).length, 3);
// Normal sending resumes when the recipient window expires.
await db.update(schema.rateLimit).set({ lastRequest: Date.now() - 3601_000 }).where(like(schema.rateLimit.key, `reset-email:%:${recipient}`));
assert.equal((await post("/request-password-reset", { email: person.email })).status, 200);
assert.equal(emails.length - before, 4);
// Global limits apply across distinct recipients, not just changing IPs.
await db.insert(schema.rateLimit).values({ key: "reset-email:global", count: 30, lastRequest: Date.now() }).onConflictDoUpdate({ target: schema.rateLimit.key, set: { count: 30, lastRequest: Date.now() } });
const globalBefore = emails.length;
assert.equal((await post("/request-password-reset", { email: other.email })).status, 200);
assert.equal(emails.length, globalBefore);
assert.equal((await post("/request-password-reset", { email: "unknown@example.invalid" })).status, 200);
await db.delete(schema.rateLimit).where(like(schema.rateLimit.key, "reset-email:%"));
const day = new Date().toISOString().slice(0, 10);
await db.insert(schema.rateLimit).values({ key: `reset-email:day:${day}`, count: 200, lastRequest: Date.now() });
assert.equal((await post("/request-password-reset", { email: other.email })).status, 200);
assert.equal(emails.length, globalBefore);

// SMTP failures leave no unsent live token and release the password lease.
await db.delete(schema.rateLimit).where(like(schema.rateLimit.key, "reset-email:%"));
await db.delete(schema.verification).where(and(eq(schema.verification.value, other.id), like(schema.verification.identifier, "reset-password:%")));
emailFailure = true;
assert.equal((await post("/request-password-reset", { email: other.email })).status, 200);
assert.equal((await db.select().from(schema.verification).where(and(eq(schema.verification.value, other.id), like(schema.verification.identifier, "reset-password:%")))).length, 0);
assert.ok((await db.select().from(schema.providerOperationLeases).where(eq(schema.providerOperationLeases.key, `password-operation:${other.id}`)))[0]!.leaseUntil <= new Date());
emailFailure = false;

// Ten attempts total, not ten per IP. Owners stay password-only, and a normal
// successful sign-in clears the account budget instead of penalizing daily use.
const owner = await makeUser("owner@example.invalid", "admin");
for (let index = 0; index < 10; index++) assert.equal((await login(owner.email, "Incorrect-test-password!")).status, 401);
const blocked = await login(owner.email.toUpperCase(), "Initial-test-password!");
assert.equal(blocked.status, 429); assert.equal(blocked.headers.get("Retry-After"), "900");
const loginKey = `password-login:${createHash("sha256").update(owner.email).digest("hex")}`;
await db.update(schema.rateLimit).set({ lastRequest: Date.now() - 16 * 60_000 }).where(eq(schema.rateLimit.key, loginKey));
const allowedOwner = await login(owner.email, "Initial-test-password!");
assert.equal(allowedOwner.status, 200); assert.equal((await allowedOwner.json()).user.role, "admin");
assert.equal((await db.select().from(schema.rateLimit).where(eq(schema.rateLimit.key, loginKey))).length, 0);
assert.equal((await db.select().from(schema.user).where(eq(schema.user.id, owner.id)))[0]!.twoFactorEnabled, false);
const mfaCustomer = await makeUser("mfa-customer@example.invalid");
await db.update(schema.user).set({ twoFactorEnabled: true }).where(eq(schema.user.id, mfaCustomer.id));
const mfaReset = await seedToken(mfaCustomer.id);
assert.equal((await reset(mfaReset)).status, 200);
assert.equal((await db.select().from(schema.user).where(eq(schema.user.id, mfaCustomer.id)))[0]!.twoFactorEnabled, true);
// Storage failures fail closed at the HTTP boundary without raw SQL or tokens.
const delivered = emails.length;
await pg.close();
await finishPasswordOperation({ key: `password-operation:${owner.id}`, token: crypto.randomUUID() });
const unavailable = await publicAuth({ request: request("/request-password-reset", { email: person.email }) } as any);
assert.equal(unavailable.status, 503); assert.ok(!(await unavailable.text()).includes("select"));
assert.equal(emails.length, delivered);
console.log("PASSWORD SECURITY INTEGRATION PASSED");
