export const MAX_API_PRICE_REFRESH_PRODUCTS = 20;

export type PriceRefreshVariant = {
  id: string;
  sku: string;
  name: string;
};

export type YgoprodeckPriceCard = {
  id: number;
  card_sets?: Array<{
    set_name: string;
    set_code: string;
    set_rarity: string;
    set_price?: string;
  }>;
  card_prices?: Array<{ cardmarket_price?: string }>;
};

export function positiveEuroCents(value: number | string | null | undefined) {
  const amount = Number(value);
  return Number.isFinite(amount) && amount > 0 ? Math.round(amount * 100) : 0;
}

export function normalizedCatalogLabel(value: string) {
  return value.trim().toLocaleLowerCase("en-US").replace(/\s+/g, " ");
}

function cleanSkuPart(value: string, limit: number) {
  return value.replace(/[^a-z0-9]+/gi, "-").replace(/^-|-$/g, "").slice(0, limit);
}

function yugiohSku(cardId: number, setCode: string, rarity: string) {
  const code = cleanSkuPart(setCode, 24);
  const finish = cleanSkuPart(rarity, 24) || "STD";
  return `YGO-${cardId}-${code}-${finish}`.slice(0, 80).toUpperCase();
}

export function matchYgoprodeckPrices(
  card: YgoprodeckPriceCard,
  variants: PriceRefreshVariant[],
) {
  const fallback = positiveEuroCents(card.card_prices?.[0]?.cardmarket_price);
  const bySku = new Map<string, number>();
  const byName = new Map<string, number>();

  for (const printing of card.card_sets ?? []) {
    const price = positiveEuroCents(printing.set_price) || fallback;
    if (price <= 0) continue;
    bySku.set(yugiohSku(card.id, printing.set_code, printing.set_rarity), price);
    byName.set(
      normalizedCatalogLabel(`${printing.set_name} · ${printing.set_rarity}`),
      price,
    );
  }

  return new Map(
    variants.flatMap(variant => {
      // Duplicate SKUs receive a numeric suffix during import. The name match
      // remains a safe fallback for those historical collisions.
      const directSku = variant.sku.replace(/-\d+$/, "");
      const price = bySku.get(variant.sku) ??
        bySku.get(directSku) ??
        byName.get(normalizedCatalogLabel(variant.name)) ??
        0;
      return price > 0 ? [[variant.id, price] as const] : [];
    }),
  );
}

export function refreshedPriceOrCurrent(
  currentPriceCents: number,
  candidatePriceCents: number | null | undefined,
) {
  return candidatePriceCents && candidatePriceCents > 0
    ? candidatePriceCents
    : currentPriceCents;
}

export function isWithinApiRefreshProductLimit(productCount: number) {
  return Number.isInteger(productCount) &&
    productCount > 0 &&
    productCount <= MAX_API_PRICE_REFRESH_PRODUCTS;
}
