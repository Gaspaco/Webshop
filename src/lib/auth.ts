import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { APIError, createAuthMiddleware } from "better-auth/api";
import { twoFactor } from "better-auth/plugins";
import { db } from "~/db";
import * as schema from "~/db/schema";
import {
  sendPasswordResetEmail,
  sendVerificationEmail,
} from "~/lib/email.server";
import {
  getAuthEnv,
  getEmailEnv,
  getGoogleAuthEnv,
} from "~/lib/env.server";
import {
  meetsPasswordRequirements,
  PASSWORD_MAX_LENGTH,
  PASSWORD_MIN_LENGTH,
  PASSWORD_REQUIREMENTS_MESSAGE,
} from "~/lib/password";
import {
  isValidStoredProfileImage,
  PROFILE_IMAGE_ERROR_MESSAGE,
} from "~/lib/profile-image";

const authEnv = getAuthEnv();
const emailEnv = getEmailEnv();
const googleAuthEnv = getGoogleAuthEnv();
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
      update: {
        before: async user => {
          const data = { ...user };

          if (typeof data.name === "string") {
            const name = data.name.normalize("NFKC").trim();
            if (
              name.length < 1 ||
              name.length > 80 ||
              /[\u0000-\u001f\u007f]/.test(name)
            ) {
              throw new APIError("BAD_REQUEST", {
                message: "Enter a valid name of 80 characters or fewer.",
              });
            }
            data.name = name;
          }

          if (
            Object.prototype.hasOwnProperty.call(data, "image") &&
            !isValidStoredProfileImage(data.image)
          ) {
            throw new APIError("BAD_REQUEST", {
              message: PROFILE_IMAGE_ERROR_MESSAGE,
            });
          }

          return { data };
        },
      },
    },
  },
  trustedOrigins: [authEnv.BETTER_AUTH_URL],
  ...(googleAuthEnv
    ? {
        socialProviders: {
          google: {
            clientId: googleAuthEnv.GOOGLE_CLIENT_ID,
            clientSecret: googleAuthEnv.GOOGLE_CLIENT_SECRET,
            accessType: "online" as const,
            prompt: "select_account" as const,
          },
        },
      }
    : {}),
  hooks: {
    before: createAuthMiddleware(async context => {
      const password =
        context.path === "/sign-up/email"
          ? context.body.password
          : context.path === "/reset-password" ||
              context.path === "/change-password"
            ? context.body.newPassword
            : undefined;

      if (
        typeof password === "string" &&
        !meetsPasswordRequirements(password)
      ) {
        throw new APIError("BAD_REQUEST", {
          message: PASSWORD_REQUIREMENTS_MESSAGE,
        });
      }
    }),
  },
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
      "/sign-in/social": { window: 60, max: 10 },
      "/sign-up/email": { window: 600, max: 5 },
      "/request-password-reset": { window: 900, max: 3 },
      "/reset-password": { window: 900, max: 5 },
      "/send-verification-email": { window: 600, max: 3 },
      "/change-email": { window: 600, max: 3 },
      "/two-factor/enable": { window: 600, max: 5 },
      "/two-factor/verify-totp": { window: 300, max: 10 },
      "/two-factor/verify-backup-code": { window: 300, max: 10 },
    },
  },
  emailAndPassword: {
    enabled: true,
    minPasswordLength: PASSWORD_MIN_LENGTH,
    maxPasswordLength: PASSWORD_MAX_LENGTH,
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
    changeEmail: {
      enabled: Boolean(emailEnv),
      updateEmailWithoutVerification: false,
    },
    additionalFields: {
      role: {
        type: ["customer", "admin"],
        required: false,
        defaultValue: "customer",
        input: false,
      },
    },
  },
  plugins: [
    twoFactor({
      issuer: "TCGHaven",
      twoFactorCookieMaxAge: 60 * 10,
      trustDeviceMaxAge: 60 * 60 * 24 * 30,
      backupCodeOptions: {
        storeBackupCodes: "encrypted",
      },
      accountLockout: {
        enabled: true,
        maxFailedAttempts: 8,
        durationSeconds: 60 * 15,
      },
    }),
  ],
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
