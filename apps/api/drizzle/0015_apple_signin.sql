ALTER TABLE "users" ALTER COLUMN "google_sub" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "apple_sub" text;--> statement-breakpoint
ALTER TABLE "users" ADD CONSTRAINT "users_apple_sub_unique" UNIQUE("apple_sub");