import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { mock } from "bun:test";
import { createHash } from "node:crypto";
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
const setText = "{{Set list|region=EN|rarities=Common|\nCORI-EN001; Black Chaos; Secret Rare, Starlight Rare\nCORI-EN002; New Test Card (card); Super Rare\n}}";
const cardText = (name: string, code: string, password = "") => `{{CardTable2\n| en_name = ${name}\n| types = Spellcaster / Effect\n| image = ${name.replace(/ /g, "")}-CORI-EN-ScR-1E.png\n| password = ${password}\n| text = A test card.\n| en_sets =\n${code}; Chaos Origins; Secret Rare\n}}`;
const imageFiles = ["BlackChaos-CORI-EN-ScR-1E.png", "BlackChaos-CORI-EN-StR-1E.png", "NewTestCard-CORI-EN-SR-1E.png"];
const live = process.env.TCG_YUGIPEDIA_LIVE_CHECK === "1";
const nativeFetch = globalThis.fetch;
const callTimes: number[] = [];
let limited = false;
let forbidden = false;
let omitCard = false;
let largeSet = false;
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
  if (forbidden) return new Response("", { status: 403 });
  if (limited) return new Response("", { status: 429, headers: { "Retry-After": "60" } });
  if (url.searchParams.get("list") === "recentchanges") {
    assert.equal(url.searchParams.get("rclimit"), "500");
    assert.equal(url.searchParams.get("rcnamespace"), "3006");
    return Response.json({ query: { recentchanges: [
      { title: "Set Card Lists:Chaos Origins (TCG-EN)", timestamp: "2026-11-07T00:00:00Z" },
      { title: "Set Card Lists:Chaos Origins (TCG-EN)", timestamp: "2026-11-06T00:00:00Z" },
      { title: "Set Card Lists:Other Language (TCG-DE)", timestamp: "2026-11-07T00:00:00Z" },
    ] } });
  }
  const titles = url.searchParams.get("titles") ?? "";
  const prop = url.searchParams.get("prop");
  if (largeSet) {
    if (titles.startsWith("Set Card Lists:")) return Response.json({ query: { pages: [{ pageid: 2000000, title: "Set Card Lists:Large Batch Fixture (TCG-EN)", revisions: [{ content: "{{Set list|region=EN|\n" + Array.from({ length: 125 }, (_, i) => `MAMS-EN${String(i + 1).padStart(3, "0")}; Batch Card ${i === 124 ? 99 : i}; Ultra Rare`).join("\n") + "\n}}" }] }] } });
    if (titles.startsWith("Set Card Galleries:")) return Response.json({ query: { pages: [] } });
    assert.equal(prop, "revisions", "Set card facts must not be truncated by image pagination");
    assert.ok(titles.split("|").length <= 25);
    return Response.json({ query: { pages: titles.split("|").map(name => ({ pageid: 2000001 + Number(name.split(" ").at(-1)), title: name,
      revisions: [{ content: `{{CardTable2\n| types = Spellcaster / Effect\n| text = Batch fixture.\n}}` }] })) } });
  }
  if (titles.startsWith("Set Card Galleries:")) return Response.json({
    ...(url.searchParams.has("imcontinue") ? {} : { continue: { continue: "||", imcontinue: "gallery-2" } }),
    query: { pages: [{ title: "Set Card Galleries:Chaos Origins (TCG-EN-1E)", images: (url.searchParams.has("imcontinue") ? imageFiles.slice(1) : imageFiles.slice(0, 1)).map(file => ({ title: `File:${file}` })) }] },
  });
  const pages = prop === "imageinfo" ? titles.split("|").map(title => ({ title, imageinfo: [{ url: `https://ms.yugipedia.com/${title.slice(5)}`, mime: "image/png", size: 200 }] }))
    : titles.startsWith("Set Card Lists:") ? [{ pageid: 99, title: "Set Card Lists:Chaos Origins (TCG-EN)", revisions: [{ content: setText }] }]
    : titles.startsWith("Set Card Galleries:") ? [{ title: "Set Card Galleries:Chaos Origins (TCG-EN-1E)", images: imageFiles.map(file => ({ title: `File:${file}` })) }]
    : [{ pageid: 1001, title: "Black Chaos", revisions: [{ content: cardText("Black Chaos", "CORI-EN001", "98684220") }] }, ...(!omitCard ? [{ pageid: 1002, title: "New Test Card (card)", revisions: [{ content: cardText("New Test Card", "CORI-EN002") }] }] : [])];
  return Response.json({ query: { pages } });
}) as typeof fetch;
const { searchYugipedia, yugipediaRequest } = await import("../src/lib/yugipedia.server");
await db.insert(schema.yugiohCards).values({ id: 98684220, name: "Black Chaos", description: "Old reference", cardType: "Effect", frameType: "effect", cardmarketPriceCents: 222 });
const [product] = await db.insert(schema.products).values({ name: "Existing shop card", slug: "existing-shop-card", game: "yugioh", status: "active", imageUrls: ["https://owner.example/photo.png"], metadata: { sourceCardId: 98684220 } }).returning();
await db.insert(schema.productVariants).values({ productId: product!.id, sku: "OWNER-SKU", name: "Owner variant", stock: 7, priceCents: 1234, imageUrl: "/images/owner-override.webp", isDefault: true });
const productsBefore = await db.select().from(schema.products);
const variantsBefore = await db.select().from(schema.productVariants);
const manifestKey = "search-v1:" + createHash("sha256").update(JSON.stringify(["set", "chaos origins"])).digest("hex");
await db.insert(schema.yugipediaCache).values({ key: manifestKey, payload: { cardIds: [98684220], matchedSets: ["Chaos Origins"], syncedAt: "2026-10-22T00:00:00Z" }, expiresAt: new Date(Date.now() + 86400000) });
const result = await searchYugipedia("Chaos Origins", "set");
assert.equal(result.matchedSets[0], "Chaos Origins");
assert.ok(result.cardIds.includes(98684220));
if (live) assert.ok(result.cardIds.length >= 100, `Only ${result.cardIds.length} cards were read`);
else { assert.equal(result.cardIds.length, 2); assert.ok(result.cardIds.includes(-1002)); }
assert.equal(result.expectedCards, 2); assert.equal(result.setSlots, 2); assert.deepEqual(result.missingCards, []);
const printingRows = await db.select().from(schema.yugiohPrintings);
assert.ok(printingRows.length > result.cardIds.length);
assert.ok(printingRows.some(row => row.rarity === "Starlight Rare" && row.imageProvider === "yugipedia"));
assert.ok(printingRows.some(row => row.cardId === -1002 && row.rarity === "Super Rare"), "A page-title/display-name alias must retain its set printing");
assert.equal((await db.select().from(schema.yugiohCards).where(eq(schema.yugiohCards.id, 98684220)))[0]!.cardmarketPriceCents, 222);
assert.deepEqual(await db.select().from(schema.products), productsBefore);
assert.deepEqual(await db.select().from(schema.productVariants), variantsBefore);
const requestsBefore = callTimes.length;
assert.deepEqual((await searchYugipedia("Chaos Origins", "set")).cardIds, result.cardIds);
assert.equal(callTimes.length, requestsBefore);
for (let i = 1; i < callTimes.length; i++) assert.ok(callTimes[i]! - callTimes[i - 1]! >= 1000, "Requests exceeded Yugipedia rate limit");
if (!live) {
  const changedAt = new Date(Date.now() + 1000);
  await db.update(schema.yugipediaCache).set({ updatedAt: changedAt }).where(eq(schema.yugipediaCache.key, result.setListCacheKey!));
  assert.equal((await searchYugipedia("Chaos Origins", "set")).setListUpdatedAt, changedAt.toISOString(), "A newer cached set list must invalidate the older search manifest");
  const { GET, POST } = await import("../src/routes/api/admin/yugipedia");
  signedIn = false;
  assert.equal((await GET({ request: new Request("https://shop.test/api/admin/yugipedia?q=Chaos%20Origins&by=set") } as any)).status, 401);
  const discoveryRequest = (origin = "https://shop.test") => ({ request: new Request("https://shop.test/api/admin/yugipedia", {
    method: "POST", headers: { Origin: origin, "Content-Type": "application/json" }, body: JSON.stringify({ action: "discover_sets" }),
  }) } as any);
  assert.equal((await POST(discoveryRequest())).status, 401);
  signedIn = true;
  assert.equal((await POST(discoveryRequest("https://evil.invalid"))).status, 403);
  const beforeDiscovery = callTimes.length;
  const discovered = await POST(discoveryRequest());
  assert.equal(discovered.status, 200);
  assert.equal(callTimes.length, beforeDiscovery + 1);
  assert.deepEqual((await discovered.json()).sets, [{ name: "Chaos Origins", updatedAt: "2026-11-07T00:00:00Z" }]);
  const { discoverYugipediaSets } = await import("../src/lib/yugipedia.server");
  assert.equal((await discoverYugipediaSets()).sets.length, 1);
  assert.equal(callTimes.length, beforeDiscovery + 1, "Repeated discovery must use the shared cache");
  assert.equal((await POST(discoveryRequest())).status, 429);
  await db.insert(schema.yugiohPrintings).values({ cardId: -1002, setName: "Other set", setCode: "OTHER-EN001", rarity: "Common" });
  const imported = await POST({ request: new Request("https://shop.test/api/admin/yugipedia", { method: "POST", headers: { Origin: "https://shop.test", "Content-Type": "application/json" }, body: JSON.stringify({ cardId: -1002, setName: "Chaos Origins" }) }) } as any);
  assert.equal(imported.status, 201);
  const newProduct = (await imported.json()).product;
  assert.equal((await db.select().from(schema.products).where(eq(schema.products.id, newProduct.id)))[0]!.status, "draft");
  assert.ok((await db.select().from(schema.productVariants).where(eq(schema.productVariants.productId, newProduct.id))).every(row => row.stock === 0));
  assert.equal((await db.select().from(schema.productVariants).where(eq(schema.productVariants.productId, newProduct.id))).length, 1, "Import only the selected set, not unrelated printings");
  const refreshRequest = () => ({ request: new Request("https://shop.test/api/admin/yugipedia", {
    method: "POST", headers: { Origin: "https://shop.test", "Content-Type": "application/json" },
    body: JSON.stringify({ action: "refresh", q: "Chaos Origins", by: "set" }),
  }) } as any);
  const beforeRefresh = callTimes.length;
  const refreshed = await POST(refreshRequest());
  assert.equal(refreshed.status, 200);
  assert.ok(callTimes.length > beforeRefresh);
  const updatedCards = (await refreshed.json()).cards;
  assert.equal(updatedCards.find((card: any) => card.id === 98684220)?.importedStatus, null);
  assert.equal(updatedCards.find((card: any) => card.id === 98684220)?.missingPrintings, 2);
  assert.equal((await POST(refreshRequest())).status, 429);
  assert.deepEqual(await db.select().from(schema.productVariants).where(eq(schema.productVariants.productId, product!.id)), variantsBefore);
  const appendRequest = (appendMissing: boolean) => ({ request: new Request("https://shop.test/api/admin/yugipedia", { method: "POST", headers: { Origin: "https://shop.test", "Content-Type": "application/json" }, body: JSON.stringify({ cardId: 98684220, setName: "Chaos Origins", appendMissing }) }) } as any);
  assert.equal((await POST(appendRequest(false))).status, 409, "Appending to an existing product requires explicit opt-in");
  assert.equal((await POST(appendRequest(true))).status, 200);
  const afterAppend = await db.select().from(schema.productVariants).where(eq(schema.productVariants.productId, product!.id));
  assert.equal(afterAppend.length, 3);
  assert.deepEqual(afterAppend.find(row => row.id === variantsBefore[0]!.id), variantsBefore[0]);
  assert.ok(afterAppend.filter(row => row.id !== variantsBefore[0]!.id).every(row => row.stock === 0 && row.priceCents === 0 && !row.isDefault));
  assert.deepEqual((await db.select().from(schema.products).where(eq(schema.products.id, product!.id)))[0], productsBefore[0]);
  assert.equal((await (await POST(appendRequest(true))).json()).variants, 0, "Retrying must not duplicate printings");
  assert.equal((await db.select().from(schema.productVariants).where(eq(schema.productVariants.productId, product!.id))).length, 3);
  omitCard = true;
  const partial = await searchYugipedia("Chaos Origins", "set", true);
  assert.equal(partial.cardIds.length, 1); assert.deepEqual(partial.missingCards, ["New Test Card (card)"]);
  const [partialCache] = await db.select().from(schema.yugipediaCache).where(eq(schema.yugipediaCache.key, manifestKey));
  assert.ok(partialCache!.expiresAt.getTime() < Date.now() + 70000, "Incomplete card lists cannot remain cached for a month");
  largeSet = true;
  const large = await searchYugipedia("Large Batch Fixture", "set");
  assert.equal(large.cardIds.length, 124); assert.equal(large.expectedCards, 124); assert.equal(large.setSlots, 125); assert.deepEqual(large.missingCards, []);
  assert.equal((await db.select().from(schema.yugiohPrintings).where(eq(schema.yugiohPrintings.setName, "Large Batch Fixture"))).length, 125);
  largeSet = false;
  forbidden = true;
  await assert.rejects(() => yugipediaRequest({ action: "query", titles: "Forbidden test" }, { fresh: true }), /refused access \(403\)/);
  assert.ok((await db.select().from(schema.providerOperationLeases).where(eq(schema.providerOperationLeases.key, "yugipedia:request")))[0]!.leaseUntil.getTime() > Date.now() + 290000);
  // Advance only the isolated test lease; production cooldowns are never reset.
  await db.update(schema.providerOperationLeases).set({ leaseUntil: new Date(0) }).where(eq(schema.providerOperationLeases.key, "yugipedia:request"));
  forbidden = false;
  limited = true;
  await assert.rejects(() => yugipediaRequest({ action: "query", titles: "Rate limit test" }, { fresh: true }), /pause/);
  assert.ok((await db.select().from(schema.providerOperationLeases).where(eq(schema.providerOperationLeases.key, "yugipedia:request")))[0]!.leaseUntil.getTime() > Date.now() + 50000);
}
console.log(JSON.stringify({ cards: result.cardIds.length, printings: printingRows.length, exactImages: printingRows.filter(row => row.imageProvider === "yugipedia").length, requests: requestsBefore, cachedRepeatRequests: callTimes.length - requestsBefore, productsUnchanged: true }));
await pg.close();
console.log("YUGIPEDIA INTEGRATION PASSED");
