import type { APIEvent } from "@solidjs/start/server";
import { eq, inArray } from "drizzle-orm";
import { z } from "zod";
import { db } from "~/db";
import { products, productVariants } from "~/db/schema";
import { apiJson, requireAdmin, toSlug, writeAuditLog } from "~/lib/admin.server";
import { getScrydexEnv } from "~/lib/env.server";

const SCRYDEX_API = "https://api.scrydex.com";
const SCRYDEX_HOST = "api.scrydex.com";
const CACHE_TTL_MS = 6 * 60 * 60 * 1_000;
const MAX_CACHE_ENTRIES = 100;

const importCardSchema = z.object({
  cardId: z.string().trim().min(2).max(80).regex(/^[a-zA-Z0-9._-]+$/),
});

type ScrydexImage = {
  type?: string;
  small?: string;
  medium?: string;
  large?: string;
};

type ScrydexPrice = {
  condition?: string;
  type?: string;
  low?: number | null;
  market?: number | null;
  currency?: string | null;
};

type ScrydexVariant = {
  name: string;
  images?: ScrydexImage[];
  prices?: ScrydexPrice[];
};

type ScrydexExpansion = {
  id: string;
  name: string;
  type?: string;
  code?: string;
  total?: number;
  printed_total?: number;
  release_date?: string;
  logo?: string;
  language?: string;
  language_code?: string;
};

type RiftboundCard = {
  id: string;
  name: string;
  number: string;
  printed_number?: string;
  domain?: string;
  type?: string;
  artist?: string;
  rarity?: string;
  rules?: string[];
  images?: ScrydexImage[];
  expansion: ScrydexExpansion;
  language?: string;
  language_code?: string;
  expansion_sort_order?: number;
  variants?: ScrydexVariant[];
};

type ScrydexList<T> = {
  status?: string;
  data: T[];
  page?: number;
  pageSize?: number;
  totalCount?: number;
};

class ScrydexRequestError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
  }
}

const responseCache = new Map<string, { expiresAt: number; value: unknown }>();
const wait = (milliseconds: number) =>
  new Promise(resolve => setTimeout(resolve, milliseconds));

let requestQueue = Promise.resolve();
let lastRequestAt = 0;

async function waitForRequestSlot() {
  const scheduled = requestQueue.then(async () => {
    const delay = Math.max(0, 250 - (Date.now() - lastRequestAt));
    if (delay) await wait(delay);
    lastRequestAt = Date.now();
  });
  requestQueue = scheduled.catch(() => undefined);
  await scheduled;
}

function remember<T>(key: string, value: T) {
  if (responseCache.size >= MAX_CACHE_ENTRIES) {
    const oldest = responseCache.keys().next().value;
    if (oldest) responseCache.delete(oldest);
  }
  responseCache.set(key, { expiresAt: Date.now() + CACHE_TTL_MS, value });
  return value;
}

async function scrydexJson<T>(path: string): Promise<T> {
  const env = getScrydexEnv();
  const target = new URL(path, `${SCRYDEX_API}/`);
  if (target.protocol !== "https:" || target.hostname !== SCRYDEX_HOST) {
    throw new Error("Unexpected Scrydex API address.");
  }

  const cacheKey = target.toString();
  const cached = responseCache.get(cacheKey);
  if (cached && cached.expiresAt > Date.now()) return cached.value as T;
  if (cached) responseCache.delete(cacheKey);

  await waitForRequestSlot();
  const response = await fetch(target, {
    headers: {
      Accept: "application/json",
      "User-Agent": "TCGHaven/1.0 (info@tcghaven.com)",
      "X-Api-Key": env.SCRYDEX_API_KEY,
      "X-Team-ID": env.SCRYDEX_TEAM_ID,
    },
    signal: AbortSignal.timeout(15_000),
  });
  if (!response.ok) {
    let detail = "Scrydex could not complete the request.";
    try {
      const body = (await response.json()) as { error?: string; message?: string };
      detail = body.error ?? body.message ?? detail;
    } catch {
      // The status code still gives the dashboard a useful error state.
    }
    throw new ScrydexRequestError(detail, response.status);
  }
  return remember(cacheKey, (await response.json()) as T);
}

