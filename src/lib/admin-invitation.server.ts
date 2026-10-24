import { randomBytes } from "node:crypto";
import { and, eq, like } from "drizzle-orm";
import { z } from "zod";
import { db } from "~/db";
import { auth } from "~/lib/auth";
import { user, session, verification } from "~/db/schema";
import { getAuthEnv, getEmailEnv } from "~/lib/env.server";

/** Run only from an explicitly authorized operator CLI, not a public endpoint. */
export async function inviteAdmin(rawEmail: string, name: string) {
  const email = z.email().max(254).parse(rawEmail.trim().toLowerCase());
  if (!getEmailEnv()) throw new Error("Email delivery must be configured before inviting an administrator.");
  const login = new URL("/admin/login", getAuthEnv().BETTER_AUTH_URL).toString();
  let [existing] = await db.select({ id: user.id, verified: user.emailVerified, role: user.role }).from(user).where(eq(user.email, email)).limit(1);
  let created = false;
  if (!existing) {
    // The random password is never displayed or delivered. The recipient sets
    // their own using the normal expiring, single-use reset flow.
    const result = await auth.api.signUpEmail({ body: { name: name.trim() || "Administrator", email, password: `${randomBytes(36).toString("base64url")}!Aa1`, callbackURL: login } });
    if (!result.user?.id) throw new Error("Account creation could not be confirmed.");
    existing = { id: result.user.id, verified: result.user.emailVerified, role: "customer" };
    created = true;
  } else if (!existing.verified) {
    await auth.api.sendVerificationEmail({ body: { email, callbackURL: login } });
  }
  // Do not bypass email verification or turn off an existing authenticator.
  await db.transaction(async tx => {
    await tx.update(user).set({ role: "admin" }).where(eq(user.id, existing!.id));
    if (existing!.role !== "admin") await tx.delete(session).where(eq(session.userId, existing!.id));
  });
  const prior = await db.select({ id: verification.id }).from(verification).where(and(eq(verification.value, existing.id), like(verification.identifier, "reset-password:%")));
  await auth.api.requestPasswordReset({ body: { email, redirectTo: new URL("/reset-password?next=%2Fadmin", getAuthEnv().BETTER_AUTH_URL).toString() } });
  const after = await db.select({ id: verification.id }).from(verification).where(and(eq(verification.value, existing.id), like(verification.identifier, "reset-password:%")));
  const passwordEmailAccepted = after.some(row => !prior.some(old => old.id === row.id));
  return { created, verificationRequired: !existing.verified, passwordEmailAccepted };
}
