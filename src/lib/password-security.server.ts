import { createHash } from "node:crypto";
import { and, eq, gt, like, ne } from "drizzle-orm";
import { APIError } from "better-auth/api";
import { z } from "zod";
import { db } from "~/db";
import { account, user, verification, rateLimit } from "~/db/schema";
import { acquireOperationLease, releaseOperationLease } from "~/lib/operation-lease.server";
import { rateLimitMutation } from "~/lib/rate-limit-query";
import { logServerError } from "~/lib/server-log";

const emailSchema = z.string().trim().toLowerCase().email().max(254);
const digest = (value: string) => createHash("sha256").update(value).digest("hex");
export type PasswordOperation = { key: string; token: string };

export async function claimPasswordOperation(userId: string): Promise<PasswordOperation> {
  const key = `password-operation:${userId}`;
  const token = await acquireOperationLease(key, 90_000);
  if (!token) throw new APIError("CONFLICT", { message: "Another password request is being processed. Please try again shortly." }, { "Retry-After": "5" });
  return { key, token };
}

export async function limitAccountPasswordAttempts(email: unknown) {
  const parsed = emailSchema.safeParse(email);
  if (!parsed.success) return;
  const allowed = await rateLimitMutation(db, `password-login:${digest(parsed.data)}`, 10, 15 * 60_000, Date.now());
  if (!allowed.length) throw new APIError("TOO_MANY_REQUESTS", { message: "Too many sign-in attempts for this account. Please wait 15 minutes before trying again." }, { "Retry-After": "900" });
}

export async function clearAccountPasswordAttempts(email: string) {
  await db.delete(rateLimit).where(eq(rateLimit.key, `password-login:${digest(email.trim().toLowerCase())}`));
}

/** Coordinate issuance, reset and password changes across instances. Revoke
 * other links BEFORE changing the password, so a later DB/mail failure cannot
 * leave old recovery links valid after a successful password write. */
export async function beginPasswordOperation(input: {
  path: string | undefined;
  body?: Record<string, unknown>;
  query?: Record<string, unknown>;
  sessionUserId?: string;
  verifyPassword: (input: { hash: string; password: string }) => Promise<boolean>;
}): Promise<PasswordOperation | null> {
  const { path, body } = input;
  let userId: string | undefined;
  let resetIdentifier: string | undefined;
  if (path === "/request-password-reset") {
    const parsed = emailSchema.safeParse(body?.email);
    if (!parsed.success) return null;
    const [found] = await db.select({ id: user.id }).from(user).where(eq(user.email, parsed.data)).limit(1);
    userId = found?.id;
  } else if (path === "/reset-password") {
    const token = body?.token || input.query?.token;
    if (typeof token !== "string" || !token || token.length > 512) return null;
    resetIdentifier = `reset-password:${token}`;
    const [pending] = await db.select({ userId: verification.value }).from(verification)
      .where(and(eq(verification.identifier, resetIdentifier), gt(verification.expiresAt, new Date()))).limit(1);
    userId = pending?.userId;
  } else if (path === "/change-password") userId = input.sessionUserId;
  else return null;
  if (!userId) return null; // Let Better Auth return its usual generic error.

  const { key, token } = await claimPasswordOperation(userId);
  try {
    if (path === "/reset-password") {
      // The first lookup can race another completed reset. Recheck AFTER the
      // shared lock, before deleting anything or letting Better Auth consume it.
      const [pending] = await db.select({ id: verification.id }).from(verification).where(and(
        eq(verification.identifier, resetIdentifier!), eq(verification.value, userId), gt(verification.expiresAt, new Date()),
      )).limit(1);
      if (!pending) throw new APIError("BAD_REQUEST", { message: "This reset link is invalid or expired. Request a new one." });
    }
    if (path === "/change-password") {
      const [credential] = await db.select({ password: account.password }).from(account)
        .where(and(eq(account.userId, userId), eq(account.providerId, "credential"))).limit(1);
      if (typeof body?.currentPassword !== "string" || !credential?.password ||
          !await input.verifyPassword({ hash: credential.password, password: body.currentPassword })) {
        throw new APIError("BAD_REQUEST", { message: "The current password is incorrect." });
      }
    }
    if (path !== "/request-password-reset") {
      await db.delete(verification).where(and(
        eq(verification.value, userId), like(verification.identifier, "reset-password:%"),
        resetIdentifier ? ne(verification.identifier, resetIdentifier) : undefined,
      ));
    }
    return { key, token };
  } catch (error) {
    await releaseOperationLease(key, token).catch(() => {});
    throw error;
  }
}

export async function finishPasswordOperation(operation: PasswordOperation | undefined) {
  if (operation) await releaseOperationLease(operation.key, operation.token).catch(error => {
    // Old links were already revoked. A cleanup outage must not turn a
    // completed password change into an apparent failure; the lease expires.
    logServerError("Password operation cleanup deferred.", error);
  });
}

/** Callback-level protection also covers direct server-side auth.api calls.
 * Suppressed sends keep the library's generic success response. */
export async function allowPasswordResetEmail(email: string) {
  const now = Date.now();
  const recipient = digest(email.trim().toLowerCase());
  const day = new Date(now).toISOString().slice(0, 10);
  const rules: Array<[string, number, number]> = [
    [`reset-email:cooldown:${recipient}`, 1, 60_000],
    [`reset-email:recipient:${recipient}`, 3, 60 * 60_000],
    ["reset-email:global", 30, 60 * 60_000],
    [`reset-email:day:${day}`, 200, 86_400_000],
  ];
  for (const [key, limit, windowMs] of rules) {
    if (!(await rateLimitMutation(db, key, limit, windowMs, now)).length) return false;
  }
  return true;
}

export async function discardPasswordResetToken(token: string) {
  await db.delete(verification).where(eq(verification.identifier, `reset-password:${token}`));
}
