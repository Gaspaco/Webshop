import type { APIEvent } from "@solidjs/start/server";
import { createHash } from "node:crypto";
import { isIP } from "node:net";
import sharp from "sharp";
import { and, asc, desc, eq, sql } from "drizzle-orm";
import { db } from "~/db";
import { products, productVariants, productImageCache, productImageCacheUsage, yugiohCards, yugiohPrintings } from "~/db/schema";
import { acquireOperationLease, releaseOperationLease } from "~/lib/operation-lease.server";
import { rateLimitMutation } from "~/lib/rate-limit-query";
import { checkRateLimit } from "~/lib/rate-limit.server";
import { imageSku, parseProductImageFilename } from "~/lib/product-image-path";
import { isYugipediaImageUrl } from "~/lib/yugipedia-catalog";

const HOSTS = new Set([
  "assets.tcgdex.net", "images.pokemontcg.io", "cards.scryfall.io", "c1.scryfall.com", "c2.scryfall.com",
  "yugipedia.com", "ms.yugipedia.com", "images.yugipedia.com", "images.ygoprodeck.com",
  "images.scrydex.com", "digimoncard.io", "images.digimoncard.io",
  "optcgapi.com", "api.gatcg.com",
  "product-images.s3.cardmarket.com", "images.cardmarket.com", "tcgplayer-cdn.tcgplayer.com",
]);
const MAX_INPUT = 8_000_000;
const MAX_OUTPUT = 1_000_000;
const LEASE_MS = 30_000;
const MAX_DOWNLOADS = 8;
type CachedImage = { data: string; etag: string };
const pending = new Map<string, Promise<CachedImage>>();

export function allowedProductImageSource(source: string) {
  try {
    const url = new URL(source);
    return source.length <= 4000 && url.protocol === "https:" && !url.username && !url.password && !url.port && !url.hash && HOSTS.has(url.hostname);
  } catch { return false; }
}

export function productImageCacheLimit() {
  const value = process.env.PRODUCT_IMAGE_CACHE_MAX_MB?.trim() || undefined;
  const mb = value === undefined ? 256 : Number(value);
  if (!Number.isSafeInteger(mb) || mb < 0 || mb > 2048) throw new Error("Invalid product image cache limit.");
  return mb * 1024 * 1024;
}

async function readRemoteImage(source: string) {
  if (!allowedProductImageSource(source)) throw new Error("Unsupported image provider.");
  const response = await fetch(source, {
    redirect: "error", signal: AbortSignal.timeout(12_000),
    headers: { Accept: "image/webp,image/png,image/jpeg", "User-Agent": "TCGHaven product image cache (info@tcghaven.com)" },
  });
  let reader: ReadableStreamDefaultReader<Uint8Array> | undefined;
  let complete = false;
  try {
    if (!response.ok || !response.body) throw new Error("Image download failed.");
    const mime = response.headers.get("content-type")?.split(";", 1)[0]?.trim().toLowerCase();
    if (!["image/png", "image/jpeg", "image/webp", "image/gif"].includes(mime ?? "")) throw new Error("Unsupported image format.");
    const length = response.headers.get("content-length");
    if (length && (!/^\d+$/.test(length) || Number(length) > MAX_INPUT)) throw new Error("Image is too large.");
    reader = response.body.getReader();
    const parts: Uint8Array[] = [];
    let size = 0;
    for (;;) {
      const { done, value } = await reader.read();
      if (done) { complete = true; break; }
      size += value.byteLength;
      if (size > MAX_INPUT) throw new Error("Image is too large.");
      parts.push(value);
    }
    if (!size) throw new Error("Empty image.");
    return Buffer.concat(parts);
  } finally {
    if (!complete) {
      try { if (reader) await reader.cancel(); else await response.body?.cancel(); } catch { /* response already aborted */ }
    }
    reader?.releaseLock();
  }
}

async function optimizeImage(source: string): Promise<CachedImage> {
  const embedded = /^data:image\/(?:png|jpeg|webp|gif);base64,([a-zA-Z0-9+/]+={0,2})$/.exec(source);
  if (embedded && embedded[1]!.length > 2_000_000) throw new Error("Embedded image is too large.");
  const input = embedded ? Buffer.from(embedded[1]!, "base64") : await readRemoteImage(source);
  // Reject vector/document payloads BEFORE passing untrusted input to a decoder.
  const png = input.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]));
  const jpeg = input[0] === 255 && input[1] === 216 && input[2] === 255;
  const webp = input.toString("ascii", 0, 4) === "RIFF" && input.toString("ascii", 8, 12) === "WEBP";
  const gif = ["GIF87a", "GIF89a"].includes(input.toString("ascii", 0, 6));
  if (!png && !jpeg && !webp && !gif) throw new Error("Not a supported raster image.");
  const output = await sharp(input, { limitInputPixels: 20_000_000, animated: false, failOn: "error" })
    .rotate().resize({ width: 1200, height: 1600, fit: "inside", withoutEnlargement: true })
    .webp({ quality: 86, effort: 4 }).timeout({ seconds: 5 }).toBuffer();
  if (!output.length || output.length > MAX_OUTPUT) throw new Error("Optimized image is too large.");
  return { data: output.toString("base64"), etag: createHash("sha256").update(output).digest("hex") };
}

