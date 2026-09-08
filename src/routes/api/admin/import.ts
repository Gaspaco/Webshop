import type { APIEvent } from "@solidjs/start/server";
import { eq, inArray } from "drizzle-orm";
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
  // Kept for compatibility with older templates. CSV imports are always
  // staged as drafts, regardless of the value supplied by the file.
  status: z.enum(["draft", "active"]).optional().default("draft"),
});

const importSchema = z
  .object({
    fileName: z.string().trim().max(180).optional().default("catalog.csv"),
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

export async function POST(event: APIEvent) {
  const guard = await requireAdmin(event);
  if (guard.response) return guard.response;

  try {
    const input = importSchema.parse(await event.request.json());
    const existingSkus = await db
      .select({ sku: productVariants.sku })
      .from(productVariants)
      .where(inArray(productVariants.sku, input.rows.map(row => row.sku)));
    const existingSkuSet = new Set(existingSkus.map(row => row.sku));

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

    for (const [index, row] of input.rows.entries()) {
      if (existingSkuSet.has(row.sku)) {
        errors.push({ row: index + 2, message: `SKU ${row.sku} already exists.` });
        continue;
      }

      try {
        await db.transaction(async tx => {
          const slugBase = toSlug(row.name);
          const slug = `${slugBase}-${crypto.randomUUID().slice(0, 8)}`;
          const [product] = await tx
            .insert(products)
            .values({
              name: row.name,
              slug,
              game: row.game,
              productType: row.productType,
              // A CSV can add hundreds of records at once. Keeping the batch
              // private until the owner reviews it prevents malformed rows,
              // prices, or images from changing the live storefront.
              status: "draft",
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
        });
        processedRows += 1;
      } catch (error) {
        const duplicate = (error as { code?: string }).code === "23505";
        errors.push({
          row: index + 2,
          message: duplicate ? "SKU already exists." : "Row could not be imported.",
        });
      }
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
      summary: `${processedRows} products imported from ${input.fileName}.`,
      metadata: { failedRows: errors.length, totalRows: input.rows.length },
    });

    return apiJson({
      jobId: job.id,
      processedRows,
      failedRows: errors.length,
      errors,
      stagedAsDrafts: true,
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
