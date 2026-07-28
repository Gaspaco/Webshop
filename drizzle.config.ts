import { config as loadEnv } from "dotenv";
import { defineConfig } from "drizzle-kit";

if (process.env.NODE_ENV !== "production") {
  loadEnv({ path: ".env.development.local" });
  loadEnv({ path: ".env.local" });
}

const databaseUrl =
  process.env.NODE_ENV !== "production"
    ? (process.env.DATABASE_PUBLIC_URL ?? process.env.DATABASE_URL)
    : process.env.DATABASE_URL;

export default defineConfig({
  dialect: "postgresql",
  schema: "./src/db/schema.ts",
  out: "./drizzle",
  dbCredentials: {
    url:
      databaseUrl ??
      "postgresql://postgres:postgres@localhost:5432/my_little_tcg_haven",
  },
  strict: true,
  verbose: true,
});
