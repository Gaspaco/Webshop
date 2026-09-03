import { mkdir, readFile, stat, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";

const API_URL = "https://db.ygoprodeck.com/api/v7/cardinfo.php";
const SNAPSHOT_PATH = resolve(".cache/ygoprodeck/cards.json");
const refresh = process.argv.includes("--refresh");
const downloadOnly = process.argv.includes("--download-only");

type ApiPrinting = {
  set_name: string;
  set_code: string;
  set_rarity: string;
  set_rarity_code?: string;
  set_price?: string;
};

type ApiCard = {
  id: number;
  name: string;
  type: string;
  frameType: string;
  desc: string;
  race?: string;
  archetype?: string;
  attribute?: string;
  atk?: number;
  def?: number;
  level?: number;
  ygoprodeck_url?: string;
  card_sets?: ApiPrinting[];
  card_images?: Array<{ image_url?: string }>;
  card_prices?: Array<{ cardmarket_price?: string }>;
};

type ApiResponse = { data: ApiCard[] };

for (const envPath of [".env.development.local", ".env.local"]) {
  try {
    process.loadEnvFile(envPath);
  } catch {
    // Local environment files are optional.
  }
}

async function fileExists(path: string) {
  try {
    await stat(path);
    return true;
  } catch {
    return false;
  }
}

async function loadSnapshot(): Promise<ApiResponse> {
  if (!refresh && await fileExists(SNAPSHOT_PATH)) {
    console.log(`Using local YGOPRODeck snapshot: ${SNAPSHOT_PATH}`);
    return JSON.parse(await readFile(SNAPSHOT_PATH, "utf8")) as ApiResponse;
  }

  console.log("Downloading one complete YGOPRODeck data snapshot...");
  const response = await fetch(API_URL, {
    headers: {
      Accept: "application/json",
      "User-Agent": "TCGHaven catalogue sync (info@tcghaven.com)",
    },
    signal: AbortSignal.timeout(120_000),
  });
  if (!response.ok) {
    throw new Error(`YGOPRODeck returned ${response.status}. Nothing was imported.`);
  }

  const payload = await response.text();
  const parsed = JSON.parse(payload) as ApiResponse;
  if (!Array.isArray(parsed.data) || parsed.data.length === 0) {
    throw new Error("YGOPRODeck returned an empty or invalid card list.");
  }

  await mkdir(dirname(SNAPSHOT_PATH), { recursive: true });
  await writeFile(SNAPSHOT_PATH, payload, "utf8");
  console.log(`Stored ${parsed.data.length} cards in ${SNAPSHOT_PATH}`);
  return parsed;
}

function priceToCents(value?: string) {
  const amount = Number(value);
  return Number.isFinite(amount) && amount >= 0 ? Math.round(amount * 100) : null;
}

function chunks<T>(values: T[], size: number) {
  const result: T[][] = [];
  for (let index = 0; index < values.length; index += size) {
    result.push(values.slice(index, index + size));
  }
  return result;
}

const snapshot = await loadSnapshot();
if (downloadOnly) {
  console.log(`Download complete. ${snapshot.data.length} cards are available in the local snapshot.`);
  process.exit(0);
}

const [{ db }, schema, { sql }] = await Promise.all([
  import("../src/db/index"),
  import("../src/db/schema"),
  import("drizzle-orm"),
]);
const { yugiohCards, yugiohPrintings } = schema;
const syncedAt = new Date();

const cardRows = snapshot.data.map(card => ({
  id: card.id,
  name: card.name,
  cardType: card.type,
  frameType: card.frameType,
  description: card.desc,
  race: card.race ?? null,
  archetype: card.archetype ?? null,
  attribute: card.attribute ?? null,
  attack: card.atk ?? null,
  defense: card.def ?? null,
  level: card.level ?? null,
  imageSourceUrl: card.card_images?.[0]?.image_url ?? null,
  cardmarketPriceCents: priceToCents(card.card_prices?.[0]?.cardmarket_price),
  sourceUrl: card.ygoprodeck_url ?? null,
  syncedAt,
}));

for (const batch of chunks(cardRows, 250)) {
  await db
    .insert(yugiohCards)
    .values(batch)
    .onConflictDoUpdate({
      target: yugiohCards.id,
      set: {
        name: sql`excluded.name`,
        cardType: sql`excluded.card_type`,
        frameType: sql`excluded.frame_type`,
        description: sql`excluded.description`,
        race: sql`excluded.race`,
        archetype: sql`excluded.archetype`,
        attribute: sql`excluded.attribute`,
        attack: sql`excluded.attack`,
        defense: sql`excluded.defense`,
        level: sql`excluded.level`,
        imageSourceUrl: sql`excluded.image_source_url`,
        cardmarketPriceCents: sql`excluded.cardmarket_price_cents`,
        sourceUrl: sql`excluded.source_url`,
        syncedAt,
      },
    });
}

const printingMap = new Map<string, {
  cardId: number;
  setName: string;
  setCode: string;
  rarity: string;
  rarityCode: string | null;
  sourcePriceCents: number | null;
  syncedAt: Date;
}>();

for (const card of snapshot.data) {
  for (const printing of card.card_sets ?? []) {
    const key = `${card.id}\u0000${printing.set_code}\u0000${printing.set_rarity}`;
    printingMap.set(key, {
      cardId: card.id,
      setName: printing.set_name,
      setCode: printing.set_code,
      rarity: printing.set_rarity,
      rarityCode: printing.set_rarity_code ?? null,
      sourcePriceCents: priceToCents(printing.set_price),
      syncedAt,
    });
  }
}

// Printings are replaced from the single local snapshot so removed or renamed
// set entries cannot linger between syncs.
await db.transaction(async tx => {
  await tx.delete(yugiohPrintings);
  for (const batch of chunks([...printingMap.values()], 500)) {
    await tx.insert(yugiohPrintings).values(batch);
  }
});

console.log(
  `YGOPRODeck sync complete: ${cardRows.length} cards and ${printingMap.size} printings stored in PostgreSQL.`,
);
