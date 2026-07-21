import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { APIError } from "better-auth/api";
import { db } from "~/db";
import * as schema from "~/db/schema";
import {
  sendPasswordResetEmail,
  sendVerificationEmail,
} from "~/lib/email.server";
import { getAuthEnv, getEmailEnv } from "~/lib/env.server";

const authEnv = getAuthEnv();
const emailEnv = getEmailEnv();
const usesHttps = new URL(authEnv.BETTER_AUTH_URL).protocol === "https:";

export const auth = betterAuth({
  appName: "TCGHaven",
  baseURL: authEnv.BETTER_AUTH_URL,
  secret: authEnv.BETTER_AUTH_SECRET,
  database: drizzleAdapter(db, {
    provider: "pg",
    schema,
  }),
  databaseHooks: {
    user: {
      create: {
        before: async user => {
          const name = user.name.normalize("NFKC").trim();
          if (
            name.length < 1 ||
            name.length > 80 ||
            /[\u0000-\u001f\u007f]/.test(name)
          ) {
            throw new APIError("BAD_REQUEST", {
              message: "Enter a valid name of 80 characters or fewer.",
            });
          }

          return { data: { ...user, name } };
        },
      },
    },
  },
  trustedOrigins: [authEnv.BETTER_AUTH_URL],
  ...(emailEnv
    ? {
        emailVerification: {
          sendOnSignUp: true,
          sendOnSignIn: true,
          expiresIn: 60 * 60,
          autoSignInAfterVerification: false,
          sendVerificationEmail: async ({ user, url, token }) => {
            void sendVerificationEmail({
              email: user.email,
              url,
              token,
            }).catch(() => {
              console.error("Verification email delivery failed.");
            });
          },
        },
      }
    : {}),
  rateLimit: {
    enabled: true,
    window: 60,
    max: 60,
    storage: "database",
    customRules: {
      "/sign-in/email": { window: 60, max: 5 },
      "/sign-up/email": { window: 600, max: 5 },
      "/request-password-reset": { window: 900, max: 3 },
      "/reset-password": { window: 900, max: 5 },
      "/send-verification-email": { window: 600, max: 3 },
    },
  },
  emailAndPassword: {
    enabled: true,
    minPasswordLength: 12,
    maxPasswordLength: 128,
    requireEmailVerification: Boolean(emailEnv),
    revokeSessionsOnPasswordReset: true,
    ...(emailEnv
      ? {
          sendResetPassword: async ({ user, url, token }) => {
            void sendPasswordResetEmail({
              email: user.email,
              url,
              token,
            }).catch(() => {
              console.error("Password reset email delivery failed.");
            });
          },
        }
      : {}),
  },
  session: {
    expiresIn: 60 * 60 * 24 * 3,
    updateAge: 60 * 60 * 12,
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
    // Better Auth must emit UUIDs because the auth tables use PostgreSQL uuid columns.
    database: {
      generateId: "uuid",
    },
    ipAddress: {
      ipAddressHeaders: ["x-real-ip"],
    },
    useSecureCookies: usesHttps,
    disableCSRFCheck: false,
    disableOriginCheck: false,
    cookiePrefix: "tcghaven",
    defaultCookieAttributes: {
      httpOnly: true,
      sameSite: "lax",
      secure: usesHttps,
      path: "/",
    },
  },
});
