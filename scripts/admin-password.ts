import { createInterface } from "node:readline";
import { Writable, type Readable } from "node:stream";

const MAX_PASSWORD_INPUT_BYTES = 1024;

export function parseAdminArguments(args: string[]) {
  const stdin = args.includes("--password-stdin");
  const positional = args.filter(value => value !== "--password-stdin");
  if (positional.length < 1 || positional.length > 2 ||
      positional.some(value => value.startsWith("--")) ||
      args.filter(value => value === "--password-stdin").length > 1) {
    throw new Error("Usage: bun run admin:create <email> [name] [--password-stdin]. Never pass a password as an argument.");
  }
  const email = positional[0]!.trim().toLowerCase();
  if (!email.includes("@")) throw new Error("Provide a valid administrator email address.");
  return { email, name: positional[1]?.trim() || "TCGHaven Owner", stdin };
}

export async function readPasswordFromStdin(input: Readable) {
  const parts: Buffer[] = [];
  let size = 0;
  for await (const chunk of input) {
    const part = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    size += part.byteLength;
    if (size > MAX_PASSWORD_INPUT_BYTES) throw new Error("Password input is too long.");
    parts.push(part);
  }
  const password = Buffer.concat(parts).toString("utf8").replace(/\r?\n$/, "");
  if (/[\r\n\0]/.test(password)) throw new Error("Provide exactly one password line on stdin.");
  return password;
}

export async function promptAdminPassword(
  input: Readable & { isTTY?: boolean } = process.stdin,
  output: Writable & { isTTY?: boolean } = process.stderr,
) {
  if (!input.isTTY || !output.isTTY) {
    throw new Error("Use an interactive terminal, or supply the password through stdin with --password-stdin.");
  }
  // Readline handles editing and UTF-8, but all terminal echo is discarded.
  // The password is never rendered, even as stars, or retained in history.
  const muted = new Writable({ write(_chunk, _encoding, callback) { callback(); } });
  const terminal = createInterface({ input, output: muted, terminal: true, historySize: 0 });
  const question = (label: string) => new Promise<string>((resolve, reject) => {
    output.write(label);
    const closed = () => reject(new Error("Password entry cancelled."));
    terminal.once("close", closed);
    terminal.question("", answer => {
      terminal.removeListener("close", closed);
      output.write("\n");
      resolve(answer);
    });
  });
  terminal.on("SIGINT", () => terminal.close());
  try {
    const password = await question("New administrator password (hidden): ");
    const confirmation = await question("Confirm password (hidden): ");
    if (password !== confirmation) throw new Error("Passwords do not match.");
    return password;
  } finally {
    terminal.close();
    muted.end();
    output.write("\n");
  }
}
