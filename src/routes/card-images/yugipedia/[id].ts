import type { APIEvent } from "@solidjs/start/server";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "~/db";
import { yugiohPrintings } from "~/db/schema";

const printingIdSchema = z.string().uuid();
const ALLOWED_IMAGE_TYPES = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
]);
const MAX_IMAGE_BYTES = 12_000_000;

function errorResponse(status: number) {
  return new Response(null, {
    status,
    headers: {
      "Cache-Control": "public, max-age=300, s-maxage=300",
      "X-Content-Type-Options": "nosniff",
    },
  });
}

function isYugipediaImageUrl(value: string) {
  try {
    const url = new URL(value);
    return url.protocol === "https:" &&
      (url.hostname === "yugipedia.com" ||
        url.hostname.endsWith(".yugipedia.com"));
  } catch {
    return false;
  }
}

export async function GET(event: APIEvent) {
  const parsedId = printingIdSchema.safeParse(event.params.id);
  if (!parsedId.success) return errorResponse(404);

  const [printing] = await db
    .select({
      sourceUrl: yugiohPrintings.imageSourceUrl,
      provider: yugiohPrintings.imageProvider,
    })
    .from(yugiohPrintings)
    .where(eq(yugiohPrintings.id, parsedId.data))
    .limit(1);

  if (
    !printing?.sourceUrl ||
    printing.provider !== "yugipedia" ||
    !isYugipediaImageUrl(printing.sourceUrl)
  ) {
    return errorResponse(404);
  }

  try {
    const response = await fetch(printing.sourceUrl, {
      headers: {
        Accept: "image/avif,image/webp,image/png,image/jpeg",
        "User-Agent": "TCGHaven card image cache (info@tcghaven.com)",
      },
      signal: AbortSignal.timeout(30_000),
    });
    if (!response.ok) return errorResponse(502);

    const contentType = response.headers.get("content-type")
      ?.split(";", 1)[0]
      .trim()
      .toLowerCase();
    const contentLength = Number(response.headers.get("content-length") ?? 0);
    if (
      !contentType ||
      !ALLOWED_IMAGE_TYPES.has(contentType) ||
      (contentLength > 0 && contentLength > MAX_IMAGE_BYTES)
    ) {
      return errorResponse(415);
    }

    const image = await response.arrayBuffer();
    if (image.byteLength > MAX_IMAGE_BYTES) return errorResponse(413);

    return new Response(image, {
      headers: {
        "Content-Type": contentType,
        "Content-Length": String(image.byteLength),
        "Cache-Control":
          "public, max-age=86400, s-maxage=2592000, stale-while-revalidate=604800",
        "CDN-Cache-Control": "public, max-age=2592000",
        "Vercel-CDN-Cache-Control": "public, max-age=2592000",
        "X-Content-Type-Options": "nosniff",
        "Content-Security-Policy": "default-src 'none'; sandbox",
      },
    });
  } catch {
    return errorResponse(502);
  }
}
