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

const variantSchema = z.object({
  productId: z.string().uuid(),
  name: z.string().trim().min(1).max(120),
  sku: z.string().trim().min(1).max(80),
  language: z.string().trim().max(60),
  condition: z.string().trim().max(60),
  finish: z.string().trim().max(60),
  priceCents: z.number().int().min(0).max(100_000_000),
  stock: z.number().int().min(0).max(1_000_000),
});

export async function POST(event: APIEvent) {
  const guard = await requireAdmin(event);
  if (guard.response) return guard.response;
  try {
    const input = variantSchema.parse(await event.request.json());
    const [product] = await db
      .select({ id: products.id, name: products.name })
      .from(products)
      .where(eq(products.id, input.productId))
      .limit(1);
    if (!product) return apiJson({ error: "Product not found." }, { status: 404 });

    const [variant] = await db
      .insert(productVariants)
      .values(input)
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
