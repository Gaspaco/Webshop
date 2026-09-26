import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { describeLoginDevice } from "./email.server";

describe("describeLoginDevice", () => {
  it("describes Chrome on macOS", () => {
    assert.equal(
      describeLoginDevice(
        "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 Chrome/140.0.0.0 Safari/537.36",
      ),
      "Chrome on macOS",
    );
  });

  it("describes mobile Safari without calling it Chrome", () => {
    assert.equal(
      describeLoginDevice(
        "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 Version/18.0 Mobile/15E148 Safari/604.1",
      ),
      "Safari on iPhone",
    );
  });

  it("handles missing user-agent data", () => {
    assert.equal(describeLoginDevice(null), "Unknown browser or device");
  });
});