async function storeImage(key: string, image: CachedImage) {
  const bytes = image.data.length;
  await db.transaction(async tx => {
    await tx.insert(productImageCacheUsage).values({ key: "catalogue", bytes: 0 }).onConflictDoNothing();
    const budget = await tx.update(productImageCacheUsage).set({ bytes: sql`${productImageCacheUsage.bytes} + ${bytes}` })
      .where(and(eq(productImageCacheUsage.key, "catalogue"), sql`${productImageCacheUsage.bytes} + ${bytes} <= ${productImageCacheLimit()}`))
      .returning({ bytes: productImageCacheUsage.bytes });
    if (!budget.length) throw new Error("Product image cache capacity reached.");
    const inserted = await tx.insert(productImageCache).values({ key, ...image, bytes }).onConflictDoNothing().returning({ key: productImageCache.key });
    if (!inserted.length) await tx.update(productImageCacheUsage).set({ bytes: sql`${productImageCacheUsage.bytes} - ${bytes}` }).where(eq(productImageCacheUsage.key, "catalogue"));
  });
}

async function cachedImage(source: string): Promise<CachedImage> {
  const key = createHash("sha256").update(`webp-v1:${source}`).digest("hex");
  const [cached] = await db.select({ data: productImageCache.data, etag: productImageCache.etag }).from(productImageCache).where(eq(productImageCache.key, key)).limit(1);
  if (cached) return cached;
  const existing = pending.get(key);
  if (existing) return existing;
  if (pending.size >= MAX_DOWNLOADS) throw new Error("Product image cache is busy.");
  const operation = (async () => {
    const token = await acquireOperationLease(`product-image:${key}`, LEASE_MS);
    if (!token) throw new Error("Product image cache is busy.");
    let slot: { key: string; token: string } | undefined;
    let providerSlot: { key: string; token: string } | undefined;
    try {
      // A different instance may have finished between the first read and lease.
      const [ready] = await db.select({ data: productImageCache.data, etag: productImageCache.etag }).from(productImageCache).where(eq(productImageCache.key, key)).limit(1);
      if (ready) return ready;
      for (let i = 0; i < MAX_DOWNLOADS; i++) {
        const slotKey = `product-image:slot:${i}`;
        const slotToken = await acquireOperationLease(slotKey, LEASE_MS);
        if (slotToken) { slot = { key: slotKey, token: slotToken }; break; }
      }
      if (!slot) throw new Error("Product image cache is busy.");
      const yugipedia = source.startsWith("https:") && isYugipediaImageUrl(source);
      if (yugipedia) {
        // Share the library image routes' original provider budget and slots;
        // adding a cache must not silently increase their outbound ceiling.
        for (let i = 0; i < 16; i++) {
          const slotKey = `yugipedia:image:slot:${i}`;
          const slotToken = await acquireOperationLease(slotKey, LEASE_MS);
          if (slotToken) { providerSlot = { key: slotKey, token: slotToken }; break; }
        }
        if (!providerSlot) throw new Error("Yugipedia image downloads are busy.");
      }
      const [usage] = await db.select({ bytes: productImageCacheUsage.bytes }).from(productImageCacheUsage).where(eq(productImageCacheUsage.key, "catalogue")).limit(1);
      if ((usage?.bytes ?? 0) >= productImageCacheLimit()) throw new Error("Product image cache capacity reached.");
      if (!(await rateLimitMutation(db, "product-image:outbound", 120, 60_000, Date.now())).length) throw new Error("Product image download budget reached.");
      if (yugipedia && !(await rateLimitMutation(db, "yugipedia:image:outbound", 240, 60_000, Date.now())).length) throw new Error("Yugipedia image download budget reached.");
      const image = await optimizeImage(source);
      await storeImage(key, image);
      return image;
    } finally {
      await Promise.allSettled([
        releaseOperationLease(`product-image:${key}`, token),
        ...(slot ? [releaseOperationLease(slot.key, slot.token)] : []),
        ...(providerSlot ? [releaseOperationLease(providerSlot.key, providerSlot.token)] : []),
      ]);
    }
  })();
  pending.set(key, operation);
  try { return await operation; } finally { pending.delete(key); }
}

