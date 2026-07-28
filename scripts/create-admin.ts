import { eq } from "drizzle-orm";
import { db } from "../src/db";
import { user } from "../src/db/schema";
import { auth } from "../src/lib/auth";
import { meetsPasswordRequirements } from "../src/lib/password";

const [emailArgument, passwordArgument, nameArgument] = process.argv.slice(2);
const email = emailArgument?.trim().toLowerCase();
const password = passwordArgument;
const name = nameArgument?.trim() || "TCGHaven Owner";

if (!email || !email.includes("@")) {
  throw new Error("Usage: bun run admin:create <email> <password> [name]");
}

if (!password || !meetsPasswordRequirements(password)) {
  throw new Error(
    "The password must contain at least 8 characters and one special character.",
  );
}

const [existing] = await db
  .select({ id: user.id, role: user.role })
  .from(user)
  .where(eq(user.email, email))
  .limit(1);

if (existing) {
  await db
    .update(user)
    .set({ role: "admin", emailVerified: true })
    .where(eq(user.id, existing.id));
  console.log(`Administrator access enabled for ${email}.`);
  process.exit(0);
}

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
  .set({ role: "admin", emailVerified: true })
  .where(eq(user.id, result.user.id));

console.log(`Administrator account created for ${email}.`);
process.exit(0);
