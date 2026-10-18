import { X509Certificate } from "node:crypto";
import { checkServerIdentity, type ConnectionOptions } from "node:tls";
import { RAILWAY_POSTGRES_CA } from "./railway-ca";

type DatabaseConnectionInput = {
  url: string;
  production?: boolean;
  ca?: string;
  serverName?: string;
};

export function databaseConnectionOptions(input: DatabaseConnectionInput): {
  connectionString: string;
  ssl: ConnectionOptions | false;
} {
  const url = new URL(input.url);
  if (!/^postgres(?:ql)?:$/.test(url.protocol)) {
    throw new Error("DATABASE_URL must be a PostgreSQL URL.");
  }
  const local = ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname);
  const railway = url.hostname.endsWith(".railway.internal") || url.hostname.endsWith(".proxy.rlwy.net");
  const originalSslMode = url.searchParams.get("sslmode");

  // pg lets URL SSL settings replace the entire SSL object, including our CA.
  // Remove them before passing the URL to pg; the verified policy below wins.
  for (const key of ["ssl", "sslmode", "sslcert", "sslkey", "sslrootcert", "uselibpqcompat"]) {
    url.searchParams.delete(key);
  }

  let ssl: ConnectionOptions | false;
  if (local && !input.production && !input.ca && !originalSslMode && !input.serverName) {
    ssl = false;
  } else {
    const customCa = input.ca?.replace(/\\n/g, "\n").trim();
    if (customCa) {
      if (customCa.includes("PRIVATE KEY")) throw new Error("DATABASE_SSL_CA must contain a public CA certificate only.");
      const certificate = new X509Certificate(customCa);
      if (!certificate.ca) throw new Error("DATABASE_SSL_CA must be a CA certificate.");
    }
    const ca = customCa || (railway ? RAILWAY_POSTGRES_CA : undefined);
    const expectedName = input.serverName?.trim() || (railway && !customCa ? "localhost" : undefined);
    if (expectedName && !ca) {
      throw new Error("DATABASE_SSL_SERVERNAME requires a dedicated DATABASE_SSL_CA certificate.");
    }
    ssl = {
      rejectUnauthorized: true,
      minVersion: "TLSv1.2",
      ...(ca ? { ca } : {}),
      // Railway's certificate is issued for localhost, while its TCP proxy has
      // a different DNS name. Verify that issued name AND this project's CA.
      ...(expectedName ? { checkServerIdentity: (_hostname: string, certificate: Parameters<typeof checkServerIdentity>[1]) =>
        checkServerIdentity(expectedName, certificate) } : {}),
    };
  }
  return { connectionString: url.toString(), ssl };
}

/** Drizzle Kit uses separate fields to preserve the same verified SSL policy. */
export function databaseMigrationCredentials(input: DatabaseConnectionInput): {
  host: string;
  port: number;
  user: string;
  password: string;
  database: string;
  ssl: ConnectionOptions | false;
} {
  const connection = databaseConnectionOptions(input);
  const url = new URL(connection.connectionString);
  return {
    host: url.hostname.replace(/^\[|\]$/g, ""),
    port: Number(url.port || 5432),
    user: decodeURIComponent(url.username),
    password: decodeURIComponent(url.password),
    database: decodeURIComponent(url.pathname.slice(1)),
    ssl: connection.ssl,
  };
}
