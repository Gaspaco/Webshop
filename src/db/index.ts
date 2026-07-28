import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import { getDatabaseEnv } from "~/lib/env.server";
import * as schema from "./schema";

const { DATABASE_URL: connectionString } = getDatabaseEnv();

const client = new Pool({
  connectionString,
  max: process.env.VERCEL ? 2 : process.env.NODE_ENV === "production" ? 10 : 2,
  ssl:
    process.env.NODE_ENV === "production"
      ? { rejectUnauthorized: false }
      : undefined,
  connectionTimeoutMillis: 10_000,
  idleTimeoutMillis: 20_000,
  allowExitOnIdle: true,
});

export const db = drizzle(client, { schema });
