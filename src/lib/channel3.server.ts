import { CHANNEL3_CATEGORIES, channel3LookupUrl, type Channel3Filters, type Channel3Option } from "./channel3";
import { referenceJson, readReference, referenceKey, storeReferences, storeReference, ReferenceError } from "./reference-cache.server";
import { channel3Products, list, object, text } from "./reference-products";

const API = "https://api.trychannel3.com/v1";
const PAGE_TTL = 5 * 60_000;
const optionKey = (type: string, id: string) => referenceKey("channel3", ["option", type, id]);

export async function channel3Options(type: "brand" | "category", q: string, key: string) {
  const data = object(await referenceJson("channel3", `${API}/${type === "brand" ? "brands" : "categories"}/search?${new URLSearchParams({ query: q, limit: "10" })}`, { key }));
  const options: Channel3Option[] = list(data[type === "brand" ? "brands" : "categories"]).flatMap(row => {
    const id = text(type === "brand" ? row.id : row.slug, 160);
    const label = text(type === "brand" ? row.name : row.title, 160);
    return id && label ? [{ id, label, detail: type === "category" ? list(row.path).map(p => text(p.title)).join(" / ").slice(0, 300) : undefined }] : [];
  });
  await storeReferences(options.map(option => ({ key: optionKey(type, option.id), payload: option })), 30 * 86400_000);
  return options;
}

async function selectedOption(type: "brand" | "category", id: string) {
  const option = await readReference<Channel3Option>(optionKey(type, id));
  if (!option) throw new ReferenceError(`Find and select the ${type} again before searching.`, 400);
  return option;
}

type Query = Channel3Filters & { q: string; kind: string; game: string; page: number };
export async function searchChannel3(query: Query, key: string) {
  const context = { q: query.q, kind: query.kind, game: query.game, brand: query.brandId ?? "", category: query.categoryId ?? "", mode: query.mode ?? "keyword", country: query.country ?? "all" };
  let brands: Channel3Option[] = [];
  if (query.brandId) {
    const brand = await selectedOption("brand", query.brandId);
    if (query.kind === "funko" && !/^funko(?: inc\.?)?$/i.test(brand.label)) throw new ReferenceError("Choose a Funko brand, or change the product type to other figurines.", 400);
    brands = [brand];
  } else if (query.kind === "funko") {
    brands = (await channel3Options("brand", "Funko", key)).filter(row => /^funko(?: inc\.?)?$/i.test(row.label));
    if (!brands.length) throw new ReferenceError("Channel3 could not resolve the Funko brand. Try a product link instead.", 400);
  }
  let body: Record<string, unknown>;
  if (query.page > 1) {
    const previous = await readReference<{ token: string }>(referenceKey("channel3", ["page-v2", context, query.page]));
    if (!previous) throw new ReferenceError("These results have expired or the filters changed. Run the search again.", 400);
    body = { page_token: previous.token, limit: 30 };
  } else {
    const filters: { brand_ids?: string[]; category_ids?: string[] } = {};
    if (brands.length) filters.brand_ids = brands.map(row => row.id);
    if (query.categoryId) filters.category_ids = [(await selectedOption("category", query.categoryId)).id];
    else {
      const expected = CHANNEL3_CATEGORIES[query.kind];
      if (!expected) throw new ReferenceError("Choose a product type.", 400);
      const category = (await channel3Options("category", expected.query, key)).find(row => row.id === expected.slug);
      if (!category) throw new ReferenceError("Channel3 could not resolve this toy/card category. Find and select a catalogue category, or use a product link.", 400);
      filters.category_ids = [category.id];
    }
    body = { query: query.q, limit: 30, filters, config: { mode: context.mode, currency: "EUR", language: "en", ...(context.country === "NL" ? { country: "NL" } : {}) } };
  }
  const data = object(await referenceJson("channel3", `${API}/search`, { key, body, ttlMs: PAGE_TTL }));
  const token = typeof data.next_page_token === "string" && data.next_page_token.length <= 16000 ? data.next_page_token : "";
  if (token && query.page < 200) await storeReference(referenceKey("channel3", ["page-v2", context, query.page + 1]), { token }, PAGE_TTL);
  // Do not display a different brand as Funko if the provider relaxes its filter.
  const products = list(data.products).filter(product => !brands.length || list(object(product).brands).some(candidate =>
    brands.some(brand => text(candidate.id) === brand.id || text(candidate.name).toLowerCase() === brand.label.toLowerCase())));
  return { cards: channel3Products({ products }, query.kind, query.game), matchedSets: [], hasMore: Boolean(token) && query.page < 200 };
}

export async function lookupChannel3(url: string, kind: string, game: string, key: string) {
  const safeUrl = channel3LookupUrl(url);
  if (!safeUrl) throw new ReferenceError("Paste a public HTTPS product link without a password, fragment or custom port.", 400);
  const result = object(await referenceJson("channel3", `${API}/lookup`, { key, body: { url: safeUrl }, ttlMs: 3 * 3600_000 }));
  const cards = channel3Products({ products: [result.product] }, kind, game);
  if (!cards.length) throw new ReferenceError("Channel3 could not read a product from this link. Try its direct product page, or add the item manually.", 400);
  return cards;
}
