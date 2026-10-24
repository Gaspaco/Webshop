ALTER TABLE "orders" ADD COLUMN "credit_request_id" uuid;--> statement-breakpoint
ALTER TABLE "orders" ADD COLUMN "credit_request_hash" text;--> statement-breakpoint
CREATE UNIQUE INDEX "order_credit_request_idx" ON "orders" USING btree ("credit_request_id");