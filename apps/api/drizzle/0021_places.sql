CREATE TYPE "public"."place_type" AS ENUM('food', 'sight', 'venue', 'stay', 'other');--> statement-breakpoint
ALTER TYPE "public"."item_type" ADD VALUE 'event';--> statement-breakpoint
CREATE TABLE "event_details" (
	"item_id" text PRIMARY KEY NOT NULL,
	"on_date" date
);
--> statement-breakpoint
ALTER TABLE "restaurant_details" ADD COLUMN "place_type" "place_type";--> statement-breakpoint
ALTER TABLE "event_details" ADD CONSTRAINT "event_details_item_id_items_id_fk" FOREIGN KEY ("item_id") REFERENCES "public"."items"("id") ON DELETE cascade ON UPDATE no action;