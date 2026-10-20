import type { APIEvent } from "@solidjs/start/server";
import { eq } from "drizzle-orm";
import { db } from "~/db";
import { yugiohCards } from "~/db/schema";
import { isYugipediaImageUrl } from "~/lib/yugipedia-catalog";

export async function GET(event: APIEvent) {
  const id = Number(event.params.id);
  if (!Number.isSafeInteger(id) || !id || Math.abs(id) > 2147483647) return new Response(null, { status: 404 });
  const [card] = await db.select({ url: yugiohCards.imageSourceUrl }).from(yugiohCards).where(eq(yugiohCards.id, id)).limit(1);
  if (!card?.url || !isYugipediaImageUrl(card.url)) return new Response(null, { status: 404 });
  try {
    const response = await fetch(card.url, { redirect: "error", headers: { "User-Agent": "TCGHaven card image cache (info@tcghaven.com)" }, signal: AbortSignal.timeout(15000) });
    const mime = response.headers.get("content-type")?.split(";")[0];
    if (!response.ok || !["image/jpeg", "image/png", "image/webp"].includes(mime ?? "")) return new Response(null, { status: 502 });
    const reader = response.body!.getReader(); const parts: Uint8Array[] = []; let size = 0;
    for (;;) {
      const { done, value } = await reader.read(); if (done) break;
      size += value.byteLength;
      if (size > 2_000_000) { await reader.cancel(); return new Response(null, { status: 413 }); }
      parts.push(value);
    }
    return new Response(Buffer.concat(parts), { headers: {
      "Content-Type": mime!, "X-Content-Type-Options": "nosniff",
      "Cache-Control": "public, max-age=86400, s-maxage=2592000, stale-while-revalidate=604800",
      "Content-Security-Policy": "default-src 'none'; sandbox",
    } });
  } catch { return new Response(null, { status: 502 }); }
}
