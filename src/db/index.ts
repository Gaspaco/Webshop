import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./schema";

const connectionString =
  process.env.DATABASE_URL ??
  "postgresql://postgres:postgres@localhost:5432/my_little_tcg_haven";

const client = postgres(connectionString, {
  max: process.env.NODE_ENV === "production" ? 10 : 1,
  prepare: false,
});

export const db = drizzle(client, { schema });
