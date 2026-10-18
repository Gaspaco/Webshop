import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { Database } from "bun:sqlite";
import { PgDialect } from "drizzle-orm/pg-core";
import { customerOrderAccess } from "./order-access";

describe("customer order privacy", () => {
  const database = new Database(":memory:");
  database.exec('CREATE TABLE orders (order_number TEXT, user_id TEXT, email TEXT)');
  database.query("INSERT INTO orders VALUES (?, ?, ?)").run("owned", "customer-1", "old@example.test");
  database.query("INSERT INTO orders VALUES (?, ?, ?)").run("guest", null, "customer@example.test");
  database.query("INSERT INTO orders VALUES (?, ?, ?)").run("other-account", "customer-2", "customer@example.test");

  function visible(emailVerified: boolean, email = "customer@example.test") {
    const query = new PgDialect().sqlToQuery(customerOrderAccess({ id: "customer-1", email, emailVerified }));
    return database.query(`SELECT order_number FROM orders WHERE ${query.sql.replace(/\$(\d+)/g, "?$1")} ORDER BY order_number`)
      .all(...query.params as string[]).map(row => (row as { order_number: string }).order_number);
  }

  it("never grants access to guest orders using an unverified signup email", () => {
    assert.deepEqual(visible(false), ["owned"]);
  });
  it("links guest orders only after email verification and never claims another account's orders", () => {
    assert.deepEqual(visible(true), ["guest", "owned"]);
  });
  it("normalizes verified email while retaining orders linked directly to the user", () => {
    assert.deepEqual(visible(true, "CUSTOMER@EXAMPLE.TEST"), ["guest", "owned"]);
  });
});
