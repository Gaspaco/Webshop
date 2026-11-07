import assert from "node:assert/strict";
import { createHash, generateKeyPairSync, privateEncrypt, constants, X509Certificate } from "node:crypto";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import { describe, it } from "node:test";
import { runInNewContext } from "node:vm";
import * as fs from "node:fs";
import { fileURLToPath } from "node:url";
import { reviewVendorAdvisories } from "../../scripts/check-vendored-advisories.mjs";
import { z } from "zod";

const require = createRequire(import.meta.url);
// Transitive consumers resolve to repository-maintained security forks.
// These tests check the actual installed code, not just audit metadata.
// RSA regressions are retained after retiring the fork for official forge 1.4.3.
// Depth guard: https://github.com/micromatch/braces/issues/70
// Resolve from the actual consumers: Bun may keep these dependencies nested.
const globRequire = createRequire(require.resolve("micromatch"));
const listenerRequire = createRequire(require.resolve("@vinxi/listhen"));
const braces = globRequire("braces");
const forge = listenerRequire("node-forge");
const resolverRequire = createRequire(import.meta.resolve("@rollup/plugin-node-resolve"));
const terserRequire = createRequire(import.meta.resolve("@rollup/plugin-terser"));
const deepmerge = resolverRequire("deepmerge");
const serialize = terserRequire("serialize-javascript");

// Keep every installed copy and the production lockfile above the reviewed
// security fixes, including dependencies resolved from nested consumers.
const minimumVersions = {
  "better-auth": "1.7.7",
  "@better-auth/core": "1.7.7",
  "@better-auth/drizzle-adapter": "1.7.7",
  "@better-auth/kysely-adapter": "1.7.7",
  zod: "4.6.6",
  "follow-redirects": "1.16.2",
  vite: "6.4.5",
  "serialize-javascript": "7.1.3",
  "node-forge": "1.4.3",
  glob: "14.0.2",
  minimatch: "11.0.1",
};

function assertPatchedVersion(name, version) {
  assert.match(version, /^\d+\.\d+\.\d+$/, `${name} must use a stable release`);
  const actual = version.split(".").map(Number);
  const minimum = minimumVersions[name].split(".").map(Number);
  const difference = actual.map((part, index) => part - minimum[index]).find(part => part !== 0) ?? 0;
  assert.ok(difference >= 0, `${name}@${version} is below patched ${minimumVersions[name]}`);
}

function resolvedPackage(consumerRequire, name) {
  let root = dirname(consumerRequire.resolve(name));
  while (dirname(root) !== root) {
    try {
      const pkg = JSON.parse(readFileSync(join(root, "package.json"), "utf8"));
      if (pkg.name === name) return pkg;
    } catch (error) {
      if (error.code !== "ENOENT") throw error;
    }
    root = dirname(root);
  }
  throw new Error(`Could not find resolved package metadata for ${name}`);
}

