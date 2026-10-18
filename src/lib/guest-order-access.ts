import { createHash, randomBytes, timingSafeEqual } from "node:crypto";

export const makeGuestOrderToken = () => randomBytes(32).toString("base64url");
export const hashGuestOrderToken = (token: string) => createHash("sha256").update(token).digest("hex");
export function verifyGuestOrderToken(token: string | null, hash: string | null) {
  if (!token || !/^[A-Za-z0-9_-]{43}$/.test(token) || !hash || !/^[a-f0-9]{64}$/.test(hash)) return false;
  return timingSafeEqual(Buffer.from(hashGuestOrderToken(token), "hex"), Buffer.from(hash, "hex"));
}
