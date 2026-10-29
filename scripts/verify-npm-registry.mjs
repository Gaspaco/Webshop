import { URL, pathToFileURL } from "node:url";

export const NPM_REGISTRY = "https://registry.npmjs.org/";

export function isAllowedNpmRegistry(value) {
  if (typeof value !== "string" || !value.trim()) return false;
  try {
    const registry = new URL(value);
    return registry.protocol === "https:" && registry.hostname === "registry.npmjs.org" &&
      registry.port === "" && registry.pathname === "/" &&
      registry.username === "" && registry.password === "" && registry.search === "" && registry.hash === "";
  } catch { return false; }
}

export function verifyNpmRegistry(environment) {
  // npm lifecycle scripts can receive lowercase configuration as well as an
  // uppercase override. Check both instead of silently ignoring a conflict.
  const configured = [environment.npm_config_registry, environment.NPM_CONFIG_REGISTRY]
    .filter(value => value !== undefined);
  return (configured.length ? configured : [NPM_REGISTRY]).every(isAllowedNpmRegistry);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href && !verifyNpmRegistry(process.env)) {
  // Registry URLs may contain credentials. Do not echo the supplied value.
  console.error(`Blocked npm install: only ${NPM_REGISTRY} is allowed.`);
  console.error("Check npm_config_registry and NPM_CONFIG_REGISTRY; remove non-official registry overrides.");
  process.exitCode = 1;
}
