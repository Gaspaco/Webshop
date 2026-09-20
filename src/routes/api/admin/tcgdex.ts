import type { APIEvent } from "@solidjs/start/server";
import { eq, inArray } from "drizzle-orm";
import { z } from "zod";
import { db } from "~/db";
import { products, productVariants } from "~/db/schema";
import { apiJson, requireAdmin, toSlug, writeAuditLog } from "~/lib/admin.server";

const importCardSchema = z.object({
  cardId: z.string().min(1).max(80).regex(/^[a-zA-Z0-9.-]+$/),
});

const TCGDEX_API = "https://api.tcgdex.net/v2/en";
const TCGDEX_HOST = "api.tcgdex.net";

type CardBrief = {
  id: string;
  localId: string;
  name: string;
  image?: string;
};

type SetBrief = {
  id: string;
  name: string;
  cardCount?: { total?: number; official?: number };
};

type SetDetail = SetBrief & { cards?: CardBrief[] };

type CardmarketPrices = {
  unit?: string;
  avg?: number;
  trend?: number;
  "avg-holo"?: number;
  "trend-holo"?: number;
};

type CardDetail = CardBrief & {
  category: string;
  illustrator?: string;
  rarity?: string;
  description?: string;
  effect?: string;
  hp?: number;
  types?: string[];
  stage?: string;
  regulationMark?: string;
  set: SetBrief;
  variants: {
    normal?: boolean;
    reverse?: boolean;
    holo?: boolean;
    firstEdition?: boolean;
    wPromo?: boolean;
  };
  pricing?: { cardmarket?: CardmarketPrices };
};

class TcgdexRequestError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
  }
}

const wait = (milliseconds: number) =>
  new Promise(resolve => setTimeout(resolve, milliseconds));

let requestQueue = Promise.resolve();
let lastRequestAt = 0;

async function waitForRequestSlot() {
  const scheduled = requestQueue.then(async () => {
    const delay = Math.max(0, 125 - (Date.now() - lastRequestAt));
    if (delay) await wait(delay);
    lastRequestAt = Date.now();
  });
  requestQueue = scheduled.catch(() => undefined);
  await scheduled;
}

async function tcgdexJson<T>(path: string) {
  const target = new URL(path, `${TCGDEX_API}/`);
  if (target.protocol !== "https:" || target.hostname !== TCGDEX_HOST) {
    throw new Error("Unexpected TCGdex API address.");
  }

  await waitForRequestSlot();
  const response = await fetch(target, {
    headers: {
      Accept: "application/json",
      "User-Agent": "TCGHaven/1.0 (info@tcghaven.com)",
    },
    signal: AbortSignal.timeout(15_000),
  });
  if (!response.ok) {
    throw new TcgdexRequestError("TCGdex could not complete the request.", response.status);
  }
  return (await response.json()) as T;
}

function cleanQuery(value: string) {
  return value.replace(/[<>]/g, " ").replace(/\s+/g, " ").trim();
}

function productSlug(card: Pick<CardBrief, "id" | "name">) {
  return toSlug(`pokemon-${card.id}-${card.name}`);
}

function imageUrl(image: string | undefined) {
  if (!image) return null;
  try {
    const target = new URL(image);
    if (target.protocol !== "https:" || target.hostname !== "assets.tcgdex.net") return null;
    return `${target.toString().replace(/\/$/, "")}/high.webp`;
  } catch {
    return null;
  }
}

function cents(value: number | undefined) {
  return Number.isFinite(value) && (value ?? 0) > 0
    ? Math.round(value! * 100)
    : 0;
}

function finishes(card: CardDetail) {
  const values: string[] = [];
  if (card.variants.normal) values.push("Normal");
  if (card.variants.reverse) values.push("Reverse Holo");
  if (card.variants.holo) values.push("Holo");
  if (card.variants.firstEdition && card.variants.normal) values.push("First Edition");
  if (card.variants.firstEdition && card.variants.holo) values.push("First Edition Holo");
  if (card.variants.firstEdition && !card.variants.normal && !card.variants.holo) {
    values.push("First Edition");
  }
  if (card.variants.wPromo) values.push("W Promo");
  return [...new Set(values.length ? values : ["Standard"])];
}

function priceFor(card: CardDetail, finish: string) {
  const prices = card.pricing?.cardmarket;
  if (prices?.unit && prices.unit !== "EUR") return 0;
  if (finish.includes("First Edition") || finish === "W Promo") return 0;
  if (finish.includes("Holo")) {
    return cents(prices?.["trend-holo"] ?? prices?.["avg-holo"]);
  }
  return cents(prices?.trend ?? prices?.avg);
}

function skuFor(card: CardDetail, finish: string) {
  const clean = (value: string, length: number) =>
    value.replace(/[^a-z0-9]+/gi, "-").replace(/^-|-$/g, "").slice(0, length);
  return `PKM-${clean(card.id, 42)}-${clean(finish, 24)}`.toUpperCase().slice(0, 80);
}

function descriptionFor(card: CardDetail) {
  return card.description ?? card.effect ??
    `${card.category} card from ${card.set.name}, number ${card.localId}.`;
}

async function importedStatuses(cards: CardBrief[]) {
  const slugs = cards.map(card => productSlug(card));
  const rows = slugs.length
    ? await db
        .select({ slug: products.slug, status: products.status })
        .from(products)
        .where(inArray(products.slug, slugs))
    : [];
  return new Map(rows.map(row => [row.slug, row.status]));
}

