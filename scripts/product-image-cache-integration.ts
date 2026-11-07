import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { mock } from "bun:test";
import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { eq, sql } from "drizzle-orm";
import sharp from "sharp";
import * as schema from "../src/db/schema";

if (process.env.TCG_PRODUCT_IMAGE_TEST !== "1") throw new Error("Use the isolated product image test wrapper.");
process.env.NODE_ENV = "production";
process.env.DATABASE_URL = "postgresql://isolated:isolated@127.0.0.1:1/no_real_database";
delete process.env.DATABASE_PUBLIC_URL;
delete process.env.PRODUCT_IMAGE_CACHE_MAX_MB;
const pg = new PGlite(); const db = drizzle(pg, { schema });
for (const file of readdirSync("drizzle").filter(file => /^\d+.*\.sql$/.test(file)).sort()) {
  for (const statement of readFileSync(`drizzle/${file}`, "utf8").split("--> statement-breakpoint")) if (statement.trim()) await pg.exec(statement);
}
mock.module("../src/db/index.ts", () => ({ db }));
const image = await sharp({ create: { width: 20, height: 30, channels: 3, background: "#0a5f40" } }).jpeg().toBuffer();
let calls = 0;
let handler = async () => new Response(image, { headers: { "Content-Type": "image/jpeg" } });
globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
  const url = new URL(String(input));
  assert.ok(["cards.scryfall.io", "assets.tcgdex.net", "ms.yugipedia.com", "images.scrydex.com"].includes(url.hostname));
  assert.equal(init?.redirect, "error"); assert.ok(init?.signal instanceof AbortSignal);
  calls++; return handler();
}) as typeof fetch;
const { serveProductImage, allowedProductImageSource, productImageCacheLimit } = await import("../src/lib/product-image-cache.server");
const { loadDatabaseCatalogRows } = await import("../src/lib/catalog-query.server");
const { GET: catalogue } = await import("../src/routes/api/catalog/products");
const { GET: legacyImage } = await import("../src/routes/api/catalog/image");
let number = 0;
async function product(source: string, status: "active" | "draft" = "active") {
  const fixtureNumber = ++number;
  const [p] = await db.insert(schema.products).values({ name: "Fixture", slug: `fixture-${fixtureNumber}`, status, game: "magic", imageUrls: [source, source] }).returning();
  const [v] = await db.insert(schema.productVariants).values({ productId: p!.id, sku: `MTG/TEST-${fixtureNumber}`, name: "Normal", stock: 1, priceCents: 100, imageUrl: source, isDefault: true }).returning();
  return { p: p!, v: v! };
}
const event = (path: string, etag?: string) => ({ params: { filename: path.split("/").pop() },
  request: new Request(`https://shop.test${path}`, { headers: { "x-real-ip": "192.0.2.1", ...(etag ? { "If-None-Match": etag } : {}) } }) }) as any;
async function paths(slug: string) { return (await loadDatabaseCatalogRows({ slug })).products[0]!; }
const source = "https://cards.scryfall.io/normal/front/fixture.jpg";
const first = await product(source);
const row = await paths(first.p.slug);
assert.ok(row.variantImageUrl?.startsWith("/product-images/mtg-test-1--v-"));
assert.ok(row.imageUrls[0]?.includes("--p-"));
assert.ok(!JSON.stringify(row).includes(source));
const publicCatalogue = await catalogue({ request: new Request("https://shop.test/api/catalog/products") } as any);
assert.ok(!(await publicCatalogue.text()).includes(source));
const served = await serveProductImage(event(row.variantImageUrl!));
assert.equal(served.status, 200); assert.equal(served.headers.get("Content-Type"), "image/webp");
assert.ok(served.headers.get("Content-Disposition")?.includes("mtg-test-1"));
assert.equal((await sharp(Buffer.from(await served.arrayBuffer())).metadata()).format, "webp");
assert.equal(calls, 1);
assert.equal((await serveProductImage(event(row.variantImageUrl!))).status, 200);
assert.equal((await serveProductImage(event(row.imageUrls[1]!))).status, 200);
const second = await product(source);
assert.equal((await serveProductImage(event((await paths(second.p.slug)).variantImageUrl!))).status, 200);
assert.equal(calls, 1, "The same source is reused across variants and gallery pictures");
const entries = await db.select().from(schema.productImageCache);
const [usage] = await db.select().from(schema.productImageCacheUsage);
assert.equal(entries.length, 1); assert.equal(usage!.bytes, entries[0]!.data.length);
assert.equal((await serveProductImage(event(row.variantImageUrl!, served.headers.get("ETag")!))).status, 304);
const redirected = await legacyImage({ request: new Request(`https://shop.test/api/catalog/image?variant=${first.v.id}`) } as any);
assert.equal(redirected.status, 302); assert.equal(redirected.headers.get("Location"), row.variantImageUrl);

