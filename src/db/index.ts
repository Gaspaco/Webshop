import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { getDatabaseEnv } from "~/lib/env.server";
import * as schema from "./schema";

const { DATABASE_URL: connectionString } = getDatabaseEnv();

const client = postgres(connectionString, {
  // Better Auth can issue nested session queries, so Vercel needs two pooled
  // connections to avoid deadlocking while still keeping serverless usage low.
  max: process.env.VERCEL ? 2 : process.env.NODE_ENV === "production" ? 10 : 1,
  prepare: false,
  ssl: process.env.NODE_ENV === "production" ? "require" : undefined,
  connect_timeout: 10,
  idle_timeout: 20,
});

export const db = drizzle(client, { schema });
