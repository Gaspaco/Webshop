// An in-memory PostgreSQL database only. No credentials or network calls.
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { mock } from "bun:test";
import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { eq, sql } from "drizzle-orm";
import * as schema from "../src/db/schema";
import { PRODUCT_TYPES } from "../src/lib/product-types";
import { parseProductSpreadsheet } from "../src/lib/product-spreadsheet";

if (process.env.TCG_PRODUCT_TYPES_TEST !== "1") throw new Error("Use the isolated product types test wrapper.");
process.env.NODE_ENV = "production";
process.env.DATABASE_URL = "postgresql://isolated:isolated@127.0.0.1:1/no_real_database";
delete process.env.DATABASE_PUBLIC_URL;
globalThis.fetch = (async () => { throw new Error("Network is forbidden in this test."); }) as typeof fetch;
const pg = new PGlite(); const db = drizzle(pg, { schema });
for (const file of readdirSync("drizzle").filter(file => /^\d+.*\.sql$/.test(file)).sort()) {
  for (const statement of readFileSync(`drizzle/${file}`, "utf8").split("--> statement-breakpoint")) if (statement.trim()) await pg.exec(statement);
}
mock.module("../src/db/index.ts", () => ({ db }));
const [owner] = await db.insert(schema.user).values({ name: "Test owner", email: "owner@example.invalid", role: "admin", emailVerified: true }).returning();
let role: string | null = "admin";
mock.module("../src/lib/auth.ts", () => ({ auth: { api: { getSession: async () => role ? { user: { id: owner!.id, role } } : null } } }));
const { POST: create, PATCH: edit } = await import("../src/routes/api/admin/products");
const { POST: addVariant, PATCH: editVariant } = await import("../src/routes/api/admin/variants");
const { POST: duplicate } = await import("../src/routes/api/admin/duplicate-product");
const { POST: importRows } = await import("../src/routes/api/admin/import");
const { GET: exportRows } = await import("../src/routes/api/admin/export");
const { loadAdminCatalogue } = await import("../src/lib/admin-catalogue.server");
const { loadDatabaseCatalogRows } = await import("../src/lib/catalog-query.server");
const { databaseCatalogRowsToState } = await import("../src/lib/catalog");
const event = (path: string, body?: unknown, method = "POST", origin = "https://shop.test") => ({ request: new Request(`https://shop.test${path}`, {
  method: body === undefined ? "GET" : method, headers: { origin, "Content-Type": "application/json" }, ...(body === undefined ? {} : { body: JSON.stringify(body) }),
}) }) as any;
async function ok(response: Response, status = 200) { const data = await response.json(); assert.equal(response.status, status, JSON.stringify(data)); return data; }
const ids = new Map<string, { product: any; variant: any }>();
for (const type of PRODUCT_TYPES) {
  const attributes = Object.fromEntries(type.fields.map(field => [field.key, "Fixture"]));
  const variantAttributes = Object.fromEntries(type.fields.filter(field => field.variation).map(field => [field.key, "Option A"]));
  const created = await ok(await create(event("/api/admin/products", { name: `Fixture ${type.value}`, slug: `fixture-${type.value}`, productType: type.value,
    game: "yugioh", brand: "Fixture brand", attributes, variantAttributes, accessoryCategory: "binders", image: "https://images.test/product.jpg",
    sku: `TYPE-${type.value}`, priceCents: 1995, stock: 4, status: "active" })), 201);
  assert.equal(created.product.game, type.game ? "yugioh" : null);
  assert.deepEqual(created.product.metadata.attributes, attributes);
  assert.deepEqual(created.variant.attributes, variantAttributes);
  ids.set(type.value, created);
  const exported = await exportRows(event(`/api/admin/export?type=inventory&productType=${type.value}&images=true`));
  assert.equal(exported.status, 200);
  const parsed = parseProductSpreadsheet(await exported.text(), type.value);
  assert.deepEqual(parsed.issues, []);
  assert.equal(parsed.rows.length, 1);
  assert.deepEqual(parsed.rows[0]!.variantAttributes ?? {}, variantAttributes);
  parsed.rows[0]!.priceCents = 2995;
  await ok(await importRows(event("/api/admin/import", { rows: parsed.rows, visibility: "active" })));
  const [after] = await db.select().from(schema.productVariants).where(eq(schema.productVariants.id, created.variant.id));
  assert.equal(after!.priceCents, 2995); assert.deepEqual(after!.attributes, variantAttributes);
}
const figure = ids.get("figurine")!;
await ok(await edit(event("/api/admin/products", { id: figure.product.id, variantId: figure.variant.id, attributes: { scale: "1:7", character: "Miku" }, variantAttributes: { edition: "Limited" } }, "PATCH")));
await ok(await edit(event("/api/admin/products", { id: figure.product.id, variantId: figure.variant.id, productType: "figurine", stock: 5, language: "English", finish: "Foil" }, "PATCH")));
const [partialProduct] = await db.select().from(schema.products).where(eq(schema.products.id, figure.product.id));
const [partialVariant] = await db.select().from(schema.productVariants).where(eq(schema.productVariants.id, figure.variant.id));
assert.deepEqual(partialProduct!.metadata.attributes, { scale: "1:7", character: "Miku" });
assert.deepEqual(partialVariant!.attributes, { edition: "Limited" });
assert.equal(partialVariant!.language, null); assert.equal(partialVariant!.finish, null);
const variant = await ok(await addVariant(event("/api/admin/variants", { productId: figure.product.id, sku: "FIG-B", name: "Second edition", language: "English", finish: "Foil", condition: "New",
  attributes: { edition: "Standard", scale: "1:8" }, priceCents: 9900, stock: 2 })), 201);