describe("patched authentication, validation and development dependencies", () => {
  it("locks every production dependency copy to a patched stable release", () => {
    const lock = JSON.parse(readFileSync(new URL("../../package-lock.json", import.meta.url), "utf8"));
    for (const name of Object.keys(minimumVersions)) {
      const copies = Object.entries(lock.packages).filter(([path]) =>
        path === `node_modules/${name}` || path.endsWith(`/node_modules/${name}`));
      assert.ok(copies.length > 0, `${name} is missing from the production lockfile`);
      for (const [, pkg] of copies) {
        // readdir-glob requires minimatch's legacy function API. Versions <7
        // are outside GHSA-g3hv-75wg-m249; preserve that compatible dependency.
        if (name === "minimatch" && Number(pkg.version.split(".")[0]) < 7) continue;
        assertPatchedVersion(name, pkg.version);
      }
    }
  });

  it("loads patched packages from the real authentication and build consumers", () => {
    for (const [consumer, names] of [
      ["better-auth", ["@better-auth/core", "@better-auth/drizzle-adapter", "@better-auth/kysely-adapter", "zod"]],
      ["vinxi", ["vite", "zod"]],
      ["vite-plugin-solid", ["vite"]],
      ["http-proxy", ["follow-redirects"]],
      ["@rollup/plugin-terser", ["serialize-javascript"]],
      ["@vinxi/listhen", ["node-forge"]],
      ["listhen", ["node-forge"]],
      ["@vercel/nft", ["glob"]],
      ["archiver-utils", ["glob"]],
      ["glob", ["minimatch"]],
    ]) {
      const consumerRequire = createRequire(import.meta.resolve(consumer));
      for (const name of names) assertPatchedVersion(name, resolvedPackage(consumerRequire, name).version);
    }
    for (const name of ["better-auth", "zod"]) assertPatchedVersion(name, resolvedPackage(require, name).version);
  });

  it("rejects oversized constrained collections without validating every element", () => {
    let visited = 0;
    const element = z.preprocess(value => { visited++; return value; }, z.string());
    const result = z.array(element).max(10).safeParse(Array(10_000).fill(null));
    assert.equal(result.success, false);
    assert.equal(visited, 0, "Oversized collections must fail before allocating an issue for each element");
    assert.equal(result.error.issues.length, 1);
    assert.equal(result.error.issues[0].code, "too_big");
    assert.equal(z.array(z.string()).max(10).safeParse(["valid"]).success, true);
  });
});

