ALTER TABLE "product_variants" ADD COLUMN "is_default" boolean DEFAULT false NOT NULL;
--> statement-breakpoint
WITH "ranked_variants" AS (
	SELECT
		"id",
		ROW_NUMBER() OVER (
			PARTITION BY "product_id"
			ORDER BY "created_at" ASC, "id" ASC
		) AS "position"
	FROM "product_variants"
)
UPDATE "product_variants"
SET "is_default" = true
FROM "ranked_variants"
WHERE "product_variants"."id" = "ranked_variants"."id"
	AND "ranked_variants"."position" = 1;
