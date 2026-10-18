import assert from "node:assert/strict";
import { X509Certificate } from "node:crypto";
import type { ConnectionOptions, PeerCertificate } from "node:tls";
import { describe, it } from "node:test";
import { Client } from "pg";
import { databaseConnectionOptions, databaseMigrationCredentials } from "./connection";
import { RAILWAY_POSTGRES_CA } from "./railway-ca";

describe("verified PostgreSQL connections", () => {
  const url = "postgresql://user:pass@postgres.railway.internal:5432/railway";
  it("pins the authenticated Railway CA and always verifies remote TLS", () => {
    const options = databaseConnectionOptions({ url, production: true });
    assert.ok(options.ssl);
    assert.equal(options.ssl.rejectUnauthorized, true);
    assert.equal(options.ssl.minVersion, "TLSv1.2");
    const certificate = new X509Certificate(options.ssl.ca as string);
    assert.equal(certificate.fingerprint256, "64:DD:EE:F1:2F:76:FE:B8:B3:3A:28:70:76:96:91:28:02:28:2D:7A:7F:11:2A:1B:6C:31:61:78:AB:23:20:C2");
    assert.equal(certificate.ca, true);
  });

  it("does not let URL flags silently disable verification or replace the CA", () => {
    for (const flags of ["sslmode=disable", "sslmode=no-verify", "ssl=false", "sslrootcert=/untrusted/file&uselibpqcompat=true"]) {
      const options = databaseConnectionOptions({ url: `${url}?${flags}`, production: true });
      const client = new Client(options);
      const actual = client.ssl as unknown as ConnectionOptions | boolean;
      assert.ok(actual && typeof actual === "object");
      assert.equal(actual.rejectUnauthorized, true);
      assert.equal(actual.ca, RAILWAY_POSTGRES_CA);
    }
  });

  it("checks the real certificate identity even when connected through a proxy", () => {
    const options = databaseConnectionOptions({ url: "postgresql://user:pass@example.proxy.rlwy.net:1234/railway" });
    assert.ok(options.ssl && options.ssl.checkServerIdentity);
    const right = { subject: { CN: "localhost" }, subjectaltname: "DNS:localhost" } as PeerCertificate;
    const wrong = { subject: { CN: "attacker.test" }, subjectaltname: "DNS:attacker.test" } as PeerCertificate;
    assert.equal(options.ssl.checkServerIdentity("example.proxy.rlwy.net", right), undefined);
    assert.ok(options.ssl.checkServerIdentity("example.proxy.rlwy.net", wrong) instanceof Error);
  });

  it("uses system CA and hostname verification for other remote databases", () => {
    const options = databaseConnectionOptions({ url: "postgresql://u:p@db.example.test/store" });
    assert.ok(options.ssl);
    assert.equal(options.ssl.rejectUnauthorized, true);
    assert.equal(options.ssl.ca, undefined);
    assert.equal(options.ssl.checkServerIdentity, undefined);
  });

  it("limits unencrypted connections to local development", () => {
    assert.equal(databaseConnectionOptions({ url: "postgresql://u:p@localhost/db" }).ssl, false);
    assert.ok(databaseConnectionOptions({ url: "postgresql://u:p@localhost/db", production: true }).ssl);
    assert.ok(databaseConnectionOptions({ url: "postgresql://u:p@db.example.test/db", production: false }).ssl);
  });

  it("supports CA overrides without allowing an unpinned hostname override", () => {
    assert.throws(() => databaseConnectionOptions({ url: "postgresql://u:p@db.example.test/db", serverName: "localhost" }), /dedicated/);
    assert.throws(() => databaseConnectionOptions({ url, ca: "-----BEGIN PRIVATE KEY-----" }), /public CA/);
    const options = databaseConnectionOptions({ url, ca: RAILWAY_POSTGRES_CA.replace(/\n/g, "\\n"), serverName: "localhost" });
    assert.ok(options.ssl && options.ssl.checkServerIdentity);
    assert.equal(options.ssl.ca, RAILWAY_POSTGRES_CA);
  });

  it("keeps migrations on the same verified policy and decodes credentials correctly", () => {
    const credentials = databaseMigrationCredentials({
      url: "postgresql://user:p%40ss%3Aword@postgres.railway.internal:5432/my%20db?sslmode=no-verify", production: true,
    });
    assert.equal(credentials.password, "p@ss:word");
    assert.equal(credentials.database, "my db");
    assert.ok(credentials.ssl);
    assert.equal(credentials.ssl.rejectUnauthorized, true);
    assert.equal(credentials.ssl.ca, RAILWAY_POSTGRES_CA);
  });
});
