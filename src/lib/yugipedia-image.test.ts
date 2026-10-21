import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { it } from "node:test";

it("public image routes enforce shared budgets, coalescing, streaming limits and URL restrictions", { timeout: 30000 }, () => {
  const output = execFileSync("bun", ["--no-env-file", "scripts/yugipedia-image-integration.ts"], {
    env: { ...process.env, TCG_IMAGE_SECURITY_TEST: "1" }, encoding: "utf8", timeout: 25000,
  });
  assert.ok(output.includes("YUGIPEDIA IMAGE SECURITY PASSED"));
});
