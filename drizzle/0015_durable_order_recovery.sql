CREATE TABLE "order_email_jobs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"order_id" uuid NOT NULL,
	"audience" text NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"attempts" integer DEFAULT 0 NOT NULL,
	"next_attempt_at" timestamp with time zone DEFAULT now() NOT NULL,
	"lease_token" uuid,
	"lease_until" timestamp with time zone,
	"sent_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "provider_operation_leases" (
	"key" text PRIMARY KEY NOT NULL,
	"token" uuid NOT NULL,
	"lease_until" timestamp with time zone NOT NULL
);
--> statement-breakpoint
ALTER TABLE "orders" ADD COLUMN "payment_creation_state" text DEFAULT 'none' NOT NULL;--> statement-breakpoint
ALTER TABLE "orders" ADD COLUMN "payment_parameters_encrypted" text;--> statement-breakpoint
ALTER TABLE "orders" ADD COLUMN "payment_credential_hash" text;--> statement-breakpoint
ALTER TABLE "orders" ADD COLUMN "payment_creation_started_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "refund_requests" ADD COLUMN "credential_hash" text;--> statement-breakpoint
ALTER TABLE "order_email_jobs" ADD CONSTRAINT "order_email_jobs_order_id_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "order_email_audience_idx" ON "order_email_jobs" USING btree ("order_id","audience");--> statement-breakpoint
CREATE INDEX "order_email_due_idx" ON "order_email_jobs" USING btree ("status","next_attempt_at");