import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { it } from "node:test";

it("guest returns, private photos and shared scan budgets enforce their security boundaries", { timeout: 30000 }, () => {
  const output = execFileSync("bun", ["--no-env-file", "scripts/public-security-integration.ts"], {
    env: { ...process.env, TCG_PUBLIC_SECURITY_TEST: "1" }, encoding: "utf8", timeout: 25000,
  });
  assert.ok(output.includes("PUBLIC SECURITY INTEGRATION PASSED"));
});
