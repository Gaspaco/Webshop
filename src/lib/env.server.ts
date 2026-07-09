import { z } from "zod";

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

const mollieSchema = z.object({
  MOLLIE_API_KEY: z.string().min(1).max(256),
});

export const getDatabaseEnv = () => databaseSchema.parse(process.env);
export const getAuthEnv = () => authSchema.parse(process.env);
export const getMollieEnv = () => mollieSchema.parse(process.env);
