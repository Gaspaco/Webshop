import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { db } from "~/db";
import * as schema from "~/db/schema";
import { getAuthEnv } from "~/lib/env.server";

const authEnv = getAuthEnv();
const isProduction = process.env.NODE_ENV === "production";

export const auth = betterAuth({
  appName: "TCGHaven",
  baseURL: authEnv.BETTER_AUTH_URL,
  secret: authEnv.BETTER_AUTH_SECRET,
  database: drizzleAdapter(db, {
    provider: "pg",
    schema,
  }),
  trustedOrigins: [authEnv.BETTER_AUTH_URL],
  rateLimit: {
    enabled: true,
    window: 60,
    max: 60,
    storage: "memory",
  },
  emailAndPassword: {
    enabled: true,
  },
  user: {
    additionalFields: {
      role: {
        type: ["customer", "admin"],
        required: false,
        defaultValue: "customer",
        input: false,
      },
    },
  },
  advanced: {
    useSecureCookies: isProduction,
    disableCSRFCheck: false,
    disableOriginCheck: false,
    cookiePrefix: "tcghaven",
    defaultCookieAttributes: {
      httpOnly: true,
      sameSite: "lax",
      secure: isProduction,
      path: "/",
    },
  },
});
