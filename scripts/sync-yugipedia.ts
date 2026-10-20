// Bounded reference-library sync. Never changes live products or inventory.
import { searchYugipedia } from "../src/lib/yugipedia.server";
const argument = process.argv.slice(2).find(value => value.startsWith("--set=") || value.startsWith("--card="));
if (!argument) throw new Error('Choose --set="Chaos Origins" or --card="Dark Magician". A full-library crawl is intentionally disabled.');
const [flag, ...parts] = argument.split("=");
try {
  const result = await searchYugipedia(parts.join("="), flag === "--set" ? "set" : "card", process.argv.includes("--refresh"));
  console.log(JSON.stringify({ provider: "yugipedia", cards: result.cardIds.length, sets: result.matchedSets, cachedAt: result.syncedAt }));
} catch (error) {
  console.error(error instanceof Error ? error.message : "Yugipedia sync failed.");
  process.exitCode = 1;
}
