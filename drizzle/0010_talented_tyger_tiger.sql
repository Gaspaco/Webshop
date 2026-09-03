CREATE TABLE "yugioh_cards" (
	"id" integer PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"card_type" text NOT NULL,
	"frame_type" text NOT NULL,
	"description" text NOT NULL,
	"race" text,
	"archetype" text,
	"attribute" text,
	"attack" integer,
	"defense" integer,
	"level" integer,
	"image_source_url" text,
	"cardmarket_price_cents" integer,
	"source_url" text,
	"synced_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "yugioh_printings" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"card_id" integer NOT NULL,
	"set_name" text NOT NULL,
	"set_code" text NOT NULL,
	"rarity" text NOT NULL,
	"rarity_code" text,
	"source_price_cents" integer,
	"synced_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "yugioh_printings" ADD CONSTRAINT "yugioh_printings_card_id_yugioh_cards_id_fk" FOREIGN KEY ("card_id") REFERENCES "public"."yugioh_cards"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "yugioh_card_name_idx" ON "yugioh_cards" USING btree ("name");--> statement-breakpoint
CREATE INDEX "yugioh_card_archetype_idx" ON "yugioh_cards" USING btree ("archetype");--> statement-breakpoint
CREATE UNIQUE INDEX "yugioh_printing_source_idx" ON "yugioh_printings" USING btree ("card_id","set_code","rarity");--> statement-breakpoint
CREATE INDEX "yugioh_printing_card_idx" ON "yugioh_printings" USING btree ("card_id");--> statement-breakpoint
CREATE INDEX "yugioh_printing_set_idx" ON "yugioh_printings" USING btree ("set_name");