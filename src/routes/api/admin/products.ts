import { logServerError } from "~/lib/server-log";
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
import { resolveAdminImage } from "~/lib/admin-images.server";
import { ACCESSORY_CATEGORIES, accessoryBrand, accessoryCategory } from "~/lib/accessories";
import { ensureAccessoryCategory } from "~/lib/accessories.server";
import { productShippingSchema } from "~/lib/product-shipping";
import { validProductImageSource, PRODUCT_IMAGE_INPUT_ERROR } from "~/lib/product-image-input";
import { PRODUCT_TYPE_VALUES, PRODUCT_GAMES, isTcgType, typeAttributes } from "~/lib/product-types";
import { productAttributesSchema, validateTypeAttributes } from "~/lib/product-attributes";
import { ensureProductTypeCategory } from "~/lib/product-types.server";

const statusSchema = z.enum(["draft", "active", "archived"]);
const gameSchema = z.enum(PRODUCT_GAMES);
const imageSchema = z
  .string()
  .trim()
  .max(1_200_000)
  .refine(validProductImageSource, PRODUCT_IMAGE_INPUT_ERROR);

const trailerUrlSchema = z
  .string()
  .trim()
  .max(500)
  .refine(value => {
    if (!value) return true;
    try {
      const url = new URL(value);
      return url.protocol === "https:" && [
        "youtube.com",
        "www.youtube.com",
        "youtu.be",
        "www.youtube-nocookie.com",
      ].includes(url.hostname);
    } catch {
      return false;
    }
  }, "Use a valid HTTPS YouTube trailer URL.");

const releaseDateSchema = z
  .string()
  .trim()
  .refine(
    value => value === "" || /^\d{4}-\d{2}-\d{2}$/.test(value),
    "Use a valid release date.",
  );

const tcgFields = {
  cardNumber: z.string().trim().max(60).optional().default(""),
  rarity: z.string().trim().max(80).optional().default(""),
  setCode: z.string().trim().max(60).optional().default(""),
  illustrator: z.string().trim().max(120).optional().default(""),
  gradingCompany: z.string().trim().max(40).optional().default(""),
  grade: z.string().trim().max(20).optional().default(""),
  certificationNumber: z.string().trim().max(80).optional().default(""),
  shipsFrom: z.string().trim().max(60).optional().default(""),
};

const createProductSchema = z.object({
  name: z.string().trim().min(2).max(140),
  slug: z.string().trim().max(110).optional().default(""),
  description: z.string().trim().max(2400).optional().default(""),
  brand: z.string().trim().max(120).optional().default(""),
  game: gameSchema.optional(),
  accessoryCategory: z.enum(ACCESSORY_CATEGORIES.map(category => category.slug)).optional(),
  shipping: productShippingSchema.optional(),
  productType: z.enum(PRODUCT_TYPE_VALUES),
  attributes: productAttributesSchema.optional(),
  variantAttributes: productAttributesSchema.optional(),
  set: z.string().trim().max(120).optional().default(""),
  badge: z.string().trim().max(32).optional().default(""),
  trailerUrl: trailerUrlSchema.optional().default(""),
  releaseDate: releaseDateSchema.optional().default(""),
  preorder: z.boolean().optional().default(false),
  image: imageSchema.optional().default(""),
  status: statusSchema,
  sku: z.string().trim().max(80).optional().default(""),
  variantName: z.string().trim().max(120).optional().default(""),
  barcode: z.string().trim().max(120).optional().default(""),
  condition: z.string().trim().max(60).optional().default("Near Mint"),
  language: z.string().trim().max(60).optional().default("English"),
  finish: z.string().trim().max(60).optional().default(""),
  ...tcgFields,
  priceCents: z.number().int().min(0).max(100_000_000),
  compareAtPriceCents: z.number().int().min(0).max(100_000_000).nullable().optional(),
  stock: z.number().int().min(0).max(1_000_000),
  trackInventory: z.boolean().optional().default(true),
});