describe("patched filesystem-pattern consumers", () => {
  const traceRequire = createRequire(import.meta.resolve("@vercel/nft"));
  const archiveRequire = createRequire(import.meta.resolve("archiver-utils"));
  const glob = traceRequire("glob");
  const minimatch = createRequire(traceRequire.resolve("glob"))("minimatch");
  const cwd = fileURLToPath(new URL("../../public", import.meta.url));

  it("preserves CommonJS glob.sync behavior for the archive builder", () => {
    const direct = glob.sync("**/*", { cwd, nodir: true }).sort();
    const archived = archiveRequire("archiver-utils").file.expand({ cwd, nodir: true }, "**/*").sort();
    assert.ok(direct.length > 0);
    assert.deepEqual(archived, direct);
  });

  it("cancels an asynchronous filesystem walk without continuing directory traversal", async () => {
    const controller = new AbortController();
    let reads = 0;
    const track = () => { reads++; controller.abort(new Error("test traversal cancelled")); };
    const trackedFs = { ...fs,
      readdir(...args) { track(); return fs.readdir(...args); },
      promises: { ...fs.promises, readdir(...args) { track(); return fs.promises.readdir(...args); } },
    };
    await assert.rejects(glob.glob("**/*", { cwd, signal: controller.signal, fs: trackedFs }));
    await new Promise(resolve => setTimeout(resolve, 20));
    assert.equal(reads, 1, "No child directory reads may start after cancellation");
  });

  it("bounds aggressive minimatch preprocessing instead of amplifying pattern parts", () => {
    assertPatchedVersion("minimatch", resolvedPackage(createRequire(traceRequire.resolve("glob")), "minimatch").version);
    for (const pattern of ["**/../".repeat(25) + "card", "a/**/../".repeat(25) + "card"]) {
      const matcher = new minimatch.Minimatch(pattern, { optimizationLevel: 2, braceExpandMax: 64 });
      assert.ok(matcher.globParts.length <= 64);
    }
    assert.equal(minimatch.minimatch("cards/set/card.webp", "cards/**/*.webp"), true);
  });
});

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
    ["@rollup/plugin-node-resolve", "deepmerge", "@tcghaven/deepmerge"],
  ]) {
    it(`${consumer} uses the reviewed ${dependency} fork, with unchanged source hashes`, () => {
      const consumerRequire = createRequire(import.meta.resolve(consumer));
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

  it("does not leave an unpatched deepmerge copy in the deployment lockfile", () => {
    const lock = JSON.parse(readFileSync(new URL("../../package-lock.json", import.meta.url), "utf8"));
    const copies = Object.entries(lock.packages).filter(([path]) =>
      path === "node_modules/deepmerge" || path.endsWith("/node_modules/deepmerge"));
    assert.ok(copies.length > 0);
    for (const [, pkg] of copies) {
      assert.equal(pkg.link, true);
      assert.equal(pkg.resolved, "vendor/deepmerge");
    }
    assert.equal(lock.packages["vendor/deepmerge"].name, "@tcghaven/deepmerge");
  });
});

describe("deepmerge CVE-2026-93753 local fix", () => {
  it("preserves deep cloning, arrays, symbols, dates, regexes and the all helper", () => {
    const symbol = Symbol("option");
    const date = new Date("2026-01-01T00:00:00Z");
    const regex = /card/gi;
    const target = { nested: { a: 1 }, items: [{ id: 1 }], date, regex, [symbol]: { a: 1 } };
    const source = { nested: { b: 2 }, items: [{ id: 2 }], [symbol]: { b: 2 } };
    const merged = deepmerge(target, source);
    assert.deepEqual(merged.nested, { a: 1, b: 2 });
    assert.deepEqual(merged.items, [{ id: 1 }, { id: 2 }]);
    assert.notEqual(merged.items[0], target.items[0]);
    assert.notEqual(merged.nested, target.nested);
    assert.deepEqual(merged[symbol], { a: 1, b: 2 });
    assert.equal(merged.date, date);
    assert.equal(merged.regex, regex);
    assert.deepEqual(deepmerge.all([{ a: 1 }, { b: 2 }, { a: 3 }]), { a: 3, b: 2 });
    assert.throws(() => deepmerge.all({}), /first argument/);
    assert.deepEqual(target.nested, { a: 1 });
    assert.deepEqual(source.nested, { b: 2 });
  });

  it("retains custom merge hooks, replacement arrays, clone:false and placeholder behavior", () => {
    const object = { retained: true };
    assert.equal(deepmerge({}, { nested: object }, { clone: false }).nested, object);
    assert.deepEqual(deepmerge({ list: [1] }, { list: [2] }, { arrayMerge: (_target, source) => source }), { list: [2] });
    assert.deepEqual(deepmerge({ option: { a: 1 } }, { option: { b: 2 } }, {
      customMerge: key => key === "option" ? () => ({ custom: true }) : undefined,
    }), { option: { custom: true } });
    for (const placeholder of [null, undefined, false, 0, ""]) {
      assert.deepEqual(deepmerge({ nested: placeholder }, { nested: { safe: true } }), { nested: { safe: true } });
    }
  });

  it("blocks poisoning through null-prototype targets, target-owned keys and nested placeholders", () => {
    const attack = () => JSON.parse('{"__proto__":{"tcghavenAdmin":true},"constructor":{"prototype":{"tcghavenAdmin":true}},"prototype":{"tcghavenAdmin":true},"safe":1}');
    for (const target of [{}, Object.create(null), attack()]) {
      for (const merged of [deepmerge(target, attack()), deepmerge(attack(), target)]) {
        assert.equal(Object.getPrototypeOf(merged), Object.prototype);
        assert.equal(merged.tcghavenAdmin, undefined);
        assert.equal(merged.safe, 1);
        for (const key of ["__proto__", "constructor", "prototype"]) assert.equal(Object.hasOwn(merged, key), false);
      }
    }
    for (const value of [null, undefined, false, 0, "", Object.create(null)]) {
      const result = deepmerge({ session: value }, { session: attack() });
      assert.equal(Object.getPrototypeOf(result.session), Object.prototype);
      assert.equal(result.session.tcghavenAdmin, undefined);
      assert.equal(result.session.safe, 1);
    }
    assert.equal(deepmerge([], [attack()])[0].tcghavenAdmin, undefined);
    assert.equal(deepmerge.all([attack(), { session: null }, { session: attack() }]).session.tcghavenAdmin, undefined);
    assert.equal(Object.prototype.tcghavenAdmin, undefined);
  });

  it("skips forbidden getters and treats throwing proxy checks as unsafe", () => {
    for (const key of ["__proto__", "constructor", "prototype"]) {
      const payload = Object.defineProperty({ safe: 1 }, key, { enumerable: true, get() { throw new Error("Forbidden getter was evaluated"); } });
      assert.deepEqual(deepmerge({}, payload), { safe: 1 });
      assert.deepEqual(deepmerge(payload, {}), { safe: 1 });
    }
    const target = new Proxy({}, { has() { throw new Error("Untrustworthy target check"); } });
    assert.deepEqual(deepmerge(target, { untrusted: true }), {});
  });

  it("defines own data properties instead of invoking inherited destination setters", () => {
    // Isolate the prototype modification in a separate JavaScript realm.
    const source = readFileSync(resolverRequire.resolve("deepmerge"), "utf8");
    const result = runInNewContext(`${source}\n
      let calls = 0;
      Object.defineProperty(Object.prototype, "inheritedSetter", { configurable: true, set() { calls++; } });
      const merged = module.exports({ inheritedSetter: 1 }, { inheritedSetter: 2 });
      ({ calls, own: Object.hasOwn(merged, "inheritedSetter"), value: merged.inheritedSetter });
    `, { module: { exports: {} } }, { timeout: 1000 });
    assert.equal(result.calls, 0);
    assert.equal(result.own, true);
    assert.equal(result.value, 2);
  });
});

describe("serialize-javascript CVE-2026-115897 fix", () => {
  it("escapes a closing script tag split across serialized function boundaries", () => {
    const first = function first() {};
    const second = function second() {};
    first.toString = () => "function first(){ return 1 }//</script";
    second.toString = () => "function second(x){ return x } > <img src=x onerror=alert(1)>";
    for (const space of [undefined, 2, "\t"]) {
      const output = serialize({ a: { first }, second }, { space });
      assert.doesNotMatch(output, /<\/script(?:[\t\n\f\r />]|$)/i);
      assert.equal(output.includes("\\u003C"), true);
    }
  });

  it("still round-trips the trusted minifier options used by Rollup", () => {
    const options = { format: { comments: /license/i }, compress: { passes: 2 }, mangle: false, sourceMap: true,
      marker: "</script><img src=x>", filter: function filter(value) { return value > 1; } };
    const restored = runInNewContext(`(${serialize(options)})`, {}, { timeout: 1000 });
    assert.equal(restored.format.comments.test("License"), true);
    assert.equal(restored.compress.passes, 2);
    assert.equal(restored.mangle, false);
    assert.equal(restored.sourceMap, true);
    assert.equal(restored.marker, options.marker);
    assert.equal(restored.filter(2), true);
  });
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

describe("official node-forge security fixes", () => {
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
    assert.equal(forge.pki.certificateFromPem(Buffer.from(forge.pki.certificateToPem(cert))).serialNumber, "01");
  });

  it("fails fragmented TLS records through the error callback without crashing the process", () => {
    let errors = 0;
    const connection = forge.tls.createConnection({ server: true,
      tlsDataReady() {}, dataReady() {}, closed() {}, error() { errors++; },
    });
    assert.doesNotThrow(() => connection.process(forge.util.hexToBytes("160301000601000010030115030100020228")));
    assert.ok(errors > 0);
  });

  it("rejects invalid AES-GCM authentication tag lengths", () => {
    for (const tagLength of [0, -1, 7, 129]) {
      const decipher = forge.cipher.createDecipher("AES-GCM", "0".repeat(16));
      assert.throws(() => decipher.start({ iv: "0".repeat(12), tagLength, tag: "" }));
    }
  });

  it("rejects out-of-range OID first arcs instead of encoding a different algorithm", () => {
    for (const oid of ["0.42.840.113549.1.1.1", "4294977127.18.840.113549.1.1.1", "3.1.1"]) assert.throws(() => forge.asn1.oidToDer(oid));
  });

  it("terminates modular inverse operations for negative inputs", () => {
    // Refuse an old install before exercising the formerly non-terminating code.
    assertPatchedVersion("node-forge", resolvedPackage(listenerRequire, "node-forge").version);
    const Integer = forge.jsbn.BigInteger;
    assert.equal(new Integer("-1").modInverse(new Integer("17")).toString(), "0");
    assert.equal(new Integer("4").modInverse(new Integer("-17")).toString(), "0");
    assert.equal(new Integer("4").modInverse(new Integer("17")).toString(), "13");
  });
});
