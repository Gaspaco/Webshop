import { z } from "zod";

if (process.env.NODE_ENV !== "production") {
  for (const path of [".env.development.local", ".env.local"]) {
    try {
      process.loadEnvFile(path);
    } catch {
      // Local environment files are optional outside developer machines.
    }
  }

  // Railway's DATABASE_URL uses its private network and cannot be reached from
  // a developer machine. Prefer the public proxy URL when Railway provides it.
  if (process.env.DATABASE_PUBLIC_URL) {
    process.env.DATABASE_URL = process.env.DATABASE_PUBLIC_URL;
  }

  process.env.BETTER_AUTH_URL = "http://localhost:3000";
  process.env.PUBLIC_APP_URL = "http://localhost:3000";
}

const requiresHttps = (value: string) =>
  process.env.NODE_ENV !== "production" || new URL(value).protocol === "https:";

const databaseSchema = z.object({
  DATABASE_URL: z.string().url().startsWith("postgres").max(2048),
});

const authSchema = z.object({
  BETTER_AUTH_SECRET: z.string().min(48),
  BETTER_AUTH_URL: z.string().url().refine(requiresHttps, {
    message: "BETTER_AUTH_URL must use HTTPS in production.",
  }),
});

const googleAuthSchema = z
  .object({
    GOOGLE_CLIENT_ID: z.string().trim().min(10).max(512).optional(),
    GOOGLE_CLIENT_SECRET: z.string().trim().min(10).max(512).optional(),
  })
  .superRefine((value, context) => {
    if (
      Boolean(value.GOOGLE_CLIENT_ID) ===
      Boolean(value.GOOGLE_CLIENT_SECRET)
    ) {
      return;
    }

    context.addIssue({
      code: "custom",
      message:
        "GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET must either both be set or both be omitted.",
    });
  });

const emailSchema = z
  .object({
    SMTP_HOST: z.string().trim().min(3).max(253).optional(),
    SMTP_PORT: z.coerce.number().int().refine(port => port === 465 || port === 587, {
      message: "SMTP_PORT must be 465 or 587.",
    }).optional(),
    SMTP_USER: z.string().trim().min(1).max(320).optional(),
    SMTP_PASS: z.string().min(8).max(512).optional(),
    AUTH_EMAIL_FROM: z.string().trim().min(3).max(320).optional(),
  })
  .superRefine((value, context) => {
    const fields = [
      value.SMTP_HOST,
      value.SMTP_PORT,
      value.SMTP_USER,
      value.SMTP_PASS,
      value.AUTH_EMAIL_FROM,
    ];
    if (fields.every(Boolean) || fields.every(field => !field)) return;

    context.addIssue({
      code: "custom",
      message:
        "SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS, and AUTH_EMAIL_FROM must all be set or all be omitted.",
    });
  });

const mollieSchema = z.object({
  MOLLIE_API_KEY: z.string().min(1).max(256),
});

export const getDatabaseEnv = () =>
  databaseSchema.parse({
    DATABASE_URL:
      process.env.DATABASE_PUBLIC_URL ?? process.env.DATABASE_URL,
  });
export const getAuthEnv = () => authSchema.parse(process.env);
export const getGoogleAuthEnv = () => {
  const parsed = googleAuthSchema.parse(process.env);
  return parsed.GOOGLE_CLIENT_ID && parsed.GOOGLE_CLIENT_SECRET
    ? {
        GOOGLE_CLIENT_ID: parsed.GOOGLE_CLIENT_ID,
        GOOGLE_CLIENT_SECRET: parsed.GOOGLE_CLIENT_SECRET,
      }
    : null;
};
export const getEmailEnv = () => {
  const parsed = emailSchema.parse(process.env);
  return parsed.SMTP_HOST &&
    parsed.SMTP_PORT &&
    parsed.SMTP_USER &&
    parsed.SMTP_PASS &&
    parsed.AUTH_EMAIL_FROM
    ? {
        SMTP_HOST: parsed.SMTP_HOST,
        SMTP_PORT: parsed.SMTP_PORT,
        SMTP_USER: parsed.SMTP_USER,
        SMTP_PASS: parsed.SMTP_PASS,
        AUTH_EMAIL_FROM: parsed.AUTH_EMAIL_FROM,
      }
    : null;
};
export const getMollieEnv = () => mollieSchema.parse(process.env);
