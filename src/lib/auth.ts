import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { APIError, createAuthMiddleware } from "better-auth/api";
import { twoFactor } from "better-auth/plugins";
import { eq } from "drizzle-orm";
import { db } from "~/db";
import * as schema from "~/db/schema";
import {
  sendNewSignInEmail,
  sendPasswordResetEmail,
  sendTwoFactorCodeEmail,
  sendVerificationEmail,
} from "~/lib/email.server";
import { getAuthEnv, getEmailEnv } from "~/lib/env.server";
import { createAuthSecurityHooks } from "~/lib/auth-security.server";
import { authRateLimitStorage } from "~/lib/rate-limit.server";
import { logServerError } from "~/lib/server-log";
import {
  allowPasswordResetEmail, beginPasswordOperation, clearAccountPasswordAttempts,
  discardPasswordResetToken, finishPasswordOperation, limitAccountPasswordAttempts,
  type PasswordOperation,
} from "~/lib/password-security.server";
import {
  meetsPasswordRequirements,
  PASSWORD_MAX_LENGTH,
  PASSWORD_MIN_LENGTH,
  PASSWORD_REQUIREMENTS_MESSAGE,
} from "~/lib/password";

const authEnv = getAuthEnv();
const emailEnv = getEmailEnv();
const authUrl = new URL(authEnv.BETTER_AUTH_URL);
const usesHttps = authUrl.protocol === "https:";
const trustedOrigins = new Set([authUrl.origin]);

// The storefront is reachable with and without www. Better Auth compares the
// Origin header exactly, so both owned production origins must be explicit.
if (process.env.NODE_ENV === "production") {
  trustedOrigins.add("https://tcghaven.com");
  trustedOrigins.add("https://www.tcghaven.com");
}

