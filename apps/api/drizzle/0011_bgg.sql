CREATE TABLE "bgg_cache" (
	"key" text PRIMARY KEY NOT NULL,
	"body" jsonb NOT NULL,
	"fetched_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "game_details" (
	"item_id" text PRIMARY KEY NOT NULL,
	"bgg_id" integer NOT NULL,
	"year" integer,
	"image_url" text,
	"thumbnail_url" text,
	"min_players" integer,
	"max_players" integer,
	"playing_time" integer,
	"weight" double precision,
	"fetched_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "game_details" ADD CONSTRAINT "game_details_item_id_items_id_fk" FOREIGN KEY ("item_id") REFERENCES "public"."items"("id") ON DELETE cascade ON UPDATE no action;