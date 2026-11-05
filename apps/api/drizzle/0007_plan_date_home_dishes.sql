ALTER TYPE "public"."item_type" ADD VALUE 'dish';--> statement-breakpoint
ALTER TABLE "plans" ADD COLUMN "date" date;--> statement-breakpoint
UPDATE "plans" SET "date" = (("plans"."created_at" AT TIME ZONE "groups"."timezone")::date) FROM "groups" WHERE "groups"."id" = "plans"."group_id" AND "plans"."date" IS NULL;
