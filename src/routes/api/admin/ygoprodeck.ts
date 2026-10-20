import { logServerError } from "~/lib/server-log";
import type { APIEvent } from "@solidjs/start/server";
import { and, asc, eq, inArray, or, sql } from "drizzle-orm";
import { z } from "zod";
import { db } from "~/db";
import {
  products,
  productVariants,
  yugiohCards,
  yugiohPrintings,
} from "~/db/schema";
import { apiJson, requireAdmin, toSlug, writeAuditLog } from "~/lib/admin.server";
import { preferredPrintingImage } from "~/lib/yugipedia-image";
import { searchYugipedia, YugipediaBusyError } from "~/lib/yugipedia.server";
import { isYugipediaImageUrl } from "~/lib/yugipedia-catalog";
import { checkRateLimit } from "~/lib/rate-limit.server";

const importCardSchema = z.object({ cardId: z.number().int().min(-2147483647).max(2147483647).refine(id => id !== 0) });

type YugiohCardRow = typeof yugiohCards.$inferSelect;
type YugiohPrintingRow = typeof yugiohPrintings.$inferSelect;

function productSlug(card: { id: number; name: string }) {
  return toSlug(`yugioh-${card.id}-${card.name}`);
}

function skuPart(value: string, limit: number) {
  return value.replace(/[^a-z0-9]+/gi, "-").replace(/^-|-$/g, "").slice(0, limit);
}

// A card is often printed in the same set at several rarities, so the set code
// alone is not unique. Leaving the rarity out made every such card collide on
// the unique variant SKU index and roll the whole import back.
function skuFor(cardId: number, setCode: string, rarity: string, index: number) {
  const code = skuPart(setCode, 24) || `INDEX-${index + 1}`;
  const finish = skuPart(rarity, 24) || "STD";
  return `YGO-${cardId}-${code}-${finish}`.slice(0, 80).toUpperCase();
}

// Belt and braces: suffix anything that still repeats within this import or
// already exists in the catalogue, so one clash cannot lose the whole card.
async function uniqueSkus(candidates: string[]) {
  const taken = new Set(
    (await db
      .select({ sku: productVariants.sku })
      .from(productVariants)
      .where(inArray(productVariants.sku, candidates)))
      .map(row => row.sku),
  );

  return candidates.map(candidate => {
    let sku = candidate;
    let attempt = 2;
    while (taken.has(sku)) {
      const suffix = `-${attempt}`;
      sku = `${candidate.slice(0, 80 - suffix.length)}${suffix}`;
      attempt += 1;
    }
    taken.add(sku);
    return sku;
  });
}

async function downloadCardImage(source: string | null) {
  if (!source) return null;

  try {
    const url = new URL(source);
    if (!isYugipediaImageUrl(source)) {
      throw new Error("Only Yugipedia card images may be downloaded.");
    }

    const response = await fetch(url, {
      headers: { "User-Agent": "TCGHaven catalogue import (info@tcghaven.com)" },
      signal: AbortSignal.timeout(20_000),
      redirect: "error",
    });
    if (!response.ok) throw new Error(`Card image returned ${response.status}.`);

    const contentType = response.headers.get("content-type")?.split(";")[0] ?? "";
    if (!["image/jpeg", "image/png", "image/webp"].includes(contentType)) {
      throw new Error("Card image returned an unsupported file type.");
    }

    const reader = response.body!.getReader(); const parts: Uint8Array[] = []; let size = 0;
    for (;;) {
      const { done, value } = await reader.read(); if (done) break;
      size += value.byteLength;
      if (size > 850_000) { await reader.cancel(); throw new Error("Card image is larger than the catalogue image limit."); }
      parts.push(value);
    }

    return `data:${contentType};base64,${Buffer.concat(parts).toString("base64")}`;
  } catch (error) {
    // A missing fallback must not discard the card or its printings. Exact
    // printing scans can still supply artwork for the variants that have one.
    logServerError("Yugipedia card image unavailable.", error);
    return null;
  }
}

