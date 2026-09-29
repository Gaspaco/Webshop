import type { APIEvent } from "@solidjs/start/server";
import { eq, inArray } from "drizzle-orm";
import { z } from "zod";
import { db } from "~/db";
import {
  products,
  productVariants,
} from "~/db/schema";
import { apiJson, requireAdmin, writeAuditLog } from "~/lib/admin.server";
import {
  isWithinApiRefreshProductLimit,
  matchYgoprodeckPrices,
  MAX_API_PRICE_REFRESH_PRODUCTS,
  normalizedCatalogLabel,
  positiveEuroCents,
  refreshedPriceOrCurrent,
  type YgoprodeckPriceCard,
} from "~/lib/catalog-price-refresh";
import { checkRateLimit } from "~/lib/rate-limit.server";

const refreshSchema = z.object({
  variantIds: z.array(z.string().uuid()).min(1).max(100),
});

type ManagedVariant = {
  id: string;
  productId: string;
  sku: string;
  name: string;
  finish: string | null;
  priceCents: number;
};

type CardmarketPrices = {
  unit?: string;
  avg?: number;
  low?: number;
  trend?: number;
  avg7?: number;
  avg30?: number;
  "avg-holo"?: number;
  "low-holo"?: number;
  "trend-holo"?: number;
  "avg7-holo"?: number;
  "avg30-holo"?: number;
};

type TcgdexCard = {
  id: string;
  variants: {
    normal?: boolean;
    reverse?: boolean;
    holo?: boolean;
    firstEdition?: boolean;
    wPromo?: boolean;
  };
  variants_detailed?: Array<{
    type: string;
    subtype?: string;
    stamp?: string[];
    variantId?: string;
    pricing?: { cardmarket?: CardmarketPrices };
  }>;
  pricing?: { cardmarket?: CardmarketPrices };
};

type ScryfallCard = {
  id: string;
  set: string;
  collector_number: string;
  lang: string;
  finishes?: string[];
  games?: string[];
  digital?: boolean;
  prices?: {
    eur?: string | null;
    eur_foil?: string | null;
  };
};

type ScryfallPage = {
  data: ScryfallCard[];
  has_more?: boolean;
  next_page?: string | null;
};

const cleanSkuPart = (value: string, limit: number) =>
  value.replace(/[^a-z0-9]+/gi, "-").replace(/^-|-$/g, "").slice(0, limit);

function positiveCents(value: number | string | null | undefined) {
  return positiveEuroCents(value);
}

function firstEuroPrice(...values: Array<number | undefined>) {
  for (const value of values) {
    const cents = positiveCents(value);
    if (cents > 0) return cents;
  }
  return 0;
}

function cardmarketPrice(prices: CardmarketPrices | undefined, finish: string) {
  if (prices?.unit && prices.unit !== "EUR") return 0;
  if (/holo|reverse/i.test(finish)) {
    return firstEuroPrice(
      prices?.["trend-holo"],
      prices?.["avg7-holo"],
      prices?.["avg30-holo"],
      prices?.["avg-holo"],
      prices?.["low-holo"],
      prices?.trend,
      prices?.avg7,
      prices?.avg30,
      prices?.avg,
      prices?.low,
    );
  }
  return firstEuroPrice(
    prices?.trend,
    prices?.avg7,
    prices?.avg30,
    prices?.avg,
    prices?.low,
    prices?.["trend-holo"],
    prices?.["avg-holo"],
  );
}

function titleCase(value: string) {
  return value
    .replace(/[-_]+/g, " ")
    .replace(/\b\w/g, letter => letter.toUpperCase());
}

function tcgdexSku(cardId: string, key: string) {
  return `PKM-${cleanSkuPart(cardId, 42)}-${cleanSkuPart(key, 24)}`
    .toUpperCase()
    .slice(0, 80);
}