async function searchResponse(cards: CardBrief[], sets: SetBrief[], matchedSets: string[] = []) {
  const limited = cards.slice(0, 300);
  const imported = await importedStatuses(limited);
  const setsById = new Map(sets.map(set => [set.id, set]));

  return apiJson({
    cards: limited.map(card => {
      const separator = card.id.lastIndexOf("-");
      const setCode = separator > 0 ? card.id.slice(0, separator) : "";
      const set = setsById.get(setCode);
      return {
        id: card.id,
        name: card.name,
        localId: card.localId,
        setName: set?.name ?? setCode.toUpperCase(),
        setCode: setCode.toUpperCase(),
        image: imageUrl(card.image),
        importedStatus: imported.get(productSlug(card)) ?? null,
      };
    }),
    matchedSets,
  });
}

export async function GET(event: APIEvent) {
  const guard = await requireAdmin(event);
  if (guard.response) return guard.response;

  const url = new URL(event.request.url);
  const query = cleanQuery(url.searchParams.get("q")?.slice(0, 80) ?? "");
  const searchBy = url.searchParams.get("by") === "set" ? "set" : "card";
  if (!query) return apiJson({ cards: [], matchedSets: [] });

  try {
    if (searchBy === "set") {
      const params = new URLSearchParams({
        name: query,
        "pagination:page": "1",
        "pagination:itemsPerPage": "6",
      });
      const matches = await tcgdexJson<SetBrief[]>(`sets?${params}`);
      if (!matches.length) return apiJson({ cards: [], matchedSets: [] });

      const details: SetDetail[] = [];
      for (const set of matches) {
        details.push(await tcgdexJson<SetDetail>(`sets/${encodeURIComponent(set.id)}`));
      }
      const cards = details.flatMap(set => set.cards ?? []);
      return searchResponse(
        cards,
        details,
        details.map(set => `${set.name} (${set.id.toUpperCase()})`),
      );
    }

    const params = new URLSearchParams({
      name: query,
      "pagination:page": "1",
      "pagination:itemsPerPage": "80",
    });
    const [cards, sets] = await Promise.all([
      tcgdexJson<CardBrief[]>(`cards?${params}`),
      tcgdexJson<SetBrief[]>("sets"),
    ]);
    return searchResponse(cards, sets);
  } catch (error) {
    console.error("TCGdex search failed", error);
    return apiJson(
      {
        error: error instanceof TcgdexRequestError && error.status === 429
          ? "TCGdex is rate limiting requests. Wait a moment and search again."
          : "The Pokémon card library could not be reached. Try again shortly.",
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
    const card = await tcgdexJson<CardDetail>(`cards/${encodeURIComponent(input.cardId)}`);
    const slug = productSlug(card);
    const [existing] = await db
      .select({ id: products.id })
      .from(products)
      .where(eq(products.slug, slug))
      .limit(1);
    if (existing) {
      return apiJson({ error: "This Pokémon card is already in the catalogue." }, { status: 409 });
    }

    const cardFinishes = finishes(card);
    const artwork = imageUrl(card.image);
    const created = await db.transaction(async tx => {
      const [product] = await tx
        .insert(products)
        .values({
          name: card.name,
          slug,
          description: descriptionFor(card),
          brand: "The Pokémon Company",
          game: "pokemon",
          productType: "single",
          status: "draft",
          imageUrls: artwork ? [artwork] : [],
          metadata: {
            source: "tcgdex",
            sourceCardId: card.id,
            sourceUrl: `${TCGDEX_API}/cards/${card.id}`,
            set: card.set.name,
            setCode: card.set.id.toUpperCase(),
            cardNumber: card.localId,
            rarity: card.rarity,
            category: card.category,
            hp: card.hp,
            types: card.types,
            stage: card.stage,
            regulationMark: card.regulationMark,
            illustrator: card.illustrator,
          },
        })
        .returning({ id: products.id, name: products.name, slug: products.slug });
      if (!product) throw new Error("Product was not created.");

      await tx.insert(productVariants).values(
        cardFinishes.map((finish, index) => ({
          productId: product.id,
          sku: skuFor(card, finish),
          name: `${card.set.name} · ${card.localId} · ${card.rarity ?? "Unspecified rarity"} · ${finish}`.slice(0, 120),
          condition: "Near Mint",
          language: "English",
          finish,
          imageUrl: artwork,
          isDefault: index === 0,
          priceCents: priceFor(card, finish),
          stock: 0,
          trackInventory: true,
        })),
      );
      return product;
    });

    await writeAuditLog({
      event,
      actorId: guard.session!.user.id,
      action: "catalogue.tcgdex_added",
      entityType: "product",
      entityId: created.id,
      summary: `${created.name} added from TCGdex as a draft with ${cardFinishes.length} variants.`,
      metadata: {
        cardId: card.id,
        setId: card.set.id,
        variants: cardFinishes.length,
        hasImage: Boolean(artwork),
      },
    });

    return apiJson(
      {
        product: created,
        variants: cardFinishes.length,
        hasImage: Boolean(artwork),
      },
      { status: 201 },
    );
  } catch (error) {
    if (error instanceof z.ZodError) {
      return apiJson({ error: "Choose a valid Pokémon card." }, { status: 400 });
    }
    if (error instanceof TcgdexRequestError && error.status === 404) {
      return apiJson({ error: "That Pokémon card is no longer available in TCGdex." }, { status: 404 });
    }
    console.error("TCGdex catalogue import failed", error);
    return apiJson(
      { error: "The Pokémon card could not be added. Check the server log for the reason." },
      { status: 500 },
    );
  }
}
