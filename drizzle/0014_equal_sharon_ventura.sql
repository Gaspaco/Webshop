CREATE TABLE "admin_session_approvals" (
	"session_id" uuid PRIMARY KEY NOT NULL,
	"verified_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "refund_requests" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"payment_id" uuid NOT NULL,
	"order_id" uuid NOT NULL,
	"mollie_refund_id" text,
	"status" text DEFAULT 'creating' NOT NULL,
	"amount_cents" integer NOT NULL,
	"reason" text NOT NULL,
	"requested_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "orders" ADD COLUMN "guest_access_hash" text;--> statement-breakpoint
ALTER TABLE "orders" ADD COLUMN "discount_released" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "orders" ADD COLUMN "label_state" text DEFAULT 'none' NOT NULL;--> statement-breakpoint
ALTER TABLE "return_requests" ADD COLUMN "mollie_refund_id" text;--> statement-breakpoint
ALTER TABLE "admin_session_approvals" ADD CONSTRAINT "admin_session_approvals_session_id_session_id_fk" FOREIGN KEY ("session_id") REFERENCES "public"."session"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "refund_requests" ADD CONSTRAINT "refund_requests_payment_id_payments_id_fk" FOREIGN KEY ("payment_id") REFERENCES "public"."payments"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "refund_requests" ADD CONSTRAINT "refund_requests_order_id_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "refund_requests" ADD CONSTRAINT "refund_requests_requested_by_user_id_fk" FOREIGN KEY ("requested_by") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "refund_mollie_id_idx" ON "refund_requests" USING btree ("mollie_refund_id");--> statement-breakpoint
CREATE INDEX "refund_payment_idx" ON "refund_requests" USING btree ("payment_id");--> statement-breakpoint
CREATE UNIQUE INDEX "return_request_mollie_refund_idx" ON "return_requests" USING btree ("mollie_refund_id");