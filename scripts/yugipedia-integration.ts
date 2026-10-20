import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { mock } from "bun:test";
import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { eq } from "drizzle-orm";
import * as schema from "../src/db/schema";

if (process.env.TCG_YUGIPEDIA_INTEGRATION !== "1") throw new Error("Run through the isolated test wrapper.");
process.env.NODE_ENV = "production";
process.env.DATABASE_URL = "postgresql://test:test@127.0.0.1:1/isolated";
delete process.env.DATABASE_PUBLIC_URL;
const pg = new PGlite();
const db = drizzle(pg, { schema });
for (const file of readdirSync("drizzle").filter(file => /^\d+.*\.sql$/.test(file)).sort()) {
  for (const statement of readFileSync(`drizzle/${file}`, "utf8").split("--> statement-breakpoint")) if (statement.trim()) await pg.exec(statement);
}
mock.module("../src/db/index.ts", () => ({ db }));
await db.insert(schema.user).values({ id: "00000000-0000-4000-8000-000000000001", email: "owner@example.invalid", name: "Isolated owner", role: "admin" });
let signedIn = true;
mock.module("../src/lib/auth.ts", () => ({ auth: { api: { getSession: async () => signedIn ? { user: { id: "00000000-0000-4000-8000-000000000001", role: "admin" }, session: {} } : null } } }));
const setText = "{{Set list|region=EN|rarities=Common|\nCORI-EN001; Black Chaos; Secret Rare, Starlight Rare\nCORI-EN002; New Test Card; Super Rare\n}}";
const cardText = (name: string, code: string, password = "") => `{{CardTable2\n| types = Spellcaster / Effect\n| image = ${name.replace(/ /g, "")}-CORI-EN-ScR-1E.png\n| password = ${password}\n| text = A test card.\n| en_sets =\n${code}; Chaos Origins; Secret Rare\n}}`;
const imageFiles = ["BlackChaos-CORI-EN-ScR-1E.png", "BlackChaos-CORI-EN-StR-1E.png", "NewTestCard-CORI-EN-SR-1E.png"];
const live = process.env.TCG_YUGIPEDIA_LIVE_CHECK === "1";
const nativeFetch = globalThis.fetch;
const callTimes: number[] = [];
let limited = false;
globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
  const url = new URL(String(input));
  if (live) {
    assert.equal(url.hostname, "yugipedia.com"); assert.equal(url.pathname, "/api.php");
    callTimes.push(Date.now());
    return nativeFetch(input, init);
  }
  if (url.hostname === "ms.yugipedia.com") return new Response(Buffer.alloc(200, 1), { headers: { "Content-Type": "image/png" } });
  assert.equal(url.origin, "https://yugipedia.com");
  assert.ok(new Headers(init?.headers).get("User-Agent")?.includes("info@tcghaven.com"));
  callTimes.push(Date.now());
  if (limited) return new Response("", { status: 429, headers: { "Retry-After": "60" } });
  const titles = url.searchParams.get("titles") ?? "";
  const prop = url.searchParams.get("prop");
  const pages = prop === "imageinfo" ? titles.split("|").map(title => ({ title, imageinfo: [{ url: `https://ms.yugipedia.com/${title.slice(5)}`, mime: "image/png", size: 200 }] }))
    : titles.startsWith("Set Card Lists:") ? [{ pageid: 99, title: "Set Card Lists:Chaos Origins (TCG-EN)", revisions: [{ content: setText }] }]
    : titles.startsWith("Set Card Galleries:") ? [{ title: "Set Card Galleries:Chaos Origins (TCG-EN-1E)", images: imageFiles.map(file => ({ title: `File:${file}` })) }]
    : [{ pageid: 1001, title: "Black Chaos", revisions: [{ content: cardText("Black Chaos", "CORI-EN001", "98684220") }] }, { pageid: 1002, title: "New Test Card", revisions: [{ content: cardText("New Test Card", "CORI-EN002") }] }];
  return Response.json({ query: { pages } });
}) as typeof fetch;
const { searchYugipedia, yugipediaRequest } = await import("../src/lib/yugipedia.server");
await db.insert(schema.yugiohCards).values({ id: 98684220, name: "Black Chaos", description: "Old reference", cardType: "Effect", frameType: "effect", cardmarketPriceCents: 222 });
const [product] = await db.insert(schema.products).values({ name: "Existing shop card", slug: "existing-shop-card", game: "yugioh", status: "active", imageUrls: ["https://owner.example/photo.png"], metadata: { sourceCardId: 98684220 } }).returning();
await db.insert(schema.productVariants).values({ productId: product!.id, sku: "OWNER-SKU", name: "Owner variant", stock: 7, priceCents: 1234 });
const productsBefore = await db.select().from(schema.products);
const variantsBefore = await db.select().from(schema.productVariants);
const result = await searchYugipedia("Chaos Origins", "set");
assert.equal(result.matchedSets[0], "Chaos Origins");
assert.ok(result.cardIds.includes(98684220));
if (live) assert.ok(result.cardIds.length >= 100, `Only ${result.cardIds.length} cards were read`);
else { assert.equal(result.cardIds.length, 2); assert.ok(result.cardIds.includes(-1002)); }
const printingRows = await db.select().from(schema.yugiohPrintings);
assert.ok(printingRows.length > result.cardIds.length);
assert.ok(printingRows.some(row => row.rarity === "Starlight Rare" && row.imageProvider === "yugipedia"));
assert.equal((await db.select().from(schema.yugiohCards).where(eq(schema.yugiohCards.id, 98684220)))[0]!.cardmarketPriceCents, 222);
assert.deepEqual(await db.select().from(schema.products), productsBefore);
assert.deepEqual(await db.select().from(schema.productVariants), variantsBefore);
const requestsBefore = callTimes.length;
assert.deepEqual((await searchYugipedia("Chaos Origins", "set")).cardIds, result.cardIds);
assert.equal(callTimes.length, requestsBefore);
for (let i = 1; i < callTimes.length; i++) assert.ok(callTimes[i]! - callTimes[i - 1]! >= 1000, "Requests exceeded Yugipedia rate limit");
if (!live) {
  const { GET, POST } = await import("../src/routes/api/admin/yugipedia");
  signedIn = false;
  assert.equal((await GET({ request: new Request("https://shop.test/api/admin/yugipedia?q=Chaos%20Origins&by=set") } as any)).status, 401);
  signedIn = true;
  const imported = await POST({ request: new Request("https://shop.test/api/admin/yugipedia", { method: "POST", headers: { Origin: "https://shop.test", "Content-Type": "application/json" }, body: JSON.stringify({ cardId: -1002 }) }) } as any);
  assert.equal(imported.status, 201);
  const newProduct = (await imported.json()).product;
  assert.equal((await db.select().from(schema.products).where(eq(schema.products.id, newProduct.id)))[0]!.status, "draft");
  assert.ok((await db.select().from(schema.productVariants).where(eq(schema.productVariants.productId, newProduct.id))).every(row => row.stock === 0));
  const refreshRequest = () => ({ request: new Request("https://shop.test/api/admin/yugipedia", {
    method: "POST", headers: { Origin: "https://shop.test", "Content-Type": "application/json" },
    body: JSON.stringify({ action: "refresh", q: "Chaos Origins", by: "set" }),
  }) } as any);
  const beforeRefresh = callTimes.length;
  const refreshed = await POST(refreshRequest());
  assert.equal(refreshed.status, 200);
  assert.ok(callTimes.length > beforeRefresh);
  const updatedCards = (await refreshed.json()).cards;
  assert.equal(updatedCards.find((card: any) => card.id === 98684220)?.importedStatus, "active");
  assert.equal((await POST(refreshRequest())).status, 429);
  assert.deepEqual(await db.select().from(schema.productVariants).where(eq(schema.productVariants.productId, product!.id)), variantsBefore);
  limited = true;
  await assert.rejects(() => yugipediaRequest({ action: "query", titles: "Rate limit test" }, { fresh: true }), /pause/);
  assert.ok((await db.select().from(schema.providerOperationLeases).where(eq(schema.providerOperationLeases.key, "yugipedia:request")))[0]!.leaseUntil.getTime() > Date.now() + 50000);
}
console.log(JSON.stringify({ cards: result.cardIds.length, printings: printingRows.length, exactImages: printingRows.filter(row => row.imageProvider === "yugipedia").length, requests: requestsBefore, cachedRepeatRequests: callTimes.length - requestsBefore, productsUnchanged: true }));
await pg.close();
console.log("YUGIPEDIA INTEGRATION PASSED");
