import type { APIEvent } from "@solidjs/start/server";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "~/db";
import {
  inventoryMovements,
  products,
  productVariants,
} from "~/db/schema";
import {
  apiJson,
  requireAdmin,
  toSlug,
  writeAuditLog,
} from "~/lib/admin.server";
import { findProduct } from "~/lib/categories";

const duplicateSchema = z.object({
  id: z
    .string()
    .trim()
    .max(160)
    .refine(
      id => id.startsWith("static:") || z.string().uuid().safeParse(id).success,
      "Invalid product id",
    ),
});

type DuplicateVariant = {
  sku: string;
  barcode: string | null;
  name: string;
  language: string | null;
  condition: string | null;
  finish: string | null;
  imageUrl: string | null;
  isDefault: boolean;
  priceCents: number;
  compareAtPriceCents: number | null;
  stock: number;
  trackInventory: boolean;
};

type DuplicateSource = {
  id: string;
  categoryId: string | null;
  name: string;
  slug: string;
  description: string | null;
  brand: string | null;
  game: string | null;
  productType: string | null;
  imageUrls: string[];
  metadata: Record<string, unknown>;
  variants: DuplicateVariant[];
};

function duplicateSku(sku: string, suffix: string) {
  const base = sku.trim().slice(0, Math.max(1, 73 - suffix.length));
  return `${base}-C-${suffix}`;
}

export async function POST(event: APIEvent) {
  const guard = await requireAdmin(event);
  if (guard.response) return guard.response;

  try {
    const input = duplicateSchema.parse(await event.request.json());
    let source: DuplicateSource | undefined;

    if (input.id.startsWith("static:")) {
      const starter = findProduct(input.id.slice("static:".length));
      if (starter) {
        const starterVariants = starter.variants?.length
          ? starter.variants.map((variant, index) => ({
              sku: variant.sku,
              barcode: null,
              name: variant.name,
              language: variant.language ?? starter.language ?? "English",
              condition:
                variant.condition ??
                starter.condition ??
                (starter.productType === "sealed" ? "Sealed" : "Near Mint"),
              finish: variant.finish ?? starter.finish ?? null,
              imageUrl: variant.image ?? null,
              isDefault:
                variant.isDefault ??
                (!starter.variants?.some(candidate => candidate.isDefault) &&
                  index === 0),
              priceCents: variant.priceCents,
              compareAtPriceCents: variant.compareAtPriceCents ?? null,
              stock: variant.stock,
              trackInventory: true,
            }))
          : [
              {
                sku: `STARTER-${starter.id}`
                  .replace(/[^A-Za-z0-9_-]/g, "-")
                  .slice(0, 80)
                  .toUpperCase(),
                barcode: null,
                name: starter.condition ?? "Default",
                language: starter.language ?? "English",
                condition:
                  starter.condition ??
                  (starter.productType === "sealed" ? "Sealed" : "Near Mint"),
                finish: starter.finish ?? null,
                imageUrl: null,
                isDefault: true,
                priceCents:
                  starter.priceCents ?? starter.priceRangeCents?.[0] ?? 0,
                compareAtPriceCents: starter.compareAtPriceCents ?? null,
                stock: starter.stock ?? 1,
                trackInventory: true,
              },
            ];

        source = {
          id: input.id,
          categoryId: null,
          name: starter.name,
          slug: starter.id,
          description: starter.description ?? null,
          brand: null,
          game: starter.game,
          productType:
            starter.productType ?? (starter.image ? "single" : "sealed"),
          imageUrls: starter.image ? [starter.image] : [],
          metadata: {
            set: starter.set ?? null,
            badge: starter.badge ?? null,
            cardNumber: starter.cardNumber ?? null,
            rarity: starter.rarity ?? null,
            setCode: starter.setCode ?? null,
            illustrator: starter.illustrator ?? null,
            gradingCompany: starter.gradingCompany ?? null,
            grade: starter.grade ?? null,
            certificationNumber: starter.certificationNumber ?? null,
            shipsFrom: starter.shipsFrom ?? null,
            trailerUrl: starter.trailerUrl ?? null,
            releaseDate: starter.releaseDate ?? null,
            preorder: starter.preorder ?? false,
          },
          variants: starterVariants,
        };
      }
    } else {
      const [managedProduct] = await db
        .select()
        .from(products)
        .where(eq(products.id, input.id))
        .limit(1);

      if (managedProduct) {
        const managedVariants = await db
          .select()
          .from(productVariants)
          .where(eq(productVariants.productId, managedProduct.id));
        source = {
          ...managedProduct,
          variants: managedVariants,
        };
      }
    }

    if (!source) {
      return apiJson({ error: "Product not found." }, { status: 404 });
    }

    if (!source.variants.length) {
      return apiJson(
        { error: "The source product has no variant to copy." },
        { status: 400 },
      );
    }

    const suffix = crypto.randomUUID().slice(0, 8);
    const copyName = `${source.name} copy`;
    const copySlug = toSlug(`${source.slug}-copy-${suffix}`);

    const result = await db.transaction(async tx => {
      const [copy] = await tx
        .insert(products)
        .values({
          categoryId: source.categoryId,
          name: copyName,
          slug: copySlug,
          description: source.description,
          brand: source.brand,
          game: source.game,
          productType: source.productType,
          status: "draft",
          imageUrls: [...source.imageUrls],
          metadata: {
            ...source.metadata,
            source: "managed",
            duplicatedFrom: source.id,
          },
        })
        .returning();

      if (!copy) throw new Error("Product copy was not created.");

      const copiedVariants: Array<typeof productVariants.$inferSelect> = [];
      for (const variant of source.variants) {
        const [copiedVariant] = await tx
          .insert(productVariants)
          .values({
            productId: copy.id,
            sku: duplicateSku(variant.sku, suffix),
            barcode: null,
            name: variant.name,
            language: variant.language,
            condition: variant.condition,
            finish: variant.finish,
            imageUrl: variant.imageUrl,
            isDefault: variant.isDefault,
            priceCents: variant.priceCents,
            compareAtPriceCents: variant.compareAtPriceCents,
            stock: variant.stock,
            reservedStock: 0,
            trackInventory: variant.trackInventory,
          })
          .returning();

        if (!copiedVariant) throw new Error("Product variant was not copied.");
        copiedVariants.push(copiedVariant);

        if (copiedVariant.stock > 0) {
          await tx.insert(inventoryMovements).values({
            variantId: copiedVariant.id,
            quantity: copiedVariant.stock,
            reason: "adjustment",
            note: `Opening stock copied from ${source.name}`,
            createdBy: guard.session!.user.id,
          });
        }
      }

      return { product: copy, variants: copiedVariants };
    });

    await writeAuditLog({
      event,
      actorId: guard.session!.user.id,
      action: "product.duplicated",
      entityType: "product",
      entityId: result.product.id,
      summary: `${source.name} duplicated as a draft.`,
      metadata: { sourceProductId: source.id },
    });

    return apiJson(result, { status: 201 });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return apiJson({ error: "Choose a valid product to duplicate." }, { status: 400 });
    }
    if ((error as { code?: string }).code === "23505") {
      return apiJson({ error: "The copy conflicted with an existing slug or SKU. Try again." }, { status: 409 });
    }
    console.error("Product duplication failed", error);
    return apiJson({ error: "The product could not be duplicated." }, { status: 500 });
  }
}
