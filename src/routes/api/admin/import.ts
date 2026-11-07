import type { APIEvent } from "@solidjs/start/server";
import { desc, eq, sql } from "drizzle-orm";
import { z } from "zod";
import { db } from "~/db";
import { adminAuditLog, importJobs, inventoryMovements, products, productVariants } from "~/db/schema";
import { apiJson, requireAdmin, toSlug } from "~/lib/admin.server";
import { spreadsheetRowSchema } from "~/lib/product-spreadsheet";
import { isTcgType } from "~/lib/product-types";
import { validateTypeAttributes } from "~/lib/product-attributes";
import { accessoryCategory } from "~/lib/accessories";
import { ensureAccessoryCategory } from "~/lib/accessories.server";
import { ensureProductTypeCategory } from "~/lib/product-types.server";
import { resolveAdminImage } from "~/lib/admin-images.server";
import { logServerError } from "~/lib/server-log";

const importSchema = z.object({
  fileName: z.string().trim().max(180).default("catalog.csv"),
  visibility: z.enum(["draft", "active"]).default("active"),
  rows: z.array(spreadsheetRowSchema).min(1).max(1000),
}).superRefine((input, ctx) => {
  const skus = new Set<string>(); const groups = new Map<string, string>();
  for (const [index, row] of input.rows.entries()) {
    const sku = row.sku.toLowerCase();
    if (skus.has(sku)) ctx.addIssue({ code: "custom", path: ["rows", index, "sku"], message: `SKU ${row.sku} is repeated.` });
    skus.add(sku);
    if (row.slug) {
      const identity = JSON.stringify([row.name, row.productType, row.game, row.brand, row.accessoryCategory, row.attributes, row.set, row.setCode]);
      if (groups.has(row.slug) && groups.get(row.slug) !== identity) ctx.addIssue({ code: "custom", path: ["rows", index], message: `Product fields must agree for every variant of ${row.slug}.` });
      groups.set(row.slug, identity);
    }
  }
});
const invalid = (message: string): never => { throw new z.ZodError([{ code: "custom", path: [], message }]); };