assert.equal(variant.variant.language, null); assert.equal(variant.variant.finish, null);
await ok(await editVariant(event("/api/admin/variants", { ...variant.variant, id: variant.variant.id, barcode: "", language: "", finish: "", condition: "New", imageUrl: "", attributes: { edition: "Deluxe" }, isDefault: false }, "PATCH")));
const copied = await ok(await duplicate(event("/api/admin/duplicate-product", { id: figure.product.id })), 201);
const copyVariants = await db.select().from(schema.productVariants).where(eq(schema.productVariants.productId, copied.product.id));
assert.ok(copyVariants.some(row => row.attributes.edition === "Deluxe"));

// A shared slug adds options to one product instead of splitting every row into a listing.
const imported = await ok(await importRows(event("/api/admin/import", { visibility: "active", rows: [
  { name: "Deck box", slug: "deck-box", brand: "Ultra PRO", productType: "accessory", accessoryCategory: "deck-boxes", attributes: { material: "Plastic" }, variantAttributes: { colour: "Blue" }, variantName: "Blue", sku: "BOX-BLUE", priceCents: 500, stock: 4, image: "https://images.test/box.jpg" },
  { name: "Deck box", slug: "deck-box", brand: "Ultra PRO", productType: "accessory", accessoryCategory: "deck-boxes", attributes: { material: "Plastic" }, variantAttributes: { colour: "Red" }, variantName: "Red", sku: "BOX-RED", priceCents: 1500, stock: 0 },
] })));
assert.equal(imported.createdRows, 2);
const [box] = await db.select().from(schema.products).where(eq(schema.products.slug, "deck-box"));
const options = await db.select().from(schema.productVariants).where(eq(schema.productVariants.productId, box!.id));
assert.equal(options.length, 2); assert.equal(options.find(row => row.isDefault)!.sku, "BOX-BLUE");
assert.deepEqual(box!.imageUrls, ["https://images.test/box.jpg"]);

// Legacy stock-only sheet keeps images, descriptions and typed attributes.
await ok(await importRows(event("/api/admin/import", { rows: [{ name: "Deck box", productType: "accessory", sku: "BOX-BLUE", priceCents: 600, stock: 5, image: "" }], visibility: "active" })));
const [preserved] = await db.select().from(schema.products).where(eq(schema.products.id, box!.id));
assert.deepEqual(preserved!.metadata.attributes, { material: "Plastic" }); assert.deepEqual(preserved!.imageUrls, box!.imageUrls);

// One invalid later row rolls back earlier stock and price updates.
const bad = await importRows(event("/api/admin/import", { rows: [
  { name: "Deck box", productType: "accessory", sku: "BOX-BLUE", priceCents: 999, stock: 10 },
  { name: "Wrong card", game: "yugioh", productType: "single", sku: "BOX-RED", priceCents: 100, stock: 2 },
] }));
assert.equal(bad.status, 400);
const [rolledBack] = await db.select().from(schema.productVariants).where(eq(schema.productVariants.sku, "BOX-BLUE"));
assert.equal(rolledBack!.priceCents, 600); assert.equal(rolledBack!.stock, 5);
await db.update(schema.productVariants).set({ reservedStock: 4 }).where(eq(schema.productVariants.id, rolledBack!.id));
assert.equal((await importRows(event("/api/admin/import", { rows: [{ name: "Deck box", productType: "accessory", sku: "BOX-BLUE", priceCents: 600, stock: 1 }] }))).status, 400);

// Catalogue projections and API guards expose the appropriate information only.
const admin = await loadAdminCatalogue();
assert.ok(admin.products.find(product => product.id === figure.product.id)!.variants.some(row => row.attributes.edition === "Deluxe"));
const publicRows = await loadDatabaseCatalogRows({ slug: figure.product.slug });
const publicFigure = databaseCatalogRowsToState(publicRows.products, []).products[0]!;
assert.equal(publicFigure.gameName, "Figurines"); assert.equal(publicFigure.attributes!.scale, "1:7");
assert.ok(publicFigure.variants!.some(row => row.attributes?.edition === "Deluxe"));
for (role of [null, "customer"]) {
  assert.equal((await create(event("/api/admin/products", {}))).status, role ? 403 : 401);
  assert.equal((await importRows(event("/api/admin/import", {}))).status, role ? 403 : 401);
  assert.equal((await exportRows(event("/api/admin/export?type=inventory&productType=figurine"))).status, role ? 403 : 401);
}
role = "admin";
assert.equal((await importRows(event("/api/admin/import", {}, "POST", "https://evil.test"))).status, 403);
assert.equal((await create(event("/api/admin/products", { name: "Invalid type attributes", brand: "Fixture", productType: "figurine", attributes: { rarity: "Secret" }, status: "draft", stock: 1, priceCents: 200 }))).status, 400);
assert.equal(Number((await db.execute(sql`select count(*)::int as total from products where name = 'Invalid type attributes'`)).rows[0]!.total), 0);
await pg.close();
console.log("PRODUCT TYPES INTEGRATION PASSED");
