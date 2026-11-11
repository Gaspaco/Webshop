import { createHash } from "node:crypto";
import { eq, inArray, lt, or, sql } from "drizzle-orm";
import { db } from "~/db";
import { yugipediaCache, yugiohCards, yugiohPrintings } from "~/db/schema";
import { acquireOperationLease, releaseOperationLease } from "./operation-lease.server";
import { isYugipediaImageUrl, parseSetList, parseWikiCard, wikiText, type WikiPage, type WikiPrinting } from "./yugipedia-catalog";
import { isExactCardImageFile, matchYugipediaPrintingFile } from "./yugipedia-match";
import { recentEnglishSets, type RecentYugipediaSet } from "./yugipedia-sets";

const MONTH = 30 * 86400_000;
const API = "https://yugipedia.com/api.php";
const wait = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));
type WikiResponse = {
  error?: { code?: string }; continue?: Record<string, string>;
  query?: { pages?: WikiPage[]; redirects?: Array<{ from: string; to: string }>; normalized?: Array<{ from: string; to: string }>; search?: Array<{ title: string }>; prefixsearch?: Array<{ title: string }>; recentchanges?: Array<{ title: string; timestamp: string }> };
};
type Manifest = { cardIds: number[]; matchedSets: string[]; syncedAt: string; schemaVersion?: number; expectedCards?: number; setSlots?: number; missingCards?: string[]; warnings?: string[]; setListCacheKey?: string; setListUpdatedAt?: string };
export class YugipediaBusyError extends Error {}

function keyFor(namespace: string, value: unknown) {
  return `${namespace}:${createHash("sha256").update(JSON.stringify(value)).digest("hex")}`;
}
async function cached<T>(key: string) {
  const [row] = await db.select().from(yugipediaCache).where(eq(yugipediaCache.key, key)).limit(1);
  return row && row.expiresAt.getTime() > Date.now() ? row.payload as T : null;
}
async function store(key: string, payload: unknown, ttl: number) {
  const values = { key, payload, updatedAt: new Date(), expiresAt: new Date(Date.now() + ttl) };
  await db.insert(yugipediaCache).values(values).onConflictDoUpdate({ target: yugipediaCache.key, set: values });
  // Bound expired rows per operation. The cache contains reference data only.
  const expired = db.select({ key: yugipediaCache.key }).from(yugipediaCache)
    .where(lt(yugipediaCache.expiresAt, new Date(Date.now() - MONTH))).limit(100);
  await db.delete(yugipediaCache).where(inArray(yugipediaCache.key, expired));
}

/** Shared DB lease enforces Yugipedia's <=1 request/second across instances. */
export async function yugipediaRequest(params: Record<string, string>, options: { fresh?: boolean; deadline?: number } = {}): Promise<WikiResponse> {
  const key = keyFor("api-v1", params);
  if (!options.fresh) {
    const value = await cached<WikiResponse>(key);
    if (value) return value;
  }
  const deadline = options.deadline ?? Date.now() + 40_000;
  let token: string | null = null;
  while (Date.now() < deadline - 1000) {
    token = await acquireOperationLease("yugipedia:request", 20_000);
    if (token) break;
    await wait(400);
  }
  if (!token) throw new YugipediaBusyError("Yugipedia is busy. Try again shortly.");
  let cooldown = 1100;
  try {
    const url = new URL(API);
    for (const [key, value] of Object.entries({ format: "json", formatversion: "2", maxlag: "5", ...params })) url.searchParams.set(key, value);
    const response = await fetch(url, {
      headers: { Accept: "application/json", "User-Agent": `TCGHaven card library (${process.env.YUGIPEDIA_CONTACT_EMAIL || "info@tcghaven.com"})` },
      redirect: "error", signal: AbortSignal.timeout(Math.max(1, Math.min(15_000, deadline - Date.now()))),
    });
    if (response.status === 403) {
      cooldown = 300_000;
      throw new YugipediaBusyError("Yugipedia refused access (403). Requests are paused for five minutes. If this continues, contact Yugipedia; refreshing repeatedly will not fix it.");
    }
    if (response.status === 429 || response.status >= 500) {
      cooldown = Math.max(60_000, Math.min(300_000, Number(response.headers.get("retry-after") || 60) * 1000 || 60_000));
      throw new YugipediaBusyError("Yugipedia requested a pause. Try again in a few minutes.");
    }
    if (!response.ok) throw new Error(`Yugipedia request failed (${response.status}).`);
    const reader = response.body!.getReader(); const parts: Uint8Array[] = []; let size = 0;
    for (;;) {
      const { done, value } = await reader.read(); if (done) break;
      size += value.byteLength;
      if (size > 8_000_000) { await reader.cancel(); throw new Error("Yugipedia response exceeded the size limit."); }
      parts.push(value);
    }
    const data = JSON.parse(Buffer.concat(parts).toString("utf8")) as WikiResponse;
    if (data.error) {
      cooldown = data.error.code === "maxlag" ? 60_000 : 1100;
      throw new YugipediaBusyError("Yugipedia could not complete this lookup. Try again shortly.");
    }
    await store(key, data, MONTH);
    return data;
  } finally { await releaseOperationLease("yugipedia:request", token, cooldown); }
}

