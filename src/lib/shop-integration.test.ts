import { execFileSync } from "node:child_process";
import assert from "node:assert/strict";
import { it } from "node:test";

it("security migrations and business flows pass in isolated PostgreSQL with mocked providers", { timeout: 60_000 }, () => {
  const output = execFileSync("bun", ["run", "scripts/security-integration.ts"], {
    env: { ...process.env, TCG_SECURITY_INTEGRATION: "1" }, encoding: "utf8", timeout: 55_000,
  });
  assert.ok(output.includes("SECURITY INTEGRATION PASSED"), output);
});
