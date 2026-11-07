import { referenceJson, ReferenceError } from "./reference-cache.server";
import { onePieceProducts, grandArchiveProducts, vanguardProducts, channel3Products, list, object, text, type ReferenceProduct } from "./reference-products";

export const REFERENCE_PROVIDERS = ["onepiece", "grandarchive", "vanguard", "channel3"] as const;
export type ReferenceProvider = (typeof REFERENCE_PROVIDERS)[number];
export type ReferenceQuery = { q: string; by: "card" | "set"; page: number; family: "sets" | "decks" | "promos"; kind: string; game: string };
export function providerKey(provider: ReferenceProvider) {
  const name = provider === "vanguard" ? "POKEWALLET_API_KEY" : provider === "channel3" ? "CHANNEL3_API_KEY" : null;
  if (!name) return undefined;
  const key = process.env[name]?.trim();
  if (!key || key.length > 512) throw new ReferenceError(`Add ${name} to the server environment to enable this library.`, 503);
  return key;
}
const searchKey = (value: string) => value.toLowerCase().replace(/[^\p{L}\p{N}]/gu, "");
function matchSet(rows: Array<{ code: string; name: string; id: string }>, q: string) {
  const query = searchKey(q);
  const exact = rows.find(row => searchKey(row.code) === query || searchKey(row.id) === query || searchKey(row.name) === query);
  if (exact) return exact;
  const matches = rows.filter(row => searchKey(row.name).includes(query) || searchKey(row.code).includes(query));
  if (matches.length === 1) return matches[0];
  if (matches.length > 1) throw new ReferenceError(`Choose an exact set code: ${matches.slice(0, 8).map(row => `${row.code} (${row.name})`).join(", ")}`, 400);
  return undefined;
}

export async function searchReferenceProvider(provider: ReferenceProvider, query: ReferenceQuery): Promise<{ cards: ReferenceProduct[]; matchedSets: string[]; hasMore: boolean }> {
  const key = providerKey(provider);
  if (provider === "onepiece") {
    const api = "https://optcgapi.com/api";
    let raw: unknown;
    if (query.by === "set" && query.family !== "promos") {
      const sets = await referenceJson(provider, `${api}/${query.family === "decks" ? "allDecks" : "allSets"}/`);
      const selected = matchSet(list(sets).map(row => ({ code: text(row.set_id ?? row.st_id), id: text(row.set_id ?? row.st_id), name: text(row.set_name ?? row.st_name) })), query.q);
      if (!selected) return { cards: [], matchedSets: [], hasMore: false };
      raw = await referenceJson(provider, `${api}/${query.family}/${encodeURIComponent(selected.id)}/`);
    } else raw = await referenceJson(provider, `${api}/${query.family === "decks" ? "allSTCards" : query.family === "promos" ? "allPromoCards" : "allSetCards"}/`);
    const normalized = onePieceProducts(raw, query.family);
    const cards = query.by === "set" && query.family !== "promos" ? normalized : normalized.filter(card => [card.name, card.number, card.setName, card.setCode].some(value => searchKey(value).includes(searchKey(query.q))));
    const offset = (query.page - 1) * 100;
    return { cards: cards.slice(offset, offset + 100), matchedSets: [...new Set(cards.map(card => card.setName))].slice(0, 20), hasMore: cards.length > offset + 100 };
  }
  if (provider === "grandarchive") {
    const definitions = await referenceJson(provider, "https://api.gatcg.com/option/search");
    const params = new URLSearchParams({ page: String(query.page), page_size: "20", separate_editions: "true" });
    if (query.by === "set") {
      const sets = list(object(definitions).set).map(row => ({ code: text(row.value), id: text(row.value), name: text(row.text) }));
      const set = matchSet(sets, query.q); if (!set) return { cards: [], matchedSets: [], hasMore: false };
      params.set("prefix", set.id);
    } else params.set("name", query.q);
    const data = await referenceJson(provider, `https://api.gatcg.com/cards/search?${params}`);
    const cards = grandArchiveProducts(data, definitions);
    return { cards, matchedSets: [...new Set(cards.map(card => card.setName))], hasMore: object(data).has_more === true };
  }
  if (provider === "vanguard") {
    const api = "https://api.pokewallet.io/cfv"; let target: string;
    if (query.by === "set") {
      const data = await referenceJson(provider, `${api}/sets`, { key });
      const sets = list(object(data).data).map(row => ({ code: text(row.set_code), name: text(row.name), id: text(row.set_id) }));
      // IDs are unique; codes can be shared by multiple printings.
      const exactIds = sets.filter(row => row.id === query.q);
      const codeMatches = sets.filter(row => searchKey(row.code) === searchKey(query.q));
      if (!exactIds.length && codeMatches.length > 1) throw new ReferenceError(`That set code has several editions. Search by its set ID: ${codeMatches.map(row => `${row.id} (${row.name})`).slice(0, 8).join(", ")}`, 400);
      const set = exactIds[0] ?? matchSet(sets, query.q); if (!set) return { cards: [], matchedSets: [], hasMore: false };
      target = `${api}/sets/${encodeURIComponent(set.id)}?page=${query.page}&limit=100`;
    } else target = `${api}/search?${new URLSearchParams({ q: query.q, page: String(query.page), limit: "100" })}`;
    const data = await referenceJson(provider, target, { key }); const cards = vanguardProducts(data);
    return { cards, matchedSets: [...new Set(cards.map(card => card.setName))], hasMore: Number(object(object(data).pagination).total_pages) > query.page };
  }
  if (query.page > 1) throw new ReferenceError("Narrow this product search to see different results.", 400);
  const data = await referenceJson(provider, "https://api.trychannel3.com/v1/search", { key, body: { query: query.q, limit: 30, config: { country: "NL", currency: "EUR", language: "en" } } });
  return { cards: channel3Products(data, query.kind, query.game), matchedSets: [], hasMore: false };
}

export async function vanguardArtwork(id: string) {
  return await referenceJson("vanguard", `https://api.pokewallet.io/cfv/images/${encodeURIComponent(id)}`, { key: providerKey("vanguard"), binary: true }) as string | null;
}
