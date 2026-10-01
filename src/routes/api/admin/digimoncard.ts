import type { APIEvent } from "@solidjs/start/server";
import { eq, inArray } from "drizzle-orm";
import { z } from "zod";
import { db } from "~/db";
import { products, productVariants } from "~/db/schema";
import { apiJson, requireAdmin, toSlug, writeAuditLog } from "~/lib/admin.server";

const DIGIMON_API = "https://digimoncard.io/api-public";
const DIGIMON_HOST = "digimoncard.io";
const CACHE_TTL_MS = 10 * 60 * 1_000;
const MAX_CACHE_ENTRIES = 80;

const importCardSchema = z.object({
  cardId: z.string().trim().min(2).max(40).regex(/^[a-zA-Z0-9-]+$/),
});

type DigimonCard = {
  name: string;
  type?: string | null;
  id: string;
  level?: number | null;
  play_cost?: number | null;
  evolution_cost?: number | null;
  evolution_color?: string | null;
  color?: string | null;
  color2?: string | null;
  digi_type?: string | null;
  digi_type2?: string | null;
  form?: string | null;
  dp?: number | null;
  attribute?: string | null;
  rarity?: string | null;
  stage?: string | null;
  artist?: string | null;
  main_effect?: string | null;
  source_effect?: string | null;
  alt_effect?: string | null;
  series?: string | null;
  pretty_url?: string | null;
  date_added?: string | null;
  set_name?: string[] | null;
};

class DigimonRequestError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
  }
}

const responseCache = new Map<string, { expiresAt: number; value: DigimonCard[] }>();
const wait = (milliseconds: number) =>
  new Promise(resolve => setTimeout(resolve, milliseconds));

let requestQueue = Promise.resolve();
let lastRequestAt = 0;

async function waitForRequestSlot() {
  const scheduled = requestQueue.then(async () => {
    // The provider allows 15 requests per 10 seconds. Staying at 700 ms leaves
    // a little headroom for retries and parallel server instances.
    const delay = Math.max(0, 700 - (Date.now() - lastRequestAt));
    if (delay) await wait(delay);
    lastRequestAt = Date.now();
  });
  requestQueue = scheduled.catch(() => undefined);
  await scheduled;
}

function remember(key: string, value: DigimonCard[]) {
  if (responseCache.size >= MAX_CACHE_ENTRIES) {
    const oldest = responseCache.keys().next().value;
    if (oldest) responseCache.delete(oldest);
  }
  responseCache.set(key, { expiresAt: Date.now() + CACHE_TTL_MS, value });
  return value;
}

async function digimonJson(params: URLSearchParams) {
  const target = new URL(`${DIGIMON_API}/search`);
  params.forEach((value, key) => target.searchParams.set(key, value));
  target.searchParams.set("series", "Digimon Card Game");
  target.searchParams.set("limit", params.get("limit") ?? "300");
  if (target.protocol !== "https:" || target.hostname !== DIGIMON_HOST) {
    throw new Error("Unexpected DigimonCard API address.");
  }

  const cacheKey = target.toString();
  const cached = responseCache.get(cacheKey);
  if (cached && cached.expiresAt > Date.now()) return cached.value;
  if (cached) responseCache.delete(cacheKey);

  await waitForRequestSlot();
  const response = await fetch(target, {
    headers: {
      Accept: "application/json",
      "User-Agent": "TCGHaven/1.0 (info@tcghaven.com)",
    },
    signal: AbortSignal.timeout(15_000),
  });
  if (!response.ok) {
    let detail = "DigimonCard could not complete the request.";
    try {
      const body = (await response.json()) as { error?: string };
      if (body.error) detail = body.error;
    } catch {
      // Status and default copy are enough for a safe admin response.
    }
    throw new DigimonRequestError(detail, response.status);
  }

  const body = await response.json();
  if (!Array.isArray(body)) throw new DigimonRequestError("Unexpected API response.", 502);
  return remember(cacheKey, body as DigimonCard[]);
}