function tcgdexLegacyFinishes(card: TcgdexCard) {
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

async function tcgdexPrices(cardId: string, variants: ManagedVariant[]) {
  const target = new URL(`/v2/en/cards/${encodeURIComponent(cardId)}`, "https://api.tcgdex.net");
  const response = await fetch(target, {
    headers: {
      Accept: "application/json",
      "User-Agent": "TCGHaven/1.0 (info@tcghaven.com)",
    },
    signal: AbortSignal.timeout(15_000),
  });
  if (!response.ok) throw new Error(`TCGdex returned ${response.status}.`);
  const card = await response.json() as TcgdexCard;
  const bySku = new Map<string, number>();

  for (const [index, variant] of (card.variants_detailed ?? []).entries()) {
    const label = [
      titleCase(variant.type || "Standard"),
      variant.subtype ? titleCase(variant.subtype) : "",
      ...(variant.stamp ?? []).map(titleCase),
    ].filter(Boolean).join(" · ");
    const key = variant.variantId ?? `${variant.type}-${index}`;
    const price = cardmarketPrice(
      variant.pricing?.cardmarket ?? card.pricing?.cardmarket,
      variant.type,
    );
    if (price > 0) bySku.set(tcgdexSku(card.id, key), price);
    if (price > 0) bySku.set(`finish:${normalizedCatalogLabel(label)}`, price);
  }

  for (const [index, finish] of tcgdexLegacyFinishes(card).entries()) {
    const price = cardmarketPrice(card.pricing?.cardmarket, finish);
    if (price > 0) bySku.set(tcgdexSku(card.id, finish), price);
    if (price > 0) bySku.set(tcgdexSku(card.id, `${finish}-${index}`), price);
    if (price > 0) bySku.set(`finish:${normalizedCatalogLabel(finish)}`, price);
  }

  return new Map(
    variants.flatMap(variant => {
      const price = bySku.get(variant.sku) ??
        bySku.get(`finish:${normalizedCatalogLabel(variant.finish ?? "")}`) ?? 0;
      return price > 0 ? [[variant.id, price] as const] : [];
    }),
  );
}

function scryfallSku(card: ScryfallCard, finish: string) {
  return [
    "MTG",
    cleanSkuPart(card.set, 8),
    cleanSkuPart(card.collector_number, 18),
    cleanSkuPart(card.lang, 5),
    cleanSkuPart(finish, 8),
    card.id.replace(/-/g, ""),
  ].join("-").toUpperCase().slice(0, 80);
}

function scryfallFinishPrice(card: ScryfallCard, finish: string) {
  if (finish === "foil" || finish === "etched") {
    return positiveCents(card.prices?.eur_foil) || positiveCents(card.prices?.eur);
  }
  return positiveCents(card.prices?.eur) || positiveCents(card.prices?.eur_foil);
}

async function scryfallPrices(oracleId: string, variants: ManagedVariant[]) {
  let nextUrl: string | null = `https://api.scryfall.com/cards/search?q=${encodeURIComponent(`oracleid:${oracleId} game:paper`)}&unique=prints&order=released&dir=asc`;
  const bySku = new Map<string, number>();
  let requests = 0;

  while (nextUrl) {
    const target = new URL(nextUrl);
    if (target.protocol !== "https:" || target.hostname !== "api.scryfall.com") {
      throw new Error("Unexpected Scryfall API address.");
    }
    const response = await fetch(target, {
      headers: {
        Accept: "application/json;q=0.9,*/*;q=0.8",
        "User-Agent": "TCGHaven/1.0 (info@tcghaven.com)",
      },
      signal: AbortSignal.timeout(15_000),
    });
    if (!response.ok) throw new Error(`Scryfall returned ${response.status}.`);
    const page = await response.json() as ScryfallPage;
    for (const card of page.data.filter(card => !card.digital && card.games?.includes("paper"))) {
      const finishes = card.finishes?.filter(finish =>
        finish === "nonfoil" || finish === "foil" || finish === "etched"
      ) ?? ["nonfoil"];
      for (const finish of finishes) {
        const price = scryfallFinishPrice(card, finish);
        if (price > 0) bySku.set(scryfallSku(card, finish), price);
      }
    }
    nextUrl = page.has_more && page.next_page ? page.next_page : null;
    requests += 1;
    if (requests >= 20 && nextUrl) throw new Error("Scryfall returned too many pages.");
    if (nextUrl) await new Promise(resolve => setTimeout(resolve, 125));
  }

  return new Map(
    variants.flatMap(variant => {
      const price = bySku.get(variant.sku) ?? 0;
      return price > 0 ? [[variant.id, price] as const] : [];
    }),
  );
}

async function yugiohPrices(sourceCardId: number, variants: ManagedVariant[]) {
  const target = new URL("https://db.ygoprodeck.com/api/v7/cardinfo.php");
  target.searchParams.set("id", String(sourceCardId));
  const response = await fetch(target, {
    headers: {
      Accept: "application/json",
      "User-Agent": "TCGHaven/1.0 (info@tcghaven.com)",
    },
    signal: AbortSignal.timeout(15_000),
  });
  if (!response.ok) throw new Error(`YGOPRODeck returned ${response.status}.`);
  const payload = await response.json() as { data?: YgoprodeckPriceCard[] };
  const card = payload.data?.find(candidate => candidate.id === sourceCardId);
  if (!card) throw new Error("YGOPRODeck did not return the requested card.");
  return matchYgoprodeckPrices(card, variants);
}

export async function POST(event: APIEvent) {
  const guard = await requireAdmin(event);
  if (guard.response) return guard.response;

  try {
    if (
      await checkRateLimit({
        event,
        namespace: "admin-api-price-refresh",
        identity: guard.session!.user.id,
        limit: 6,
        windowMs: 60 * 1000,
      })
    ) {
      return apiJson(
        { error: "Too many price refreshes. Wait a minute and try again." },
        { status: 429 },
      );
    }

    const input = refreshSchema.parse(await event.request.json());
    if (new Set(input.variantIds).size !== input.variantIds.length) {
      return apiJson({ error: "The selection contains duplicate products." }, { status: 400 });
    }

    const selected = await db
      .select({ id: productVariants.id, productId: productVariants.productId })
      .from(productVariants)
      .where(inArray(productVariants.id, input.variantIds));
    if (selected.length !== input.variantIds.length) {
      return apiJson(
        { error: "One or more selected products no longer exist. Refresh and try again." },
        { status: 409 },
      );
    }

    const productIds = [...new Set(selected.map(row => row.productId))];
    if (!isWithinApiRefreshProductLimit(productIds.length)) {
      return apiJson(
        { error: `Refresh API prices for no more than ${MAX_API_PRICE_REFRESH_PRODUCTS} products at a time.` },
        { status: 400 },
      );
    }

    const [productRows, variantRows] = await Promise.all([
      db
        .select({ id: products.id, name: products.name, metadata: products.metadata })
        .from(products)
        .where(inArray(products.id, productIds)),
      db
        .select({
          id: productVariants.id,
          productId: productVariants.productId,
          sku: productVariants.sku,
          name: productVariants.name,
          finish: productVariants.finish,
          priceCents: productVariants.priceCents,
        })
        .from(productVariants)
        .where(inArray(productVariants.productId, productIds)),
    ]);

    const updates = new Map<string, number>();
    const failedProducts: string[] = [];
    const failedProductIds = new Set<string>();
    const unsupportedProducts: string[] = [];
    const unsupportedProductIds = new Set<string>();
    const variantsByProduct = new Map<string, ManagedVariant[]>();
    for (const variant of variantRows) {
      const rows = variantsByProduct.get(variant.productId) ?? [];
      rows.push(variant);
      variantsByProduct.set(variant.productId, rows);
    }

    for (const product of productRows) {
      const metadata = product.metadata ?? {};
      const source = typeof metadata.source === "string" ? metadata.source : "";
      const variants = variantsByProduct.get(product.id) ?? [];
      try {
        let prices = new Map<string, number>();
        if (source === "ygoprodeck" && typeof metadata.sourceCardId === "number") {
          prices = await yugiohPrices(metadata.sourceCardId, variants);
        } else if (source === "tcgdex" && typeof metadata.sourceCardId === "string") {
          prices = await tcgdexPrices(metadata.sourceCardId, variants);
        } else if (source === "scryfall" && typeof metadata.oracleId === "string") {
          prices = await scryfallPrices(metadata.oracleId, variants);
        } else {
          unsupportedProducts.push(product.name);
          unsupportedProductIds.add(product.id);
          continue;
        }
        for (const [variantId, price] of prices) updates.set(variantId, price);
        if (source === "ygoprodeck" || source === "tcgdex" || source === "scryfall") {
          await new Promise(resolve => setTimeout(resolve, 125));
        }
      } catch (error) {
        console.error(`Price refresh failed for ${product.name}`, error);
        failedProducts.push(product.name);
        failedProductIds.add(product.id);
      }
    }

    const updatedProductIds = new Set<string>();
    let changedVariants = 0;
    await db.transaction(async tx => {
      for (const variant of variantRows) {
        const price = refreshedPriceOrCurrent(
          variant.priceCents,
          updates.get(variant.id),
        );
        if (price === variant.priceCents) continue;
        await tx
          .update(productVariants)
          .set({ priceCents: price })
          .where(eq(productVariants.id, variant.id));
        updatedProductIds.add(variant.productId);
        changedVariants += 1;
      }

      const refreshedAt = new Date().toISOString();
      for (const product of productRows) {
        if (unsupportedProductIds.has(product.id) || failedProductIds.has(product.id)) continue;
        const variants = variantsByProduct.get(product.id) ?? [];
        const pricesNeedingReview = variants.filter(variant =>
          (updates.get(variant.id) ?? variant.priceCents) <= 0
        ).length;
        await tx
          .update(products)
          .set({
            metadata: {
              ...(product.metadata ?? {}),
              priceNeedsReview: pricesNeedingReview > 0,
              pricesNeedingReview,
              priceRefreshedAt: refreshedAt,
            },
          })
          .where(eq(products.id, product.id));
      }
    });

    await writeAuditLog({
      event,
      actorId: guard.session!.user.id,
      action: "catalogue.api_prices_refreshed",
      entityType: "product",
      summary: `${changedVariants} variant prices changed from ${updates.size} matched API prices across ${productIds.length} selected products.`,
      metadata: {
        productIds,
        matchedVariants: updates.size,
        changedVariants,
        updatedProducts: updatedProductIds.size,
        unsupportedProducts,
        failedProducts,
      },
    });

    return apiJson({
      matchedVariants: updates.size,
      changedVariants,
      updatedProducts: updatedProductIds.size,
      checkedProducts: productIds.length,
      unsupportedProducts: unsupportedProducts.length,
      failedProducts: failedProducts.length,
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return apiJson({ error: "Select valid catalogue products to refresh." }, { status: 400 });
    }
    console.error("Catalogue API price refresh failed", error);
    return apiJson({ error: "API prices could not be refreshed." }, { status: 500 });
  }
}
