CREATE TABLE "wallet_accounts" (
	"user_id" uuid PRIMARY KEY NOT NULL,
	"balance_cents" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "wallet_balance_valid" CHECK ("wallet_accounts"."balance_cents" >= 0 and "wallet_accounts"."balance_cents" <= 100000000)
);
--> statement-breakpoint
CREATE TABLE "wallet_entries" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid,
	"amount_cents" integer NOT NULL,
	"balance_cents" integer NOT NULL,
	"kind" text NOT NULL,
	"reason" text NOT NULL,
	"request_id" uuid NOT NULL,
	"order_id" uuid,
	"actor_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "wallet_entry_valid" CHECK ("wallet_entries"."kind" in ('adjustment','reservation','release','refund') and "wallet_entries"."amount_cents" <> 0 and "wallet_entries"."balance_cents" >= 0)
);
--> statement-breakpoint
ALTER TABLE "orders" ADD COLUMN "shipment" jsonb;--> statement-breakpoint
ALTER TABLE "orders" ADD COLUMN "credit_applied_cents" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "orders" ADD COLUMN "credit_state" text DEFAULT 'none' NOT NULL;--> statement-breakpoint
ALTER TABLE "wallet_accounts" ADD CONSTRAINT "wallet_accounts_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "wallet_entries" ADD CONSTRAINT "wallet_entries_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "wallet_entries" ADD CONSTRAINT "wallet_entries_order_id_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "wallet_entries" ADD CONSTRAINT "wallet_entries_actor_id_user_id_fk" FOREIGN KEY ("actor_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "wallet_request_idx" ON "wallet_entries" USING btree ("request_id");--> statement-breakpoint
CREATE UNIQUE INDEX "wallet_order_operation_idx" ON "wallet_entries" USING btree ("order_id","kind") WHERE "wallet_entries"."order_id" is not null;--> statement-breakpoint
CREATE INDEX "wallet_user_created_idx" ON "wallet_entries" USING btree ("user_id","created_at");--> statement-breakpoint
ALTER TABLE "orders" ADD CONSTRAINT "order_credit_valid" CHECK ("orders"."credit_applied_cents" >= 0 and "orders"."credit_applied_cents" <= "orders"."total_cents" and "orders"."credit_state" in ('none','reserved','spent','released','refunded'));
