import type { APIEvent } from "@solidjs/start/server";
import { eq, inArray, sql } from "drizzle-orm";
import { z } from "zod";
import { db } from "~/db";
import {
  importJobs,
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

const rowSchema = z.object({
  name: z.string().trim().min(2).max(140),
  game: z.enum([
    "pokemon",
    "yugioh",
    "magic",
    "lorcana",
    "riftbound",
    "digimon",
    "cyberpunk",
    "other",
  ]),
  productType: z.enum(["single", "sealed", "graded", "accessory"]),
  set: z.string().trim().max(120).optional().default(""),
  sku: z.string().trim().min(1).max(80),
  priceCents: z.number().int().min(1).max(100_000_000),
  stock: z.number().int().min(0).max(1_000_000),
  image: z
    .string()
    .trim()
    .max(2048)
    .refine(value => {
      if (!value) return true;
      try {
        return new URL(value).protocol === "https:";
      } catch {
        return false;
      }
    }, "Images must use a valid HTTPS address.")
    .optional()
    .default(""),
  // Kept for compatibility with older templates. Visibility is chosen once
  // for the whole reviewed import instead of being trusted from a CSV cell.
  status: z.enum(["draft", "active"]).optional().default("draft"),
});

const importSchema = z
  .object({
    fileName: z.string().trim().max(180).optional().default("catalog.csv"),
    visibility: z.enum(["draft", "active"]).optional().default("active"),
    rows: z.array(rowSchema).min(1).max(1000),
  })
  .superRefine((input, context) => {
    const seen = new Map<string, number>();
    input.rows.forEach((row, index) => {
      const sku = row.sku.toLocaleLowerCase("en-US");
      const firstRow = seen.get(sku);
      if (firstRow !== undefined) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["rows", index, "sku"],
          message: `SKU ${row.sku} is repeated on CSV rows ${firstRow + 2} and ${index + 2}.`,
        });
      } else {
        seen.set(sku, index);
      }
    });
  });

function normalizeSku(sku: string) {
  return sku.trim().toLocaleLowerCase("en-US");
}

