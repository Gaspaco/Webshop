import assert from "node:assert/strict";
import { afterEach, describe, it } from "node:test";
import { DEFAULT_STORE_PROFILE } from "./store-profile";
import { getLaunchReadiness } from "./readiness.server";

const managedKeys = [
  "MOLLIE_API_KEY",
  "SMTP_HOST",
  "SMTP_PORT",
  "SMTP_USER",
  "SMTP_PASS",
  "AUTH_EMAIL_FROM",
  "POSTNL_API_KEY",
  "POSTNL_CUSTOMER_NUMBER",
  "POSTNL_CUSTOMER_CODE",
  "POSTNL_COLLECTION_LOCATION",
  "POSTNL_MODE",
  "BACKUPS_CONFIRMED",
  "VAT_RULES_CONFIRMED",
  "LEGAL_REVIEW_CONFIRMED",
] as const;

const originalValues = Object.fromEntries(
  managedKeys.map(key => [key, process.env[key]]),
);

afterEach(() => {
  for (const key of managedKeys) {
    const value = originalValues[key];
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
});

function baseInput() {
  return {
    unconvertedStarterProducts: 0,
    storeProfile: DEFAULT_STORE_PROFILE,
    activeProducts: 590,
    paidPayments: 1,
    trackedOrders: 0,
    embeddedImageCount: 10,
  };
}

describe("getLaunchReadiness", () => {
  it("uses paid-order evidence and does not block launch on optional automation", () => {
    Object.assign(process.env, {
      MOLLIE_API_KEY: "live_example",
      SMTP_HOST: "smtp.example.com",
      SMTP_PORT: "465",
      SMTP_USER: "shop@example.com",
      SMTP_PASS: "example-password",
      AUTH_EMAIL_FROM: "TCGHaven <no-reply@tcghaven.com>",
      POSTNL_API_KEY: "sandbox-example-key",
      POSTNL_CUSTOMER_NUMBER: "12345678",
      POSTNL_CUSTOMER_CODE: "ABCD",
      POSTNL_COLLECTION_LOCATION: "123456",
      POSTNL_MODE: "sandbox",
      BACKUPS_CONFIRMED: "true",
      VAT_RULES_CONFIRMED: "true",
      LEGAL_REVIEW_CONFIRMED: "true",
    });

    const readiness = getLaunchReadiness(baseInput());
    const mollie = readiness.items.find(item => item.id === "mollie-live");
    const shipping = readiness.items.find(item => item.id === "shipping");
    const storage = readiness.items.find(item => item.id === "storage");

    assert.equal(readiness.ready, true);
    assert.equal(mollie?.configured, true);
    assert.match(mollie?.detail ?? "", /1 paid payment has been recorded/);
    assert.equal(shipping?.configured, false);
    assert.equal(shipping?.blocking, false);
    assert.match(shipping?.detail ?? "", /sandbox mode/);
    assert.equal(storage?.configured, false);
    assert.equal(storage?.blocking, false);
  });

  it("keeps legal decisions and backups as real launch blockers", () => {
    process.env.MOLLIE_API_KEY = "live_example";
    Object.assign(process.env, {
      SMTP_HOST: "smtp.example.com",
      SMTP_PORT: "587",
      SMTP_USER: "shop@example.com",
      SMTP_PASS: "example-password",
      AUTH_EMAIL_FROM: "TCGHaven <no-reply@tcghaven.com>",
    });
    delete process.env.BACKUPS_CONFIRMED;
    delete process.env.VAT_RULES_CONFIRMED;
    delete process.env.LEGAL_REVIEW_CONFIRMED;

    const readiness = getLaunchReadiness({
      ...baseInput(),
      embeddedImageCount: 0,
    });

    assert.equal(readiness.ready, false);
    assert.equal(readiness.blockers, 3);
    assert.deepEqual(
      readiness.items
        .filter(item => item.blocking && !item.configured)
        .map(item => item.id),
      ["backups", "vat", "legal-review"],
    );
  });

  it("accepts an auditable dashboard confirmation without environment flags", () => {
    process.env.MOLLIE_API_KEY = "live_example";
    Object.assign(process.env, {
      SMTP_HOST: "smtp.example.com",
      SMTP_PORT: "465",
      SMTP_USER: "shop@example.com",
      SMTP_PASS: "example-password",
      AUTH_EMAIL_FROM: "TCGHaven <no-reply@tcghaven.com>",
    });
    delete process.env.VAT_RULES_CONFIRMED;

    const readiness = getLaunchReadiness({
      ...baseInput(),
      confirmations: {
        vat: {
          confirmedAt: "2026-09-26T12:00:00.000Z",
          confirmedBy: "11111111-1111-4111-8111-111111111111",
        },
      },
    });
    const vat = readiness.items.find(item => item.id === "vat");

    assert.equal(vat?.configured, true);
    assert.equal(vat?.manuallyConfirmed, true);
    assert.equal(vat?.confirmationId, "vat");
  });
});
