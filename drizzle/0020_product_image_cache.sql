CREATE TABLE "product_image_cache" (
  "key" text PRIMARY KEY NOT NULL,
  "data" text NOT NULL,
  "etag" text NOT NULL,
  "bytes" integer NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "product_image_cache_size" CHECK ("bytes" = octet_length("data") AND "bytes" > 0 AND "bytes" <= 1400000)
);
--> statement-breakpoint
CREATE TABLE "product_image_cache_usage" (
  "key" text PRIMARY KEY NOT NULL,
  "bytes" bigint DEFAULT 0 NOT NULL,
  CONSTRAINT "product_image_cache_usage_nonnegative" CHECK ("bytes" >= 0)
);
