export const PUBLIC_SITE_ORIGIN = "https://www.tcghaven.com";

export function canonicalProductUrl(slug: string) {
  return `${PUBLIC_SITE_ORIGIN}/products/${encodeURIComponent(slug)}`;
}

export function publicProductImageUrl(source?: string) {
  if (!source) return undefined;
  try {
    const url = new URL(source, PUBLIC_SITE_ORIGIN);
    return url.protocol === "https:" && !url.username && !url.password ? url.toString() : undefined;
  } catch { return undefined; }
}