function batches<T>(items: T[], size = 25) {
  return Array.from({ length: Math.ceil(items.length / size) }, (_, i) => items.slice(i * size, (i + 1) * size));
}

/** One bounded recent-changes request, shared and cached across dashboard users. */
export async function discoverYugipediaSets(): Promise<{ sets: RecentYugipediaSet[]; checkedAt: string }> {
  const key = "yugipedia:recent-sets-v1";
  const existing = await cached<{ sets: RecentYugipediaSet[]; checkedAt: string }>(key);
  if (existing) return existing;
  const token = await acquireOperationLease(key, 55_000);
  if (!token) throw new YugipediaBusyError("New sets are already being checked. Try again shortly.");
  try {
    const response = await yugipediaRequest({
      action: "query", list: "recentchanges", rcnamespace: "3006",
      rctype: "new|edit", rcprop: "title|timestamp", rclimit: "500",
    }, { fresh: true });
    const result = { sets: recentEnglishSets(response.query?.recentchanges ?? []), checkedAt: new Date().toISOString() };
    await store(key, result, 60 * 60_000);
    return result;
  } finally { await releaseOperationLease(key, token); }
}

export async function searchYugipedia(query: string, by: "card" | "set", fresh = false): Promise<Manifest> {
  query = query.trim();
  if (!query) return { cardIds: [], matchedSets: [], syncedAt: new Date().toISOString() };
  if (query.length > 80 || /[\x00-\x1f\x7f|]/.test(query)) throw new Error("Enter a card or set name of up to 80 characters, without pipe characters.");
  const key = keyFor("search-v1", [by, query.toLowerCase()]);
  if (!fresh) {
    const result = await cached<Manifest>(key);
    if (result && (by === "card" || result.schemaVersion === 2)) {
      const [source] = result.setListCacheKey ? await db.select({ updatedAt: yugipediaCache.updatedAt }).from(yugipediaCache).where(eq(yugipediaCache.key, result.setListCacheKey)).limit(1) : [];
      if (!source || (result.setListUpdatedAt && source.updatedAt.getTime() <= Date.parse(result.setListUpdatedAt))) return result;
    }
  }
  // Coalesce duplicate refreshes across all server instances, not just this tab.
  const leaseKey = `yugipedia:${key}`;
  const token = await acquireOperationLease(leaseKey, 55_000);
  if (!token) throw new YugipediaBusyError("This lookup is already refreshing. Try again shortly.");
  const deadline = Date.now() + 45_000;
  try {
    const request = (params: Record<string, string>) => yugipediaRequest(params, { fresh, deadline });
    const pages = async (params: Record<string, string>, maxPages = 4) => {
      const merged = new Map<string, WikiPage>();
      const redirects: Array<{ from: string; to: string }> = [];
      let cursor: Record<string, string> = {};
      for (let i = 0; i < maxPages; i++) {
        const result = await request({ ...params, ...cursor });
        redirects.push(...(result.query?.normalized ?? []), ...(result.query?.redirects ?? []));
        for (const page of result.query?.pages ?? []) {
          const previous = merged.get(page.title);
          merged.set(page.title, { ...previous, ...page, revisions: page.revisions ?? previous?.revisions,
            images: [...new Map([...(previous?.images ?? []), ...(page.images ?? [])].map(image => [image.title, image])).values()] });
        }
        if (!result.continue) return { pages: [...merged.values()], redirects };
        cursor = result.continue;
      }
      throw new YugipediaBusyError("Yugipedia returned too many continuation pages. No complete result was cached; try a smaller lookup.");
    };
    let titles: string[] = [];
    let setName = "";
    let setRows: ReturnType<typeof parseSetList> = [];
    let gallery: string[] = [];
    let setListCacheKey: string | undefined;
    let setListUpdatedAt: string | undefined;
    const warnings: string[] = [];
    if (by === "set") {
      const exact = `Set Card Lists:${query.replace(/^Set Card Lists:/i, "").replace(/\s*\(TCG-EN\)$/i, "")} (TCG-EN)`;
      let setParams = { action: "query", prop: "revisions", rvprop: "content", titles: exact, redirects: "1" };
      let result = await request(setParams);
      let page = result.query?.pages?.find(page => !page.missing && wikiText(page));
      if (!page) {
        const search = await request({ action: "query", list: "search", srnamespace: "3006", srsearch: query, srlimit: "10", srprop: "" });
        titles = (search.query?.search ?? []).map(item => item.title).filter(title => /\(TCG-EN\)$/.test(title));
        // Echo the resolved English set name to the owner with the results.
        const selected = titles.find(title => title.toLowerCase().includes(query.toLowerCase())) ?? titles[0];
        if (selected) {
          setParams = { ...setParams, titles: selected };
          result = await request(setParams);
          page = result.query?.pages?.find(page => !page.missing && wikiText(page));
        }
      }
      if (page) {
        setName = page.title.replace(/^Set Card Lists:/, "").replace(/ \(TCG-EN\)$/, "");
        setRows = parseSetList(wikiText(page), setName);
        setListCacheKey = keyFor("api-v1", setParams);
        const [source] = await db.select({ updatedAt: yugipediaCache.updatedAt }).from(yugipediaCache).where(eq(yugipediaCache.key, setListCacheKey)).limit(1);
        setListUpdatedAt = source?.updatedAt.toISOString();
        titles = [...new Set(setRows.map(row => row.cardName))];
        if (titles.length > 300) throw new Error("This set exceeds the 300-card lookup limit. Search by card name instead.");
      } else titles = [];
    } else {
      const search = await request({ action: "query", list: "prefixsearch", pssearch: query, psnamespace: "0", pslimit: "20" });
      let matches = (search.query?.prefixsearch ?? []).map(item => item.title);
      if (!matches.length) {
        const fallback = await request({ action: "query", list: "search", srsearch: `intitle:${query}`, srnamespace: "0", srlimit: "20", srprop: "" });
        matches = (fallback.query?.search ?? []).map(item => item.title);
      }
      titles = [...new Set([query, ...matches])].slice(0, 20);
    }
    const cards: NonNullable<ReturnType<typeof parseWikiCard>>[] = [];
    const aliases = new Map<string, string>();
    for (const batch of batches(titles)) {
      // Set completeness must not depend on paginated image properties.
      const response = await pages({ action: "query", titles: batch.join("|"), prop: by === "set" ? "revisions" : "revisions|images", rvprop: "content", ...(by === "card" ? { imlimit: "500" } : {}), redirects: "1" });
      for (const redirect of response.redirects) aliases.set(redirect.from, redirect.to);
      for (const page of response.pages) {
        const card = parseWikiCard(page);
        if (!card || (by === "card" && !card.printings.length)) continue;
        cards.push(card);
        if (page.title !== card.name) aliases.set(page.title, card.name);
      }
    }
    let artworkAvailable = true;
    if (by === "set" && setName) {
      try {
        const images = await pages({ action: "query", titles: `Set Card Galleries:${setName} (TCG-EN-1E)|Set Card Galleries:${setName} (TCG-EN-UE)`, prop: "images", imlimit: "500" });
        gallery = images.pages.flatMap(page => (page.images ?? []).map(image => image.title.replace(/^File:/, "")));
      } catch {
        artworkAvailable = false;
        warnings.push("The card list loaded, but Yugipedia scans were unavailable. Existing photos are preserved; missing artwork can be uploaded manually.");
      }
    }
    const canonical = (name: string) => { for (let i = 0; i < 5 && aliases.has(name); i++) name = aliases.get(name)!; return name; };
    const missingCards = by === "set" ? titles.filter(title => !cards.some(card => canonical(title) === canonical(card.name))) : [];
    const candidates = new Map<number, { card: (typeof cards)[number]; printings: WikiPrinting[]; files: Map<string, string> }>();
    const allFiles = new Set<string>();
    for (const card of cards) {
      const printings = by === "set" ? setRows.filter(row => canonical(row.cardName) === canonical(card.name)) : card.printings;
      const files = new Map<string, string>();
      const cardFiles = [...card.images, ...gallery].filter(file => isExactCardImageFile(card.name, file));
      for (const printing of printings) {
        const file = matchYugipediaPrintingFile({ cardName: card.name, ...printing }, cardFiles);
        if (file) { files.set(`${printing.setCode}\0${printing.rarity}`, file); allFiles.add(file); }
      }
      const generic = card.images.find(file => /-EN-/.test(file) && isExactCardImageFile(card.name, file));
      if (generic) { files.set("generic", generic); allFiles.add(generic); }
      candidates.set(card.pageId, { card, printings, files });
    }
    const imageUrls = new Map<string, string>();
    for (const batch of batches(artworkAvailable ? [...allFiles].slice(0, 450) : [], 50)) {
      let response: WikiResponse;
      try { response = await request({ action: "query", titles: batch.map(file => `File:${file}`).join("|"), prop: "imageinfo", iiprop: "url|mime|size", iiurlwidth: "600" }); }
      catch { warnings.push("Some scans were unavailable. The complete available card list is still importable; upload missing images in the catalogue."); break; }
      for (const page of response.query?.pages ?? []) {
        const image = page.imageinfo?.[0];
        const url = image?.thumburl ?? image?.url;
        if (url && isYugipediaImageUrl(url) && ["image/png", "image/jpeg", "image/webp"].includes(image?.mime ?? "") && (image?.size ?? Infinity) < 12_000_000) imageUrls.set(page.title.replace(/^File:/, ""), url);
      }
    }
    const ids: number[] = [];
    // Only reference-library tables are updated. Published products, variant
    // IDs, image overrides, stock, and sale prices are never touched here.
    await db.transaction(async tx => {
      const references = [...candidates.values()];
      const known = references.length ? await tx.select({ id: yugiohCards.id, name: yugiohCards.name }).from(yugiohCards).where(or(
        inArray(yugiohCards.name, references.map(row => row.card.name)),
        inArray(yugiohCards.id, references.flatMap(row => [row.card.password ?? -row.card.pageId, -row.card.pageId])),
      )) : [];
      const knownNames = new Map(known.map(row => [row.name, row.id]));
      const knownIds = new Map(known.map(row => [row.id, row.name]));
      const cardValues: Array<typeof yugiohCards.$inferInsert> = [];
      const printingValues = new Map<string, typeof yugiohPrintings.$inferInsert>();
      for (const { card, printings, files } of candidates.values()) {
        let id = knownNames.get(card.name) ?? card.password ?? -card.pageId;
        if (knownIds.has(id) && knownIds.get(id) !== card.name) id = -card.pageId;
        if (knownIds.has(id) && knownIds.get(id) !== card.name) throw new Error("Conflicting Yugipedia reference IDs; no reference rows were changed.");
        knownIds.set(id, card.name); knownNames.set(card.name, id);
        const { pageId: _pageId, password: _password, images: _images, printings: _printings, ...facts } = card;
        const source = imageUrls.get(files.get("generic") ?? "") ?? null;
        const values = { ...facts, id, imageSourceUrl: source, syncedAt: new Date() };
        cardValues.push(values);
        for (const printing of printings) {
          const fileName = files.get(`${printing.setCode}\0${printing.rarity}`);
          const url = fileName ? imageUrls.get(fileName) : null;
          const image = url ? { imageSourceUrl: url, imageSourcePageUrl: card.sourceUrl, imageFileName: fileName!, imageProvider: "yugipedia", imageSyncedAt: values.syncedAt } : {};
          printingValues.set(`${id}\0${printing.setCode}\0${printing.rarity}`, { cardId: id, setName: printing.setName, setCode: printing.setCode, rarity: printing.rarity, rarityCode: printing.rarityCode, ...image, syncedAt: values.syncedAt });
        }
        ids.push(id);
      }
      // Batch persistence avoids hundreds of database round trips for a 125-card set.
      if (cardValues.length) await tx.insert(yugiohCards).values([...new Map(cardValues.map(row => [row.id, row])).values()]).onConflictDoUpdate({ target: yugiohCards.id, set: {
        name: sql`excluded.name`, cardType: sql`excluded.card_type`, frameType: sql`excluded.frame_type`, description: sql`excluded.description`,
        race: sql`excluded.race`, archetype: sql`excluded.archetype`, attribute: sql`excluded.attribute`, attack: sql`excluded.attack`, defense: sql`excluded.defense`, level: sql`excluded.level`,
        sourceUrl: sql`excluded.source_url`, imageSourceUrl: sql`coalesce(excluded.image_source_url, ${yugiohCards.imageSourceUrl})`, syncedAt: sql`excluded.synced_at`,
      } });
      for (const values of batches([...printingValues.values()], 100)) await tx.insert(yugiohPrintings).values(values).onConflictDoUpdate({ target: [yugiohPrintings.cardId, yugiohPrintings.setCode, yugiohPrintings.rarity], set: {
        setName: sql`excluded.set_name`, rarityCode: sql`excluded.rarity_code`, syncedAt: sql`excluded.synced_at`,
        imageSourceUrl: sql`coalesce(excluded.image_source_url, ${yugiohPrintings.imageSourceUrl})`,
        imageSourcePageUrl: sql`coalesce(excluded.image_source_page_url, ${yugiohPrintings.imageSourcePageUrl})`,
        imageFileName: sql`coalesce(excluded.image_file_name, ${yugiohPrintings.imageFileName})`,
        imageProvider: sql`coalesce(excluded.image_provider, ${yugiohPrintings.imageProvider})`,
        imageSyncedAt: sql`coalesce(excluded.image_synced_at, ${yugiohPrintings.imageSyncedAt})`,
      } });
      const result: Manifest = { cardIds: [...new Set(ids)], matchedSets: setName ? [setName] : [], syncedAt: new Date().toISOString(), schemaVersion: 2,
        ...(by === "set" ? { expectedCards: titles.length, setSlots: new Set(setRows.map(row => row.setCode)).size, missingCards, warnings, setListCacheKey, setListUpdatedAt } : {}) };
      // A scan outage must not expire a complete card list and repeatedly hit
      // the provider. Only incomplete card coverage gets a short retry cache.
      const ttl = missingCards.length ? 60_000 : ids.length ? MONTH : 10 * 60_000;
      const values = { key, payload: result, updatedAt: new Date(), expiresAt: new Date(Date.now() + ttl) };
      await tx.insert(yugipediaCache).values(values).onConflictDoUpdate({ target: yugipediaCache.key, set: values });
    });
    return { cardIds: [...new Set(ids)], matchedSets: setName ? [setName] : [], syncedAt: new Date().toISOString(), schemaVersion: 2,
      ...(by === "set" ? { expectedCards: titles.length, setSlots: new Set(setRows.map(row => row.setCode)).size, missingCards, warnings, setListCacheKey, setListUpdatedAt } : {}) };
  } finally { await releaseOperationLease(leaseKey, token); }
}
