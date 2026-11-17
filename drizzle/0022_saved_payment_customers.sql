CREATE TABLE "payment_customers" (
  "user_id" uuid NOT NULL,
  "profile_id" text NOT NULL,
  "mode" text NOT NULL,
  "customer_id" text,
  "creation_key" uuid DEFAULT gen_random_uuid() NOT NULL,
  "consent_version" text NOT NULL,
  "consented_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "payment_customers_user_id_profile_id_mode_pk" PRIMARY KEY ("user_id", "profile_id", "mode"),
  CONSTRAINT "payment_customers_mode_check" CHECK ("mode" IN ('test', 'live'))
);
--> statement-breakpoint
ALTER TABLE "payment_customers" ADD CONSTRAINT "payment_customers_user_id_user_id_fk"
  FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE RESTRICT ON UPDATE NO ACTION;
--> statement-breakpoint
CREATE UNIQUE INDEX "payment_customers_provider_idx" ON "payment_customers" ("profile_id", "mode", "customer_id");
--> statement-breakpoint
-- Historical owner-password migration retained verified factors while clearing
-- the user flag. Permit inactive accounts to enroll again without touching
-- any account whose two-factor protection is active.
UPDATE "two_factor" SET "verified" = false WHERE "user_id" IN (
  SELECT "id" FROM "user" WHERE "two_factor_enabled" = false
);