async function resolveStoredSource(filename: string) {
  const parsed = parseProductImageFilename(filename);
  if (!parsed) return null;
  const [row] = parsed.kind === "v"
    ? await db.select({ source: productVariants.imageUrl, sku: productVariants.sku }).from(productVariants)
      .innerJoin(products, eq(products.id, productVariants.productId))
      .where(and(eq(productVariants.id, parsed.id), eq(products.status, "active"))).limit(1)
    : await db.select({ source: sql<string | null>`${products.imageUrls} ->> ${parsed.index}::int`, sku: sql<string>`coalesce(${productVariants.sku}, ${products.slug})` })
      .from(products).leftJoin(productVariants, eq(productVariants.productId, products.id))
      .where(and(eq(products.id, parsed.id), eq(products.status, "active")))
      .orderBy(desc(productVariants.isDefault), asc(productVariants.createdAt), asc(productVariants.id)).limit(1);
  if (!row?.source || imageSku(row.sku) !== parsed.sku || createHash("md5").update(row.source).digest("hex") !== parsed.version) return null;
  return row.source;
}

async function resolveProviderSource(source: string) {
  const printing = /^\/card-images\/yugipedia\/([0-9a-f-]{36})$/.exec(source);
  if (printing) {
    const [row] = await db.select({ url: yugiohPrintings.imageSourceUrl, provider: yugiohPrintings.imageProvider }).from(yugiohPrintings).where(eq(yugiohPrintings.id, printing[1]!)).limit(1);
    return row?.provider === "yugipedia" ? row.url : null;
  }
  const card = /^\/card-images\/yugipedia\/card\/(-?\d{1,10})$/.exec(source);
  if (card) {
    const id = Number(card[1]);
    if (!Number.isSafeInteger(id) || !id || Math.abs(id) > 2147483647) return null;
    const [row] = await db.select({ url: yugiohCards.imageSourceUrl }).from(yugiohCards).where(eq(yugiohCards.id, id)).limit(1);
    return row?.url;
  }
  return source;
}

const HEADERS = {
  "Cache-Control": "private, no-cache, max-age=0, must-revalidate",
  "CDN-Cache-Control": "no-store", "Vercel-CDN-Cache-Control": "no-store",
  "X-Content-Type-Options": "nosniff", "Content-Security-Policy": "default-src 'none'; sandbox",
};

/** Publication is checked before consulting the cache or honoring an ETag. */
export async function serveProductImage(event: APIEvent) {
  const filename = event.params.filename ?? "";
  let fallbackSource: string | null = null;
  try {
    const original = await resolveStoredSource(filename);
    if (!original) return new Response(null, { status: 404, headers: HEADERS });
    const source = await resolveProviderSource(original);
    if (!source) return new Response(null, { status: 404, headers: HEADERS });
    if (allowedProductImageSource(source)) fallbackSource = source;
    else if (source.startsWith("data:image/")) {
      const reference = parseProductImageFilename(filename)!;
      fallbackSource = `/api/catalog/image?${reference.kind === "v" ? "variant" : "product"}=${reference.id}${reference.kind === "p" ? `&image=${reference.index}` : ""}`;
    }
    if (await checkRateLimit({ event, namespace: "product-images", identity: "public", limit: 600, windowMs: 60_000 })) {
      return new Response(null, { status: 429, headers: { ...HEADERS, "Retry-After": "60" } });
    }
    if (!source.startsWith("data:image/") && !allowedProductImageSource(source)) {
      // Owner-supplied images on other hosts are left working, but are NEVER
      // fetched server-side. Adding a new API requires an explicit host review.
      const target = new URL(source);
      if (target.protocol !== "https:" || target.username || target.password || target.port ||
        isIP(target.hostname.replace(/^\[|\]$/g, "")) || /(^|\.)(localhost|internal|local)$/.test(target.hostname)) {
        return new Response(null, { status: 404, headers: HEADERS });
      }
      return new Response(null, { status: 302, headers: { ...HEADERS, Location: target.toString(), "X-Product-Image-Cache": "unsupported-provider" } });
    }
    const image = await cachedImage(source);
    const etag = `"${image.etag}"`;
    const headers = { ...HEADERS, "Content-Type": "image/webp", "Content-Disposition": `inline; filename="${filename}"`, ETag: etag };
    if (event.request.headers.get("if-none-match")?.split(",").map(value => value.trim()).includes(etag)) return new Response(null, { status: 304, headers });
    return new Response(Buffer.from(image.data, "base64"), { headers });
  } catch {
    // Preserve working images during a cold-cache burst, a provider outage or
    // a full storage budget. Failures are never persisted; a later view retries
    // caching. Never redirect a missing/private product or a guessed filename.
    if (fallbackSource) return new Response(null, { status: 302, headers: {
      ...HEADERS, Location: fallbackSource, "X-Product-Image-Cache": "fallback", "Retry-After": "2",
    } });
    return new Response(null, { status: 503, headers: { ...HEADERS, "Retry-After": "2" } });
  }
}

