import type { ProductAttributes, ProductType } from "./product-types";

export type ReferenceVariant = { name: string; finish: string; language: string; image: string | null; priceCents: number; attributes?: ProductAttributes };
export type ReferenceProduct = {
  id: string; name: string; setName: string; setCode: string; number: string; typeLine: string; rarity: string;
  image: string | null; referencePriceLabel: string; description: string; brand: string; game: string | null;
  productType: ProductType; attributes: ProductAttributes; variants: ReferenceVariant[];
};
export const MERCHANDISE_KINDS = [
  { value: "funko", label: "Funko Pops", query: "Funko Pop", type: "figurine" },
  { value: "figures", label: "Bandai and other figurines", query: "Bandai figure", type: "figurine" },
  { value: "beyblade", label: "Beyblades", query: "Beyblade", type: "collectible" },
  { value: "plush", label: "Plushies", query: "plush toy", type: "merchandise" },
  { value: "tcg", label: "Trading cards (review game and printing)", query: "trading card", type: "single" },
] as const;
export const object = (value: unknown): Record<string, any> => value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, any> : {};
export const list = (value: unknown): any[] => Array.isArray(value) ? value : [];
export const text = (value: unknown, max = 160) => typeof value === "string" || typeof value === "number" ? String(value).replace(/<[^>]*>/g, " ").replace(/[\x00-\x08\x0b\x0c\x0e-\x1f]/g, "").trim().slice(0, max) : "";
export function remoteImage(value: unknown, base?: string) {
  if (!text(value, 2000)) return null;
  try { const url = new URL(text(value, 2000), base); return url.protocol === "https:" && !url.username && !url.password && !url.port ? url.href : null; } catch { return null; }
}
const base = (): ReferenceProduct => ({ id: "", name: "", setName: "", setCode: "", number: "", typeLine: "", rarity: "", image: null,
  referencePriceLabel: "No EUR reference price. Review before publishing.", description: "", brand: "", game: null, productType: "single", attributes: {}, variants: [] });
const option = (name: string, image: string | null, finish = "", language = "English", priceCents = 0): ReferenceVariant => ({ name, image, finish, language, priceCents });

export function onePieceProducts(data: unknown, family = "sets"): ReferenceProduct[] {
  return list(data).flatMap(value => {
    const row = object(value); const id = text(row.card_image_id || row.card_set_id, 120); const name = text(row.card_name, 140);
    if (!id || !name) return [];
    const image = remoteImage(row.card_image); const setCode = text(row.set_id ?? row.st_id, 60); const rarity = text(row.rarity, 80);
    return [{ ...base(), id: `${family}:${setCode}:${id}`, name, image, game: "onepiece", brand: "Bandai", setName: text(row.set_name ?? row.st_name, 120), setCode,
      number: text(row.card_set_id, 60), rarity, typeLine: text(row.card_type), attributes: { cardType: text(row.card_type) },
      description: text(row.card_text, 2400), referencePriceLabel: Number.isFinite(row.market_price) ? `USD $${Number(row.market_price).toFixed(2)} reference only; EUR price needs review.` : base().referencePriceLabel,
      variants: [option(name, image, rarity)] }];
  });
}

export function grandArchiveProducts(data: unknown, definitions: unknown): ReferenceProduct[] {
  const rarityMap = new Map(list(object(definitions).rarity).map(row => [String(row.value), text(row.text)]));
  return list(object(data).data).flatMap(value => {
    const card = object(value);
    return list(card.result_editions ?? card.editions).filter(edition => object(edition).orientation !== "back").flatMap(value => {
      const edition = object(value); const set = object(edition.set); const id = text(edition.uuid, 120); const name = text(card.name, 140);
      if (!id || !name) return [];
      const image = remoteImage(edition.image, "https://api.gatcg.com");
      const circulations = [...list(edition.circulations), ...list(edition.circulationTemplates)];
      const variants: ReferenceVariant[] = [...new Set(circulations.map(row => row.foil === true ? "Foil" : "Non-foil"))].map(finish => option(finish, image, finish, set.language === "CN" ? "Chinese" : "English"));
      for (const circulation of circulations) for (const variant of list(circulation.variants)) {
        const image = remoteImage(variant.image, "https://api.gatcg.com");
        if (image) variants.push(option(text(variant.description, 120) || text(variant.uuid), image, text(variant.kind), set.language === "CN" ? "Chinese" : "English"));
      }
      return [{ ...base(), id, name, image, game: "grandarchive", brand: "Weebs of the Shore", setName: text(set.name, 120), setCode: text(set.prefix, 60),
        number: text(edition.collector_number, 60), rarity: rarityMap.get(String(edition.rarity)) || text(edition.rarity), typeLine: list(card.types).map(type => text(type)).join(" / ").slice(0, 160),
        attributes: { cardType: list(card.types).map(type => text(type)).join(" / ").slice(0, 160) }, description: text(edition.effect_raw || card.effect_raw, 2400),
        variants: variants.length ? variants.slice(0, 50) : [option("Default", image, "", set.language === "CN" ? "Chinese" : "English")] }];
    });
  });
}

