import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import { getDatabaseEnv } from "~/lib/env.server";
import * as schema from "./schema";
import { databaseConnectionOptions } from "./connection";

const { DATABASE_URL: connectionString } = getDatabaseEnv();

const client = new Pool({
  ...databaseConnectionOptions({
    url: connectionString,
    production: process.env.NODE_ENV === "production",
    ca: process.env.DATABASE_SSL_CA,
    serverName: process.env.DATABASE_SSL_SERVERNAME,
  }),
  max: process.env.VERCEL ? 2 : process.env.NODE_ENV === "production" ? 10 : 2,
  connectionTimeoutMillis: 10_000,
  idleTimeoutMillis: 20_000,
  allowExitOnIdle: true,
});

export const db = drizzle(client, { schema });