// Cached bytes and validators cannot bypass publication or stale filename checks.
await db.update(schema.products).set({ status: "draft" }).where(eq(schema.products.id, first.p.id));
assert.equal((await serveProductImage(event(row.variantImageUrl!, served.headers.get("ETag")!))).status, 404);
await db.update(schema.products).set({ status: "active" }).where(eq(schema.products.id, first.p.id));
const changed = "https://cards.scryfall.io/normal/front/new-printing.jpg";
await db.update(schema.productVariants).set({ imageUrl: changed }).where(eq(schema.productVariants.id, first.v.id));
assert.equal((await serveProductImage(event(row.variantImageUrl!))).status, 404);
assert.equal((await serveProductImage(event((await paths(first.p.slug)).variantImageUrl!))).status, 200);
assert.equal((await db.select().from(schema.productVariants).where(eq(schema.productVariants.id, first.v.id)))[0]!.imageUrl, changed);
assert.equal((await serveProductImage(event(row.variantImageUrl!.replace("mtg-test-1", "wrong-sku")))).status, 404);

// Stored uploads and first-party Yugipedia references use this same cache.
const embedded = await product(`data:image/jpeg;base64,${image.toString("base64")}`);
assert.ok(!JSON.stringify(await paths(embedded.p.slug)).includes("base64"));
assert.equal((await serveProductImage(event((await paths(embedded.p.slug)).variantImageUrl!))).status, 200);
await db.insert(schema.yugiohCards).values({ id: 42, name: "Fixture card", cardType: "Effect", frameType: "effect", description: "Fixture", imageSourceUrl: "https://ms.yugipedia.com/fixture.jpg" });
const ygo = await product("/card-images/yugipedia/card/42");
assert.equal((await serveProductImage(event((await paths(ygo.p.slug)).variantImageUrl!))).status, 200);
assert.equal((await db.select().from(schema.rateLimit).where(eq(schema.rateLimit.key, "yugipedia:image:outbound")))[0]!.count, 1);
await db.update(schema.rateLimit).set({ count: 240 }).where(eq(schema.rateLimit.key, "yugipedia:image:outbound"));
const throttled = await product("https://ms.yugipedia.com/another-printing.jpg");
const beforeThrottled = calls;
assert.equal((await serveProductImage(event((await paths(throttled.p.slug)).variantImageUrl!))).status, 302);
assert.equal(calls, beforeThrottled, "The shared Yugipedia ceiling cannot be bypassed through the new cache route");
await db.update(schema.rateLimit).set({ count: 1 }).where(eq(schema.rateLimit.key, "yugipedia:image:outbound"));

// No caller-controlled URL fetch, credentials, private hosts or redirects.
const beforeUnsafe = calls;
for (const unsafe of ["http://cards.scryfall.io/x", "https://user:pass@cards.scryfall.io/x", "https://cards.scryfall.io:444/x", "https://cards.scryfall.io.attacker.test/x", "https://127.0.0.1/x", "https://[::1]/x", "https://cards.scryfall.io/x#fragment"]) {
  assert.equal(allowedProductImageSource(unsafe), false);
}
const local = await product("https://127.0.0.1/private");
assert.equal((await serveProductImage(event((await paths(local.p.slug)).variantImageUrl!))).status, 404);
assert.equal(calls, beforeUnsafe);

