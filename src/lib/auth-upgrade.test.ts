import assert from "node:assert/strict";
import { it } from "node:test";
import { betterAuth } from "better-auth";
import { memoryAdapter, type MemoryDB } from "better-auth/adapters/memory";
import { twoFactor } from "better-auth/plugins";

it("patched auth preserves sign-out, authenticator enrollment, email challenges and single-use recovery codes", async () => {
  const database: MemoryDB = { user: [], session: [], account: [], verification: [], twoFactor: [] };
  let emailedCode = "";
  const auth = betterAuth({
    baseURL: "https://auth.test",
    secret: "isolated-auth-upgrade-test-secret-not-used-for-any-real-account-123456789",
    database: memoryAdapter(database),
    emailAndPassword: { enabled: true },
    rateLimit: { enabled: false },
    logger: { disabled: true },
    plugins: [twoFactor({
      otpOptions: { digits: 6, period: 5, storeOTP: "hashed", sendOTP: async ({ otp }) => { emailedCode = otp; } },
      backupCodeOptions: { storeBackupCodes: "encrypted" },
    })],
  });
  const jar = new Map<string, string>();
  const cookie = () => [...jar].map(([name, value]) => `${name}=${value}`).join("; ");
  const remember = (response: Response) => {
    for (const header of response.headers.getSetCookie()) {
      const pair = header.split(";", 1)[0]!;
      const index = pair.indexOf("=");
      jar.set(pair.slice(0, index), pair.slice(index + 1));
    }
  };
  const post = async (path: string, body: unknown) => {
    const response = await auth.handler(new Request(`https://auth.test/api/auth${path}`, {
      method: "POST", headers: { "Content-Type": "application/json", Origin: "https://auth.test", Cookie: cookie() },
      body: JSON.stringify(body),
    }));
    remember(response);
    return response;
  };
  const session = async () => (await auth.handler(new Request("https://auth.test/api/auth/get-session", {
    headers: { Cookie: cookie() },
  }))).json();
  const credentials = { email: "upgrade@example.test", password: "Isolated-test-password!" };
  assert.equal((await post("/sign-up/email", { ...credentials, name: "Test Customer" })).status, 200);
  database.user[0]!.emailVerified = true;
  assert.ok((await session())?.user);

  const enrollment = await post("/two-factor/enable", { password: credentials.password, method: "totp" });
  assert.equal(enrollment.status, 200);
  const data = await enrollment.json();
  assert.equal(data.method, "totp");
  assert.ok(data.backupCodes.length > 0);
  const secret = new URL(data.totpURI).searchParams.get("secret")!;
  const bits = [...secret].map(char => "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567".indexOf(char).toString(2).padStart(5, "0")).join("");
  const rawSecret = new TextDecoder().decode(Uint8Array.from(bits.match(/.{8}/g)!, byte => Number.parseInt(byte, 2)));
  const { code } = await auth.api.generateTOTP({ body: { secret: rawSecret } });
  assert.equal((await post("/two-factor/verify-totp", { code })).status, 200);
  const activeCookie = cookie();
  assert.equal((await post("/sign-out", {})).status, 200);
  assert.equal(await session(), null);
  assert.equal(await (await auth.handler(new Request("https://auth.test/api/auth/get-session", { headers: { Cookie: activeCookie } }))).json(), null);

  const challenge = await post("/sign-in/email", credentials);
  assert.equal(challenge.status, 200);
  assert.equal((await challenge.json()).twoFactorRedirect, true);
  assert.equal(await session(), null, "Password alone must not authenticate an enrolled customer");
  assert.equal((await post("/two-factor/send-otp", {})).status, 200);
  assert.match(emailedCode, /^\d{6}$/);
  assert.equal((await post("/two-factor/verify-otp", { code: "invalid" })).status, 401);
  assert.equal(await session(), null);
  assert.equal((await post("/two-factor/verify-otp", { code: emailedCode })).status, 200);
  assert.equal((await session())?.user.email, credentials.email);

  assert.equal((await post("/sign-out", {})).status, 200);
  await post("/sign-in/email", credentials);
  const backup = data.backupCodes[0];
  assert.equal((await post("/two-factor/verify-backup-code", { code: backup })).status, 200);
  assert.equal((await session())?.user.email, credentials.email);
  await post("/sign-out", {});
  await post("/sign-in/email", credentials);
  assert.equal((await post("/two-factor/verify-backup-code", { code: backup })).status, 401);
  assert.equal(await session(), null, "A used recovery code must never create another session");
});
