import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { mock } from "bun:test";
import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { eq } from "drizzle-orm";
import sharp from "sharp";
import * as schema from "../src/db/schema";

if (process.env.TCG_REFERENCE_TEST !== "1") throw new Error("Run through the isolated wrapper.");
process.env.NODE_ENV = "production"; process.env.DATABASE_URL = "postgresql://isolated:isolated@127.0.0.1:1/no_real_database";
delete process.env.DATABASE_PUBLIC_URL; delete process.env.POKEWALLET_API_KEY; delete process.env.CHANNEL3_API_KEY;
const pg = new PGlite(); const db = drizzle(pg, { schema });
for (const file of readdirSync("drizzle").filter(file => /^\d+.*\.sql$/.test(file)).sort()) for (const statement of readFileSync(`drizzle/${file}`, "utf8").split("--> statement-breakpoint")) if (statement.trim()) await pg.exec(statement);
mock.module("../src/db/index.ts", () => ({ db }));
const [owner] = await db.insert(schema.user).values({ name: "Fixture owner", email: "owner@example.invalid", role: "admin" }).returning();
let role: string | null = "admin";
mock.module("../src/lib/auth.ts", () => ({ auth: { api: { getSession: async () => role ? { user: { id: owner!.id, role } } : null } } }));
const image = await sharp({ create: { width: 20, height: 30, channels: 3, background: "#164332" } }).png().toBuffer();
const calls: string[] = [];
const json = (data: unknown) => Response.json(data);
globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
  const url = new URL(String(input)); calls.push(url.href); assert.equal(init?.redirect, "error");
  if (url.hostname === "optcgapi.com") {
    if (url.pathname === "/api/allSetCards/") return json(Array.from({ length: 101 }, (_, i) => ({ card_name: `Zoro ${i}`, card_image_id: `OP01-${i}`, card_set_id: `OP01-${i}`, set_name: "Romance Dawn", set_id: "OP-01", card_image: `https://optcgapi.com/images/${i}.jpg`, market_price: 10 })));
    if (url.pathname === "/api/allSets/") return json([{ set_id: "OP-01", set_name: "Romance Dawn" }]);
    if (url.pathname === "/api/sets/OP-01/") return json([{ card_name: "Luffy", card_image_id: "OP01-L", card_set_id: "OP01-L", set_name: "Romance Dawn", set_id: "OP-01" }]);
  }
  if (url.hostname === "api.gatcg.com") {
    if (url.pathname === "/option/search") return json({ set: [{ value: "DOA 1st", text: "Dawn of Ashes First Edition" }], rarity: [{ value: "4", text: "Super Rare" }] });
    if (url.pathname === "/cards/search") { assert.equal(url.searchParams.get("prefix"), "DOA 1st"); return json({ has_more: true, data: [{ name: "Lorraine", result_editions: [{ uuid: "ga-1", set: { name: "Dawn of Ashes First Edition", prefix: "DOA 1st", language: "EN" }, image: "/cards/images/ga-1.jpg", circulations: [{ foil: true }, { foil: false }] }] }] }); }
  }
  if (url.hostname === "api.pokewallet.io") {
    assert.equal(new Headers(init?.headers).get("x-api-key"), "isolated-test-key-not-real");
    if (url.pathname === "/cfv/search") return json({ results: [{ id: "cfv_test", card_info: { name: "Blaster Blade", set_name: "Vanguard set", set_code: "BT01", product_type: "card", variants: ["Normal"] }, cardmarket: { prices: [{ variant_type: "normal", trend: 1.23 }] } }], pagination: { total_pages: 1 } });
    if (url.pathname === "/cfv/images/cfv_test") return new Response(image, { headers: { "content-type": "image/png" } });
  }
  if (url.hostname === "api.trychannel3.com") {
    assert.equal(new Headers(init?.headers).get("x-api-key"), "isolated-test-key-not-real");
    if (url.pathname === "/v1/brands/search") return json({ brands: [{ id: "brand-funko", name: "Funko" }, { id: "brand-wrong", name: "Other Brand" }] });
    if (url.pathname === "/v1/categories/search") return json({ categories: [{ slug: "figurines", title: "Figurines", path: [{ title: "Home & Garden" }] }, { slug: "action-toy-figures", title: "Action & Toy Figures" }] });
    const body = JSON.parse(String(init?.body));
    const fixture = (id: string) => ({ id, title: "Funko Pop fixture", brands: [{ name: "Funko" }], images: [{ url: "https://cdn.example.test/pop.png" }], variants: { selected: [] }, offers: [{ availability: "InStock", price: { price: 99, currency: "EUR" } }] });
    if (url.pathname === "/v1/lookup") {
      assert.ok(body.url.startsWith("https://retailer.com/"));
      if (body.url.endsWith("/invalid-page")) return new Response("", { status: 422 });
      if (body.url.endsWith("/slow-page")) return new Response("", { status: 504 });
      return json({ product: fixture("lookup-test") });
    }
    assert.equal(url.pathname, "/v1/search");
    if (body.page_token) {
      assert.equal(body.page_token, "provider-private-cursor");
      assert.equal(body.query, undefined, "Continuation follows the provider cursor, not a changed client query");
      return json({ products: [fixture("funko-second-page")] });
    }
    assert.equal(body.config.currency, "EUR");
    assert.equal(body.config.mode, "keyword");
    assert.equal(body.config.country, undefined);
    assert.deepEqual(body.filters.brand_ids, ["brand-funko"]);
    assert.deepEqual(body.filters.category_ids, ["action-toy-figures"]);
    return json({ products: [fixture("funko-test"), { ...fixture("unrelated"), title: "Unrelated clothing", brands: [{ name: "Other Brand" }] }], next_page_token: "provider-private-cursor" });
  }
  throw new Error(`Unexpected test provider route: ${url.hostname}${url.pathname}`);
}) as typeof fetch;
const { GET, POST } = await import("../src/routes/api/admin/reference/[provider]");
const { referenceJson, boundedReferenceBody, referenceKey } = await import("../src/lib/reference-cache.server");
const event = (provider: string, query = "", body?: unknown, origin = "https://shop.test") => ({ params: { provider }, request: new Request(`https://shop.test/api/admin/reference/${provider}${query ? `?${query}` : ""}`, { method: body === undefined ? "GET" : "POST", headers: { origin, "content-type": "application/json" }, ...(body === undefined ? {} : { body: JSON.stringify(body) }) }) }) as any;
const ok = async (response: Response, status = 200) => { const body = await response.json(); assert.equal(response.status, status, JSON.stringify(body)); return body; };
for (role of [null, "customer"]) {
  assert.equal((await GET(event("onepiece", "q=Zoro"))).status, role ? 403 : 401);
  assert.equal((await POST(event("onepiece", "", { cardId: "x" }))).status, role ? 403 : 401);
  assert.equal((await GET(event("channel3", "action=options&type=brand&q=Funko"))).status, role ? 403 : 401);
  assert.equal((await POST(event("channel3", "kind=funko", { action: "lookup", url: "https://retailer.com/product" }))).status, role ? 403 : 401);
}
role = "admin";
assert.equal((await POST(event("onepiece", "", {}, "https://evil.test"))).status, 403);
assert.equal((await GET(event("unknown", "q=test"))).status, 400);
assert.equal((await GET(event("onepiece", "q=x"))).status, 400);
assert.equal(calls.length, 0);
assert.equal((await GET(event("vanguard", "q=Blaster"))).status, 503);
assert.equal((await GET(event("channel3", "q=Funko"))).status, 503);
assert.equal(calls.length, 0);
const first = await ok(await GET(event("onepiece", "q=Zoro"))); assert.equal(first.cards.length, 100); assert.equal(first.hasMore, true);
const second = await ok(await GET(event("onepiece", "q=Zoro&page=2"))); assert.equal(second.cards.length, 1); assert.equal(second.hasMore, false);
assert.equal(calls.length, 1, "The full provider list is cached once, not fetched for each page.");
const imported = await ok(await POST(event("onepiece", "", { cardId: first.cards[0].id })), 201); assert.equal(imported.variants, 1);
const [product] = await db.select().from(schema.products).where(eq(schema.products.game, "onepiece"));
const [variant] = await db.select().from(schema.productVariants).where(eq(schema.productVariants.productId, product!.id));
assert.equal(product!.status, "draft"); assert.equal(variant!.stock, 0); assert.equal(variant!.priceCents, 0); assert.equal(variant!.attributes.setName, "Romance Dawn");
await db.update(schema.productVariants).set({ stock: 5, priceCents: 5000 }).where(eq(schema.productVariants.id, variant!.id));
const duplicate = await ok(await POST(event("onepiece", "", { cardId: first.cards[0].id }))); assert.equal(duplicate.alreadyImported, true);
const [preserved] = await db.select().from(schema.productVariants).where(eq(schema.productVariants.id, variant!.id)); assert.equal(preserved!.stock, 5); assert.equal(preserved!.priceCents, 5000);
await ok(await GET(event("onepiece", "q=Romance%20Dawn&by=set")));
const ga = await ok(await GET(event("grandarchive", "q=Dawn%20of%20Ashes%20First%20Edition&by=set"))); assert.equal(ga.hasMore, true); assert.equal(ga.cards[0].setName, "Dawn of Ashes First Edition");
await ok(await POST(event("grandarchive", "", { cardId: ga.cards[0].id })), 201);
process.env.POKEWALLET_API_KEY = "isolated-test-key-not-real";
const vg = await ok(await GET(event("vanguard", "q=Blaster"))); assert.equal(vg.cards[0].image, null);
await ok(await POST(event("vanguard", "", { cardId: vg.cards[0].id })), 201);
const [vanguard] = await db.select().from(schema.products).where(eq(schema.products.game, "vanguard")); assert.ok(vanguard!.imageUrls[0]!.startsWith("data:image/webp;base64,"));
const [vgVariant] = await db.select().from(schema.productVariants).where(eq(schema.productVariants.productId, vanguard!.id)); assert.equal(vgVariant!.priceCents, 123); assert.equal(vgVariant!.stock, 0);
process.env.CHANNEL3_API_KEY = "isolated-test-key-not-real";
const merch = await ok(await GET(event("channel3", "q=Funko&kind=funko")));
assert.equal(merch.cards.length, 1, "Unrelated brands returned despite the requested filter must not appear as Funko");
assert.equal(merch.hasMore, true);
assert.ok(!JSON.stringify(merch).includes("provider-private-cursor"), "Raw provider cursors stay server-side");
const pageTwo = await ok(await GET(event("channel3", "q=Funko&kind=funko&page=2")));
assert.equal(pageTwo.cards[0].id, "funko-second-page"); assert.equal(pageTwo.hasMore, false);
const beforeInvalidPage = calls.length;
assert.equal((await GET(event("channel3", "q=Different&kind=funko&page=2"))).status, 400);
assert.equal((await GET(event("channel3", "q=Funko&kind=figures&page=2"))).status, 400);
assert.equal((await GET(event("channel3", "q=Funko&kind=funko&country=NL&page=2"))).status, 400);
assert.equal((await GET(event("channel3", "q=Funko&kind=funko&brandId=not-verified"))).status, 400);
assert.equal((await GET(event("channel3", "q=Funko&kind=funko&brandId=brand-wrong"))).status, 400);
assert.equal(calls.length, beforeInvalidPage);
const cursorKey = referenceKey("channel3", ["page-v2", { q: "Funko", kind: "funko", game: "other", brand: "", category: "", mode: "keyword", country: "all" }, 2]);
await db.update(schema.yugipediaCache).set({ expiresAt: new Date(0) }).where(eq(schema.yugipediaCache.key, cursorKey));
assert.equal((await GET(event("channel3", "q=Funko&kind=funko&page=2"))).status, 400);
assert.equal(calls.length, beforeInvalidPage, "Expired and mismatched cursors must not trigger provider calls");
const brandOptions = await ok(await GET(event("channel3", "action=options&type=brand&q=Funko")));
assert.equal(brandOptions.options[0].id, "brand-funko");
const categoryOptions = await ok(await GET(event("channel3", "action=options&type=category&q=action%20toy%20figures")));
assert.equal(categoryOptions.options[0].detail, "Home & Garden");
await ok(await GET(event("channel3", "q=Funko&kind=funko&brandId=brand-funko&categoryId=action-toy-figures")));
assert.equal((await POST(event("channel3", "kind=funko", { cardId: merch.cards[0].id }))).status, 400);
await ok(await POST(event("channel3", "kind=funko", { cardId: merch.cards[0].id, rightsConfirmed: true })), 201);
const [pop] = await db.select().from(schema.products).where(eq(schema.products.productType, "figurine")); assert.equal(pop!.brand, "Funko"); assert.equal(pop!.game, null);
const [popVariant] = await db.select().from(schema.productVariants).where(eq(schema.productVariants.productId, pop!.id)); assert.equal(popVariant!.priceCents, 0); assert.equal(popVariant!.stock, 0);
const productsBeforeLookup = await db.select().from(schema.products);
const beforeUnsafeLookup = calls.length;
assert.equal((await POST(event("channel3", "kind=funko", { action: "lookup", url: "https://127.0.0.1/secret" }))).status, 400);
assert.equal((await POST(event("channel3", "kind=funko", { action: "lookup", url: "https://retailer.com/product" }, "https://evil.test"))).status, 403);
assert.equal(calls.length, beforeUnsafeLookup);
const preview = await ok(await POST(event("channel3", "kind=funko", { action: "lookup", url: "https://retailer.com/product" })));
assert.equal(preview.cards[0].id, "lookup-test");
assert.deepEqual(await db.select().from(schema.products), productsBeforeLookup, "Lookup must preview, not publish or import");
assert.equal((await POST(event("channel3", "kind=funko", { cardId: "lookup-test" }))).status, 400);
await ok(await POST(event("channel3", "kind=funko", { cardId: "lookup-test", rightsConfirmed: true })), 201);
const lookupProducts = await db.select().from(schema.products);
const lookupVariants = await db.select().from(schema.productVariants);
await ok(await POST(event("channel3", "kind=funko", { cardId: "lookup-test", rightsConfirmed: true })));
assert.deepEqual(await db.select().from(schema.products), lookupProducts);
assert.deepEqual(await db.select().from(schema.productVariants), lookupVariants);
const repeat = await ok(await POST(event("channel3", "kind=funko", { action: "lookup", url: "https://retailer.com/product" })));
assert.equal(repeat.cards[0].importedStatus, "draft");
assert.equal((await POST(event("channel3", "kind=funko", { action: "lookup", url: "https://retailer.com/invalid-page" }))).status, 400);
assert.equal((await POST(event("channel3", "kind=funko", { action: "lookup", url: "https://retailer.com/slow-page" }))).status, 503);
await db.insert(schema.rateLimit).values({ key: "reference:channel3:3600000", count: 100, lastRequest: Date.now() }).onConflictDoUpdate({ target: schema.rateLimit.key, set: { count: 100, lastRequest: Date.now() } });
const beforeBudgetLookup = calls.length;
assert.equal((await POST(event("channel3", "kind=funko", { action: "lookup", url: "https://retailer.com/new-product" }))).status, 429);
assert.equal(calls.length, beforeBudgetLookup, "Lookup shares the existing Channel3 provider budget");
const before = calls.length;
await assert.rejects(() => referenceJson("onepiece", "https://127.0.0.1/private")); assert.equal(calls.length, before);
await assert.rejects(() => boundedReferenceBody(new Response("123456789"), 5));
await db.insert(schema.rateLimit).values({ key: "reference:vanguard:3600000", count: 80, lastRequest: Date.now() }).onConflictDoUpdate({ target: schema.rateLimit.key, set: { count: 80, lastRequest: Date.now() } });
assert.equal((await GET(event("vanguard", "q=Another"))).status, 429);
await ok(await GET(event("vanguard", "q=Blaster")));
assert.ok(!JSON.stringify(await db.select().from(schema.products)).includes("isolated-test-key"));
await pg.close(); console.log("REFERENCE PROVIDERS INTEGRATION PASSED");
