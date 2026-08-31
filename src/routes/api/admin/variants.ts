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
  writeAuditLog,
} from "~/lib/admin.server";

const variantImageSchema = z
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

const variantSchema = z.object({
  productId: z.string().uuid(),
  name: z.string().trim().min(1).max(120),
  sku: z.string().trim().min(1).max(80),
  barcode: z.string().trim().max(120).optional().default(""),
  language: z.string().trim().max(60),
  condition: z.string().trim().max(60),
  finish: z.string().trim().max(60),
  imageUrl: variantImageSchema.optional().default(""),
  priceCents: z.number().int().min(0).max(100_000_000),
  compareAtPriceCents: z.number().int().min(0).max(100_000_000).nullable().optional(),
  stock: z.number().int().min(0).max(1_000_000),
  trackInventory: z.boolean().optional().default(true),
});

const updateVariantSchema = variantSchema.extend({
  id: z.string().uuid(),
});

export async function POST(event: APIEvent) {
  const guard = await requireAdmin(event);
  if (guard.response) return guard.response;
  try {
    const input = variantSchema.parse(await event.request.json());
    const [product] = await db
      .select({
        id: products.id,
        name: products.name,
        productType: products.productType,
      })
      .from(products)
      .where(eq(products.id, input.productId))
      .limit(1);
    if (!product) return apiJson({ error: "Product not found." }, { status: 404 });

    const [variant] = await db
      .insert(productVariants)
      .values({
        ...input,
        barcode: input.barcode || null,
        imageUrl: input.imageUrl || null,
        condition:
          product.productType === "sealed" ? "Sealed" : input.condition || null,
      })
      .returning();
    if (input.stock > 0) {
      await db.insert(inventoryMovements).values({
        variantId: variant!.id,
        quantity: input.stock,
        reason: "adjustment",
        note: "Opening stock for new variant",
        createdBy: guard.session!.user.id,
      });
    }
    await writeAuditLog({
      event,
      actorId: guard.session!.user.id,
      action: "variant.created",
      entityType: "product",
      entityId: product.id,
      summary: `${input.name} variant added to ${product.name}.`,
      metadata: { sku: input.sku, stock: input.stock },
    });
    return apiJson({ variant }, { status: 201 });
  } catch (error) {
    if ((error as { code?: string }).code === "23505") {
      return apiJson({ error: "That SKU already exists." }, { status: 409 });
    }
    if (error instanceof z.ZodError) {
      return apiJson({ error: "Check the variant details." }, { status: 400 });
    }
    return apiJson({ error: "The variant could not be added." }, { status: 500 });
  }
}

export async function PATCH(event: APIEvent) {
  const guard = await requireAdmin(event);
  if (guard.response) return guard.response;

  try {
    const input = updateVariantSchema.parse(await event.request.json());
    const [current] = await db
      .select({
        stock: productVariants.stock,
        productType: products.productType,
      })
      .from(productVariants)
      .innerJoin(products, eq(products.id, productVariants.productId))
      .where(
        and(
          eq(productVariants.id, input.id),
          eq(productVariants.productId, input.productId),
        ),
      )
      .limit(1);
    if (!current) {
      return apiJson({ error: "Variant not found." }, { status: 404 });
    }

    const [variant] = await db
      .update(productVariants)
      .set({
        name: input.name,
        sku: input.sku,
        barcode: input.barcode || null,
        condition:
          current.productType === "sealed" ? "Sealed" : input.condition || null,
        language: input.language || null,
        finish: input.finish || null,
        imageUrl: input.imageUrl || null,
        priceCents: input.priceCents,
        compareAtPriceCents: input.compareAtPriceCents ?? null,
        stock: input.stock,
        trackInventory: input.trackInventory,
      })
      .where(
        and(
          eq(productVariants.id, input.id),
          eq(productVariants.productId, input.productId),
        ),
      )
      .returning();

    if (input.stock !== current.stock) {
      await db.insert(inventoryMovements).values({
        variantId: input.id,
        quantity: input.stock - current.stock,
        reason: "adjustment",
        note: "Variant stock changed from admin dashboard",
        createdBy: guard.session!.user.id,
      });
    }

    await writeAuditLog({
      event,
      actorId: guard.session!.user.id,
      action: "variant.updated",
      entityType: "product",
      entityId: input.productId,
      summary: `Variant ${input.sku} updated.`,
      metadata: { stock: input.stock, priceCents: input.priceCents },
    });
    return apiJson({ variant });
  } catch (error) {
    if ((error as { code?: string }).code === "23505") {
      return apiJson({ error: "That SKU already exists." }, { status: 409 });
    }
    if (error instanceof z.ZodError) {
      return apiJson(
        { error: error.issues[0]?.message ?? "Check the variant details." },
        { status: 400 },
      );
    }
    return apiJson({ error: "The variant could not be updated." }, { status: 500 });
  }
}

export async function DELETE(event: APIEvent) {
  const guard = await requireAdmin(event);
  if (guard.response) return guard.response;
  try {
    const input = z
      .object({
        id: z.string().uuid(),
        productId: z.string().uuid(),
        confirmation: z.literal("REMOVE"),
      })
      .parse(await event.request.json());
    const variants = await db
      .select({ id: productVariants.id })
      .from(productVariants)
      .where(eq(productVariants.productId, input.productId));
    if (variants.length <= 1) {
      return apiJson(
        { error: "A product must keep at least one variant." },
        { status: 400 },
      );
    }
    const [removed] = await db
      .delete(productVariants)
      .where(
        and(
          eq(productVariants.id, input.id),
          eq(productVariants.productId, input.productId),
        ),
      )
      .returning({ id: productVariants.id, sku: productVariants.sku });
    if (!removed) return apiJson({ error: "Variant not found." }, { status: 404 });
    await writeAuditLog({
      event,
      actorId: guard.session!.user.id,
      action: "variant.removed",
      entityType: "product",
      entityId: input.productId,
      summary: `Variant ${removed.sku} removed.`,
    });
    return apiJson({ ok: true });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return apiJson({ error: "Variant removal confirmation failed." }, { status: 400 });
    }
    return apiJson({ error: "The variant could not be removed." }, { status: 500 });
  }
}
