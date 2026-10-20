CREATE TABLE "yugipedia_cache" (
  "key" text PRIMARY KEY NOT NULL,
  "payload" jsonb NOT NULL,
  "expires_at" timestamp with time zone NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX "yugipedia_cache_expiry_idx" ON "yugipedia_cache" ("expires_at");
