// Isolated PostgreSQL and mock HTTP only: never use the shop DB or a provider.
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync, readdirSync } from "node:fs";
import { mock } from "bun:test";
import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { eq } from "drizzle-orm";
import * as schema from "../src/db/schema";
import type { APIEvent } from "@solidjs/start/server";

if (process.env.TCG_IMAGE_SECURITY_TEST !== "1") throw new Error("Run through the isolated test wrapper.");
process.env.DATABASE_URL = "postgresql://isolated:isolated@127.0.0.1:1/no_real_database";
delete process.env.DATABASE_PUBLIC_URL;
const pg = new PGlite();
const db = drizzle(pg, { schema });
for (const file of readdirSync("drizzle").filter(file => /^\d+.*\.sql$/.test(file)).sort()) {
  for (const statement of readFileSync(`drizzle/${file}`, "utf8").split("--> statement-breakpoint")) {
    if (statement.trim()) await pg.exec(statement);
  }
}
mock.module("../src/db/index.ts", () => ({ db }));
let calls = 0;
let handler: () => Promise<Response> = async () => new Response("mock image", { headers: { "Content-Type": "image/png" } });
globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
  assert.equal(new URL(String(input)).hostname, "ms.yugipedia.com");
  assert.equal(init?.redirect, "error", "Redirects must not escape the validated host");
  assert.ok(init.signal instanceof AbortSignal);
  calls++;
  return handler();
}) as typeof fetch;
const { serveYugipediaImage } = await import("../src/lib/yugipedia-image.server");
const { GET: cardImage } = await import("../src/routes/card-images/yugipedia/card/[id]");
const { GET: printingImage } = await import("../src/routes/card-images/yugipedia/[id]");
const imageUrl = "https://ms.yugipedia.com/test/card.png";
const event = (id = "1", ip = "192.0.2.1") => ({
  params: { id }, request: new Request(`https://shop.test/card-images/yugipedia/card/${id}`, { headers: { "x-real-ip": ip } }),
}) as unknown as APIEvent;
await db.insert(schema.yugiohCards).values({ id: 1, name: "Test card", cardType: "Effect", frameType: "effect", description: "Fixture", imageSourceUrl: imageUrl });
const [printing] = await db.insert(schema.yugiohPrintings).values({ cardId: 1, setName: "Test", setCode: "TEST-EN001", rarity: "Rare", imageProvider: "yugipedia", imageSourceUrl: imageUrl }).returning();

// Real routes return intact bytes, with public success caching and safe headers.
for (const response of [await cardImage(event()), await printingImage(event(printing!.id))]) {
  assert.equal(response.status, 200);
  assert.equal(await response.text(), "mock image");
  assert.equal(response.headers.get("Content-Type"), "image/png");
  assert.equal(response.headers.get("X-Content-Type-Options"), "nosniff");
  assert.ok(response.headers.get("Cache-Control")?.includes("s-maxage=2592000"));
}
assert.equal((await cardImage(event("invalid"))).status, 404);
assert.equal((await printingImage(event("invalid"))).status, 404);

// Twenty simultaneous requests use exactly one fetch; every response is readable.
const beforeBurst = calls;
let releaseDownload!: () => void;
const gate = new Promise<void>(resolve => { releaseDownload = resolve; });
handler = async () => { await gate; return new Response("shared image", { headers: { "Content-Type": "image/png" } }); };
let resolved = 0;
let allResolved!: () => void;
const ready = new Promise<void>(resolve => { allResolved = resolve; });
const burst = Array.from({ length: 20 }, (_, index) => serveYugipediaImage(event("1", `192.0.2.${index + 10}`), async () => {
  resolved++; if (resolved === 20) allResolved(); return imageUrl;
}));
await ready;
releaseDownload();
const burstResponses = await Promise.all(burst);
assert.equal(calls - beforeBurst, 1);
for (const response of burstResponses) { assert.equal(response.status, 200); assert.equal(await response.text(), "shared image"); }

// Block private, unknown-subdomain, credential-bearing and non-HTTPS URLs.
const beforeRejected = calls;
for (const url of ["http://127.0.0.1/private", "https://evil.yugipedia.com/x", "https://user:pass@yugipedia.com/x", "https://ms.yugipedia.com:444/x"]) {
  await db.update(schema.yugiohPrintings).set({ imageSourceUrl: url }).where(eq(schema.yugiohPrintings.id, printing!.id));
  assert.equal((await printingImage(event(printing!.id))).status, 404);
}
assert.equal(calls, beforeRejected);
await db.update(schema.yugiohPrintings).set({ imageSourceUrl: imageUrl }).where(eq(schema.yugiohPrintings.id, printing!.id));

