const allowedRegistry = "https://registry.npmjs.org/";
const registry = process.env.npm_config_registry ?? allowedRegistry;

let parsed;

try {
  parsed = new URL(registry);
} catch {
  console.error(`Blocked npm install: invalid registry URL "${registry}".`);
  process.exit(1);
}

const normalized = parsed.toString();

if (parsed.protocol !== "https:" || normalized !== allowedRegistry) {
  console.error(
    `Blocked npm install: this project only allows ${allowedRegistry}. Current registry: ${normalized}`,
  );
  console.error(
    "Unset NPM_CONFIG_REGISTRY and npm_config_registry before installing dependencies.",
  );
  process.exit(1);
}
