import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { APIEvent } from "@solidjs/start/server";
import { handleAuthRequest, limitJsonBody, validateJsonRequest, safeApiResponse } from "./request-security.server";

describe("auth request boundary", () => {
  it("does not expose database exception details from account routes", async () => {
    const response = await safeApiResponse(async () => { throw new Error("SELECT secret_address PRIVATE_TEST_VALUE"); });
    assert.equal(response.status, 503);
    assert.ok(!(await response.text()).includes("PRIVATE_TEST_VALUE"));
  });
  it("rejects an oversized login body before invoking authentication", async () => {
    let called = false;
    const result = await handleAuthRequest(new Request("https://shop.test/api/auth/sign-in/email", {
      method: "POST", body: "x".repeat(16_001),
    }), async () => { called = true; return Response.json({}); });
    assert.equal(result.status, 413);
    assert.equal(called, false);
  });

  it("measures streamed bytes instead of trusting Content-Length", async () => {
    let cancelled = false;
    const body = new ReadableStream({
      pull(controller) { controller.enqueue(new Uint8Array(1024)); },
      cancel() { cancelled = true; },
    });
    const request = new Request("https://shop.test/api/auth/sign-in/email", {
      method: "POST", body, duplex: "half", headers: { "Content-Length": "1" },
    } as RequestInit);
    const result = await limitJsonBody(request, 2000);
    assert.ok(result instanceof Response);
    assert.equal(result.status, 413);
    assert.equal(cancelled, true);
  });

  it("counts UTF-8 bytes and accepts a body exactly at its limit", async () => {
    const result = await limitJsonBody(new Request("https://shop.test", {
      method: "POST", body: "éé",
    }), 4);
    assert.ok(result instanceof Request);
    assert.equal(await result.text(), "éé");
    const oversized = await limitJsonBody(new Request("https://shop.test", {
      method: "POST", body: "éé",
    }), 3);
    assert.ok(oversized instanceof Response);
    assert.equal(oversized.status, 413);
  });

  it("accepts uploaded profile images and preserves cookies while preventing caching", async () => {
    const body = JSON.stringify({ image: "data:image/png;base64," + "a".repeat(440_000) });
    const result = await handleAuthRequest(new Request("https://shop.test/api/auth/update-user", {
      method: "POST", body,
    }), async request => {
      assert.equal(await request.text(), body);
      return Response.json({ ok: true }, { headers: { "Set-Cookie": "session=test; HttpOnly; Secure" } });
    });
    assert.equal(result.status, 200);
    assert.equal(result.headers.get("Cache-Control"), "private, no-store, max-age=0");
    assert.equal(result.headers.get("Referrer-Policy"), "no-referrer");
    assert.ok(result.headers.get("Set-Cookie")?.includes("HttpOnly"));
  });

  it("fails closed during a database outage without exposing internal error details", async () => {
    const result = await handleAuthRequest(new Request("https://shop.test/api/auth/get-session"), async () => {
      throw Object.assign(new Error("SELECT * FROM session; password=PRIVATE_SECRET"), { code: "ECONNREFUSED" });
    });
    assert.equal(result.status, 503);
    assert.ok(!(await result.text()).includes("PRIVATE_SECRET"));
    assert.equal(result.headers.get("Cache-Control"), "private, no-store, max-age=0");
  });
});

describe("JSON request validation", () => {
  it("enforces actual body bytes on storefront endpoints and keeps the body readable", async () => {
    const oversized = { request: new Request("https://shop.test/api/contact", {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ message: "x".repeat(20000) }),
    }) } as APIEvent;
    assert.equal((await validateJsonRequest(oversized, { maxBytes: 16000 }))?.status, 413);
    const valid = { request: new Request("https://shop.test/api/contact", {
      method: "POST", headers: { "Content-Type": "application/json" }, body: '{"ok":true}',
    }) } as APIEvent;
    assert.equal(await validateJsonRequest(valid, { maxBytes: 100 }), null);
    assert.deepEqual(await valid.request.json(), { ok: true });
    // A second authorization check may inspect an already-validated request.
    assert.equal(await limitJsonBody(valid.request, 100), valid.request);
  });
  function event(headers: Record<string, string>) {
    return { request: new Request("https://shop.test/api/account/address", { method: "PUT", headers }) } as APIEvent;
  }
  it("rejects cross-site mutations", async () => {
    assert.equal((await validateJsonRequest(event({ Origin: "https://attacker.test", "Content-Type": "application/json" }), { maxBytes: 1000 }))?.status, 403);
  });
  it("rejects fake JSON media types while allowing charset parameters", async () => {
    assert.equal((await validateJsonRequest(event({ "Content-Type": "application/json-malicious" }), { maxBytes: 1000 }))?.status, 415);
    assert.equal(await validateJsonRequest(event({ "Content-Type": "application/json; charset=utf-8" }), { maxBytes: 1000 }), null);
  });
});
