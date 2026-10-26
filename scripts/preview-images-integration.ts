import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { mock } from "bun:test";
import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { eq } from "drizzle-orm";
import * as schema from "../src/db/schema";
import { databaseCatalogRowsToState } from "../src/lib/catalog";

if (process.env.TCG_PREVIEW_IMAGES_TEST !== "1") throw new Error("Use the isolated test wrapper.");
process.env.NODE_ENV = "production";
process.env.DATABASE_URL = "postgresql://isolated:isolated@127.0.0.1:1/no_real_database";
delete process.env.DATABASE_PUBLIC_URL;
globalThis.fetch = (async () => { throw new Error("No external calls allowed in this test."); }) as typeof fetch;
const pg = new PGlite(); const db = drizzle(pg, { schema });
for (const file of readdirSync("drizzle").filter(file => /^\d+.*\.sql$/.test(file)).sort()) {
  for (const statement of readFileSync(`drizzle/${file}`, "utf8").split("--> statement-breakpoint")) if (statement.trim()) await pg.exec(statement);
}
mock.module("../src/db/index.ts", () => ({ db }));
const [owner] = await db.insert(schema.user).values({ name: "Fixture owner", email: "owner@example.invalid", role: "admin", emailVerified: true }).returning();
mock.module("../src/lib/auth.ts", () => ({ auth: { api: { getSession: async () => ({ user: owner }) } } }));
const { PATCH: editProduct } = await import("../src/routes/api/admin/products");
const { PATCH: editVariant } = await import("../src/routes/api/admin/variants");
const { loadDatabaseCatalogRows } = await import("../src/lib/catalog-query.server");
const { searchCatalog } = await import("../src/lib/catalog-search.server");
const [product] = await db.insert(schema.products).values({ name: "Fixture variable box", slug: "fixture-variable", game: "yugioh", productType: "sealed", status: "active", imageUrls: ["/images/product.webp"] }).returning();
const variants = await db.insert(schema.productVariants).values([
  { productId: product!.id, name: "Pack", sku: "FIX-PACK", priceCents: 2000, stock: 5, imageUrl: "/api/yugipedia/card/1234", isDefault: true },
  { productId: product!.id, name: "Case", sku: "FIX-CASE", priceCents: 50000, stock: 0, imageUrl: "/images/case.webp" },
  { productId: product!.id, name: "Box", sku: "FIX-BOX", priceCents: 10000, stock: 2, imageUrl: "/images/box.webp" },
]).returning();
const event = (body: unknown) => ({ request: new Request("https://shop.test/api/admin/products", { method: "PATCH", headers: { Origin: "https://shop.test", "Content-Type": "application/json" }, body: JSON.stringify(body) }) }) as any;
const pack = variants[0]!;
const edit = { ...pack, name: "Updated pack", language: "English", condition: "Sealed", finish: "", barcode: "", cardmarketPriceType: "normal" };
assert.equal((await editVariant(event(edit))).status, 200);
assert.equal((await db.select().from(schema.productVariants).where(eq(schema.productVariants.id, pack.id)))[0]!.imageUrl, "/api/yugipedia/card/1234");
const upload = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=";
await db.update(schema.productVariants).set({ imageUrl: upload }).where(eq(schema.productVariants.id, pack.id));
assert.equal((await editVariant(event({ ...edit, imageUrl: `/api/admin/product-image?variant=${pack.id}`, priceCents: 2500 }))).status, 200);
assert.equal((await db.select().from(schema.productVariants).where(eq(schema.productVariants.id, pack.id)))[0]!.imageUrl, upload);
assert.equal((await editProduct(event({ id: product!.id, variantId: pack.id, name: "Updated product", variantImages: [{ id: pack.id, imageUrl: `/api/admin/product-image?variant=${pack.id}` }, { id: variants[2]!.id, imageUrl: "/images/box-new.webp" }] }))).status, 200);
assert.equal((await db.select().from(schema.productVariants).where(eq(schema.productVariants.id, pack.id)))[0]!.imageUrl, upload);
async function preview() { const rows = await loadDatabaseCatalogRows({ slug: product!.slug }); return databaseCatalogRowsToState(rows.products, rows.managedSlugs).products[0]!; }
assert.equal((await preview()).variantId, variants[2]!.id);
assert.equal((await preview()).image, "/images/box-new.webp");
let search = await searchCatalog({ text: "Updated product" });
assert.equal(search[0]!.priceCents, 10000); assert.equal(search[0]!.image, `/api/catalog/image?variant=${variants[2]!.id}`);
await db.update(schema.productVariants).set({ stock: 1 }).where(eq(schema.productVariants.id, variants[1]!.id));
assert.equal((await preview()).variantId, variants[1]!.id);
search = await searchCatalog({ text: "Updated product" });
assert.equal(search[0]!.priceCents, 50000); assert.equal(search[0]!.image, `/api/catalog/image?variant=${variants[1]!.id}`);
await db.update(schema.productVariants).set({ reservedStock: 1 }).where(eq(schema.productVariants.id, variants[1]!.id));
assert.equal((await preview()).variantId, variants[2]!.id);
assert.equal((await searchCatalog({ text: "Updated product" }))[0]!.priceCents, 10000);
await pg.close();
console.log("PREVIEW IMAGES INTEGRATION PASSED");
