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

const emailSchema = z
  .object({
    RESEND_API_KEY: z.string().trim().startsWith("re_").max(256).optional(),
    AUTH_EMAIL_FROM: z.string().trim().min(3).max(320).optional(),
  })
  .superRefine((value, context) => {
    if (Boolean(value.RESEND_API_KEY) === Boolean(value.AUTH_EMAIL_FROM)) return;

    context.addIssue({
      code: "custom",
      message:
        "RESEND_API_KEY and AUTH_EMAIL_FROM must either both be set or both be omitted.",
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
export const getEmailEnv = () => {
  const parsed = emailSchema.parse(process.env);
  return parsed.RESEND_API_KEY && parsed.AUTH_EMAIL_FROM
    ? {
        RESEND_API_KEY: parsed.RESEND_API_KEY,
        AUTH_EMAIL_FROM: parsed.AUTH_EMAIL_FROM,
      }
    : null;
};
export const getMollieEnv = () => mollieSchema.parse(process.env);
