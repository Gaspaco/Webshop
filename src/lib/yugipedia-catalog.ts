import { parseInfoboxImageFileNames } from "./yugipedia-match";

export type WikiPage = {
  pageid: number; title: string; missing?: boolean;
  revisions?: Array<{ content?: string; "*"?: string; slots?: { main?: { content?: string; "*"?: string } } }>;
  images?: Array<{ title: string }>;
  imageinfo?: Array<{ url?: string; thumburl?: string; mime?: string; size?: number }>;
};
export type WikiPrinting = { setCode: string; setName: string; rarity: string; rarityCode: string | null };
export const wikiText = (page: WikiPage) => page.revisions?.[0]?.content ?? page.revisions?.[0]?.["*"] ?? page.revisions?.[0]?.slots?.main?.content ?? page.revisions?.[0]?.slots?.main?.["*"] ?? "";
export const wikiUrl = (title: string) => `https://yugipedia.com/wiki/${encodeURIComponent(title.replace(/ /g, "_"))}`;

export function plainWiki(value: string) {
  return value.replace(/<!--[\s\S]*?-->/g, "")
    .replace(/\[\[(?:[^\]|]+\|)?([^\]]+)\]\]/g, "$1")
    .replace(/<br\s*\/?\s*>/gi, "\n").replace(/<ref\b[^>]*>[\s\S]*?<\/ref>/gi, "")
    .replace(/<[^>]+>/g, "").replace(/'{2,5}/g, "")
    .replace(/&amp;/g, "&").replace(/&quot;/g, '"').replace(/&#39;/g, "'").trim();
}

export function wikiFields(text: string) {
  const fields: Record<string, string> = {};
  // A field starts at a line-leading pipe, not at pipes inside wiki links or
  // nested templates. Do not interpret arbitrary wiki markup as HTML or JS.
  for (const match of text.matchAll(/^\|\s*([a-z][a-z0-9_]*)\s*=([\s\S]*?)(?=\n\s*\|\s*[a-z][a-z0-9_]*\s*=|\n\}\}|(?![\s\S]))/gim)) {
    fields[match[1]!.toLowerCase()] = match[2]!.trim();
  }
  return fields;
}

const rarityCodes: Record<string, string> = {
  Common: "C", Rare: "R", "Super Rare": "SR", "Ultra Rare": "UR", "Secret Rare": "ScR",
  "Starlight Rare": "StR", "Ultimate Rare": "UtR", "Ghost Rare": "GR", "Gold Rare": "GUR",
  "Gold Secret Rare": "GScR", "Premium Gold Rare": "PGR", "Collector's Rare": "CR",
  "Quarter Century Secret Rare": "QCScR", "Platinum Secret Rare": "PlScR", "Prismatic Secret Rare": "PScR",
};
function rarities(value: string) {
  return plainWiki(value.split("//")[0] ?? "").split(/,\s*/).map(value => value.trim()).filter(Boolean);
}

export function parseCardPrintings(text: string) {
  const fields = wikiFields(text);
  const result = new Map<string, WikiPrinting>();
  // Keep English regional printings together; languages have different set
  // codes and must not be silently labelled English during import.
  for (const field of ["en_sets", "na_sets", "eu_sets", "au_sets"]) {
    for (const line of (fields[field] ?? "").split("\n")) {
      const [rawCode, rawSet, rawRarity] = line.split(";");
      const code = plainWiki(rawCode ?? "");
      if (!/^[A-Z0-9]+-[A-Z0-9]+$/i.test(code) || !rawSet || !rawRarity) continue;
      for (const rarity of rarities(rawRarity)) {
        result.set(`${code}\0${rarity}`, { setCode: code, setName: plainWiki(rawSet), rarity, rarityCode: rarityCodes[rarity] ?? null });
      }
    }
  }
  return [...result.values()];
}

export function parseSetList(text: string, setName: string) {
  const rows: Array<WikiPrinting & { cardName: string }> = [];
  // Work inside Set list blocks only, so references, navigation, and galleries
  // cannot accidentally create cards. Each block can specify a default rarity.
  for (const block of text.matchAll(/\{\{Set list\s*\|([\s\S]*?)\n\}\}/gi)) {
    const defaultRarity = block[1]!.match(/(?:^|\|)rarities\s*=\s*([^|\n]+)/i)?.[1] ?? "Common";
    for (const line of block[1]!.split("\n")) {
      const [rawCode, rawName, rawRarity] = line.split(";");
      const code = plainWiki(rawCode ?? "");
      if (!/^[A-Z0-9]+-[A-Z0-9]+$/i.test(code) || !rawName) continue;
      const cardName = plainWiki(rawName.split("//")[0] ?? "");
      for (const rarity of rarities(rawRarity || defaultRarity)) {
        rows.push({ cardName, setCode: code, setName, rarity, rarityCode: rarityCodes[rarity] ?? null });
      }
    }
  }
  return rows;
}

export function parseWikiCard(page: WikiPage) {
  const text = wikiText(page);
  if (page.missing || !/\{\{CardTable2?\s*[\n|]/i.test(text) || /\|\s*medium\s*=\s*(?:anime|manga|video game)/i.test(text)) return null;
  const fields = wikiFields(text);
  const number = (value: string | undefined) => value && /^\d+$/.test(value) ? Number(value) : null;
  const password = number(fields.password);
  const types = plainWiki(fields.types ?? fields.card_type ?? "");
  const frameType = /spell/i.test(fields.card_type ?? "") ? "spell" : /trap/i.test(fields.card_type ?? "") ? "trap"
    : /fusion/i.test(types) ? "fusion" : /synchro/i.test(types) ? "synchro" : /xyz/i.test(types) ? "xyz"
    : /link/i.test(types) ? "link" : /ritual/i.test(types) ? "ritual" : /normal/i.test(types) ? "normal" : "effect";
  const images = [...new Set([...parseInfoboxImageFileNames(text), ...(page.images ?? []).map(image => image.title.replace(/^File:/, ""))])];
  return {
    pageId: page.pageid, password: password && password <= 99999999 ? password : null,
    name: plainWiki(fields.en_name ?? fields.name ?? page.title),
    cardType: plainWiki(fields.card_type ?? types) || "Card", frameType,
    description: plainWiki(fields.text ?? fields.lore ?? ""), race: types.split(" / ")[0] || null,
    attribute: plainWiki(fields.attribute ?? "") || null, archetype: plainWiki(fields.archseries ?? "") || null,
    attack: number(fields.atk), defense: number(fields.def), level: number(fields.level ?? fields.rank ?? fields.link_rating),
    sourceUrl: wikiUrl(page.title), images, printings: parseCardPrintings(text),
  };
}

export function isYugipediaImageUrl(value: string) {
  try {
    const url = new URL(value);
    return url.protocol === "https:" && !url.username && !url.password && !url.port &&
      (url.hostname === "yugipedia.com" || url.hostname === "ms.yugipedia.com" || url.hostname === "images.yugipedia.com");
  } catch { return false; }
}
