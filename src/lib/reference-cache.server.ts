import { createHash } from "node:crypto";
import { and, eq, like, lt, inArray, sql } from "drizzle-orm";
import { db } from "~/db";
import { yugipediaCache } from "~/db/schema";
import { acquireOperationLease, releaseOperationLease } from "./operation-lease.server";
import { rateLimitMutation } from "./rate-limit-query";
import sharp from "sharp";

export class ReferenceError extends Error {
  constructor(message: string, readonly status = 502, readonly retryAfter = 0) { super(message); }
}
export function referenceKey(provider: string, value: unknown) {
  return `reference-v1:${provider}:${createHash("sha256").update(JSON.stringify(value)).digest("hex")}`;
}
export async function readReference<T>(key: string): Promise<T | null> {
  const [row] = await db.select({ payload: yugipediaCache.payload, expires: yugipediaCache.expiresAt }).from(yugipediaCache).where(eq(yugipediaCache.key, key)).limit(1);
  return row && row.expires.getTime() > Date.now() ? row.payload as T : null;
}
export async function storeReference(key: string, payload: unknown, ttl = 86400_000) {
  return storeReferences([{ key, payload }], ttl);
}
export async function storeReferences(entries: Array<{ key: string; payload: unknown }>, ttl = 86400_000) {
  if (!entries.length) return;
  if (entries.length > 200) throw new ReferenceError("Too many results. Narrow the search.");
  const now = new Date();
  const values = entries.map(entry => ({ ...entry, updatedAt: now, expiresAt: new Date(now.getTime() + ttl) }));
  await db.insert(yugipediaCache).values(values).onConflictDoUpdate({ target: yugipediaCache.key,
    set: { payload: sql`excluded.payload`, updatedAt: now, expiresAt: new Date(now.getTime() + ttl) } });
  const expired = db.select({ key: yugipediaCache.key }).from(yugipediaCache).where(and(like(yugipediaCache.key, "reference-v1:%"), lt(yugipediaCache.expiresAt, new Date()))).limit(100);
  await db.delete(yugipediaCache).where(inArray(yugipediaCache.key, expired));
}
export async function boundedReferenceBody(response: Response, max = 8_000_000) {
  if (Number(response.headers.get("content-length")) > max) throw new ReferenceError("The provider response is too large. Narrow the search.");
  if (!response.body) throw new ReferenceError("The provider returned an empty response.");
  const reader = response.body.getReader(); const parts: Uint8Array[] = []; let size = 0;
  try { for (;;) { const { done, value } = await reader.read(); if (done) break;
    size += value.byteLength; if (size > max) { await reader.cancel(); throw new ReferenceError("The provider response is too large. Narrow the search."); } parts.push(value);
  } } finally { reader.releaseLock(); }
  return Buffer.concat(parts);
}
const hosts: Record<string, string> = { onepiece: "optcgapi.com", grandarchive: "api.gatcg.com", vanguard: "api.pokewallet.io", channel3: "api.trychannel3.com" };

/** Cached, bounded, authenticated only server-side; budgets are shared by all instances. */
export async function referenceJson(provider: string, target: string, init: { key?: string; body?: unknown; binary?: boolean; ttlMs?: number } = {}) {
  const url = new URL(target);
  if (url.protocol !== "https:" || url.hostname !== hosts[provider] || url.username || url.password || url.port) throw new ReferenceError("Unexpected provider address.");
  const key = referenceKey(provider, [target, init.body ?? null, init.binary ?? false]);
  const cached = await readReference<unknown>(key); if (cached) return cached;
  const leaseKey = `reference:${provider}:request`;
  let token = await acquireOperationLease(leaseKey, 20_000);
  for (let attempt = 0; !token && attempt < 4; attempt++) { await new Promise(resolve => setTimeout(resolve, 250)); token = await acquireOperationLease(leaseKey, 20_000); }
  if (!token) throw new ReferenceError("This provider is busy. Try again shortly.", 429, 2);
  let cooldown = 600;
  try {
    const retry = await readReference<unknown>(key); if (retry) return retry;
    for (const [window, limit] of [[3600_000, provider === "vanguard" ? 80 : 100], [86400_000, provider === "vanguard" ? 800 : 500]] as const) {
      if (!(await rateLimitMutation(db, `reference:${provider}:${window}`, limit, window, Date.now())).length) throw new ReferenceError("The safe provider request budget has been reached. Cached searches still work.", 429, 3600);
    }
    const response = await fetch(url, { method: init.body ? "POST" : "GET", redirect: "error", signal: AbortSignal.timeout(15_000),
      headers: { Accept: "application/json", "User-Agent": "TCGHaven catalogue (info@tcghaven.com)", ...(init.key ? { "x-api-key": init.key } : {}), ...(init.body ? { "Content-Type": "application/json" } : {}) },
      ...(init.body ? { body: JSON.stringify(init.body) } : {}) });
    if (response.status === 429) {
      cooldown = Math.min(3600_000, Math.max(60_000, Number(response.headers.get("retry-after")) * 1000 || 60_000));
      throw new ReferenceError("The provider requested a pause. Please try again later.", 429, Math.ceil(cooldown / 1000));
    }
    if (response.status === 401 || response.status === 403) throw new ReferenceError("The provider rejected the API key or this account does not have access.", 503);
    if (provider === "channel3" && response.status === 422) throw new ReferenceError(url.pathname.endsWith("/lookup")
      ? "Channel3 could not read this product link. Use a direct product page rather than a homepage or collection."
      : "Channel3 could not use these search options. Run a new search or select the filters again.", 400);
    if (provider === "channel3" && response.status === 504) throw new ReferenceError("Channel3 took too long to read this product. Try again later or add it manually.", 503);
    if (response.status === 404) return null;
    if (!response.ok) throw new ReferenceError("The provider is temporarily unavailable.");
    const bytes = await boundedReferenceBody(response, init.binary ? 4_000_000 : 8_000_000);
    let data: unknown;
    if (init.binary) {
      const raster = bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff || bytes.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])) || bytes.toString("ascii", 0, 4) === "RIFF" && bytes.toString("ascii", 8, 12) === "WEBP";
      if (!raster) throw new ReferenceError("The provider did not return a supported raster image.");
      const normalized = await sharp(bytes, { limitInputPixels: 20_000_000 }).timeout({ seconds: 5 }).resize({ width: 800, height: 1200, fit: "inside", withoutEnlargement: true }).webp({ quality: 80 }).toBuffer();
      if (normalized.byteLength > 650_000) throw new ReferenceError("The artwork is too large. Upload a smaller image in the editor.");
      data = `data:image/webp;base64,${normalized.toString("base64")}`;
    } else {
      try { data = JSON.parse(bytes.toString("utf8")); }
      catch { throw new ReferenceError("The provider returned an unreadable response. Try again later."); }
    }
    await storeReference(key, data, init.ttlMs ?? 86400_000); return data;
  } finally { await releaseOperationLease(leaseKey, token, cooldown); }
}