const updateProductSchema = createProductSchema.partial().extend({
  id: z.string().uuid(),
  variantId: z.string().uuid(),
  variantImages: z.array(z.object({
    id: z.string().uuid(),
    imageUrl: imageSchema,
  })).max(200).optional().default([]),
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

  logServerError("Admin product mutation failed", error);
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
    if (isTcgType(input.productType) ? !input.game : !input.brand) {
      return apiJson({ error: isTcgType(input.productType) ? "Choose a game." : "Choose or enter a brand." }, { status: 400 });
    }
    input.image = await resolveAdminImage(input.image);
    if (input.preorder && !input.releaseDate) {
      return apiJson(
        { error: "Choose a release date before enabling pre-order." },
        { status: 400 },
      );
    }
    const slug = toSlug(input.slug || input.name);
    if (!slug) {
      return apiJson({ error: "Enter a product name." }, { status: 400 });
    }

    const result = await db.transaction(async tx => {
      const isAccessory = input.productType === "accessory";
      const category = accessoryCategory(input.accessoryCategory);
      const categoryId = isAccessory ? await ensureAccessoryCategory(tx, category) : await ensureProductTypeCategory(tx, input.productType);
      const [createdProduct] = await tx
        .insert(products)
        .values({
          name: input.name,
          slug,
          description: input.description || null,
          brand: accessoryBrand(input.brand) || null,
          game: isTcgType(input.productType) ? input.game : null,
          categoryId,
          productType: input.productType,
          status: input.status,
          imageUrls: input.image ? [input.image] : [],
          metadata: {
            attributes: validateTypeAttributes(input.productType, input.attributes ?? {}),
            shipping: input.shipping ?? null,
            accessoryCategory: isAccessory ? category : null,
            set: input.set || null,
            badge: input.badge || null,
            cardNumber: input.cardNumber || null,
            rarity: input.rarity || null,
            setCode: input.setCode || null,
            illustrator: input.illustrator || null,
            gradingCompany: input.gradingCompany || null,
            grade: input.grade || null,
            certificationNumber: input.certificationNumber || null,
            shipsFrom: input.shipsFrom || null,
            trailerUrl: input.trailerUrl || null,
            releaseDate: input.releaseDate || null,
            preorder: input.preorder,
          },
        })
        .returning();

      if (!createdProduct) throw new Error("Product insert returned no row.");

      const sku =
        input.sku ||
        `${isTcgType(input.productType) ? input.game!.slice(0, 3).toUpperCase() : input.productType.slice(0, 3).toUpperCase()}-${slug.slice(0, 36).toUpperCase()}`;
      const [variant] = await tx
        .insert(productVariants)
        .values({
          productId: createdProduct.id,
          sku,
          barcode: input.barcode || null,
          name:
            input.variantName ||
            (input.productType === "sealed" ? "Sealed product" : input.condition) ||
            "Default",
          condition:
            !isTcgType(input.productType) ? (input.condition === "Near Mint" ? "New" : input.condition || "New") : input.productType === "sealed" ? "Sealed" : input.condition || null,
          language: isTcgType(input.productType) ? input.language || null : null,
          finish: isTcgType(input.productType) ? input.finish || null : null,
          attributes: validateTypeAttributes(input.productType, input.variantAttributes ?? {}, true),
          imageUrl: input.image || null,
          isDefault: true,
          priceCents: input.priceCents,
          compareAtPriceCents: input.compareAtPriceCents ?? null,
          stock: input.stock,
          trackInventory: input.trackInventory,
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
      if (isTcgType(input.productType) ? !input.game : !input.brand) {
        return apiJson({ error: "Choose a game or enter a brand." }, { status: 400 });
      }
      input.image = await resolveAdminImage(input.image);
      if (input.preorder && !input.releaseDate) {
        return apiJson(
          { error: "Choose a release date before enabling pre-order." },
          { status: 400 },
        );
      }
      const starterSlug = input.id.slice("static:".length);
      const starter = findProduct(starterSlug);
      if (!starter || input.variantId !== `static:${starterSlug}`) {
        return apiJson(
          { error: "Starter product could not be verified." },
          { status: 404 },
        );
      }

      const result = await db.transaction(async tx => {
        const isAccessory = input.productType === "accessory";
        const category = accessoryCategory(input.accessoryCategory);
        const [createdProduct] = await tx
          .insert(products)
          .values({
            name: input.name,
            slug: starterSlug,
            description: input.description || null,
            brand: accessoryBrand(input.brand) || null,
            game: isTcgType(input.productType) ? input.game : null,
            categoryId: isAccessory ? await ensureAccessoryCategory(tx, category) : await ensureProductTypeCategory(tx, input.productType),
            productType: input.productType,
            status: input.status,
            imageUrls: input.image ? [input.image] : [],
            metadata: {
              attributes: validateTypeAttributes(input.productType, input.attributes ?? {}),
              shipping: input.shipping ?? null,
              accessoryCategory: isAccessory ? category : null,
              set: input.set || null,
              badge: input.badge || null,
              cardNumber: input.cardNumber || null,
              rarity: input.rarity || null,
              setCode: input.setCode || null,
              illustrator: input.illustrator || null,
              gradingCompany: input.gradingCompany || null,
              grade: input.grade || null,
              certificationNumber: input.certificationNumber || null,
              shipsFrom: input.shipsFrom || null,
              trailerUrl: input.trailerUrl || null,
              releaseDate: input.releaseDate || null,
              preorder: input.preorder,
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
            barcode: input.barcode || null,
            name:
              input.variantName ||
              (input.productType === "sealed" ? "Sealed product" : input.condition) ||
              "Default",
            condition:
              input.productType === "sealed" ? "Sealed" : input.condition || null,
            language: isTcgType(input.productType) ? input.language || null : null,
            finish: isTcgType(input.productType) ? input.finish || null : null,
            imageUrl: input.image || null,
            isDefault: true,
            priceCents: input.priceCents,
            attributes: validateTypeAttributes(input.productType, input.variantAttributes ?? {}, true),
            compareAtPriceCents: input.compareAtPriceCents ?? null,
            stock: input.stock,
            trackInventory: input.trackInventory,
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

    const parsed = updateProductSchema.parse(payload);
    // Zod applies create-form defaults even inside partial schemas. A stock-
    // only update must not erase a product's brand, metadata, or description.
    const input = Object.fromEntries(Object.entries(parsed).filter(([key]) => key === "variantImages" || Object.hasOwn(payload, key))) as typeof parsed;
    // An unchanged display handle is not a replacement image. Keep the full
    // gallery and the primary variant's independent artwork untouched.
    if (input.image === `/api/admin/product-image?product=${input.id}&image=0`) delete input.image;
    else if (input.image !== undefined) input.image = await resolveAdminImage(input.image);
    for (const variant of input.variantImages) variant.imageUrl = await resolveAdminImage(variant.imageUrl);
    if (input.preorder === true && input.releaseDate === "") {
      return apiJson(
        { error: "Choose a release date before enabling pre-order." },
        { status: 400 },
      );
    }
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
      const [current] = await tx.select({ productType: products.productType, brand: products.brand, game: products.game, metadata: products.metadata })
        .from(products).where(eq(products.id, input.id)).for("update").limit(1);
      if (!current) throw new Error("Product not found.");
      const nextType = input.productType ?? current.productType;
      const organizationChanged = input.productType !== undefined || input.accessoryCategory !== undefined || input.brand !== undefined || input.game !== undefined;
      if (organizationChanged && !isTcgType(nextType) && !(input.brand ?? current.brand)?.trim()) {
        throw new z.ZodError([{ code: "custom", path: ["brand"], message: "Choose or enter a brand." }]);
      }
      if (isTcgType(nextType) && (input.productType !== undefined || input.game !== undefined) && !(input.game ?? current.game)) {
        throw new z.ZodError([{ code: "custom", path: ["game"], message: "Choose a game for this product." }]);
      }
      const productChanges: Partial<typeof products.$inferInsert> = {};
      if (input.name !== undefined) productChanges.name = input.name;
      if (input.slug !== undefined) productChanges.slug = toSlug(input.slug || input.name || "");
      if (input.description !== undefined) productChanges.description = input.description || null;
      if (input.brand !== undefined) productChanges.brand = accessoryBrand(input.brand) || null;
      if (input.game !== undefined) productChanges.game = input.game;
      if (input.productType !== undefined) productChanges.productType = input.productType;
      if (input.status !== undefined) productChanges.status = input.status;
      if (input.image !== undefined) productChanges.imageUrls = input.image ? [input.image] : [];
      if (nextType === "accessory" && organizationChanged) {
        productChanges.game = null;
        productChanges.categoryId = await ensureAccessoryCategory(tx, accessoryCategory(input.accessoryCategory ?? current.metadata.accessoryCategory));
      } else if (input.productType !== undefined && nextType !== current.productType && nextType !== "accessory") {
        productChanges.categoryId = await ensureProductTypeCategory(tx, nextType!);
      }
      if (organizationChanged && !isTcgType(nextType)) productChanges.game = null;
      if (
        input.attributes !== undefined || input.shipping !== undefined || organizationChanged || input.set !== undefined ||
        input.badge !== undefined ||
        input.cardNumber !== undefined ||
        input.rarity !== undefined ||
        input.setCode !== undefined ||
        input.illustrator !== undefined ||
        input.gradingCompany !== undefined ||
        input.grade !== undefined ||
        input.certificationNumber !== undefined ||
        input.shipsFrom !== undefined ||
        input.trailerUrl !== undefined ||
        input.releaseDate !== undefined ||
        input.preorder !== undefined
      ) {
        const [stored] = await tx
          .select({ metadata: products.metadata })
          .from(products)
          .where(eq(products.id, input.id))
          .limit(1);
        productChanges.metadata = {
          ...(stored?.metadata ?? {}),
          ...(input.attributes !== undefined || (input.productType !== undefined && nextType !== current.productType) ? { attributes: validateTypeAttributes(nextType, input.attributes ?? typeAttributes(nextType, current.metadata.attributes)) } : {}),
          ...(input.shipping !== undefined ? { shipping: input.shipping } : {}),
          ...(organizationChanged ? { accessoryCategory: nextType === "accessory" ? accessoryCategory(input.accessoryCategory ?? current.metadata.accessoryCategory) : null } : {}),
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
          ...(input.shipsFrom !== undefined
            ? { shipsFrom: input.shipsFrom || null }
            : {}),
          ...(input.trailerUrl !== undefined
            ? { trailerUrl: input.trailerUrl || null }
            : {}),
          ...(input.releaseDate !== undefined
            ? { releaseDate: input.releaseDate || null }
            : {}),
          ...(input.preorder !== undefined
            ? { preorder: input.preorder }
            : {}),
        };
      }

      if (Object.keys(productChanges).length) {
        await tx.update(products).set(productChanges).where(eq(products.id, input.id));
      }

      const variantChanges: Partial<typeof productVariants.$inferInsert> = {};
      if (input.variantAttributes !== undefined) variantChanges.attributes = validateTypeAttributes(nextType, input.variantAttributes, true);
      if (input.productType !== undefined && !isTcgType(nextType)) { variantChanges.language = null; variantChanges.finish = null; }
      if (input.sku !== undefined) variantChanges.sku = input.sku;
      if (input.barcode !== undefined) variantChanges.barcode = input.barcode || null;
      if (input.variantName !== undefined) {
        variantChanges.name =
          input.variantName ||
          (input.productType === "sealed" ? "Sealed product" : input.condition) ||
          "Default";
      }
      if (input.productType === "sealed") {
        variantChanges.condition = "Sealed";
      } else if (input.condition !== undefined) {
        variantChanges.condition = input.condition || null;
      }
      if (input.language !== undefined) variantChanges.language = isTcgType(nextType) ? input.language || null : null;
      if (input.finish !== undefined) variantChanges.finish = isTcgType(nextType) ? input.finish || null : null;
      if (nextType === "accessory" && input.productType !== undefined) {
        variantChanges.condition = input.condition === "Near Mint" ? "New" : input.condition || "New";
        variantChanges.language = null;
        variantChanges.finish = null;
      }
      // The main product editor edits the primary variant shown in the same
      // row. Keep its image in sync so the detail page cannot resurrect the
      // variant's previous photo after the product artwork was replaced.
      if (input.image !== undefined) variantChanges.imageUrl = input.image || null;
      if (input.priceCents !== undefined) variantChanges.priceCents = input.priceCents;
      if (input.compareAtPriceCents !== undefined) {
        variantChanges.compareAtPriceCents = input.compareAtPriceCents;
      }
      if (input.stock !== undefined) variantChanges.stock = input.stock;
      if (input.trackInventory !== undefined) {
        variantChanges.trackInventory = input.trackInventory;
      }

      if (Object.keys(variantChanges).length) {
        await tx
          .update(productVariants)
          .set(variantChanges)
          .where(eq(productVariants.id, input.variantId));
      }

      for (const variantImage of input.variantImages) {
        const [updated] = await tx
          .update(productVariants)
          .set({ imageUrl: variantImage.imageUrl || null })
          .where(
            and(
              eq(productVariants.id, variantImage.id),
              eq(productVariants.productId, input.id),
            ),
          )
          .returning({ id: productVariants.id });
        if (!updated) throw new Error("Variant image target not found.");
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
        variantImagesUpdated: input.variantImages.length,
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
    const input = z
      .object({
        id: z.string().uuid(),
        confirmation: z.literal("DELETE").optional(),
      })
      .parse(await event.request.json());

    if (input.confirmation === "DELETE") {
      const [removed] = await db
        .delete(products)
        .where(eq(products.id, input.id))
        .returning({ id: products.id, name: products.name });

      if (!removed) {
        return apiJson({ error: "Product not found." }, { status: 404 });
      }

      await writeAuditLog({
        event,
        actorId: guard.session!.user.id,
        action: "product.deleted",
        entityType: "product",
        entityId: removed.id,
        summary: `${removed.name} permanently deleted from the catalogue.`,
      });

      return apiJson({ ok: true });
    }

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