export const auth = betterAuth({
  appName: "TCGHaven",
  baseURL: authEnv.BETTER_AUTH_URL,
  secret: authEnv.BETTER_AUTH_SECRET,
  logger: {
    level: "error",
    log: (level, _message, ...details) => {
      if (level === "error") {
        logServerError("Authentication service error.", details.find(value => value instanceof Error));
      }
    },
  },
  database: drizzleAdapter(db, {
    provider: "pg",
    schema,
  }),
  databaseHooks: createAuthSecurityHooks(async userId => {
    const [profile] = await db
      .select({ suspended: schema.customerAdminProfiles.suspended })
      .from(schema.customerAdminProfiles)
      .where(eq(schema.customerAdminProfiles.userId, userId))
      .limit(1);
    return profile?.suspended === true;
  }),
  trustedOrigins: [...trustedOrigins],
  hooks: {
    before: createAuthMiddleware(async context => {
      if (context.path === "/sign-in/email") await limitAccountPasswordAttempts(context.body?.email);
      if (["/two-factor/disable", "/two-factor/enable", "/two-factor/get-totp-uri", "/two-factor/generate-backup-codes"].includes(context.path)) {
        const current = await auth.api.getSession({ headers: context.headers ?? new Headers() });
        if (current?.user.role === "admin" && context.path !== "/two-factor/disable") {
          throw new APIError("FORBIDDEN", { message: "Owner accounts use email and password sign-in. Authenticator setup is not enabled for owners." });
        }
      }
      const password =
        context.path === "/sign-up/email"
          ? context.body?.password
          : context.path === "/reset-password" ||
              context.path === "/change-password"
            ? context.body?.newPassword
            : undefined;

      if (
        ["/sign-up/email", "/reset-password", "/change-password"].includes(context.path) &&
        (typeof password !== "string" || !meetsPasswordRequirements(password))
      ) {
        throw new APIError("BAD_REQUEST", {
          message: PASSWORD_REQUIREMENTS_MESSAGE,
        });
      }
      const session = context.path === "/change-password"
        ? await auth.api.getSession({ headers: context.headers ?? new Headers() }) : null;
      try {
        const passwordOperation = await beginPasswordOperation({
          path: context.path, body: context.body, query: context.query,
          sessionUserId: session?.user.id, verifyPassword: context.context.password.verify,
        });
        if (passwordOperation) return { context: { passwordOperation } };
      } catch (error) {
        if (context.path === "/request-password-reset" && error instanceof APIError && error.statusCode === 409) {
          // A concurrent request must not reveal whether this email exists.
          return context.json({ status: true, message: "If this email exists in our system, check your email for the reset link" });
        }
        throw error;
      }
    }),
    after: createAuthMiddleware(async context => {
      const operation = (context as typeof context & { passwordOperation?: PasswordOperation }).passwordOperation;
      try {
        const newSession = context.context.newSession;
        if (context.path === "/sign-in/email" && newSession) {
          await clearAccountPasswordAttempts(newSession.user.email).catch(error => logServerError("Sign-in counter cleanup deferred.", error));
        }
        if (!emailEnv) return;

        const completedSignIn =
          context.path === "/sign-in/email" ||
          context.path === "/two-factor/verify-totp" ||
          context.path === "/two-factor/verify-backup-code" ||
          context.path === "/two-factor/verify-otp" ||
          context.path.startsWith("/callback/");
        if (!completedSignIn || !newSession) return;

        try {
          await sendNewSignInEmail({
            email: newSession.user.email,
            name: newSession.user.name,
            signedInAt: newSession.session.createdAt,
            ipAddress: newSession.session.ipAddress,
            userAgent: newSession.session.userAgent,
            recoveryUrl: new URL("/login?recovery=1", authUrl).toString(),
            sessionId: newSession.session.id,
          });
        } catch {
          // A mail outage must never prevent a legitimate, completed sign-in.
          console.error("New sign-in notification delivery failed.");
        }
      } finally { await finishPasswordOperation(operation); }
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
            try {
              await sendVerificationEmail({
                email: user.email,
                url,
                token,
              });
            } catch {
              console.error("Verification email delivery failed.");
              throw new APIError("INTERNAL_SERVER_ERROR", {
                message: "Verification email could not be sent.",
              });
            }
          },
        },
      }
    : {}),
  rateLimit: {
    enabled: true,
    window: 60,
    max: 60,
    storage: "database",
    customStorage: authRateLimitStorage,
    customRules: {
      "/sign-in/email": { window: 60, max: 5 },
      "/sign-in/social": { window: 60, max: 10 },
      "/sign-up/email": { window: 600, max: 5 },
      "/request-password-reset": { window: 900, max: 3 },
      "/reset-password": { window: 900, max: 5 },
      "/change-password": { window: 600, max: 5 },
      "/send-verification-email": { window: 600, max: 3 },
      "/change-email": { window: 600, max: 3 },
      "/two-factor/enable": { window: 600, max: 5 },
      "/two-factor/send-otp": { window: 300, max: 5 },
      "/two-factor/verify-otp": { window: 300, max: 10 },
      "/two-factor/verify-totp": { window: 300, max: 10 },
      "/two-factor/verify-backup-code": { window: 300, max: 10 },
    },
  },
  emailAndPassword: {
    enabled: true,
    minPasswordLength: PASSWORD_MIN_LENGTH,
    maxPasswordLength: PASSWORD_MAX_LENGTH,
    requireEmailVerification: process.env.NODE_ENV === "production" || Boolean(emailEnv),
    revokeSessionsOnPasswordReset: true,
    ...(emailEnv
      ? {
          sendResetPassword: async ({ user, url, token }) => {
            try {
              if (!await allowPasswordResetEmail(user.email)) {
                await discardPasswordResetToken(token);
                return;
              }
              await sendPasswordResetEmail({
                email: user.email,
                url,
                token,
              });
            } catch (error) {
              await discardPasswordResetToken(token);
              logServerError("Password reset email delivery failed.", error);
              // Preserve the same generic response for unknown recipients,
              // suppressed sends, concurrent requests and SMTP outages.
            }
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
      ...(emailEnv
        ? {
            otpOptions: {
              digits: 6,
              period: 5,
              allowedAttempts: 5,
              storeOTP: "hashed" as const,
              sendOTP: async ({ user, otp }) => {
                await sendTwoFactorCodeEmail({
                  email: user.email,
                  name: user.name,
                  otp,
                });
              },
            },
          }
        : {}),
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
