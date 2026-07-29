import type { APIEvent } from "@solidjs/start/server";
import { and, eq } from "drizzle-orm";
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

const statusSchema = z.enum(["draft", "active", "archived"]);
const gameSchema = z.enum(["pokemon", "yugioh", "magic", "other"]);
const imageSchema = z
  .string()
  .trim()
  .max(1_200_000)
  .refine(
    value =>
      value === "" ||
      value.startsWith("/") ||
      value.startsWith("https://") ||
      /^data:image\/(?:webp|jpeg|png);base64,/i.test(value),
    "Use an HTTPS image, a local image path, or upload a JPG, PNG, or WebP file.",
  );

const tcgFields = {
  cardNumber: z.string().trim().max(60).optional().default(""),
  rarity: z.string().trim().max(80).optional().default(""),
  setCode: z.string().trim().max(60).optional().default(""),
  illustrator: z.string().trim().max(120).optional().default(""),
  gradingCompany: z.string().trim().max(40).optional().default(""),
  grade: z.string().trim().max(20).optional().default(""),
  certificationNumber: z.string().trim().max(80).optional().default(""),
};

const createProductSchema = z.object({
  name: z.string().trim().min(2).max(140),
  slug: z.string().trim().max(110).optional().default(""),
  description: z.string().trim().max(2400).optional().default(""),
  game: gameSchema,
  productType: z.enum(["single", "sealed", "graded", "accessory"]),
  set: z.string().trim().max(120).optional().default(""),
  badge: z.string().trim().max(32).optional().default(""),
  image: imageSchema.optional().default(""),
  status: statusSchema,
  sku: z.string().trim().max(80).optional().default(""),
  condition: z.string().trim().max(60).optional().default("Near Mint"),
  language: z.string().trim().max(60).optional().default("English"),
  finish: z.string().trim().max(60).optional().default(""),
  ...tcgFields,
  priceCents: z.number().int().min(0).max(100_000_000),
  compareAtPriceCents: z.number().int().min(0).max(100_000_000).nullable().optional(),
  stock: z.number().int().min(0).max(1_000_000),
});

const updateProductSchema = createProductSchema.partial().extend({
  id: z.string().uuid(),
  variantId: z.string().uuid(),
});
const starterOverrideSchema = createProductSchema.extend({
  id: z.string().startsWith("static:"),
  variantId: z.string().startsWith("static:"),
});

function failure(error: unknown) {
  if (error instanceof z.ZodError) {
    return apiJson(
      { error: error.issues[0]?.message ?? "Check the product details." },
      { status: 400 },
    );
  }

  const code = (error as { code?: string }).code;
  if (code === "23505") {
    return apiJson(
      { error: "That product slug or SKU is already in use." },
      { status: 409 },
    );
  }

  console.error("Admin product mutation failed", error);
  return apiJson(
    { error: "The product could not be saved." },
    { status: 500 },
  );
}

export async function POST(event: APIEvent) {
  const guard = await requireAdmin(event);
  if (guard.response) return guard.response;

  try {
    const input = createProductSchema.parse(await event.request.json());
    const slug = toSlug(input.slug || input.name);
    if (!slug) {
      return apiJson({ error: "Enter a product name." }, { status: 400 });
    }

    const result = await db.transaction(async tx => {
      const [createdProduct] = await tx
        .insert(products)
        .values({
          name: input.name,
          slug,
          description: input.description || null,
          game: input.game,
          productType: input.productType,
          status: input.status,
          imageUrls: input.image ? [input.image] : [],
          metadata: {
            set: input.set || null,
            badge: input.badge || null,
            cardNumber: input.cardNumber || null,
            rarity: input.rarity || null,
            setCode: input.setCode || null,
            illustrator: input.illustrator || null,
            gradingCompany: input.gradingCompany || null,
            grade: input.grade || null,
            certificationNumber: input.certificationNumber || null,
          },
        })
        .returning();

      if (!createdProduct) throw new Error("Product insert returned no row.");

      const sku =
        input.sku ||
        `${input.game.slice(0, 3).toUpperCase()}-${slug.slice(0, 36).toUpperCase()}`;
      const [variant] = await tx
        .insert(productVariants)
        .values({
          productId: createdProduct.id,
          sku,
          name: input.condition || "Default",
          condition: input.condition || null,
          language: input.language || null,
          finish: input.finish || null,
          priceCents: input.priceCents,
          compareAtPriceCents: input.compareAtPriceCents ?? null,
          stock: input.stock,
        })
        .returning();

      if (!variant) throw new Error("Variant insert returned no row.");

      if (input.stock > 0) {
        await tx.insert(inventoryMovements).values({
          variantId: variant.id,
          quantity: input.stock,
          reason: "adjustment",
          note: "Opening stock from admin dashboard",
          createdBy: guard.session!.user.id,
        });
      }

      return { product: createdProduct, variant };
    });

    await writeAuditLog({
      event,
      actorId: guard.session!.user.id,
      action: "product.created",
      entityType: "product",
      entityId: result.product.id,
      summary: `${result.product.name} created as ${result.product.status}.`,
    });

    return apiJson(result, { status: 201 });
  } catch (error) {
    return failure(error);
  }
}

