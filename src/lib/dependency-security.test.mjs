import assert from "node:assert/strict";
import { createHash, generateKeyPairSync, privateEncrypt, constants, X509Certificate } from "node:crypto";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import { describe, it } from "node:test";
import { reviewVendorAdvisories } from "../../scripts/check-vendored-advisories.mjs";

const require = createRequire(import.meta.url);
// Transitive consumers resolve to repository-maintained security forks.
// These tests check the actual installed code, not just audit metadata.
// RSA backport: https://github.com/digitalbazaar/forge/pull/1152
// Depth guard: https://github.com/micromatch/braces/issues/70
// Resolve from the actual consumers: Bun may keep these dependencies nested.
const globRequire = createRequire(require.resolve("micromatch"));
const listenerRequire = createRequire(require.resolve("@vinxi/listhen"));
const braces = globRequire("braces");
const forge = listenerRequire("node-forge");

describe("continued upstream advisory monitoring", () => {
  const manifests = [{ upstream: { name: "braces" }, advisory: "https://github.com/advisories/known-fix" }];
  it("recognizes only advisories explicitly covered by the reviewed backport", () => {
    assert.deepEqual(reviewVendorAdvisories({ braces: [
      { url: "https://github.com/advisories/known-fix" },
      { url: "https://github.com/advisories/new-unfixed-issue" },
    ] }, manifests), { backported: 1, uncovered: [
      { name: "braces", url: "https://github.com/advisories/new-unfixed-issue" },
    ] });
  });
  it("does not mistake a malformed advisory response for a clean report", () => {
    for (const report of [null, [], { braces: null }, { braces: [{}] }, { unexpected: [] }]) {
      assert.throws(() => reviewVendorAdvisories(report, manifests));
    }
    assert.deepEqual(reviewVendorAdvisories({}, manifests), { backported: 0, uncovered: [] });
  });
});

describe("installed security forks", () => {
  for (const [consumer, dependency, expected] of [
    ["micromatch", "braces", "@tcghaven/braces"],
    ["@vinxi/listhen", "node-forge", "@tcghaven/node-forge"],
    ["listhen", "node-forge", "@tcghaven/node-forge"],
  ]) {
    it(`${consumer} uses the reviewed ${dependency} fork, with unchanged source hashes`, () => {
      const consumerRequire = createRequire(require.resolve(consumer));
      const packagePath = consumerRequire.resolve(`${dependency}/package.json`);
      const root = dirname(packagePath);
      const pkg = JSON.parse(readFileSync(packagePath, "utf8"));
      assert.equal(pkg.name, expected);
      const provenance = JSON.parse(readFileSync(join(root, "security-provenance.json"), "utf8"));
      assert.equal(provenance.upstream.name, dependency);
      for (const [file, hash] of Object.entries(provenance.files)) {
        assert.equal(createHash("sha256").update(readFileSync(join(root, file))).digest("hex"), hash, file);
      }
    });
  }
});

describe("braces CVE-2026-93687 backport", () => {
  it("preserves ordinary glob compilation, expansion and escaped literals", () => {
    assert.deepEqual(braces("src/{lib,routes}/**/*.{ts,tsx}"), ["src/(lib|routes)/**/*.(ts|tsx)"]);
    assert.deepEqual(braces.expand("{a,b}{1,2}"), ["a1", "a2", "b1", "b2"]);
    assert.deepEqual(braces.expand("{1..3}"), ["1", "2", "3"]);
    assert.deepEqual(braces.expand("\\{literal\\}"), ["{literal}"]);
  });

  it("rejects deep patterns with a controlled syntax error before recursion can overflow", () => {
    // Below the original 10,000-character input cap, but deep enough to
    // exhaust the unpatched Node.js AST walkers.
    const nested = "{".repeat(4900) + "a,b" + "}".repeat(4900);
    for (const action of [braces, braces.parse, braces.compile, braces.expand, braces.stringify]) {
      assert.throws(() => action(nested), error =>
        error instanceof SyntaxError && error.message.includes("maximum nesting depth"));
    }
    assert.throws(() => braces("(".repeat(1000) + "x" + ")".repeat(1000)), SyntaxError);
  });

  it("also bounds callers supplying an AST directly", () => {
    for (const action of [braces.compile, braces.expand, braces.stringify]) {
      let ast = { type: "text", nodes: [] };
      for (let index = 0; index < 4000; index++) ast = { type: "root", nodes: [ast] };
      assert.throws(() => action(ast), error =>
        error instanceof SyntaxError && error.message.includes("maximum nesting depth"));
    }
  });
});

describe("node-forge CVE-2026-85393 backport", () => {
  const keys = generateKeyPairSync("rsa", { modulusLength: 1024, publicExponent: 3 });
  const publicKey = forge.pki.publicKeyFromPem(keys.publicKey.export({ type: "spki", format: "pem" }));
  const asn1 = forge.asn1;
  const node = (type, constructed, value) =>
    asn1.create(asn1.Class.UNIVERSAL, type, constructed, value);

  function signature(hash, includeNull, extraChildren) {
    const md = forge.md[hash].create();
    md.update("TCGHaven security regression test", "utf8");
    const digest = md.digest().getBytes();
    const algorithm = [node(asn1.Type.OID, false, asn1.oidToDer(forge.oids[hash]).getBytes())];
    if (includeNull) algorithm.push(node(asn1.Type.NULL, false, ""));
    algorithm.push(...extraChildren);
    const info = asn1.toDer(node(asn1.Type.SEQUENCE, true, [
      node(asn1.Type.SEQUENCE, true, algorithm), node(asn1.Type.OCTETSTRING, false, digest),
    ])).getBytes();
    const data = Buffer.from(info, "latin1");
    const encoded = Buffer.concat([Buffer.from([0, 1]), Buffer.alloc(128 - data.length - 3, 255), Buffer.from([0]), data]);
    const signed = privateEncrypt({ key: keys.privateKey, padding: constants.RSA_NO_PADDING }, encoded);
    return { digest, signature: signed.toString("latin1") };
  }

  it("still verifies valid signatures with optional NULL parameters", () => {
    for (const hash of ["sha1", "sha256", "sha384", "sha512"]) {
      for (const includeNull of [true, false]) {
        const input = signature(hash, includeNull, []);
        assert.equal(publicKey.verify(input.digest, input.signature), true);
      }
    }
  });

  it("rejects signatures containing extra nested DigestAlgorithm children", () => {
    for (const extra of [node(asn1.Type.NULL, false, ""), node(asn1.Type.OCTETSTRING, false, "garbage")]) {
      const input = signature("sha256", true, [extra]);
      assert.throws(() => publicKey.verify(input.digest, input.signature), /DigestInfo/);
    }
  });

  it("preserves the certificate generation API used by the development listeners", () => {
    const cert = forge.pki.createCertificate();
    cert.publicKey = publicKey;
    cert.serialNumber = "01";
    cert.validity.notBefore = new Date("2026-01-01T00:00:00Z");
    cert.validity.notAfter = new Date("2027-01-01T00:00:00Z");
    const attrs = [{ name: "commonName", value: "localhost" }];
    cert.setSubject(attrs);
    cert.setIssuer(attrs);
    const privateKey = forge.pki.privateKeyFromPem(keys.privateKey.export({ type: "pkcs1", format: "pem" }));
    cert.sign(privateKey, forge.md.sha256.create());
    assert.equal(new X509Certificate(forge.pki.certificateToPem(cert)).verify(keys.publicKey), true);
  });
});
