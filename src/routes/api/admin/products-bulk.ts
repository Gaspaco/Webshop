import type { APIEvent } from "@solidjs/start/server";
import { inArray } from "drizzle-orm";
import { z } from "zod";
import { db } from "~/db";
import {
  inventoryMovements,
  products,
  productVariants,
} from "~/db/schema";
import { apiJson, requireAdmin, writeAuditLog } from "~/lib/admin.server";

const bulkUpdateSchema = z
  .object({
    variantIds: z.array(z.string().uuid()).min(1).max(250),
    status: z.enum(["draft", "active", "archived"]).optional(),
    stock: z.number().int().min(0).max(1_000_000).optional(),
    priceCents: z.number().int().min(1).max(100_000_000).optional(),
  })
  .superRefine((input, context) => {
    if (
      input.status === undefined &&
      input.stock === undefined &&
      input.priceCents === undefined
    ) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Choose a visibility, quantity, or price to change.",
      });
    }
    if (new Set(input.variantIds).size !== input.variantIds.length) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["variantIds"],
        message: "The selection contains duplicate variants.",
      });
    }
  });

export async function PATCH(event: APIEvent) {
  const guard = await requireAdmin(event);
  if (guard.response) return guard.response;

  try {
    const input = bulkUpdateSchema.parse(await event.request.json());
    const selectedVariants = await db
      .select({
        id: productVariants.id,
        productId: productVariants.productId,
        stock: productVariants.stock,
      })
      .from(productVariants)
      .where(inArray(productVariants.id, input.variantIds));

    if (selectedVariants.length !== input.variantIds.length) {
      return apiJson(
        { error: "One or more selected products no longer exist. Refresh and try again." },
        { status: 409 },
      );
    }

    const productIds = [...new Set(selectedVariants.map(variant => variant.productId))];
    await db.transaction(async tx => {
      if (input.status !== undefined) {
        await tx
          .update(products)
          .set({ status: input.status })
          .where(inArray(products.id, productIds));
      }

      const variantChanges: Partial<typeof productVariants.$inferInsert> = {};
      if (input.stock !== undefined) variantChanges.stock = input.stock;
      if (input.priceCents !== undefined) variantChanges.priceCents = input.priceCents;
      if (Object.keys(variantChanges).length) {
        await tx
          .update(productVariants)
          .set(variantChanges)
          .where(inArray(productVariants.id, input.variantIds));
      }

      if (input.stock !== undefined) {
        const movements = selectedVariants
          .filter(variant => variant.stock !== input.stock)
          .map(variant => ({
            variantId: variant.id,
            quantity: input.stock! - variant.stock,
            reason: "adjustment" as const,
            note: "Stock changed with catalogue bulk edit",
            createdBy: guard.session!.user.id,
          }));
        if (movements.length) await tx.insert(inventoryMovements).values(movements);
      }
    });

    await writeAuditLog({
      event,
      actorId: guard.session!.user.id,
      action: "catalogue.bulk_updated",
      entityType: "product",
      summary: `${productIds.length} products updated in bulk.`,
      metadata: {
        productIds,
        variantIds: input.variantIds,
        status: input.status,
        stock: input.stock,
        priceCents: input.priceCents,
      },
    });

    return apiJson({ updatedProducts: productIds.length });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return apiJson(
        { error: error.issues[0]?.message ?? "Check the bulk edit values." },
        { status: 400 },
      );
    }
    console.error("Catalogue bulk update failed", error);
    return apiJson({ error: "The selected products could not be updated." }, { status: 500 });
  }
}