function cleanQuery(value: string) {
  return value.replace(/[<>]/g, " ").replace(/\s+/g, " ").trim();
}

function rarityLabel(value: string | null | undefined) {
  if (!value) return "Unspecified rarity";
  const labels: Record<string, string> = {
    c: "Common",
    u: "Uncommon",
    r: "Rare",
    sr: "Super Rare",
    sec: "Secret Rare",
    p: "Promo",
  };
  return labels[value.toLowerCase()] ?? value.toUpperCase();
}

function productSlug(card: Pick<DigimonCard, "id" | "name">) {
  return toSlug(`digimon-${card.id}-${card.name}`);
}

function setNames(card: DigimonCard) {
  const names = (card.set_name ?? []).map(name => name.trim()).filter(Boolean);
  return [...new Set(names.length ? names : ["Unspecified set"])];
}

function setCode(card: DigimonCard) {
  const match = card.id.toUpperCase().match(/^([A-Z]+\d*)-/);
  return match?.[1] ?? card.id.split("-")[0]?.toUpperCase() ?? "DIGI";
}

function skuFor(card: DigimonCard, set: string, index: number) {
  const clean = (value: string, length: number) =>
    value.replace(/[^a-z0-9]+/gi, "-").replace(/^-|-$/g, "").slice(0, length);
  return `DGM-${clean(card.id, 32)}-${clean(set, 28)}-${index + 1}`
    .toUpperCase()
    .slice(0, 80);
}

function descriptionFor(card: DigimonCard) {
  const effects = [card.main_effect, card.source_effect, card.alt_effect]
    .map(value => value?.trim())
    .filter(Boolean);
  return effects.join("\n\n") ||
    `${card.type ?? "Digimon"} card ${card.id} from the Digimon Card Game.`;
}

async function importedStatuses(cards: DigimonCard[]) {
  const slugs = cards.map(productSlug);
  const rows = slugs.length
    ? await db
        .select({ slug: products.slug, status: products.status })
        .from(products)
        .where(inArray(products.slug, slugs))
    : [];
  return new Map(rows.map(row => [row.slug, row.status]));
}

async function searchResponse(cards: DigimonCard[], query: string, by: "card" | "set") {
  const unique = [...new Map(cards.map(card => [card.id, card])).values()].slice(0, 300);
  const imported = await importedStatuses(unique);
  const needle = query.toLocaleLowerCase("en-US");
  const matchedSets = by === "set"
    ? [...new Set(unique.flatMap(setNames))]
        .filter(name => name.toLocaleLowerCase("en-US").includes(needle))
        .slice(0, 12)
    : [];

  return apiJson({
    cards: unique.map(card => ({
      id: card.id,
      name: card.name,
      setName: setNames(card)[0],
      setCode: setCode(card),
      number: card.id,
      typeLine: [card.type, card.color, card.digi_type].filter(Boolean).join(" · "),
      rarity: rarityLabel(card.rarity),
      image: null,
      referencePriceLabel: "Price review needed",
      importedStatus: imported.get(productSlug(card)) ?? null,
    })),
    matchedSets,
  });
}

export async function GET(event: APIEvent) {
  const guard = await requireAdmin(event);
  if (guard.response) return guard.response;

  const url = new URL(event.request.url);
  const query = cleanQuery(url.searchParams.get("q")?.slice(0, 100) ?? "");
  const by = url.searchParams.get("by") === "set" ? "set" : "card";
  if (!query) return apiJson({ cards: [], matchedSets: [] });

  const params = new URLSearchParams();
  if (by === "set") params.set("pack", query);
  else if (/^[a-z]+\d*-\d+$/i.test(query)) params.set("card", query);
  else params.set("n", query);

  try {
    const cards = await digimonJson(params);
    return searchResponse(cards, query, by);
  } catch (error) {
    if (error instanceof DigimonRequestError && error.status === 400) {
      return apiJson({ cards: [], matchedSets: [] });
    }
    console.error("DigimonCard search failed", error);
    return apiJson(
      {
        error: error instanceof DigimonRequestError && error.status === 429
          ? "DigimonCard is rate limiting requests. Wait a minute and search again."
          : "The Digimon card library could not be reached. Try again shortly.",
      },
      { status: 503 },
    );
  }
}

