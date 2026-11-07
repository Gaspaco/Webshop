import type { ShopProduct, ShopVariant } from "./categories";
import { productPreviewVariant } from "./product-preview";
import { isTcgType } from "./product-types";

export type ProductSet = { name: string; code?: string };
export type ProductSetSource = { set?: string; setCode?: string; catalogSource?: string; game?: string | null; productType?: string | null; variants?: Array<Pick<ShopVariant, "name" | "attributes">> };
export function setSlug(value: string) { return value.normalize("NFKD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, ""); }
export function variantSet(product: ProductSetSource, variant: Pick<ShopVariant, "name" | "attributes">): ProductSet | undefined {
  const explicit = variant.attributes?.setName?.trim();
  if (explicit) return { name: explicit, code: variant.attributes?.setCode };
  const code = variant.attributes?.setCode?.trim();
  if (code) return { name: product.setCode?.trim().toLowerCase() === code.toLowerCase() && product.set ? product.set.trim() : code, code };
  // Earlier library imports encoded the actual printing set in the variant name.
  // Restrict this fallback to known provider formats, not custom colour/size names.
  if (["yugipedia", "ygoprodeck", "scryfall", "digimoncard"].includes(product.catalogSource ?? "") && variant.name.includes("·")) {
    const name = variant.name.split("·")[0].trim();
    if (name && !/^(default|unspecified)/i.test(name)) return { name };
  }
  return undefined;
}
export function productSets(product: ProductSetSource): ProductSet[] {
  if (product.productType && !isTcgType(product.productType)) return [];
  const values: ProductSet[] = [];
  if (product.set?.trim()) values.push({ name: product.set.trim(), code: product.setCode });
  else if (product.setCode?.trim()) values.push({ name: product.setCode.trim(), code: product.setCode.trim() });
  values.push(...(product.variants ?? []).map(variant => variantSet(product, variant)).filter((value): value is ProductSet => !!value));
  const result = new Map<string, ProductSet>();
  for (const value of values) if (setSlug(value.name)) {
    const key = setSlug(value.name); const old = result.get(key);
    result.set(key, { name: old?.name ?? value.name, code: old?.code || value.code });
  }
  return [...result.values()];
}
export function productBelongsToSet(product: ProductSetSource, path: string) { return productSets(product).some(set => setSlug(set.name) === path); }
export function setFilterOptions(products: ProductSetSource[], game?: string) {
  const options = new Map<string, { value: string; name: string; game: string; code?: string; count: number }>();
  for (const product of products) {
    if (!product.game || (game && product.game !== game)) continue;
    for (const set of productSets(product)) {
      const value = `${product.game}:${setSlug(set.name)}`;
      const previous = options.get(value);
      options.set(value, { value, name: previous?.name ?? set.name, game: product.game, code: previous?.code || set.code, count: (previous?.count ?? 0) + 1 });
    }
  }
  return [...options.values()].sort((a, b) => a.name.localeCompare(b.name) || a.game.localeCompare(b.game));
}
export function matchesSetFilter(product: ProductSetSource, value: string) {
  if (!value) return true;
  const colon = value.indexOf(":");
  return colon > 0 && product.game === value.slice(0, colon) && productBelongsToSet(product, value.slice(colon + 1));
}
export function productForSet(product: ShopProduct, path: string): ShopProduct {
  const printing = productSets(product).find(set => setSlug(set.name) === path);
  const variants = product.variants?.filter(variant => {
    const set = variantSet(product, variant); return set ? setSlug(set.name) === path : setSlug(product.set || product.setCode || "") === path;
  });
  if (!variants?.length) return product;
  const main = productPreviewVariant(variants);
  return { ...product, set: printing?.name ?? product.set, setCode: printing?.code ?? product.setCode,
    variants, variantId: main?.id, sku: main?.sku, priceCents: main?.priceCents,
    condition: main?.condition ?? product.condition, language: main?.language ?? product.language, finish: main?.finish ?? product.finish,
    image: main?.image || product.image, stock: variants.reduce((total, variant) => total + variant.stock, 0),
    href: main ? `${product.href.split("?")[0]}?variant=${encodeURIComponent(main.id)}` : product.href };
}
