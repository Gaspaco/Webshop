import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { Database } from "bun:sqlite";
import { drizzle } from "drizzle-orm/node-postgres";
import { rateLimitMutation } from "./rate-limit-query";

// Execute the generated upsert against an isolated SQL database. Only placeholder
// syntax and the unused generated UUID default differ from PostgreSQL.
function setup() {
  const database = new Database(":memory:");
  database.exec("CREATE TABLE rate_limit (id TEXT, key TEXT UNIQUE, count INTEGER NOT NULL, last_request INTEGER NOT NULL)");
  return (key: string, limit: number, windowMs: number, now: number) => {
    const query = rateLimitMutation(drizzle.mock(), key, limit, windowMs, now).toSQL();
    const statement = query.sql.replace(/\$(\d+)/g, "?$1").replace(/\bdefault\b/g, "null");
    return database.query(statement).all(...query.params as (string | number)[]).length > 0;
  };
}

describe("atomic rate limits", () => {
  it("allows exactly the configured number of simultaneous first requests", async () => {
    const consume = setup();
    const results = await Promise.all(Array.from({ length: 50 }, async () => consume("same-key", 5, 60_000, 1000)));
    assert.equal(results.filter(Boolean).length, 5);
  });
  it("does not clear a blocked counter until its complete window expires", () => {
    const consume = setup();
    assert.equal(consume("reset", 1, 900_000, 1000), true);
    assert.equal(consume("reset", 1, 900_000, 61_000), false);
    assert.equal(consume("reset", 1, 900_000, 900_999), false);
    assert.equal(consume("reset", 1, 900_000, 901_000), true);
  });
  it("keeps identities and namespaces independent and treats hostile keys as data", () => {
    const consume = setup();
    assert.equal(consume("auth:one", 1, 60_000, 1000), true);
    assert.equal(consume("auth:one", 1, 60_000, 1000), false);
    assert.equal(consume("contact:one", 1, 60_000, 1000), true);
    assert.equal(consume("'; DROP TABLE rate_limit; --", 1, 60_000, 1000), true);
    assert.equal(consume("auth:two", 1, 60_000, 1000), true);
  });
});
