CREATE TYPE "public"."tracking_email_status" AS ENUM('not_sent', 'sent', 'failed');--> statement-breakpoint
ALTER TABLE "orders" ADD COLUMN "tracking_email_status" "tracking_email_status" DEFAULT 'not_sent' NOT NULL;--> statement-breakpoint
ALTER TABLE "orders" ADD COLUMN "tracking_email_sent_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "orders" ADD COLUMN "tracking_email_last_attempt_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "orders" ADD COLUMN "tracking_email_attempts" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "orders" ADD COLUMN "tracking_email_error" text;