async function searchResponse(
  cardRows: YugiohCardRow[],
  printingRows: YugiohPrintingRow[],
  matchedSets: string[] = [],
) {
  const printingsByCard = new Map<number, YugiohPrintingRow[]>();
  for (const printing of printingRows) {
    const values = printingsByCard.get(printing.cardId) ?? [];
    values.push(printing);
    printingsByCard.set(printing.cardId, values);
  }

  const slugs = cardRows.map(productSlug);
  const importedRows = slugs.length
    ? await db
        .select({ slug: products.slug, status: products.status, metadata: products.metadata })
        .from(products)
        .where(or(inArray(products.slug, slugs), and(eq(products.game, "yugioh"), inArray(sql<string>`${products.metadata}->>'sourceCardId'`, cardRows.map(card => String(card.id))))))
    : [];
  const imported = new Map(importedRows.map(row => [row.slug, row.status]));
  const importedIds = new Map(importedRows.map(row => [String(row.metadata?.sourceCardId ?? ""), row.status]));

  return apiJson({
    cards: cardRows.map(card => ({
      ...card,
      imageSourceUrl: card.imageSourceUrl && isYugipediaImageUrl(card.imageSourceUrl)
        ? `/card-images/yugipedia/card/${card.id}` : null,
      importedStatus: importedIds.get(String(card.id)) ?? imported.get(productSlug(card)) ?? null,
      printings: printingsByCard.get(card.id) ?? [],
    })),
    matchedSets,
  });
}

async function lookup(event: APIEvent, query: string, by: "card" | "set", fresh: boolean, ownerId: string) {
  if (await checkRateLimit({ event, namespace: fresh ? "yugipedia-refresh" : "yugipedia-search", identity: ownerId, limit: fresh ? 1 : 20, windowMs: 60_000 })) {
    return apiJson({ error: "Please wait a minute before refreshing Yugipedia again." }, { status: 429 });
  }
  const result = await searchYugipedia(query, by, fresh);
  const cardRows = result.cardIds.length ? await db.select().from(yugiohCards).where(inArray(yugiohCards.id, result.cardIds)).orderBy(asc(yugiohCards.name)) : [];
  const printingRows = result.cardIds.length ? await db.select().from(yugiohPrintings).where(inArray(yugiohPrintings.cardId, result.cardIds)).orderBy(asc(yugiohPrintings.setName), asc(yugiohPrintings.rarity)) : [];
  return searchResponse(cardRows, by === "set" ? printingRows.filter(row => result.matchedSets.includes(row.setName)) : printingRows, result.matchedSets);
}

export async function GET(event: APIEvent) {
  const guard = await requireAdmin(event);
  if (guard.response) return guard.response;
  try {
    const url = new URL(event.request.url);
    const query = z.string().trim().max(80).parse(url.searchParams.get("q") ?? "");
    return await lookup(event, query, url.searchParams.get("by") === "set" ? "set" : "card", false, guard.session!.user.id);
  } catch (error) {
    if (error instanceof z.ZodError) return apiJson({ error: "Use a card or set name of up to 80 characters." }, { status: 400 });
    logServerError("Yugipedia library lookup failed.", error);
    return apiJson({ error: error instanceof YugipediaBusyError ? error.message : "Yugipedia could not be refreshed. Try again shortly; migration 0017 is required for the local cache." }, { status: 503 });
  }
}

