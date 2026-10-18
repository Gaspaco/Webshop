import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";
import { getMollieEnv } from "~/lib/env.server";

export const IDEMPOTENT_RETRY_MS = 45 * 60_000; // Mollie retains keys for one hour.
export const mollieCredentialHash = () => createHash("sha256").update(getMollieEnv().MOLLIE_API_KEY).digest("hex");

// Redirect URLs contain guest access tokens. Keep the durable retry payload
// encrypted instead of introducing a plaintext copy into the order record.
function encryptionKey() {
  const secret = process.env.ORDER_RECOVERY_ENCRYPTION_KEY;
  if (!secret || secret.length < 48) throw new Error("Configure a dedicated order recovery encryption key of at least 48 characters.");
  // Independent of BETTER_AUTH_SECRET: rotating an exposed login secret must
  // not make outstanding payment recovery records unreadable.
  return createHash("sha256").update(`tcghaven:payment-recovery:v1:${secret}`).digest();
}
export function sealPaymentParameters(value: unknown) {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", encryptionKey(), iv);
  const ciphertext = Buffer.concat([cipher.update(JSON.stringify(value), "utf8"), cipher.final()]);
  return Buffer.concat([iv, cipher.getAuthTag(), ciphertext]).toString("base64url");
}
export function openPaymentParameters<T>(value: string): T {
  const bytes = Buffer.from(value, "base64url");
  const decipher = createDecipheriv("aes-256-gcm", encryptionKey(), bytes.subarray(0, 12));
  decipher.setAuthTag(bytes.subarray(12, 28));
  return JSON.parse(Buffer.concat([decipher.update(bytes.subarray(28)), decipher.final()]).toString("utf8")) as T;
}

export function canReplayProviderRequest(startedAt: Date, credentialHash: string | null, now = Date.now()) {
  const age = now - startedAt.getTime();
  return age >= 0 && age < IDEMPOTENT_RETRY_MS && credentialHash === mollieCredentialHash();
}

export function providerDefinitivelyRejected(error: unknown) {
  return [400, 401, 403, 404, 422].includes(Number((error as { statusCode?: number } | null)?.statusCode));
}
