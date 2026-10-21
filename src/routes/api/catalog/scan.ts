import type { APIEvent } from "@solidjs/start/server";
import sharp from "sharp";
import { z } from "zod";
import { readCardText } from "~/lib/card-text";
import { searchCatalog } from "~/lib/catalog-search.server";
import { getVisionEnv } from "~/lib/env.server";
import { checkRateLimit } from "~/lib/rate-limit.server";
import { limitJsonBody, safeApiResponse, validateJsonRequest } from "~/lib/request-security.server";
import { logServerError } from "~/lib/server-log";
import { consumeCardScanBudget, withCardScanCapacity } from "~/lib/card-scan-budget.server";

// Card photo search: read the text on a card with Google Cloud Vision, then
// look those words up in the catalogue.
//
// Safety:
// - same-origin JSON only, body capped at 3 MB, rate limited per visitor;
// - shared daily/minute budgets and capacity limits across server instances;
// - the image must really be a JPEG, PNG or WebP (magic bytes), and is
//   re-encoded with sharp, which drops EXIF/GPS metadata and anything that
//   isn't pixels before it leaves this server;
// - nothing is stored or logged; Google only sees the re-encoded pixels;
// - text read from the card is used as plain data in parameterized queries.

const MAX_BODY_BYTES = 3_000_000;
const MAX_IMAGE_BYTES = 2_200_000;

const bodySchema = z.object({
  image: z.string().min(100).max(MAX_IMAGE_BYTES * 1.4),
});

const headers = { "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff" };
const fail = (error: string, status: number, extra: Record<string, string> = {}) =>
  Response.json({ error }, { status, headers: { ...headers, ...extra } });

function isSupportedImage(bytes: Buffer) {
  const jpeg = bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff;
  const png = bytes.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]));
  const webp = bytes.subarray(0, 4).toString("ascii") === "RIFF" && bytes.subarray(8, 12).toString("ascii") === "WEBP";
  return jpeg || png || webp;
}

export function GET() {
  return Response.json({ enabled: Boolean(getVisionEnv()) }, { headers: { ...headers, "Cache-Control": "public, max-age=300" } });
}

export async function POST(event: APIEvent) {
  return safeApiResponse(async () => {
    const vision = getVisionEnv();
    if (!vision) return fail("Card scanning isn't available right now.", 503);

    const invalid = await validateJsonRequest(event, { maxBytes: MAX_BODY_BYTES });
    if (invalid) return invalid;

    const [shortLimited, dailyLimited] = await Promise.all([
      checkRateLimit({ event, namespace: "card-scan", identity: "burst", limit: 8, windowMs: 10 * 60_000 }),
      checkRateLimit({ event, namespace: "card-scan", identity: "daily", limit: 40, windowMs: 24 * 60 * 60_000 }),
    ]);
    if (shortLimited || dailyLimited) {
      return fail("You've scanned a lot of cards. Try again in a few minutes.", 429, { "Retry-After": "600" });
    }

    const limited = await limitJsonBody(event.request, MAX_BODY_BYTES);
    if (limited instanceof Response) return limited;

    let raw: Buffer;
    try {
      const { image } = bodySchema.parse(await limited.json());
      const base64 = image.replace(/^data:image\/[a-z]+;base64,/, "");
      if (!/^[A-Za-z0-9+/=]+$/.test(base64)) return fail("That file isn't a supported image.", 400);
      raw = Buffer.from(base64, "base64");
    } catch {
      return fail("That file isn't a supported image.", 400);
    }
    if (raw.byteLength > MAX_IMAGE_BYTES || !isSupportedImage(raw)) {
      return fail("Use a JPEG, PNG or WebP photo under 2 MB.", 415);
    }

    return withCardScanCapacity(vision, async () => {
      let clean: Buffer;
      try {
        clean = await sharp(raw, { failOn: "error", limitInputPixels: 40_000_000 })
          .rotate()
          .resize({ width: 1600, height: 1600, fit: "inside", withoutEnlargement: true })
          .jpeg({ quality: 82 })
          .toBuffer();
      } catch {
        return fail("That photo couldn't be read. Try another one.", 400);
      }

      const budget = await consumeCardScanBudget(vision);
      if (!budget.allowed) return fail("Card scanning has reached its shared limit. Please try again later.", 429, { "Retry-After": String(budget.retryAfter) });

      let text = "";
      try {
        const response = await fetch("https://vision.googleapis.com/v1/images:annotate", {
          method: "POST",
          headers: { "Content-Type": "application/json", "X-Goog-Api-Key": vision.GOOGLE_VISION_API_KEY },
          body: JSON.stringify({
            requests: [{ image: { content: clean.toString("base64") }, features: [{ type: "TEXT_DETECTION" }] }],
          }),
          signal: AbortSignal.timeout(12_000),
          redirect: "error",
        });
        if (!response.ok) throw new Error(`Vision API responded ${response.status}`);
        const data = (await response.json()) as {
          responses?: Array<{ fullTextAnnotation?: { text?: string }; error?: { message?: string } }>;
        };
        const first = data.responses?.[0];
        if (first?.error) throw new Error(first.error.message ?? "Vision API error");
        text = (first?.fullTextAnnotation?.text ?? "").slice(0, 4000);
      } catch (error) {
        logServerError("Card scan text recognition failed.", error);
        return fail("We couldn't read that card right now. Try again in a moment.", 502);
      }

      const read = readCardText(text);
      const results = await searchCatalog({ ...read, limit: 6 });
      return Response.json(
        { results, recognised: read.words.slice(0, 2).join(" ") || read.codes[0] || null },
        { headers },
      );
    });
  });
}
