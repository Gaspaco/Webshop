// Isolated fixtures only: no production database, authentication, or HTTP calls.
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { mock } from "bun:test";
import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import * as schema from "../src/db/schema";
import type { APIEvent } from "@solidjs/start/server";

if (process.env.TCG_INVENTORY_EXPORT_TEST !== "1") throw new Error("Run through the isolated test wrapper.");
process.env.NODE_ENV = "production";
process.env.DATABASE_URL = "postgresql://isolated:isolated@127.0.0.1:1/no_real_database";
delete process.env.DATABASE_PUBLIC_URL;
globalThis.fetch = (async () => { throw new Error("Network is forbidden in this test."); }) as typeof fetch;
const pg = new PGlite();
const queries: string[] = [];
const db = drizzle(pg, { schema, logger: { logQuery(query) { queries.push(query); } } });
for (const file of readdirSync("drizzle").filter(file => /^\d+.*\.sql$/.test(file)).sort()) {
  for (const statement of readFileSync(`drizzle/${file}`, "utf8").split("--> statement-breakpoint")) if (statement.trim()) await pg.exec(statement);
}
mock.module("../src/db/index.ts", () => ({ db }));
let role: string | null = "admin";
mock.module("../src/lib/auth.ts", () => ({ auth: { api: { getSession: async () => role ? { user: { id: "test-owner", role } } : null } } }));
const { GET } = await import("../src/routes/api/admin/export");
const event = (query = "type=inventory") => ({ request: new Request(`https://shop.test/api/admin/export?${query}`) }) as APIEvent;

function parseCsv(text: string) {
  const rows: string[][] = []; let row: string[] = []; let field = ""; let quoted = false;
  for (let i = 0; i < text.length; i++) {
    const char = text[i];
    if (char === '"') {
      if (quoted && text[i + 1] === '"') { field += '"'; i++; } else quoted = !quoted;
    } else if (!quoted && char === ",") { row.push(field); field = ""; }
    else if (!quoted && char === "\n") { row.push(field.replace(/\r$/, "")); rows.push(row); row = []; field = ""; }
    else field += char;
  }
  assert.equal(quoted, false);
  return rows;
}
const data = "data:image/png;base64,dGVzdA==";
const [setCategory] = await db.insert(schema.categories).values({ name: "Complete sets", slug: "complete-sets" }).returning();
const [expansionCategory] = await db.insert(schema.categories).values({ name: "Chaos Origins", slug: "chaos-origins" }).returning();
async function fixture(slug: string, type: string, options: { categoryId?: string; count?: number; images?: string[]; variantImage?: string; status?: "draft" | "active" | "archived" } = {}) {
  const [product] = await db.insert(schema.products).values({ name: slug === "single" ? '=Test, "card"\nline' : slug, slug, productType: type,
    categoryId: options.categoryId, metadata: { set: "Chaos Origins", setCode: "CHAO" }, status: options.status ?? "active", imageUrls: options.images ?? [] }).returning();
  const count = options.count ?? 1;
  if (count) await db.insert(schema.productVariants).values(Array.from({ length: count }, (_, i) => ({ productId: product!.id,
    name: `Variant ${i}`, sku: `${slug}-${i}`, priceCents: 125 + i, stock: i, reservedStock: 0, imageUrl: options.variantImage ?? null })));
}
await fixture("single", "single", { categoryId: expansionCategory!.id, count: 35, images: ["https://images.test/product.jpg", data], variantImage: "https://images.test/variant.jpg" });
await fixture("many", "single", { count: 505, status: "draft" });
await fixture("set", "set", { images: [data] });
await fixture("category-set", "single", { categoryId: setCategory!.id, status: "archived" });
await fixture("booster-set", "sealed", { categoryId: setCategory!.id });
await fixture("booster", "sealed");
await fixture("graded", "graded");
await fixture("accessory", "accessory");
await fixture("without-variants", "single", { count: 0 });

const expected: Record<string, number> = { all: 547, singles: 541, sets: 2, sealed: 2, "singles-and-sets": 543 };
for (const [scope, count] of Object.entries(expected)) for (const images of [false, true]) {
  queries.length = 0;
  const response = await GET(event(`type=inventory&scope=${scope}&images=${images}`));
  assert.equal(response.status, 200);
  assert.equal(response.headers.get("Cache-Control"), "private, no-store");
  assert.equal(response.headers.get("CDN-Cache-Control"), "no-store");
  assert.match(response.headers.get("Content-Disposition")!, /^attachment; filename="tcghaven-inventory/);
  const [headers, ...rows] = parseCsv(await response.text());
  assert.equal(headers!.length, images ? 14 : 11);
  assert.equal(rows.length, count, `${scope}, images=${images}`);
  assert.ok(rows.every(row => row.length === headers!.length));
  assert.equal(new Set(rows.map(row => row[5] || row[1])).size, rows.length, "no duplicated paginated variants");
  if (scope === "all" || scope === "singles") {
    const single = rows.find(row => row[1] === "single")!;
    assert.equal(single[0], '\t=Test, "card"\nline');
    const empty = rows.find(row => row[1] === "without-variants")!;
    assert.equal(empty[8], "", "missing variant price is not exported as zero");
    if (images) {
      assert.equal(single[11], "https://images.test/variant.jpg");
      assert.deepEqual(JSON.parse(single[12]!), ["https://images.test/product.jpg", data]);
      assert.equal(single[13], "https://images.test/variant.jpg");
    }
  }
  if (scope === "sets" || scope === "singles-and-sets") {
    assert.ok(rows.some(row => row[1] === "category-set"));
    assert.ok(rows.every(row => row[3] !== "sealed"));
    if (images) assert.equal(rows.find(row => row[1] === "set")![11], data);
  }
  if (!images) assert.ok(queries.every(query => !/"image_urls"|"image_url"/.test(query)), "no image data loaded for image-free CSV");
}
assert.equal(parseCsv(await (await GET(event())).text()).length, expected.all! + 1);
for (const query of ["scope=wrong", "images=1", "scope="]) assert.equal((await GET(event(`type=inventory&${query}`))).status, 400);
for (role of [null, "customer"]) for (const scope of Object.keys(expected)) {
  assert.equal((await GET(event(`type=inventory&scope=${scope}&images=true`))).status, role ? 403 : 401);
}
role = "admin";
const customers = await GET(event("type=customers&scope=sealed&images=true"));
assert.equal(customers.status, 200); assert.match(await customers.text(), /^"name","email","verified","joined"/);
const orders = await GET(event("type=orders"));
assert.equal(orders.status, 200); assert.match(await orders.text(), /^"order","email","status"/);
const cancelled = await GET(event("type=inventory&images=true"));
await cancelled.body!.cancel();
await pg.close();
console.log("INVENTORY EXPORT INTEGRATION PASSED");
