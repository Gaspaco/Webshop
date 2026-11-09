import type { APIEvent } from "@solidjs/start/server";
import { createHash } from "node:crypto";
import { eq, inArray } from "drizzle-orm";
import { z } from "zod";
import { db } from "~/db";
import { products, productVariants } from "~/db/schema";
import { apiJson, requireAdmin, writeAuditLog } from "~/lib/admin.server";
import { checkRateLimit } from "~/lib/rate-limit.server";
import { logServerError } from "~/lib/server-log";
import { ReferenceError, readReference, storeReferences, referenceKey } from "~/lib/reference-cache.server";
import { REFERENCE_PROVIDERS, providerKey, searchReferenceProvider, vanguardArtwork } from "~/lib/reference-providers.server";
import { channel3Options, lookupChannel3 } from "~/lib/channel3.server";
import { MERCHANDISE_KINDS, type ReferenceProduct } from "~/lib/reference-products";
import { PRODUCT_GAMES, typeAttributes } from "~/lib/product-types";
import { ensureProductTypeCategory } from "~/lib/product-types.server";

const querySchema = z.object({ q: z.string().trim().min(2).max(100), by: z.enum(["card", "set"]).default("card"), page: z.coerce.number().int().min(1).max(200).default(1),
  family: z.enum(["sets", "decks", "promos"]).default("sets"), kind: z.enum(MERCHANDISE_KINDS.map(kind => kind.value)).default("funko"), game: z.enum(PRODUCT_GAMES).default("other"),
  brandId: z.string().trim().min(1).max(160).optional(), categoryId: z.string().trim().min(1).max(160).optional(),
  mode: z.enum(["keyword", "default"]).default("keyword"), country: z.enum(["all", "NL"]).default("all") });