export async function PATCH(event: APIEvent) {
  const guard = await requireAdmin(event);
  if (guard.response) return guard.response;

  try {
    const payload = await event.request.json();
    if (
      typeof payload?.id === "string" &&
      payload.id.startsWith("static:")
    ) {
      const input = starterOverrideSchema.parse(payload);
      const starterSlug = input.id.slice("static:".length);
      const starter = findProduct(starterSlug);
      if (!starter || input.variantId !== `static:${starterSlug}`) {
        return apiJson(
          { error: "Starter product could not be verified." },
          { status: 404 },
        );
      }

      const result = await db.transaction(async tx => {
        const [createdProduct] = await tx
          .insert(products)
          .values({
            name: input.name,
            slug: starterSlug,
            description: input.description || null,
            game: input.game,
            productType: input.productType,
            status: input.status,
            imageUrls: input.image ? [input.image] : [],
            metadata: {
              set: input.set || null,
              badge: input.badge || null,
              cardNumber: input.cardNumber || null,
              rarity: input.rarity || null,
              setCode: input.setCode || null,
              illustrator: input.illustrator || null,
              gradingCompany: input.gradingCompany || null,
              grade: input.grade || null,
              certificationNumber: input.certificationNumber || null,
              source: "managed",
            },
          })
          .returning();
        if (!createdProduct) throw new Error("Starter product was not created.");

        const [variant] = await tx
          .insert(productVariants)
          .values({
            productId: createdProduct.id,
            sku: input.sku,
            name: input.condition || "Default",
            condition: input.condition || null,
            language: input.language || null,
            finish: input.finish || null,
            priceCents: input.priceCents,
            compareAtPriceCents: input.compareAtPriceCents ?? null,
            stock: input.stock,
          })
          .returning();
        if (!variant) throw new Error("Starter variant was not created.");

        if (input.stock > 0) {
          await tx.insert(inventoryMovements).values({
            variantId: variant.id,
            quantity: input.stock,
            reason: "adjustment",
            note: "Opening stock for converted starter listing",
            createdBy: guard.session!.user.id,
          });
        }
        return { product: createdProduct, variant };
      });

      await writeAuditLog({
        event,
        actorId: guard.session!.user.id,
        action: "product.starter_converted",
        entityType: "product",
        entityId: result.product.id,
        summary: `${result.product.name} converted to a managed listing.`,
      });

      return apiJson({ ok: true, ...result });
    }

    const input = updateProductSchema.parse(payload);
    const [currentVariant] = await db
      .select({ stock: productVariants.stock })
      .from(productVariants)
      .where(
        and(
          eq(productVariants.id, input.variantId),
          eq(productVariants.productId, input.id),
        ),
      )
      .limit(1);

    if (!currentVariant) {
      return apiJson({ error: "Product variant not found." }, { status: 404 });
    }

    await db.transaction(async tx => {
      const productChanges: Partial<typeof products.$inferInsert> = {};
      if (input.name !== undefined) productChanges.name = input.name;
      if (input.slug !== undefined) productChanges.slug = toSlug(input.slug || input.name || "");
      if (input.description !== undefined) productChanges.description = input.description || null;
      if (input.game !== undefined) productChanges.game = input.game;
      if (input.productType !== undefined) productChanges.productType = input.productType;
      if (input.status !== undefined) productChanges.status = input.status;
      if (input.image !== undefined) productChanges.imageUrls = input.image ? [input.image] : [];
      if (
        input.set !== undefined ||
        input.badge !== undefined ||
        input.cardNumber !== undefined ||
        input.rarity !== undefined ||
        input.setCode !== undefined ||
        input.illustrator !== undefined ||
        input.gradingCompany !== undefined ||
        input.grade !== undefined ||
        input.certificationNumber !== undefined
      ) {
        const [stored] = await tx
          .select({ metadata: products.metadata })
          .from(products)
          .where(eq(products.id, input.id))
          .limit(1);
        productChanges.metadata = {
          ...(stored?.metadata ?? {}),
          ...(input.set !== undefined ? { set: input.set || null } : {}),
          ...(input.badge !== undefined ? { badge: input.badge || null } : {}),
          ...(input.cardNumber !== undefined
            ? { cardNumber: input.cardNumber || null }
            : {}),
          ...(input.rarity !== undefined ? { rarity: input.rarity || null } : {}),
          ...(input.setCode !== undefined ? { setCode: input.setCode || null } : {}),
          ...(input.illustrator !== undefined
            ? { illustrator: input.illustrator || null }
            : {}),
          ...(input.gradingCompany !== undefined
            ? { gradingCompany: input.gradingCompany || null }
            : {}),
          ...(input.grade !== undefined ? { grade: input.grade || null } : {}),
          ...(input.certificationNumber !== undefined
            ? { certificationNumber: input.certificationNumber || null }
            : {}),
        };
      }

      if (Object.keys(productChanges).length) {
        await tx.update(products).set(productChanges).where(eq(products.id, input.id));
      }

      const variantChanges: Partial<typeof productVariants.$inferInsert> = {};
      if (input.sku !== undefined) variantChanges.sku = input.sku;
      if (input.condition !== undefined) {
        variantChanges.condition = input.condition || null;
        variantChanges.name = input.condition || "Default";
      }
      if (input.language !== undefined) variantChanges.language = input.language || null;
      if (input.finish !== undefined) variantChanges.finish = input.finish || null;
      if (input.priceCents !== undefined) variantChanges.priceCents = input.priceCents;
      if (input.compareAtPriceCents !== undefined) {
        variantChanges.compareAtPriceCents = input.compareAtPriceCents;
      }
      if (input.stock !== undefined) variantChanges.stock = input.stock;

      if (Object.keys(variantChanges).length) {
        await tx
          .update(productVariants)
          .set(variantChanges)
          .where(eq(productVariants.id, input.variantId));
      }

      if (input.stock !== undefined && input.stock !== currentVariant.stock) {
        await tx.insert(inventoryMovements).values({
          variantId: input.variantId,
          quantity: input.stock - currentVariant.stock,
          reason: "adjustment",
          note: "Stock changed from admin dashboard",
          createdBy: guard.session!.user.id,
        });
      }
    });

    await writeAuditLog({
      event,
      actorId: guard.session!.user.id,
      action: "product.updated",
      entityType: "product",
      entityId: input.id,
      summary: `${input.name ?? "Product"} listing updated.`,
      metadata: {
        status: input.status,
        stock: input.stock,
        priceCents: input.priceCents,
      },
    });

    return apiJson({ ok: true });
  } catch (error) {
    return failure(error);
  }
}

export async function DELETE(event: APIEvent) {
  const guard = await requireAdmin(event);
  if (guard.response) return guard.response;

  try {
    const input = z.object({ id: z.string().uuid() }).parse(await event.request.json());
    const [archived] = await db
      .update(products)
      .set({ status: "archived" })
      .where(eq(products.id, input.id))
      .returning({ id: products.id });

    if (!archived) {
      return apiJson({ error: "Product not found." }, { status: 404 });
    }

    await writeAuditLog({
      event,
      actorId: guard.session!.user.id,
      action: "product.archived",
      entityType: "product",
      entityId: archived.id,
      summary: "Product archived.",
    });

    return apiJson({ ok: true });
  } catch (error) {
    return failure(error);
  }
}
