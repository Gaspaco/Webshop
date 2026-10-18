import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { describeServerError } from "./server-log";

describe("server error redaction", () => {
  it("keeps useful error codes without logging SQL, parameters, tokens or stack traces", () => {
    const error = Object.assign(new Error("password=secret token=private"), {
      query: "INSERT INTO user (...) VALUES (...)" , params: ["customer@example.test", "private"],
      cause: { code: "23505", detail: "customer@example.test already exists" },
    });
    assert.deepEqual(describeServerError(error), { name: "Error", code: "23505" });
  });
  it("does not trust arbitrary error names, codes or strings", () => {
    assert.deepEqual(describeServerError({ name: "stolen-password", code: "live_secret" }), { name: "Error" });
    assert.deepEqual(describeServerError("secret"), { name: "Error" });
  });
});