// Cold requests for one photo coalesce instead of hammering the provider.
const burst = await product("https://assets.tcgdex.net/fixture/high.webp");
const burstPath = (await paths(burst.p.slug)).variantImageUrl!;
const beforeBurst = calls;
const responses = await Promise.all(Array.from({ length: 10 }, () => serveProductImage(event(burstPath))));
assert.ok(responses.every(response => response.status === 200));
assert.equal(calls - beforeBurst, 1);

// Invalid raster data is never stored as a cache hit; original sources survive.
const bad = await product("https://images.scrydex.com/fixture/bad.webp");
const badPath = (await paths(bad.p.slug)).variantImageUrl!;
const countBeforeBad = (await db.select().from(schema.productImageCache)).length;
handler = async () => new Response("<svg xmlns='http://www.w3.org/2000/svg'></svg>", { headers: { "Content-Type": "image/png" } });
assert.equal((await serveProductImage(event(badPath))).status, 302);
assert.equal((await db.select().from(schema.productImageCache)).length, countBeforeBad);
let cancelled = false;
handler = async () => new Response(new ReadableStream<Uint8Array>({ pull(controller) { controller.enqueue(new Uint8Array(4_000_000)); }, cancel() { cancelled = true; } }, { highWaterMark: 0 }), { headers: { "Content-Type": "image/png" } });
assert.equal((await serveProductImage(event(badPath))).status, 302); assert.equal(cancelled, true);
assert.equal((await db.select().from(schema.productImageCache)).length, countBeforeBad);
handler = async () => new Response(image, { headers: { "Content-Type": "image/jpeg" } });

// Concurrent inserts cannot exceed the configured cap, nor consume budget for
// failed inserts. Cache exhaustion leaves original working images available.
process.env.PRODUCT_IMAGE_CACHE_MAX_MB = "1";
await db.update(schema.productImageCacheUsage).set({ bytes: 1024 * 1024 - 1 }).where(eq(schema.productImageCacheUsage.key, "catalogue"));
const exhausted = await Promise.all([1, 2].map(async index => {
  const p = await product(`https://cards.scryfall.io/capacity-${index}.jpg`);
  return serveProductImage(event((await paths(p.p.slug)).variantImageUrl!));
}));
assert.ok(exhausted.every(response => response.status === 302));
assert.equal((await db.select().from(schema.productImageCacheUsage))[0]!.bytes, 1024 * 1024 - 1);
assert.equal((await db.select().from(schema.productImageCache)).length, countBeforeBad);
assert.equal((await serveProductImage(event(row.imageUrls[0]!))).status, 200, "Existing cached photos remain available when capacity is exhausted");
assert.equal(productImageCacheLimit(), 1024 * 1024);
await db.update(schema.productImageCacheUsage).set({ bytes: sql`(select coalesce(sum(bytes), 0) from product_image_cache)` }).where(eq(schema.productImageCacheUsage.key, "catalogue"));
let signedIn: { user: { id: string; role: string; email: string; emailVerified: boolean } } | null = null;
mock.module("../src/lib/auth.ts", () => ({ auth: { api: { getSession: async () => signedIn } } }));
const { GET: cacheStatus } = await import("../src/routes/api/admin/image-cache");
const statusEvent = event("/api/admin/image-cache");
assert.equal((await cacheStatus(statusEvent)).status, 401);
signedIn = { user: { id: crypto.randomUUID(), role: "customer", email: "fixture@example.invalid", emailVerified: true } };
assert.equal((await cacheStatus(statusEvent)).status, 403);
signedIn.user.role = "admin";
const status = await cacheStatus(statusEvent);
assert.equal(status.status, 200);
assert.equal((await status.json()).images, countBeforeBad);
await pg.close();
console.log("PRODUCT IMAGE CACHE INTEGRATION PASSED; no production database or provider contacted");
