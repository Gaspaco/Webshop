import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { it } from "node:test";

it("saved-card ownership, consent, mode isolation, and catalogue budgets are enforced", { timeout: 40000 }, () => {
  const output = execFileSync("bun", ["--no-env-file", "scripts/saved-cards-integration.ts"], {
    env: { ...process.env, TCG_SAVED_CARDS_TEST: "1" }, encoding: "utf8", timeout: 35000,
  });
  assert.ok(output.includes("SAVED CARDS INTEGRATION PASSED"));
});
