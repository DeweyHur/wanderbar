CREATE TYPE "public"."group_module" AS ENUM('food', 'boardgame');--> statement-breakpoint
ALTER TYPE "public"."member_role" ADD VALUE 'host' BEFORE 'member';--> statement-breakpoint
ALTER TABLE "groups" ADD COLUMN "module" "group_module" DEFAULT 'food' NOT NULL;--> statement-breakpoint
ALTER TABLE "groups" ADD COLUMN "default_locale" text DEFAULT 'en' NOT NULL;--> statement-breakpoint
ALTER TABLE "groups" ADD COLUMN "timezone" text DEFAULT 'UTC' NOT NULL;--> statement-breakpoint
ALTER TABLE "groups" ADD COLUMN "currency" text DEFAULT 'USD' NOT NULL;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "locale" text;