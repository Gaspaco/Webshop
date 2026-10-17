import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { normalizeSocialUrl } from "./social-links";

describe("normalizeSocialUrl", () => {
  it("turns an Instagram handle into a profile URL", () => {
    assert.equal(
      normalizeSocialUrl("instagram", "@mylittletcghaven"),
      "https://www.instagram.com/mylittletcghaven/",
    );
  });

  it("repairs extra path segments on an Instagram profile", () => {
    assert.equal(
      normalizeSocialUrl("instagram", "https://www.instagram.com/mylittletcghaven/7"),
      "https://www.instagram.com/mylittletcghaven/",
    );
  });

  it("rejects an unrelated host", () => {
    assert.equal(
      normalizeSocialUrl("instagram", "https://example.com/mylittletcghaven"),
      "",
    );
  });

  it("normalizes a TikTok handle", () => {
    assert.equal(
      normalizeSocialUrl("tiktok", "tcghaven"),
      "https://www.tiktok.com/@tcghaven",
    );
  });
});
