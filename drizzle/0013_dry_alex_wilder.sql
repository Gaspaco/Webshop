ALTER TABLE "product_variants" ADD COLUMN "cardmarket_product_id" integer;--> statement-breakpoint
ALTER TABLE "product_variants" ADD COLUMN "cardmarket_price_type" text DEFAULT 'normal' NOT NULL;--> statement-breakpoint
CREATE INDEX "product_variant_cardmarket_idx" ON "product_variants" USING btree ("cardmarket_product_id");