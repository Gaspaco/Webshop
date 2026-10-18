import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

// npm audit cannot assess unpublished forks. Continue checking their original
// release identities, failing on any advisory not covered by our tested fixes.
export function reviewVendorAdvisories(report, manifests) {
  if (!report || typeof report !== "object" || Array.isArray(report)) {
    throw new Error("Invalid upstream advisory response");
  }
  const packages = new Map(manifests.map(manifest => [manifest.upstream.name, manifest]));
  const uncovered = [];
  let backported = 0;
  for (const [name, advisories] of Object.entries(report)) {
    const manifest = packages.get(name);
    if (!manifest || !Array.isArray(advisories)) throw new Error("Unexpected upstream advisory data");
    for (const advisory of advisories) {
      if (!advisory || typeof advisory.url !== "string") throw new Error("Invalid upstream advisory entry");
      if (advisory.url === manifest.advisory) backported++;
      else uncovered.push({ name, url: advisory.url });
    }
  }
  return { backported, uncovered };
}

async function main() {
  const manifests = ["braces", "node-forge"].map(name => JSON.parse(readFileSync(
    new URL(`../vendor/${name}/security-provenance.json`, import.meta.url), "utf8",
  )));
  const payload = Object.fromEntries(manifests.map(({ upstream }) => [upstream.name, [upstream.version]]));
  const response = await fetch("https://registry.npmjs.org/-/npm/v1/security/advisories/bulk", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(payload),
    signal: AbortSignal.timeout(15_000),
    redirect: "error",
  });
  if (!response.ok) throw new Error(`Upstream advisory lookup failed (HTTP ${response.status})`);
  const { backported, uncovered } = reviewVendorAdvisories(await response.json(), manifests);
  if (uncovered.length) {
    for (const { name, url } of uncovered) console.error(`Unreviewed upstream advisory: ${name} ${url}`);
    throw new Error("Review and fix new advisories before accepting these forks");
  }
  console.log(`Upstream advisory check: ${backported} covered by tested backports; no unreviewed advisories.`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  main().catch(error => {
    console.error(error.message);
    process.exitCode = 1;
  });
}