export async function POST(event: APIEvent) {
  const guard = await requireAdmin(event);
  if (guard.response) return guard.response;

  try {
    const input = importSchema.parse(await event.request.json());
    const normalizedSkus = input.rows.map(row => normalizeSku(row.sku));
    const existingVariants = await db
      .select({
        id: productVariants.id,
        sku: productVariants.sku,
        productId: productVariants.productId,
        stock: productVariants.stock,
        isDefault: productVariants.isDefault,
        metadata: products.metadata,
      })
      .from(productVariants)
      .innerJoin(products, eq(products.id, productVariants.productId))
      .where(inArray(sql<string>`lower(${productVariants.sku})`, normalizedSkus));
    const existingBySku = new Map(
      existingVariants.map(variant => [normalizeSku(variant.sku), variant]),
    );

    const [job] = await db
      .insert(importJobs)
      .values({
        status: "processing",
        source: "admin_csv",
        fileName: input.fileName,
        totalRows: input.rows.length,
        createdBy: guard.session!.user.id,
        startedAt: new Date(),
      })
      .returning();

    if (!job) throw new Error("Import job could not be created.");

    const errors: Array<{ row: number; message: string }> = [];
    let processedRows = 0;
    let createdRows = 0;
    let updatedRows = 0;
    const affectedProductIds = new Set<string>();

    for (const [index, row] of input.rows.entries()) {
      try {
        const outcome = await db.transaction(async tx => {
          const existing = existingBySku.get(normalizeSku(row.sku));
          if (existing) {
            const productChanges: Partial<typeof products.$inferInsert> = {
              name: row.name,
              game: row.game,
              productType: row.productType,
              status: input.visibility,
              metadata: {
                ...(existing.metadata ?? {}),
                set: row.set || null,
                importJobId: job.id,
                importFileName: input.fileName,
              },
            };
            // A blank spreadsheet image means “keep the current image.” Only
            // the default variant is allowed to replace the product cover.
            if (row.image && existing.isDefault) productChanges.imageUrls = [row.image];

            await tx
              .update(products)
              .set(productChanges)
              .where(eq(products.id, existing.productId));
            await tx
              .update(productVariants)
              .set({
                priceCents: row.priceCents,
                stock: row.stock,
                condition:
                  row.productType === "single"
                    ? "Near Mint"
                    : row.productType === "sealed"
                      ? "Sealed"
                      : null,
                ...(row.image ? { imageUrl: row.image } : {}),
              })
              .where(eq(productVariants.id, existing.id));

            if (row.stock !== existing.stock) {
              await tx.insert(inventoryMovements).values({
                variantId: existing.id,
                quantity: row.stock - existing.stock,
                reason: "import",
                reference: job.id,
                note: "Existing product updated from CSV",
                createdBy: guard.session!.user.id,
              });
            }
            return { kind: "updated" as const, productId: existing.productId };
          }

          const slugBase = toSlug(row.name);
          const slug = `${slugBase}-${crypto.randomUUID().slice(0, 8)}`;
          const [product] = await tx
            .insert(products)
            .values({
              name: row.name,
              slug,
              game: row.game,
              productType: row.productType,
              status: input.visibility,
              imageUrls: row.image ? [row.image] : [],
              metadata: {
                set: row.set || null,
                importJobId: job.id,
                importFileName: input.fileName,
              },
            })
            .returning();
          if (!product) throw new Error("Product was not created.");

          const [variant] = await tx
            .insert(productVariants)
            .values({
              productId: product.id,
              sku: row.sku,
              name: "Default",
              condition: row.productType === "single" ? "Near Mint" : null,
              language: "English",
              imageUrl: row.image || null,
              isDefault: true,
              priceCents: row.priceCents,
              stock: row.stock,
            })
            .returning();
          if (!variant) throw new Error("Variant was not created.");

          if (row.stock > 0) {
            await tx.insert(inventoryMovements).values({
              variantId: variant.id,
              quantity: row.stock,
              reason: "import",
              reference: job.id,
              createdBy: guard.session!.user.id,
            });
          }
          return { kind: "created" as const, productId: product.id };
        });
        affectedProductIds.add(outcome.productId);
        if (outcome.kind === "created") createdRows += 1;
        else updatedRows += 1;
        processedRows += 1;
      } catch (error) {
        const duplicate = (error as { code?: string }).code === "23505";
        errors.push({
          row: index + 2,
          message: duplicate ? "SKU already exists." : "Row could not be imported.",
        });
      }
    }

    // Spreadsheet price changes can change which option should represent the
    // product in grids and the hero. Pick the highest-priced variant after all
    // rows have been processed, so the result is independent of CSV row order.
    if (affectedProductIds.size) {
      await db.transaction(async tx => {
        const affectedIds = [...affectedProductIds];
        const variants = await tx
          .select({
            id: productVariants.id,
            productId: productVariants.productId,
            priceCents: productVariants.priceCents,
            imageUrl: productVariants.imageUrl,
          })
          .from(productVariants)
          .where(inArray(productVariants.productId, affectedIds));
        const mainByProduct = new Map<
          string,
          { id: string; priceCents: number; imageUrl: string | null }
        >();
        for (const variant of variants) {
          const current = mainByProduct.get(variant.productId);
          if (
            !current ||
            variant.priceCents > current.priceCents ||
            (variant.priceCents === current.priceCents && variant.id < current.id)
          ) {
            mainByProduct.set(variant.productId, variant);
          }
        }

        await tx
          .update(productVariants)
          .set({ isDefault: false })
          .where(inArray(productVariants.productId, affectedIds));
        for (const variant of mainByProduct.values()) {
          await tx
            .update(productVariants)
            .set({ isDefault: true })
            .where(eq(productVariants.id, variant.id));
        }

        // Keep the catalogue cover aligned with the newly selected main
        // variant when that option has its own image.
        for (const [productId, variant] of mainByProduct) {
          if (variant.imageUrl) {
            await tx
              .update(products)
              .set({ imageUrls: [variant.imageUrl] })
              .where(eq(products.id, productId));
          }
        }
      });
    }

    await db
      .update(importJobs)
      .set({
        status: errors.length === input.rows.length ? "failed" : "completed",
        processedRows,
        failedRows: errors.length,
        errors,
        completedAt: new Date(),
      })
      .where(eq(importJobs.id, job.id));

    await writeAuditLog({
      event,
      actorId: guard.session!.user.id,
      action: "catalogue.imported",
      entityType: "import",
      entityId: job.id,
      summary: `${createdRows} products created and ${updatedRows} updated from ${input.fileName}.`,
      metadata: {
        createdRows,
        updatedRows,
        failedRows: errors.length,
        totalRows: input.rows.length,
      },
    });

    return apiJson({
      jobId: job.id,
      processedRows,
      createdRows,
      updatedRows,
      failedRows: errors.length,
      errors,
      stagedAsDrafts: input.visibility === "draft",
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return apiJson(
        { error: error.issues[0]?.message ?? "Check the CSV rows." },
        { status: 400 },
      );
    }
    console.error("Admin import failed", error);
    return apiJson({ error: "The import could not be completed." }, { status: 500 });
  }
}
