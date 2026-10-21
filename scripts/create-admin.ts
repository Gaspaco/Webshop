import { hashPassword } from "better-auth/crypto";
import { and, eq, like } from "drizzle-orm";
import { account, session, user, verification } from "../src/db/schema";
import { meetsPasswordRequirements } from "../src/lib/password";
import { parseAdminArguments, promptAdminPassword, readPasswordFromStdin } from "./admin-password";

const { email, name, stdin } = parseAdminArguments(process.argv.slice(2));
const password = stdin ? await readPasswordFromStdin(process.stdin) : await promptAdminPassword();

if (!password || !meetsPasswordRequirements(password)) {
  throw new Error(
    "The password must contain at least 8 characters and one special character.",
  );
}

// Do not initialize the database or authentication service until input has
// been collected and validated. Tests can exercise input without live access.
const { db } = await import("../src/db");

const [existing] = await db
  .select({ id: user.id, role: user.role })
  .from(user)
  .where(eq(user.email, email))
  .limit(1);

if (existing) {
  const passwordHash = await hashPassword(password);
  const { claimPasswordOperation, finishPasswordOperation } = await import("../src/lib/password-security.server");
  const operation = await claimPasswordOperation(existing.id);

  try {
    await db.transaction(async tx => {
      await tx.delete(verification).where(and(eq(verification.value, existing.id), like(verification.identifier, "reset-password:%")));
      const [credentialAccount] = await tx
        .select({ id: account.id })
        .from(account)
        .where(
          and(
            eq(account.userId, existing.id),
            eq(account.providerId, "credential"),
          ),
        )
        .limit(1);

      if (credentialAccount) {
        await tx
          .update(account)
          .set({ password: passwordHash })
          .where(eq(account.id, credentialAccount.id));
      } else {
        await tx.insert(account).values({
          userId: existing.id,
          accountId: existing.id,
          providerId: "credential",
          password: passwordHash,
        });
      }

      await tx
        .update(user)
        .set({ role: "admin", emailVerified: true, twoFactorEnabled: false })
        .where(eq(user.id, existing.id));
      await tx.delete(session).where(eq(session.userId, existing.id));
    });
  } finally { await finishPasswordOperation(operation); }

  console.log(`Administrator access enabled for ${email}.`);
  process.exit(0);
}

const { auth } = await import("../src/lib/auth");
const result = await auth.api.signUpEmail({
  body: {
    name,
    email,
    password,
  },
});

if (!result.user?.id) {
  throw new Error("Better Auth did not create the administrator account.");
}

await db
  .update(user)
  .set({ role: "admin", emailVerified: true, twoFactorEnabled: false })
  .where(eq(user.id, result.user.id));

console.log(`Administrator account created for ${email}.`);
process.exit(0);