function cleanQuery(value: string) {
  return value.replace(/[<>"\\]/g, " ").replace(/\s+/g, " ").trim();
}

function listData<T>(body: ScrydexList<T> | T[]) {
  return Array.isArray(body) ? body : Array.isArray(body.data) ? body.data : [];
}

function cardData(body: RiftboundCard | { data?: RiftboundCard }) {
  return "data" in body && body.data ? body.data : body as RiftboundCard;
}

function productSlug(card: Pick<RiftboundCard, "id" | "name">) {
  return toSlug(`riftbound-${card.id}-${card.name}`);
}

function imageUrl(images: ScrydexImage[] | undefined) {
  const raw = images?.find(image => image.type === "front")?.large ??
    images?.[0]?.large ??
    images?.find(image => image.type === "front")?.medium ??
    images?.[0]?.medium ??
    null;
  if (!raw) return null;
  try {
    const target = new URL(raw);
    return target.protocol === "https:" && target.hostname === "images.scrydex.com"
      ? target.toString()
      : null;
  } catch {
    return null;
  }
}

function variantImage(card: RiftboundCard, variant: ScrydexVariant) {
  return imageUrl(variant.images) ?? imageUrl(card.images);
}

function marketPrice(variant: ScrydexVariant) {
  return variant.prices?.find(price =>
    price.type === "raw" &&
    (!price.condition || price.condition.toUpperCase() === "NM") &&
    Number.isFinite(price.market) &&
    (price.market ?? 0) > 0,
  ) ?? variant.prices?.find(price => Number.isFinite(price.market) && (price.market ?? 0) > 0) ?? null;
}

function referencePriceLabel(card: RiftboundCard) {
  const price = card.variants?.map(marketPrice).find(Boolean);
  if (!price?.market) return "Price review needed";
  const currency = price.currency?.toUpperCase() ?? "USD";
  try {
    return new Intl.NumberFormat("en-NL", {
      style: "currency",
      currency,
      maximumFractionDigits: 2,
    }).format(price.market);
  } catch {
    return `${price.market.toFixed(2)} ${currency}`;
  }
}

function priceCents(variant: ScrydexVariant) {
  const price = marketPrice(variant);
  // Storefront prices are EUR. Never silently treat a USD market price as EUR.
  return price?.currency?.toUpperCase() === "EUR" && price.market
    ? Math.round(price.market * 100)
    : 0;
}

function skuFor(card: RiftboundCard, variant: ScrydexVariant, index: number) {
  const clean = (value: string, length: number) =>
    value.replace(/[^a-z0-9]+/gi, "-").replace(/^-|-$/g, "").slice(0, length);
  return `RFB-${clean(card.id, 42)}-${clean(variant.name || "standard", 24)}-${index + 1}`
    .toUpperCase()
    .slice(0, 80);
}

function variantsFor(card: RiftboundCard) {
  return card.variants?.length ? card.variants : [{ name: "normal", images: card.images, prices: [] }];
}

async function importedStatuses(cards: RiftboundCard[]) {
  const slugs = cards.map(productSlug);
  const rows = slugs.length
    ? await db
        .select({ slug: products.slug, status: products.status })
        .from(products)
        .where(inArray(products.slug, slugs))
    : [];
  return new Map(rows.map(row => [row.slug, row.status]));
}

async function searchResponse(cards: RiftboundCard[], matchedSets: string[] = []) {
  const unique = [...new Map(cards.map(card => [card.id, card])).values()].slice(0, 300);
  const imported = await importedStatuses(unique);
  return apiJson({
    cards: unique.map(card => ({
      id: card.id,
      name: card.name,
      setName: card.expansion?.name ?? "Unknown expansion",
      setCode: (card.expansion?.code ?? card.expansion?.id ?? "RFB").toUpperCase(),
      number: card.printed_number ?? card.number,
      typeLine: [card.type, card.domain].filter(Boolean).join(" · "),
      rarity: card.rarity ?? "Unspecified rarity",
      image: imageUrl(card.images) ?? variantsFor(card).map(variant => variantImage(card, variant)).find(Boolean) ?? null,
      referencePriceLabel: referencePriceLabel(card),
      importedStatus: imported.get(productSlug(card)) ?? null,
    })),
    matchedSets,
  });
}

async function searchExpansions(query: string) {
  const response = await scrydexJson<ScrydexList<ScrydexExpansion>>(
    "riftbound/v1/expansions?page_size=100&select=id,name,code,type,release_date,language,language_code",
  );
  const needle = query.toLocaleLowerCase("en-US");
  return listData(response)
    .filter(expansion =>
      expansion.id.toLocaleLowerCase("en-US").includes(needle) ||
      expansion.code?.toLocaleLowerCase("en-US").includes(needle) ||
      expansion.name.toLocaleLowerCase("en-US").includes(needle),
    )
    .slice(0, 3);
}

export async function GET(event: APIEvent) {
  const guard = await requireAdmin(event);
  if (guard.response) return guard.response;

  const url = new URL(event.request.url);
  const query = cleanQuery(url.searchParams.get("q")?.slice(0, 100) ?? "");
  const by = url.searchParams.get("by") === "set" ? "set" : "card";
  if (!query) return apiJson({ cards: [], matchedSets: [] });

  try {
    if (by === "set") {
      const expansions = await searchExpansions(query);
      const cards: RiftboundCard[] = [];
      for (const expansion of expansions) {
        const body = await scrydexJson<ScrydexList<RiftboundCard>>(
          `riftbound/v1/expansions/${encodeURIComponent(expansion.id)}/cards?page_size=250&include=prices`,
        );
        cards.push(...listData(body));
      }
      return searchResponse(
        cards,
        expansions.map(expansion => `${expansion.name} (${(expansion.code ?? expansion.id).toUpperCase()})`),
      );
    }

    const isCardId = /^[a-z]+-?\d+$/i.test(query);
    if (isCardId) {
      const body = await scrydexJson<RiftboundCard | { data?: RiftboundCard }>(
        `riftbound/v1/cards/${encodeURIComponent(query)}?include=prices`,
      );
      return searchResponse([cardData(body)]);
    }

    const search = `name:\"${query}\"`;
    const body = await scrydexJson<ScrydexList<RiftboundCard>>(
      `riftbound/v1/cards?q=${encodeURIComponent(search)}&page_size=80&include=prices`,
    );
    return searchResponse(listData(body));
  } catch (error) {
    if (error instanceof ScrydexRequestError && error.status === 404) {
      return apiJson({ cards: [], matchedSets: [] });
    }
    console.error("Scrydex search failed", error);
    const configurationMissing = error instanceof z.ZodError;
    return apiJson(
      {
        error: configurationMissing
          ? "Riftbound needs SCRYDEX_API_KEY and SCRYDEX_TEAM_ID in the server environment."
          : error instanceof ScrydexRequestError && error.status === 429
            ? "Scrydex is rate limiting requests or the account is out of credits. Try again later."
            : "The Riftbound card library could not be reached. Try again shortly.",
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
    const body = await scrydexJson<RiftboundCard | { data?: RiftboundCard }>(
      `riftbound/v1/cards/${encodeURIComponent(input.cardId)}?include=prices`,
    );
    const card = cardData(body);
    if (!card?.id || !card.name) {
      return apiJson({ error: "That Riftbound card was not found." }, { status: 404 });
    }

    const slug = productSlug(card);
    const [existing] = await db
      .select({ id: products.id })
      .from(products)
      .where(eq(products.slug, slug))
      .limit(1);
    if (existing) {
      return apiJson({ error: "This Riftbound card is already in the catalogue." }, { status: 409 });
    }

    const cardVariants = variantsFor(card);
    const artwork = imageUrl(card.images) ?? cardVariants.map(variant => variantImage(card, variant)).find(Boolean) ?? null;
    const prices = cardVariants.map(priceCents);
    const pricesNeedingReview = prices.filter(price => price <= 0).length;

    const created = await db.transaction(async tx => {
      const [product] = await tx
        .insert(products)
        .values({
          name: card.name,
          slug,
          description: card.rules?.filter(Boolean).join("\n\n") ||
            `${card.type ?? "Riftbound"} card ${card.id} from ${card.expansion.name}.`,
          brand: "Riot Games",
          game: "riftbound",
          productType: "single",
          status: "draft",
          imageUrls: artwork ? [artwork] : [],
          metadata: {
            source: "scrydex",
            sourceCardId: card.id,
            sourceUrl: `${SCRYDEX_API}/riftbound/v1/cards/${encodeURIComponent(card.id)}`,
            set: card.expansion.name,
            setCode: (card.expansion.code ?? card.expansion.id).toUpperCase(),
            cardNumber: card.printed_number ?? card.number,
            rarity: card.rarity,
            cardType: card.type,
            domain: card.domain,
            artist: card.artist,
            language: card.language,
            releaseDate: card.expansion.release_date,
            priceReference: referencePriceLabel(card),
            priceNeedsReview: pricesNeedingReview > 0,
            pricesNeedingReview,
          },
        })
        .returning({ id: products.id, name: products.name, slug: products.slug });
      if (!product) throw new Error("Product was not created.");

      await tx.insert(productVariants).values(
        cardVariants.map((variant, index) => ({
          productId: product.id,
          sku: skuFor(card, variant, index),
          name: `${card.expansion.name} · ${card.printed_number ?? card.number} · ${card.rarity ?? "Unspecified rarity"} · ${variant.name}`.slice(0, 120),
          condition: "Near Mint",
          language: card.language ?? "English",
          finish: variant.name.charAt(0).toUpperCase() + variant.name.slice(1),
          imageUrl: variantImage(card, variant),
          isDefault: index === 0,
          priceCents: prices[index] ?? 0,
          stock: 0,
          trackInventory: true,
        })),
      );
      return product;
    });

    await writeAuditLog({
      event,
      actorId: guard.session!.user.id,
      action: "catalogue.scrydex_added",
      entityType: "product",
      entityId: created.id,
      summary: `${created.name} added from Scrydex as a draft with ${cardVariants.length} variants.`,
      metadata: {
        cardId: card.id,
        variants: cardVariants.length,
        hasImage: Boolean(artwork),
        pricesNeedingReview,
      },
    });

    return apiJson(
      {
        product: created,
        variants: cardVariants.length,
        hasImage: Boolean(artwork),
        pricesNeedingReview,
      },
      { status: 201 },
    );
  } catch (error) {
    if (error instanceof z.ZodError) {
      const configurationMissing = error.issues.some(issue =>
        issue.path.includes("SCRYDEX_API_KEY") || issue.path.includes("SCRYDEX_TEAM_ID"),
      );
      return apiJson(
        {
          error: configurationMissing
            ? "Riftbound needs SCRYDEX_API_KEY and SCRYDEX_TEAM_ID in the server environment."
            : "Choose a valid Riftbound card.",
        },
        { status: configurationMissing ? 503 : 400 },
      );
    }
    if (error instanceof ScrydexRequestError && error.status === 404) {
      return apiJson({ error: "That Riftbound card is no longer available in Scrydex." }, { status: 404 });
    }
    console.error("Scrydex catalogue import failed", error);
    return apiJson(
      { error: "The Riftbound card could not be added. Check the server log for the reason." },
      { status: 500 },
    );
  }
}
