ALTER TABLE "yugioh_printings" ADD COLUMN "image_source_url" text;--> statement-breakpoint
ALTER TABLE "yugioh_printings" ADD COLUMN "image_source_page_url" text;--> statement-breakpoint
ALTER TABLE "yugioh_printings" ADD COLUMN "image_storage_url" text;--> statement-breakpoint
ALTER TABLE "yugioh_printings" ADD COLUMN "image_file_name" text;--> statement-breakpoint
ALTER TABLE "yugioh_printings" ADD COLUMN "image_provider" text;--> statement-breakpoint
ALTER TABLE "yugioh_printings" ADD COLUMN "image_synced_at" timestamp with time zone;