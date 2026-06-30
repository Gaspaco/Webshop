import { z } from "zod";

const databaseSchema = z.object({
  DATABASE_URL: z.string().url().startsWith("postgres"),
});

const authSchema = z.object({
  BETTER_AUTH_SECRET: z.string().min(32),
  BETTER_AUTH_URL: z.string().url(),
});

const mollieSchema = z.object({
  MOLLIE_API_KEY: z.string().min(1),
});

export const getDatabaseEnv = () => databaseSchema.parse(process.env);
export const getAuthEnv = () => authSchema.parse(process.env);
export const getMollieEnv = () => mollieSchema.parse(process.env);