export async function POST(event: APIEvent) {
  const guard = await requireAdmin(event);
  if (guard.response) return guard.response;

  try {
    const body = await event.request.json();
    if (body && typeof body === "object" && body.action === "refresh") {
      const input = z.object({ q: z.string().trim().min(1).max(80), by: z.enum(["card", "set"]) }).parse(body);
      return await lookup(event, input.q, input.by, true, guard.session!.user.id);
    }
    const input = importCardSchema.parse(body);
    const [card] = await db
      .select()
      .from(yugiohCards)
      .where(eq(yugiohCards.id, input.cardId))
      .limit(1);
    if (!card) {
      return apiJson({ error: "Card not found in the local Yu-Gi-Oh database." }, { status: 404 });
    }

    const slug = productSlug(card);
    const [existing] = await db
      .select({ id: products.id })
      .from(products)
      .where(or(eq(products.slug, slug), and(eq(products.game, "yugioh"), sql`${products.metadata}->>'sourceCardId' = ${String(card.id)}`)))
      .limit(1);
    if (existing) {
      return apiJson(
        { error: "This card is already in the catalogue." },
        { status: 409 },
      );
    }

    const printings = await db
      .select()
      .from(yugiohPrintings)
      .where(eq(yugiohPrintings.cardId, card.id))
      .orderBy(asc(yugiohPrintings.setName), asc(yugiohPrintings.rarity));
    const variants = printings.length
      ? printings
      : [{
          setName: "Unspecified printing",
          setCode: String(card.id),
          rarity: "Unspecified",
          rarityCode: null,
          id: crypto.randomUUID(),
          imageSourceUrl: null,
          imageStorageUrl: null,
          imageProvider: null,
          sourcePriceCents: null,
        }];
    const genericArtwork = await downloadCardImage(card.imageSourceUrl);
    const exactVariantArtwork = variants.map(preferredPrintingImage);
    const variantArtwork = exactVariantArtwork.map(image => image ?? (printings.length ? null : genericArtwork));
    const printingArtwork = exactVariantArtwork
      .find((image): image is string => Boolean(image)) ?? null;
    const productArtwork = printingArtwork ?? genericArtwork;
    const skus = await uniqueSkus(
      variants.map((printing, index) =>
        skuFor(card.id, printing.setCode, printing.rarity, index),
      ),
    );
    const variantPrices = variants.map(printing =>
      printing.sourcePriceCents && printing.sourcePriceCents > 0
        ? printing.sourcePriceCents
        : card.cardmarketPriceCents && card.cardmarketPriceCents > 0
          ? card.cardmarketPriceCents
          : 0,
    );
    const pricesNeedingReview = variantPrices.filter(price => price <= 0).length;

    const created = await db.transaction(async tx => {
      const [product] = await tx
        .insert(products)
        .values({
          name: card.name,
          slug,
          description: card.description,
          brand: "Konami",
          game: "yugioh",
          productType: "single",
          status: "draft",
          imageUrls: productArtwork ? [productArtwork] : [],
          metadata: {
            source: "yugipedia",
            sourceCardId: card.id,
            sourceUrl: card.sourceUrl,
            set: variants[0]?.setName ?? null,
            setCode: variants[0]?.setCode ?? null,
            rarity: variants[0]?.rarity ?? null,
            cardType: card.cardType,
            race: card.race,
            archetype: card.archetype,
            attribute: card.attribute,
            attack: card.attack,
            defense: card.defense,
            level: card.level,
            printingImageProvider: printingArtwork
              ? "yugipedia"
              : genericArtwork
                ? "yugipedia"
                : null,
            priceNeedsReview: pricesNeedingReview > 0,
            pricesNeedingReview,
          },
        })
        .returning({ id: products.id, name: products.name, slug: products.slug });
      if (!product) throw new Error("Product was not created.");

      await tx.insert(productVariants).values(
        variants.map((printing, index) => ({
          productId: product.id,
          sku: skus[index]!,
          name: `${printing.setName} · ${printing.rarity}`.slice(0, 120),
          condition: "Near Mint",
          language: "English",
          finish: printing.rarity,
          // Prefer the exact printing scan. Every other printing receives the
          // retained generic card image, including variants with zero stock.
          imageUrl: variantArtwork[index] ?? null,
          isDefault: index === 0,
          // Retain any previously stored market references. Yugipedia itself
          // provides no prices; new cards stay drafts flagged for price review.
          priceCents: variantPrices[index] ?? 0,
          stock: 0,
          trackInventory: true,
        })),
      );
      return product;
    });

    await writeAuditLog({
      event,
      actorId: guard.session!.user.id,
      action: "catalogue.yugipedia_added",
      entityType: "product",
      entityId: created.id,
      summary: `${created.name} added from the cached Yugipedia library as a draft${productArtwork ? "" : " without artwork"}.`,
      metadata: {
        cardId: card.id,
        variants: variants.length,
        hasImage: Boolean(productArtwork),
        printingImages: exactVariantArtwork.filter(Boolean).length,
        variantImages: variantArtwork.filter(Boolean).length,
        pricesNeedingReview,
      },
    });

    return apiJson(
      { product: created, variants: variants.length, hasImage: Boolean(productArtwork) },
      { status: 201 },
    );
  } catch (error) {
    if (error instanceof z.ZodError) {
      return apiJson({ error: "Choose a valid Yu-Gi-Oh card." }, { status: 400 });
    }
    if (error instanceof YugipediaBusyError) return apiJson({ error: error.message }, { status: 503 });
    logServerError("Yugipedia catalogue import failed", error);
    return apiJson(
      { error: "The card could not be added. Check the server log for the reason." },
      { status: 500 },
    );
  }
}
