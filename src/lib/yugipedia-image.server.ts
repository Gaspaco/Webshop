import type { APIEvent } from "@solidjs/start/server";
import { createHash } from "node:crypto";
import { db } from "~/db";
import { acquireOperationLease, releaseOperationLease } from "~/lib/operation-lease.server";
import { checkRateLimit } from "~/lib/rate-limit.server";
import { rateLimitMutation } from "~/lib/rate-limit-query";
import { isYugipediaImageUrl } from "~/lib/yugipedia-catalog";

const DOWNLOAD_TIMEOUT_MS = 20_000;
const LEASE_MS = 30_000;
const MAX_CONCURRENT_DOWNLOADS = 16;
const IMAGE_TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);
type ImageResult = { status: number; body?: ArrayBuffer; mime?: string; retryAfter?: number };
// Bound memory and coalesce requests within an instance. Database leases and
// the shared outbound budget also protect across serverless instances.
const pending = new Map<string, Promise<ImageResult>>();

function imageResponse(result: ImageResult) {
  const headers = new Headers({
    "X-Content-Type-Options": "nosniff",
    "Content-Security-Policy": "default-src 'none'; sandbox",
    // Never cache a temporary failure as a broken product image.
    "Cache-Control": "no-store",
  });
  if (result.retryAfter) headers.set("Retry-After", String(result.retryAfter));
  if (result.body && result.mime) {
    headers.set("Content-Type", result.mime);
    headers.set("Content-Length", String(result.body.byteLength));
    headers.set("Cache-Control", "public, max-age=86400, s-maxage=2592000, stale-while-revalidate=604800");
    headers.set("CDN-Cache-Control", "public, max-age=2592000");
    headers.set("Vercel-CDN-Cache-Control", "public, max-age=2592000");
  }
  return new Response(result.body ?? null, { status: result.status, headers });
}

async function download(url: string, key: string, maxBytes: number): Promise<ImageResult> {
  const token = await acquireOperationLease(key, LEASE_MS);
  if (!token) return { status: 503, retryAfter: 1 };
  let slot: { key: string; token: string } | undefined;
  try {
    for (let index = 0; index < MAX_CONCURRENT_DOWNLOADS; index++) {
      const slotKey = `yugipedia:image:slot:${index}`;
      const slotToken = await acquireOperationLease(slotKey, LEASE_MS);
      if (slotToken) { slot = { key: slotKey, token: slotToken }; break; }
    }
    if (!slot) return { status: 503, retryAfter: 1 };
    // Fixed global key, deliberately independent of spoofable client headers.
    const allowed = await rateLimitMutation(db, "yugipedia:image:outbound", 240, 60_000, Date.now());
    if (!allowed.length) return { status: 429, retryAfter: 60 };

    const response = await fetch(url, {
      redirect: "error",
      headers: { Accept: "image/webp,image/png,image/jpeg", "User-Agent": "TCGHaven card image cache (info@tcghaven.com)" },
      signal: AbortSignal.timeout(DOWNLOAD_TIMEOUT_MS),
    });
    let reader: ReadableStreamDefaultReader<Uint8Array> | undefined;
    let complete = false;
    try {
      if (!response.ok) return { status: 502 };
      const mime = response.headers.get("content-type")?.split(";", 1)[0]?.trim().toLowerCase();
      if (!mime || !IMAGE_TYPES.has(mime)) return { status: 415 };
      const length = response.headers.get("content-length");
      if (length && (!/^\d+$/.test(length) || Number(length) > maxBytes)) return { status: 413 };
      if (!response.body) return { status: 502 };
      reader = response.body.getReader();
      const parts: Uint8Array[] = [];
      let size = 0;
      for (;;) {
        const { done, value } = await reader.read();
        if (done) { complete = true; break; }
        size += value.byteLength;
        if (size > maxBytes) return { status: 413 };
        parts.push(value);
      }
      if (!size) return { status: 502 };
      const image = new Uint8Array(size);
      let offset = 0;
      for (const part of parts) { image.set(part, offset); offset += part.byteLength; }
      return { status: 200, body: image.buffer, mime };
    } finally {
      if (!complete) {
        // Also stop rejected types/lengths and chunked or decompressed bodies.
        try { if (reader) await reader.cancel(); else await response.body?.cancel(); } catch { /* already aborted */ }
      }
      reader?.releaseLock();
    }
  } catch {
    return { status: 502 };
  } finally {
    // An unavailable database must fail closed; leases expire if cleanup fails.
    await Promise.allSettled([
      releaseOperationLease(key, token),
      ...(slot ? [releaseOperationLease(slot.key, slot.token)] : []),
    ]);
  }
}

export async function serveYugipediaImage(
  event: APIEvent,
  resolveSource: () => Promise<string | null | undefined>,
  maxBytes = 2_000_000,
) {
  try {
    if (await checkRateLimit({ event, namespace: "yugipedia:images", identity: "public", limit: 180, windowMs: 60_000 })) {
      return imageResponse({ status: 429, retryAfter: 60 });
    }
    const url = await resolveSource();
    if (!url || !isYugipediaImageUrl(url)) return imageResponse({ status: 404 });
    const key = `yugipedia:image:${createHash("sha256").update(`${maxBytes}:${url}`).digest("hex")}`;
    const existing = pending.get(key);
    if (existing) return imageResponse(await existing);
    if (pending.size >= MAX_CONCURRENT_DOWNLOADS) return imageResponse({ status: 503, retryAfter: 1 });
    const operation = download(url, key, maxBytes);
    pending.set(key, operation);
    try { return imageResponse(await operation); }
    finally { pending.delete(key); }
  } catch {
    return imageResponse({ status: 503, retryAfter: 1 });
  }
}
