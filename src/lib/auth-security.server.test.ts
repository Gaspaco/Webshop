import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { betterAuth } from "better-auth";
import { memoryAdapter, type MemoryDB } from "better-auth/adapters/memory";
import { createAuthSecurityHooks } from "./auth-security.server";

function setup() {
  const suspended = new Set<string>();
  const database: MemoryDB = { user: [], session: [], account: [], verification: [] };
  const auth = betterAuth({
    baseURL: "http://auth.test",
    secret: "test-only-secret-not-used-in-production-12345678901234567890",
    database: memoryAdapter(database),
    emailAndPassword: { enabled: true },
    databaseHooks: createAuthSecurityHooks(async id => suspended.has(id)),
    rateLimit: { enabled: false },
    logger: { disabled: true },
    advanced: { disableCSRFCheck: false, disableOriginCheck: false },
    user: { additionalFields: { role: { type: "string", defaultValue: "customer", input: false } } },
  });
  const post = (path: string, body: unknown, cookie?: string, origin = "http://auth.test") =>
    auth.handler(new Request(`http://auth.test/api/auth${path}`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Origin: origin, ...(cookie ? { Cookie: cookie } : {}) },
      body: JSON.stringify(body),
    }));
  const signup = (extra: Record<string, unknown> = {}) => post("/sign-up/email", {
    name: "  Test Customer  ", email: "customer@example.test", password: "Test-only-password!", ...extra,
  });
  return { auth, database, suspended, post, signup };
}

describe("authentication security", () => {
  it("allows valid signup, normalizes the name and ignores client-supplied admin roles", async () => {
    const { signup, database } = setup();
    assert.equal((await signup({ role: "admin" })).status, 200);
    assert.equal(database.user[0].name, "Test Customer");
    assert.equal(database.user[0].role, "customer");
    assert.equal(database.session.length, 1);
  });

  it("rejects remote and executable profile images during signup before storing the user", async () => {
    for (const image of ["https://attacker.test/tracker.png", "javascript:alert(1)", "data:image/svg+xml;base64,PHN2Zz4="]) {
      const { signup, database } = setup();
      assert.equal((await signup({ image })).status, 400);
      assert.equal(database.user.length, 0);
    }
  });

  it("applies profile validation on updates and still permits a safe uploaded image", async () => {
    const { signup, post, database } = setup();
    const response = await signup();
    const cookie = response.headers.getSetCookie().map(value => value.split(";", 1)[0]).join("; ");
    assert.equal((await post("/update-user", { image: "https://attacker.test/pixel" }, cookie)).status, 400);
    assert.equal((await post("/update-user", { image: "data:image/png;base64,aGVsbG8=" }, cookie)).status, 200);
    assert.equal(database.user[0].image, "data:image/png;base64,aGVsbG8=");
  });

  it("blocks suspended users after password validation without disclosing suspension for a wrong password", async () => {
    const { signup, post, database, suspended } = setup();
    await signup();
    suspended.add(database.user[0].id);
    database.session.length = 0;
    const wrong = await post("/sign-in/email", { email: "customer@example.test", password: "Wrong-password!" });
    assert.equal(wrong.status, 401);
    const correct = await post("/sign-in/email", { email: "customer@example.test", password: "Test-only-password!" });
    assert.equal(correct.status, 403);
    assert.equal((await correct.json()).code, "ACCOUNT_SUSPENDED");
    assert.equal(database.session.length, 0);
  });

  it("also blocks session creation outside password login, such as a pending 2FA completion", async () => {
    const { signup, database, suspended, auth } = setup();
    await signup();
    const userId = database.user[0].id;
    suspended.add(userId);
    const count = database.session.length;
    const context = await auth.$context;
    await assert.rejects(context.internalAdapter.createSession(userId), /suspended/);
    assert.equal(database.session.length, count);
  });

  it("rejects cross-site signup and external callback destinations", async () => {
    const { post, signup, database } = setup();
    assert.equal((await post("/sign-up/email", {
      name: "Attacker", email: "attacker@example.test", password: "Test-only-password!",
    }, undefined, "https://attacker.test")).status, 403);
    assert.equal((await signup({ callbackURL: "https://attacker.test/steal" })).status, 403);
    assert.equal(database.user.length, 0);
  });
});