const digest = (value: string) => createHash("sha256").update(value).digest("hex");
const slug = (provider: string, id: string) => `ref-${provider}-${digest(id).slice(0, 32)}`;
const cardKey = (provider: string, input: { kind: string; game: string; family: string }, id: string) => referenceKey(provider, ["card", input.kind, input.game, input.family, id]);
function fail(error: unknown) {
  if (error instanceof z.ZodError) return apiJson({ error: error.issues[0]?.message ?? "Check the search details." }, { status: 400 });
  if (error instanceof ReferenceError) return apiJson({ error: error.message, retryAfter: error.retryAfter }, { status: error.status, ...(error.retryAfter ? { headers: { "Retry-After": String(error.retryAfter) } } : {}) });
  logServerError("Reference catalogue operation failed", error);
  return apiJson({ error: "This catalogue could not be reached. Try again shortly." }, { status: 502 });
}
export async function GET(event: APIEvent) {
  const guard = await requireAdmin(event); if (guard.response) return guard.response;
  try {
    const provider = z.enum(REFERENCE_PROVIDERS).parse(event.params.provider);
    const params = new URL(event.request.url).searchParams;
    const input = querySchema.parse(Object.fromEntries(params));
    if (await checkRateLimit({ event, namespace: "reference-search", identity: guard.session!.user.id, limit: 40, windowMs: 60_000 })) throw new ReferenceError("Please slow down the catalogue searches.", 429, 60);
    if (provider === "channel3" && params.get("action") === "options") {
      const type = z.enum(["brand", "category"]).parse(params.get("type"));
      return apiJson({ options: await channel3Options(type, input.q, providerKey(provider)!) });
    }
    const result = await searchReferenceProvider(provider, input);
    const cards = [...new Map(result.cards.map(card => [card.id, card])).values()];
    await storeReferences(cards.map(card => ({ key: cardKey(provider, input, card.id), payload: card })), 30 * 86400_000);
    const slugs = cards.map(card => slug(provider, card.id));
    const imported = slugs.length ? await db.select({ slug: products.slug, status: products.status }).from(products).where(inArray(products.slug, slugs)) : [];
    const statuses = new Map(imported.map(row => [row.slug, row.status]));
    return apiJson({ ...result, page: input.page, cards: cards.map(card => ({ ...card, importedStatus: statuses.get(slug(provider, card.id)) ?? null })) });
  } catch (error) { return fail(error); }
}
export async function POST(event: APIEvent) {
  const guard = await requireAdmin(event); if (guard.response) return guard.response;
  try {
    const provider = z.enum(REFERENCE_PROVIDERS).parse(event.params.provider);
    const input = querySchema.parse({ q: "import", ...Object.fromEntries(new URL(event.request.url).searchParams) });
    const raw = await event.request.json();
    if (provider === "channel3" && raw?.action === "lookup") {
      const body = z.object({ url: z.string().trim().min(1).max(2000) }).parse(raw);
      if (await checkRateLimit({ event, namespace: "channel3-lookup", identity: guard.session!.user.id, limit: 10, windowMs: 60_000 })) throw new ReferenceError("Please wait before looking up more product links.", 429, 60);
      const cards = await lookupChannel3(body.url, input.kind, input.game, providerKey(provider)!);
      await storeReferences(cards.map(card => ({ key: cardKey(provider, input, card.id), payload: card })), 30 * 86400_000);
      const existing = await db.select({ slug: products.slug, status: products.status }).from(products).where(inArray(products.slug, cards.map(card => slug(provider, card.id))));
      return apiJson({ cards: cards.map(card => ({ ...card, importedStatus: existing.find(row => row.slug === slug(provider, card.id))?.status ?? null })) });
    }
    const body = z.object({ cardId: z.string().trim().min(1).max(200), rightsConfirmed: z.boolean().optional() }).parse(raw);
    if (provider === "channel3" && !body.rightsConfirmed) throw new ReferenceError("Confirm that you sell this item and have permission to reuse its supplied product data and images.", 400);
    const card = await readReference<ReferenceProduct>(cardKey(provider, input, body.cardId));
    if (!card) throw new ReferenceError("Search for this product again before importing it.", 400);
    const [existing] = await db.select({ id: products.id }).from(products).where(eq(products.slug, slug(provider, card.id))).limit(1);
    if (existing) return apiJson({ ok: true, alreadyImported: true, variants: card.variants.length });
    let artwork = card.image;
    if (provider === "vanguard") artwork = await vanguardArtwork(card.id);
    const result = await db.transaction(async tx => {
      const [product] = await tx.insert(products).values({ slug: slug(provider, card.id), name: card.name, brand: card.brand || null, game: card.game,
        categoryId: await ensureProductTypeCategory(tx, card.productType), productType: card.productType, status: "draft", description: card.description || null,
        imageUrls: artwork ? [artwork] : [], metadata: { source: provider, referenceId: card.id, set: card.setName || null, setCode: card.setCode || null,
          cardNumber: card.number || null, rarity: card.rarity || null, attributes: typeAttributes(card.productType, card.attributes), referencePrice: card.referencePriceLabel,
          ...(provider === "channel3" ? { mediaRightsConfirmedBy: guard.session!.user.id, mediaRightsConfirmedAt: new Date().toISOString() } : {}) } }).onConflictDoNothing({ target: products.slug }).returning();
      if (!product) return null;
      const options = card.variants.slice(0, 50);
      await tx.insert(productVariants).values(options.map((variant, i) => ({ productId: product.id, sku: `REF-${provider.slice(0, 3).toUpperCase()}-${digest(card.id).slice(0, 32)}-${i + 1}`,
        name: variant.name || "Default", condition: card.productType === "single" ? "Near Mint" : "New", language: card.game ? variant.language : null,
        finish: card.game ? variant.finish || null : null, imageUrl: variant.image || artwork, priceCents: provider === "channel3" ? 0 : variant.priceCents,
        attributes: typeAttributes(card.productType, { ...(card.game ? { setName: card.setName, setCode: card.setCode } : {}), ...variant.attributes }, true), stock: 0, isDefault: i === 0 })));
      return product;
    });
    if (result) await writeAuditLog({ event, actorId: guard.session!.user.id, action: "product.reference_imported", entityType: "product", entityId: result.id, summary: `${card.name} imported from ${provider} as a zero-stock draft.` });
    return apiJson({ ok: true, alreadyImported: !result, variants: card.variants.length, hasImage: !!artwork }, { status: result ? 201 : 200 });
  } catch (error) { return fail(error); }
}
