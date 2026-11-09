export type Channel3Filters = { brandId?: string; categoryId?: string; mode?: "keyword" | "default"; country?: "all" | "NL" };
export type Channel3Option = { id: string; label: string; detail?: string };

export const CHANNEL3_CATEGORIES: Record<string, { query: string; slug: string }> = {
  funko: { query: "action toy figures", slug: "action-toy-figures" },
  figures: { query: "action toy figures", slug: "action-toy-figures" },
  beyblade: { query: "spinning tops", slug: "spinning-tops" },
  plush: { query: "stuffed animals", slug: "stuffed-animals" },
  tcg: { query: "collectible trading cards", slug: "collectible-trading-cards" },
};

/** The URL is sent only to Channel3's fixed lookup API, never fetched by our server. */
export function channel3LookupUrl(value: string): string | null {
  try {
    if (value.length > 2000) return null;
    const url = new URL(value.trim());
    if (url.protocol !== "https:" || url.username || url.password || url.port || url.hash ||
      !/^(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$/i.test(url.hostname) ||
      /(^|\.)(localhost|internal|local|test|invalid|example|onion|arpa|home|corp)$/.test(url.hostname)) return null;
    return url.href;
  } catch { return null; }
}
