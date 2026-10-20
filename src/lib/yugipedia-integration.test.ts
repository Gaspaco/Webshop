import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { it } from "node:test";

it("Yugipedia imports, caching, throttling and stock preservation pass in isolated PostgreSQL", { timeout: 60000 }, () => {
  const output = execFileSync("bun", ["--no-env-file", "run", "scripts/yugipedia-integration.ts"], {
    env: { ...process.env, TCG_YUGIPEDIA_INTEGRATION: "1", TCG_YUGIPEDIA_LIVE_CHECK: "0" }, encoding: "utf8", timeout: 55000,
  });
  assert.ok(output.includes("YUGIPEDIA INTEGRATION PASSED"));
});
