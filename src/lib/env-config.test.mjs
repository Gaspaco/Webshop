import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";

// Repository policy checks run in the test suite, not the production build.
// Vercel's CLI intentionally omits Git-only metadata such as .gitignore.
describe("private environment configuration", () => {
  for (const file of [".gitignore", ".vercelignore"]) {
    it(`excludes environment files in ${file}`, () => {
      const rules = readFileSync(new URL(`../../${file}`, import.meta.url), "utf8")
        .split(/\r?\n/).map(line => line.trim());
      assert.ok(rules.includes(".env*"), "Keep environment files excluded.");
      assert.ok(!rules.some(line => line.startsWith("!") && line.includes(".env")), "Do not re-include private environment files.");
    });
  }
});