export async function POST(event: APIEvent) {
  const guard = await requireAdmin(event);
  if (guard.response) return guard.response;

  try {
    const input = importCardSchema.parse(await event.request.json());
    const matches = await digimonJson(new URLSearchParams({ card: input.cardId, limit: "20" }));
    const card = matches.find(item => item.id.toUpperCase() === input.cardId.toUpperCase());
    if (!card) return apiJson({ error: "That Digimon card was not found." }, { status: 404 });

    const slug = productSlug(card);
    const [existing] = await db
      .select({ id: products.id })
      .from(products)
      .where(eq(products.slug, slug))
      .limit(1);
    if (existing) {
      return apiJson({ error: "This Digimon card is already in the catalogue." }, { status: 409 });
    }

    const printings = setNames(card);
    const created = await db.transaction(async tx => {
      const [product] = await tx
        .insert(products)
        .values({
          name: card.name,
          slug,
          description: descriptionFor(card),
          brand: "Bandai",
          game: "digimon",
          productType: "single",
          status: "draft",
          imageUrls: [],
          metadata: {
            source: "digimoncard",
            sourceCardId: card.id,
            sourceUrl: `${DIGIMON_API}/search?card=${encodeURIComponent(card.id)}`,
            set: printings[0],
            setCode: setCode(card),
            cardNumber: card.id,
            rarity: rarityLabel(card.rarity),
            cardType: card.type,
            colors: [card.color, card.color2].filter(Boolean),
            digiTypes: [card.digi_type, card.digi_type2].filter(Boolean),
            form: card.form,
            stage: card.stage,
            attribute: card.attribute,
            level: card.level,
            dp: card.dp,
            playCost: card.play_cost,
            evolutionCost: card.evolution_cost,
            evolutionColor: card.evolution_color,
            artist: card.artist,
            priceNeedsReview: true,
            imageNeedsUpload: true,
          },
        })
        .returning({ id: products.id, name: products.name, slug: products.slug });
      if (!product) throw new Error("Product was not created.");

      await tx.insert(productVariants).values(
        printings.map((set, index) => ({
          productId: product.id,
          sku: skuFor(card, set, index),
          name: `${set} · ${card.id} · ${rarityLabel(card.rarity)}`.slice(0, 120),
          condition: "Near Mint",
          language: "English",
          finish: rarityLabel(card.rarity),
          imageUrl: null,
          isDefault: index === 0,
          priceCents: 0,
          stock: 0,
          trackInventory: true,
        })),
      );
      return product;
    });

    await writeAuditLog({
      event,
      actorId: guard.session!.user.id,
      action: "catalogue.digimoncard_added",
      entityType: "product",
      entityId: created.id,
      summary: `${created.name} added from DigimonCard as a zero-stock draft.`,
      metadata: { cardId: card.id, variants: printings.length, hasImage: false },
    });

    return apiJson(
      { product: created, variants: printings.length, hasImage: false },
      { status: 201 },
    );
  } catch (error) {
    if (error instanceof z.ZodError) {
      return apiJson({ error: "Choose a valid Digimon card." }, { status: 400 });
    }
    if (error instanceof DigimonRequestError && error.status === 429) {
      return apiJson({ error: "DigimonCard is rate limiting requests. Try again later." }, { status: 503 });
    }
    console.error("DigimonCard catalogue import failed", error);
    return apiJson(
      { error: "The Digimon card could not be added. Check the server log for the reason." },
      { status: 500 },
    );
  }
}
