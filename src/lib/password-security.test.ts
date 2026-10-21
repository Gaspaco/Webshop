import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { it } from "node:test";

it("password reset invalidation and account/email abuse limits pass against isolated PostgreSQL", { timeout: 30000 }, () => {
  const output = execFileSync("bun", ["--no-env-file", "scripts/password-security-integration.ts"], {
    env: { ...process.env, TCG_PASSWORD_SECURITY_TEST: "1" }, encoding: "utf8", timeout: 25000,
  });
  assert.ok(output.includes("PASSWORD SECURITY INTEGRATION PASSED"));
});
