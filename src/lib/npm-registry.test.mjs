import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";
import { readFileSync } from "node:fs";
import { isAllowedNpmRegistry, verifyNpmRegistry } from "../../scripts/verify-npm-registry.mjs";

describe("npm registry install guard", () => {
  it("accepts only the official HTTPS registry, including canonical URL spellings", () => {
    for (const value of ["https://registry.npmjs.org/", "https://registry.npmjs.org", "HTTPS://REGISTRY.NPMJS.ORG/", "https://registry.npmjs.org:443/"]) assert.equal(isAllowedNpmRegistry(value), true, value);
    for (const value of [undefined, "", "not a URL", "http://registry.npmjs.org/", "https://registry.npmjs.org.attacker.invalid/", "https://registry.npmjs.org@attacker.invalid/", "https://token@registry.npmjs.org/", "https://registry.npmjs.org:444/", "https://registry.npmjs.org/private", "https://registry.npmjs.org/?mirror=other", "https://registry.npmjs.org/#other", "https://registry.npmjs.org./", "file:///tmp/registry"]) assert.equal(isAllowedNpmRegistry(value), false, String(value));
  });

  it("handles npm's lowercase/uppercase environment variables without ignoring conflicts", () => {
    assert.equal(verifyNpmRegistry({}), true);
    for (const key of ["npm_config_registry", "NPM_CONFIG_REGISTRY"]) {
      assert.equal(verifyNpmRegistry({ [key]: "https://registry.npmjs.org/" }), true);
      assert.equal(verifyNpmRegistry({ [key]: "https://mirror.example.invalid/" }), false);
    }
    assert.equal(verifyNpmRegistry({ npm_config_registry: "https://registry.npmjs.org/", NPM_CONFIG_REGISTRY: "https://mirror.example.invalid/" }), false);
  });

  it("runs as a Node preinstall command and does not print registry credentials on rejection", () => {
    const environment = { ...process.env };
    delete environment.npm_config_registry; delete environment.NPM_CONFIG_REGISTRY;
    const script = fileURLToPath(new URL("../../scripts/verify-npm-registry.mjs", import.meta.url));
    for (const value of [undefined, "https://registry.npmjs.org/"]) {
      const result = spawnSync("node", [script], { env: { ...environment, ...(value ? { npm_config_registry: value } : {}) }, encoding: "utf8" });
      assert.equal(result.status, 0, result.stderr);
    }
    const result = spawnSync("node", [script], { env: { ...environment, npm_config_registry: "https://fixture-user:fixture-password@mirror.example.invalid/" }, encoding: "utf8" });
    assert.equal(result.status, 1);
    assert.match(result.stderr, /Blocked npm install/);
    assert.equal(result.stderr.includes("fixture-password"), false);
  });

  it("pins Vercel installs to the lockfile and official registry without skipping scripts or TLS checks", () => {
    const config = JSON.parse(readFileSync(new URL("../../vercel.json", import.meta.url), "utf8"));
    assert.equal(config.installCommand, undefined, "Services require the install command on the owning web service.");
    assert.equal(config.services.web.installCommand, "env -u NPM_CONFIG_REGISTRY -u npm_config_registry npm ci --registry=https://registry.npmjs.org/");
    assert.equal(/ignore-scripts|strict-ssl=false/.test(config.services.web.installCommand), false);
  });
});
