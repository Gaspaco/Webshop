import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  describeLoginDevice,
  renderTransactionalEmail,
} from "./email.server";

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

describe("renderTransactionalEmail", () => {
  it("escapes customer-controlled copy and action values", () => {
    const html = renderTransactionalEmail({
      preheader: "A <private> update",
      label: "Order & delivery",
      heading: "Hello <script>alert(1)</script>",
      intro: 'A "safe" message',
      action: {
        label: "Open <account>",
        url: 'https://www.tcghaven.com/account?next="unsafe"&step=1',
      },
      notice: "Never share <codes>.",
    });

    assert.ok(!html.includes("<script>alert(1)</script>"));
    assert.ok(html.includes("Hello &lt;script&gt;alert(1)&lt;/script&gt;"));
    assert.ok(html.includes("Open &lt;account&gt;"));
    assert.ok(html.includes("&quot;unsafe&quot;&amp;step=1"));
    assert.ok(html.includes("Never share &lt;codes&gt;."));
  });

  it("uses self-contained email-safe branding", () => {
    const html = renderTransactionalEmail({
      preheader: "Order update",
      label: "Payment received",
      heading: "Your order is confirmed",
      intro: "We are preparing your cards.",
    });

    assert.ok(html.includes('role="presentation"'));
    assert.ok(html.includes("TCGHaven"));
    assert.ok(html.includes("Secure payments by Mollie"));
    assert.ok(!/<script\b/i.test(html));
    assert.ok(!/<img\b/i.test(html));
    assert.ok(!/https?:\/\/fonts\./i.test(html));
  });
});