let pulls = 0;
let cancelled = 0;
function oversized(headers: Record<string, string>) {
  pulls = 0; cancelled = 0;
  return new Response(new ReadableStream<Uint8Array>({
    pull(controller) { pulls++; controller.enqueue(new Uint8Array(1_000_000)); },
    cancel() { cancelled++; },
  }, { highWaterMark: 0 }), { headers });
}
// A missing or understated Content-Length cannot bypass the streaming limit.
for (const length of [undefined, "10"]) {
  handler = async () => oversized({ "Content-Type": "image/png", ...(length ? { "Content-Length": length } : {}) });
  const response = await printingImage(event(printing!.id));
  assert.equal(response.status, 413);
  assert.equal(pulls, 13);
  assert.equal(cancelled, 1);
  assert.equal(response.headers.get("Cache-Control"), "no-store");
}
handler = async () => oversized({ "Content-Type": "image/png", "Content-Length": "13000000" });
assert.equal((await printingImage(event(printing!.id))).status, 413);
assert.equal(pulls, 0); assert.equal(cancelled, 1);
handler = async () => oversized({ "Content-Type": "text/html" });
assert.equal((await cardImage(event())).status, 415);
assert.equal(pulls, 0); assert.equal(cancelled, 1);
handler = async () => { throw new TypeError("Mock redirect refused"); };
assert.equal((await cardImage(event())).status, 502);

// Another instance owns this download: no second fetch, no cached error.
const sharedKey = `yugipedia:image:${createHash("sha256").update(`2000000:${imageUrl}`).digest("hex")}`;
const anotherToken = crypto.randomUUID();
await db.insert(schema.providerOperationLeases).values({ key: sharedKey, token: anotherToken, leaseUntil: new Date(Date.now() + 60_000) })
  .onConflictDoUpdate({ target: schema.providerOperationLeases.key, set: { token: anotherToken, leaseUntil: new Date(Date.now() + 60_000) } });
const beforeLeased = calls;
const leased = await cardImage(event());
assert.equal(leased.status, 503); assert.equal(leased.headers.get("Retry-After"), "1");
assert.equal(leased.headers.get("Cache-Control"), "no-store"); assert.equal(calls, beforeLeased);
await db.delete(schema.providerOperationLeases);

// All shared concurrency slots occupied, even though this local instance is idle.
await db.insert(schema.providerOperationLeases).values(Array.from({ length: 16 }, (_, index) => ({ key: `yugipedia:image:slot:${index}`, token: crypto.randomUUID(), leaseUntil: new Date(Date.now() + 60_000) })));
assert.equal((await cardImage(event())).status, 503); assert.equal(calls, beforeLeased);
await db.delete(schema.providerOperationLeases);

// Shared outbound limit applies regardless of the supplied client IP.
await db.insert(schema.rateLimit).values({ key: "yugipedia:image:outbound", count: 240, lastRequest: Date.now() })
  .onConflictDoUpdate({ target: schema.rateLimit.key, set: { count: 240, lastRequest: Date.now() } });
for (const ip of ["192.0.2.100", "192.0.2.101"]) {
  const response = await cardImage(event("1", ip));
  assert.equal(response.status, 429); assert.equal(response.headers.get("Retry-After"), "60");
}
assert.equal(calls, beforeLeased);
// Client limit is checked before resolving the source or starting a download.
const fingerprint = createHash("sha256").update("192.0.2.200:public").digest("hex").slice(0, 32);
await db.insert(schema.rateLimit).values({ key: `yugipedia:images:${fingerprint}`, count: 180, lastRequest: Date.now() });
let lookedUp = false;
assert.equal((await serveYugipediaImage(event("1", "192.0.2.200"), async () => { lookedUp = true; return imageUrl; })).status, 429);
assert.equal(lookedUp, false);
// Storage failure must not silently bypass either abuse control.
await pg.close();
assert.equal((await cardImage(event())).status, 503);
assert.equal(calls, beforeLeased);
console.log("YUGIPEDIA IMAGE SECURITY PASSED");