export function vanguardProducts(data: unknown): ReferenceProduct[] {
  const body = object(data); const rows = Array.isArray(data) ? data : body.results ?? body.cards ?? (body.card_info ? [body] : []);
  return list(rows).flatMap(value => {
    const row = object(value); const card = object(row.card_info); const id = text(row.id, 180); const name = text(card.name, 140);
    if (!id || !name || card.product_type === "sealed") return [];
    const priceRows = list(object(row.cardmarket).prices);
    const finishes: string[] = [...new Map([...list(card.variants).map(value => text(value, 60)), ...priceRows.map(price => text(price.variant_type, 60))]
      .filter(Boolean).map(finish => [finish.toLowerCase(), finish])).values()];
    const variants = (finishes.length ? finishes : ["Normal"]).map(finish => {
      const reference = priceRows.find(price => text(price.variant_type).toLowerCase() === finish.toLowerCase());
      const cents = Number(reference?.trend ?? reference?.avg ?? 0) * 100;
      return option(finish, null, finish, "English", Number.isFinite(cents) && cents > 0 && cents <= 100_000_000 ? Math.round(cents) : 0);
    });
    return [{ ...base(), id, name, game: "vanguard", brand: "Bushiroad", setName: text(card.set_name, 120), setCode: text(card.set_code, 60), number: text(card.card_number, 60), rarity: text(card.rarity, 80),
      typeLine: text(card.card_type), attributes: { cardType: text(card.card_type) }, description: text(card.card_text, 2400), variants,
      referencePriceLabel: variants.some(row => row.priceCents > 0) ? "Cardmarket EUR reference prices; review before publishing." : "No EUR reference price. Review before publishing. Images are fetched on import to conserve the API quota." }];
  });
}

export function channel3Products(data: unknown, kind: string, game?: string): ReferenceProduct[] {
  const config = MERCHANDISE_KINDS.find(row => row.value === kind); if (!config) return [];
  return list(object(data).products).flatMap(value => {
    const row = object(value); const id = text(row.id, 160); const name = text(row.title, 140); if (!id || !name) return [];
    const images = list(row.images); const image = remoteImage((images.find(image => image.is_main_image) ?? images[0])?.url);
    const brand = text(list(row.brands)[0]?.name, 120); const attributes = object(row.structured_attributes);
    const values: ProductAttributes = {};
    for (const [source, target] of [["color", "colour"], ["size", "size"], ["material", "material"], ["series", "series"], ["character", "character"], ["scale", "scale"]]) {
      const value = text(list(attributes[source])[0]); if (value) values[target] = value;
    }
    if (kind === "beyblade") values.collectibleType = "Beyblade";
    if (kind === "plush") values.merchandiseType = "Plushie";
    const selected: ProductAttributes = {};
    for (const option of list(object(row.variants).selected)) {
      const key = ({ color: "colour", colour: "colour", size: "size", scale: "scale", edition: "edition" } as Record<string, string>)[text(option.name).toLowerCase()];
      if (key) selected[key] = text(option.label);
    }
    // Do not fabricate the Cartesian product of advertised options: it can create nonexistent SKUs.
    const variant = { ...option(Object.values(selected).join(" / ").slice(0, 120) || "Default", image), attributes: selected };
    const eur = list(row.offers).map(row => object(row.price)).find(row => row.currency === "EUR");
    return [{ ...base(), id, name, image, brand, productType: config.type, game: kind === "tcg" ? game ?? "other" : null, attributes: values,
      setName: "", setCode: "", description: text(row.description, 2400), variants: [variant],
      referencePriceLabel: eur && Number.isFinite(eur.price) ? `Retailer reference €${Number(eur.price).toFixed(2)}. Set your own price and stock.` : "Retail reference only. Set your own EUR price and stock." }];
  });
}