export async function POST(event: APIEvent) {
  const guard = await requireAdmin(event);
  if (guard.response) return guard.response;
  let jobId: string | undefined;
  try {
    const input = importSchema.parse(await event.request.json());
    const [job] = await db.insert(importJobs).values({ status: "processing", source: "admin_csv", fileName: input.fileName,
      totalRows: input.rows.length, createdBy: guard.session!.user.id, startedAt: new Date() }).returning();
    jobId = job!.id;
    const result = await db.transaction(async tx => {
      await tx.execute(sql`select pg_advisory_xact_lock(hashtext('catalogue-spreadsheet-import'))`);
      let createdRows = 0; let updatedRows = 0; const affected = new Set<string>();
      for (const [index, row] of input.rows.entries()) {
        const matches = await tx.select().from(productVariants).where(sql`lower(${productVariants.sku}) = ${row.sku.toLowerCase()}`).for("update").limit(2);
        if (matches.length > 1) invalid(`Row ${index + 2}: more than one existing variant uses this SKU. Give them distinct SKUs before importing.`);
        const existing = matches[0];
        const [stored] = existing
          ? await tx.select().from(products).where(eq(products.id, existing.productId)).for("update").limit(1)
          : row.slug ? await tx.select().from(products).where(eq(products.slug, row.slug)).for("update").limit(1) : [];
        if (existing && row.slug && stored!.slug !== row.slug) invalid(`Row ${index + 2}: this SKU belongs to a different product slug.`);
        if (stored && stored.productType !== row.productType) invalid(`Row ${index + 2}: the category does not match the existing listing. Change it in the editor first.`);
        if (!isTcgType(row.productType) && !(row.brand || stored?.brand)) invalid(`Row ${index + 2}: enter a brand for this product.`);
        if (existing && row.stock < existing.reservedStock) invalid(`Row ${index + 2}: stock cannot be below the ${existing.reservedStock} units reserved by orders.`);
        const tcg = isTcgType(row.productType);
        const metadata: Record<string, unknown> = { ...(stored?.metadata ?? {}), importJobId: job!.id, importFileName: input.fileName };
        for (const key of ["set", "setCode", "cardNumber", "rarity", "illustrator", "gradingCompany", "grade", "certificationNumber", "badge", "releaseDate", "preorder", "shipping"] as const) if (row[key] !== undefined) metadata[key] = row[key];
        if (row.attributes !== undefined) metadata.attributes = validateTypeAttributes(row.productType, row.attributes);
        const kind = accessoryCategory(row.accessoryCategory ?? metadata.accessoryCategory);
        if (row.productType === "accessory") metadata.accessoryCategory = kind;
        const categoryId = row.productType === "accessory" ? await ensureAccessoryCategory(tx, kind) : tcg ? stored?.categoryId ?? null : await ensureProductTypeCategory(tx, row.productType);
        const image = row.image ? await resolveAdminImage(row.image) : "";
        const variantImage = row.variantImage ? await resolveAdminImage(row.variantImage) : "";
        const gallery = row.productImages?.length ? await Promise.all(row.productImages.map(resolveAdminImage)) : undefined;
        const change = { name: row.name, game: tcg ? row.game : null, productType: row.productType,
          status: input.visibility, metadata, categoryId,
          ...(row.brand !== undefined ? { brand: row.brand } : {}), ...(row.description !== undefined ? { description: row.description } : {}),
          // Blank images keep uploads. A variant image never replaces the gallery.
          ...(gallery ? { imageUrls: gallery } : image && (!existing || existing.isDefault) ? { imageUrls: [image] } : {}) };
        let productId = stored?.id;
        if (stored) await tx.update(products).set(change).where(eq(products.id, stored.id));
        else {
          const [created] = await tx.insert(products).values({ ...change, slug: row.slug || `${toSlug(row.name)}-${crypto.randomUUID().slice(0, 8)}` }).returning();
          productId = created!.id;
        }
        const variantChanges = {
          priceCents: row.priceCents, stock: row.stock,
          ...(row.compareAtPriceCents !== undefined ? { compareAtPriceCents: row.compareAtPriceCents || null } : {}),
          ...(row.variantName !== undefined ? { name: row.variantName } : {}),
          ...(row.barcode !== undefined ? { barcode: row.barcode } : {}),
          ...(row.condition !== undefined ? { condition: row.condition } : {}),
          ...(!tcg ? { language: null, finish: null } : {
            ...(row.language !== undefined ? { language: row.language } : {}), ...(row.finish !== undefined ? { finish: row.finish } : {}) }),
          ...(row.productType === "sealed" ? { condition: "Sealed" } : {}),
          ...(row.trackInventory !== undefined ? { trackInventory: row.trackInventory } : {}),
          ...(row.variantAttributes !== undefined ? { attributes: validateTypeAttributes(row.productType, row.variantAttributes, true) } : {}),
          ...(variantImage || image ? { imageUrl: variantImage || image } : {}),
        };
        let variantId = existing?.id;
        if (existing) { await tx.update(productVariants).set(variantChanges).where(eq(productVariants.id, existing.id)); updatedRows++; }
        else {
          const [variant] = await tx.insert(productVariants).values({ productId: productId!, sku: row.sku,
            name: row.variantName || "Default", condition: row.productType === "sealed" ? "Sealed" : tcg ? "Near Mint" : "New", language: tcg ? "English" : null,
            isDefault: !stored, ...variantChanges }).returning();
          variantId = variant!.id; createdRows++;
        }
        const quantity = row.stock - (existing?.stock ?? 0);
        if (quantity) await tx.insert(inventoryMovements).values({ variantId: variantId!, quantity, reason: "import", reference: job!.id, createdBy: guard.session!.user.id });
        affected.add(productId!);
      }
      for (const id of affected) {
        const [main] = await tx.select({ id: productVariants.id }).from(productVariants).where(eq(productVariants.productId, id))
          .orderBy(desc(sql`(${productVariants.stock} > ${productVariants.reservedStock})`), desc(productVariants.priceCents), desc(productVariants.isDefault), productVariants.id).limit(1);
        await tx.update(productVariants).set({ isDefault: false }).where(eq(productVariants.productId, id));
        await tx.update(productVariants).set({ isDefault: true }).where(eq(productVariants.id, main!.id));
      }
      await tx.update(importJobs).set({ status: "completed", processedRows: input.rows.length, failedRows: 0, completedAt: new Date() }).where(eq(importJobs.id, job!.id));
      await tx.insert(adminAuditLog).values({ actorId: guard.session!.user.id, action: "catalogue.imported", entityType: "import", entityId: job!.id,
        summary: `${createdRows} variants created and ${updatedRows} updated from ${input.fileName}.` });
      return { createdRows, updatedRows };
    });
    return apiJson({ jobId: job!.id, ...result, processedRows: input.rows.length, failedRows: 0, errors: [], stagedAsDrafts: input.visibility === "draft" });
  } catch (error) {
    if (jobId) await db.update(importJobs).set({ status: "failed", failedRows: 1, completedAt: new Date() }).where(eq(importJobs.id, jobId)).catch(() => {});
    if (error instanceof z.ZodError) return apiJson({ error: error.issues[0]?.message ?? "Check the spreadsheet rows. Nothing was imported." }, { status: 400 });
    if ((error as { code?: string }).code === "23505") return apiJson({ error: "A SKU or product slug is already in use. Nothing was imported." }, { status: 409 });
    logServerError("Admin spreadsheet import failed", error);
    return apiJson({ error: "The import could not be completed. No product changes were saved." }, { status: 500 });
  }
}
