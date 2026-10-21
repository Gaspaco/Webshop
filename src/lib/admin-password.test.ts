import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { PassThrough, Readable } from "node:stream";
import { parseAdminArguments, promptAdminPassword, readPasswordFromStdin } from "../../scripts/admin-password";

describe("administrator password input", () => {
  it("accepts only email, optional name and the stdin switch", () => {
    assert.deepEqual(parseAdminArguments(["Owner@example.test", "Owner"]), { email: "owner@example.test", name: "Owner", stdin: false });
    assert.equal(parseAdminArguments(["owner@example.test", "--password-stdin"]).stdin, true);
    assert.throws(() => parseAdminArguments(["owner@example.test", "password", "Owner"]), /Never pass a password/);
    assert.throws(() => parseAdminArguments(["owner@example.test", "--password=secret"]), /Usage/);
    assert.throws(() => parseAdminArguments(["owner@example.test", "--password-stdin", "--password-stdin"]), /Usage/);
  });
  it("reads bounded single-line stdin without trimming password characters", async () => {
    assert.equal(await readPasswordFromStdin(Readable.from([" test", "password! \r\n"])), " testpassword! ");
    await assert.rejects(readPasswordFromStdin(Readable.from(["one\ntwo\n"])), /exactly one/);
    await assert.rejects(readPasswordFromStdin(Readable.from(["a".repeat(1025)])), /too long/);
  });
  it("refuses noninteractive input unless stdin was explicitly selected", async () => {
    await assert.rejects(promptAdminPassword(Object.assign(new PassThrough(), { isTTY: false })), /interactive terminal/);
  });
  it("hides interactive input and requires matching confirmation", async () => {
    const input = Object.assign(new PassThrough(), { isTTY: true });
    const output = Object.assign(new PassThrough(), { isTTY: true });
    let visible = "";
    output.on("data", chunk => {
      visible += chunk.toString();
      if (chunk.toString().startsWith("New administrator")) setImmediate(() => input.write("Test-secret!\n"));
      if (chunk.toString().startsWith("Confirm password")) setImmediate(() => input.write("Test-secret!\n"));
    });
    assert.equal(await promptAdminPassword(input, output), "Test-secret!");
    assert.ok(!visible.includes("Test-secret!"));
  });
});
