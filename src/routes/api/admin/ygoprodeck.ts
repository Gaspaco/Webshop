import type { APIEvent } from "@solidjs/start/server";
import { asc, eq, ilike, inArray } from "drizzle-orm";
import { z } from "zod";
import { db } from "~/db";
import {
  products,
  productVariants,
  yugiohCards,
  yugiohPrintings,
} from "~/db/schema";
import { apiJson, requireAdmin, toSlug, writeAuditLog } from "~/lib/admin.server";

const importCardSchema = z.object({ cardId: z.number().int().positive() });

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
    if (url.protocol !== "https:" || url.hostname !== "images.ygoprodeck.com") {
      throw new Error("Unexpected YGOPRODeck image host.");
    }

    const response = await fetch(url, {
      headers: { "User-Agent": "TCGHaven catalogue import (info@tcghaven.com)" },
      signal: AbortSignal.timeout(20_000),
    });
    if (!response.ok) throw new Error(`Card image returned ${response.status}.`);
    const contentType = response.headers.get("content-type")?.split(";")[0] ?? "";
    if (!["image/jpeg", "image/png", "image/webp"].includes(contentType)) {
      throw new Error("Card image returned an unsupported file type.");
    }
    const bytes = new Uint8Array(await response.arrayBuffer());
    if (bytes.byteLength > 850_000) {
      throw new Error("Card image is larger than the catalogue image limit.");
    }
    return `data:${contentType};base64,${Buffer.from(bytes).toString("base64")}`;
  } catch (error) {
    // The artwork is a nice-to-have, not a reason to lose the card. The import
    // reports the miss so the admin can add an image on the draft.
    console.warn(`YGOPRODeck image unavailable for ${source}`, error);
    return null;
  }
}

export async function GET(event: APIEvent) {
  const guard = await requireAdmin(event);
  if (guard.response) return guard.response;

  try {
    const url = new URL(event.request.url);
    const query = url.searchParams.get("q")?.trim().slice(0, 80) ?? "";
    const cardRows = await db
      .select()
      .from(yugiohCards)
      .where(query ? ilike(yugiohCards.name, `%${query}%`) : undefined)
      .orderBy(asc(yugiohCards.name))
      .limit(40);

    const ids = cardRows.map(card => card.id);
    const printingRows = ids.length
      ? await db
          .select()
          .from(yugiohPrintings)
          .where(inArray(yugiohPrintings.cardId, ids))
          .orderBy(asc(yugiohPrintings.setName), asc(yugiohPrintings.rarity))
      : [];
    const printingsByCard = new Map<number, typeof printingRows>();
    for (const printing of printingRows) {
      const values = printingsByCard.get(printing.cardId) ?? [];
      values.push(printing);
      printingsByCard.set(printing.cardId, values);
    }

    const slugs = cardRows.map(productSlug);
    const importedRows = slugs.length
      ? await db
          .select({ slug: products.slug, status: products.status })
          .from(products)
          .where(inArray(products.slug, slugs))
      : [];
    const imported = new Map(importedRows.map(row => [row.slug, row.status]));

    return apiJson({
      cards: cardRows.map(card => ({
        ...card,
        importedStatus: imported.get(productSlug(card)) ?? null,
        printings: printingsByCard.get(card.id) ?? [],
      })),
    });
  } catch (error) {
    console.error("Local YGOPRODeck search failed", error);
    return apiJson(
      { error: "The local Yu-Gi-Oh library is not ready. Run its database migration and sync first." },
      { status: 503 },
    );
  }
}

export async function POST(event: APIEvent) {
  const guard = await requireAdmin(event);
  if (guard.response) return guard.response;

  try {
    const input = importCardSchema.parse(await event.request.json());
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
      .where(eq(products.slug, slug))
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
    const image = await downloadCardImage(card.imageSourceUrl);
    const variants = printings.length
      ? printings
      : [{
          setName: "Unspecified printing",
          setCode: String(card.id),
          rarity: "Unspecified",
          rarityCode: null,
        }];
    const skus = await uniqueSkus(
      variants.map((printing, index) =>
        skuFor(card.id, printing.setCode, printing.rarity, index),
      ),
    );

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
          imageUrls: image ? [image] : [],
          metadata: {
            source: "ygoprodeck",
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
          imageUrl: null,
          isDefault: index === 0,
          priceCents: card.cardmarketPriceCents ?? 0,
          stock: 0,
          trackInventory: true,
        })),
      );
      return product;
    });

    await writeAuditLog({
      event,
      actorId: guard.session!.user.id,
      action: "catalogue.ygoprodeck_added",
      entityType: "product",
      entityId: created.id,
      summary: `${created.name} added from the local YGOPRODeck library as a draft${image ? "" : " without artwork"}.`,
      metadata: { cardId: card.id, variants: variants.length, hasImage: Boolean(image) },
    });

    return apiJson(
      { product: created, variants: variants.length, hasImage: Boolean(image) },
      { status: 201 },
    );
  } catch (error) {
    if (error instanceof z.ZodError) {
      return apiJson({ error: "Choose a valid Yu-Gi-Oh card." }, { status: 400 });
    }
    console.error("YGOPRODeck catalogue import failed", error);
    return apiJson(
      { error: "The card could not be added. Check the server log for the reason." },
      { status: 500 },
    );
  }
}
