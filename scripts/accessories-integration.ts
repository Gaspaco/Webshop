import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { mock } from "bun:test";
import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { eq } from "drizzle-orm";
import * as schema from "../src/db/schema";
import { ACCESSORY_CATEGORIES } from "../src/lib/accessories";
import { databaseCatalogRowsToState } from "../src/lib/catalog";
import type { APIEvent } from "@solidjs/start/server";

if (process.env.TCG_ACCESSORIES_TEST !== "1") throw new Error("Run through the isolated test wrapper.");
process.env.NODE_ENV = "production";
process.env.DATABASE_URL = "postgresql://isolated:isolated@127.0.0.1:1/no_real_database";
delete process.env.DATABASE_PUBLIC_URL;
globalThis.fetch = (async () => { throw new Error("No external calls are allowed in this test."); }) as typeof fetch;
const pg = new PGlite();
const db = drizzle(pg, { schema });
for (const file of readdirSync("drizzle").filter(file => /^\d+.*\.sql$/.test(file)).sort()) {
  for (const statement of readFileSync(`drizzle/${file}`, "utf8").split("--> statement-breakpoint")) if (statement.trim()) await pg.exec(statement);
}
mock.module("../src/db/index.ts", () => ({ db }));
const [owner] = await db.insert(schema.user).values({ name: "Fixture owner", email: "owner@example.invalid", role: "admin", emailVerified: true }).returning();
let role: string | null = "admin";
mock.module("../src/lib/auth.ts", () => ({ auth: { api: { getSession: async () => role ? { user: { ...owner, role } } : null } } }));
const { POST, PATCH } = await import("../src/routes/api/admin/products");
const { POST: duplicate } = await import("../src/routes/api/admin/duplicate-product");
const { loadDatabaseCatalogRows } = await import("../src/lib/catalog-query.server");
const { GET: publicCatalogue } = await import("../src/routes/api/catalog/products");
const { searchCatalog } = await import("../src/lib/catalog-search.server");
function event(method: string, body: unknown, path = "/api/admin/products") {
  return { request: new Request(`https://shop.test${path}`, { method, headers: { Origin: "https://shop.test", "Content-Type": "application/json" }, body: JSON.stringify(body) }) } as APIEvent;
}
const base = { name: "Fixture sleeves", productType: "accessory", brand: "Dragon Shield", status: "active", priceCents: 1295, stock: 4, image: "https://images.test/sleeves.png" };
const created = [];
for (const [i, category] of ACCESSORY_CATEGORIES.entries()) {
  const response = await POST(event("POST", { ...base, name: `Accessory ${i}`, slug: `accessory-${i}`, accessoryCategory: category.slug, brand: i % 2 ? "ultra pro" : "Dragon Shield", game: i === 0 ? "pokemon" : undefined }));
  assert.equal(response.status, 201, await response.clone().text());
  const body = await response.json(); created.push(body);
  assert.equal(body.product.game, null);
  assert.equal(body.product.brand, i % 2 ? "Ultra PRO" : "Dragon Shield");
  assert.equal(body.product.metadata.accessoryCategory, category.slug);
  const [savedCategory] = await db.select().from(schema.categories).where(eq(schema.categories.id, body.product.categoryId));
  assert.equal(savedCategory!.slug, `accessories-${category.slug}`);
  assert.ok(savedCategory!.parentId);
  assert.match(body.variant.sku, /^ACC-/);
  assert.equal(body.variant.condition, "New");
  assert.equal(body.variant.language, null);
  assert.equal(body.variant.stock, 4);
}
assert.equal((await db.select().from(schema.categories)).length, 6);
for (const input of [{ ...base, brand: "" }, { ...base, accessoryCategory: "not-a-category" }, { ...base, productType: "single", game: undefined }]) {
  assert.equal((await POST(event("POST", input))).status, 400);
}
const first = created[0]!;
const patch = (changes: object) => PATCH(event("PATCH", { id: first.product.id, variantId: first.variant.id, ...changes }));
assert.equal((await patch({ productType: "accessory", brand: "Custom maker", accessoryCategory: "binders", game: "yugioh", priceCents: 1595 })).status, 200);
let [updated] = await db.select().from(schema.products).where(eq(schema.products.id, first.product.id));
assert.equal(updated!.brand, "Custom maker"); assert.equal(updated!.game, null); assert.equal(updated!.metadata.accessoryCategory, "binders");
assert.equal((await patch({ brand: "" })).status, 400);
assert.equal((await patch({ accessoryCategory: "unknown" })).status, 400);
const stockOnly = await patch({ stock: 6 });
assert.equal(stockOnly.status, 200, await stockOnly.clone().text());
[updated] = await db.select().from(schema.products).where(eq(schema.products.id, first.product.id));
assert.equal(updated!.brand, "Custom maker"); assert.equal(updated!.metadata.accessoryCategory, "binders");
const copied = await duplicate(event("POST", { id: first.product.id }, "/api/admin/duplicate-product"));
assert.equal(copied.status, 201, await copied.clone().text());
const copies = await db.select().from(schema.products);
const copy = copies.find(product => product.id !== first.product.id && product.brand === "Custom maker")!;
assert.ok(copy); assert.equal(copy.status, "draft"); assert.equal(copy.categoryId, updated!.categoryId);
assert.equal(copy.metadata.accessoryCategory, "binders");
assert.equal((await patch({ productType: "single" })).status, 400);
assert.equal((await patch({ productType: "single", game: "yugioh" })).status, 200);
[updated] = await db.select().from(schema.products).where(eq(schema.products.id, first.product.id));
assert.equal(updated!.game, "yugioh"); assert.equal(updated!.categoryId, null); assert.equal(updated!.metadata.accessoryCategory, null);
assert.equal((await patch({ productType: "accessory", brand: "Ultra PRO", accessoryCategory: "playmats" })).status, 200);
const normal = await POST(event("POST", { ...base, slug: "real-card", productType: "single", game: "pokemon", brand: "The Pokémon Company" }));
assert.equal(normal.status, 201);
const catalogue = await loadDatabaseCatalogRows();
const state = databaseCatalogRowsToState(catalogue.products, catalogue.managedSlugs);
const accessories = state.products.filter(product => product.productType === "accessory");
assert.equal(accessories.length, 5, "draft duplicate is not public");
for (const product of accessories) {
  assert.equal(product.game, "accessories"); assert.equal(product.gameName, "Accessories"); assert.equal(product.theme, "accessories");
  assert.ok(product.brand); assert.ok(product.accessoryCategoryName);
  assert.ok(product.variants?.[0]?.image); assert.ok(product.priceCents);
}
const gamePage = await loadDatabaseCatalogRows({ game: "pokemon" });
assert.equal(gamePage.products.length, 1); assert.equal(gamePage.products[0]!.slug, "real-card");
const publicResponse = await publicCatalogue({ request: new Request("https://shop.test/api/catalog/products") } as APIEvent);
assert.equal(publicResponse.status, 200);
const publicRows = (await publicResponse.json()).products;
assert.ok(publicRows.some((product: any) => product.brand === "Ultra PRO" && product.metadata.accessoryCategory === "playmats"));
assert.ok((await searchCatalog({ text: "Ultra PRO" })).length > 0);
for (role of [null, "customer"]) assert.equal((await POST(event("POST", base))).status, role ? 403 : 401);
await pg.close();
console.log("ACCESSORIES INTEGRATION PASSED");
