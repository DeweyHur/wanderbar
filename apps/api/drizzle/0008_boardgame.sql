ALTER TYPE "public"."item_type" ADD VALUE 'game';--> statement-breakpoint
ALTER TYPE "public"."link_kind" ADD VALUE 'tts';--> statement-breakpoint
CREATE TABLE "game_queue" (
	"group_id" text NOT NULL,
	"item_id" text NOT NULL,
	"user_id" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "game_queue_item_id_user_id_pk" PRIMARY KEY("item_id","user_id")
);
--> statement-breakpoint
CREATE TABLE "item_tags" (
	"item_id" text NOT NULL,
	"tag_id" text NOT NULL,
	CONSTRAINT "item_tags_item_id_tag_id_pk" PRIMARY KEY("item_id","tag_id")
);
--> statement-breakpoint
CREATE TABLE "meetup_nights" (
	"id" text PRIMARY KEY NOT NULL,
	"group_id" text NOT NULL,
	"series_id" text,
	"starts_at" timestamp with time zone NOT NULL,
	"location" text DEFAULT '' NOT NULL,
	"note" text DEFAULT '' NOT NULL,
	"picker_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "meetup_series" (
	"id" text PRIMARY KEY NOT NULL,
	"group_id" text NOT NULL,
	"title" text DEFAULT '' NOT NULL,
	"weekday" integer NOT NULL,
	"time" text NOT NULL,
	"every_weeks" integer DEFAULT 1 NOT NULL,
	"start_date" date NOT NULL,
	"location" text DEFAULT '' NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"created_by" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "night_games" (
	"night_id" text NOT NULL,
	"item_id" text NOT NULL,
	"order_index" integer DEFAULT 0 NOT NULL,
	"added_by" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "night_games_night_id_item_id_pk" PRIMARY KEY("night_id","item_id")
);
--> statement-breakpoint
CREATE TABLE "tags" (
	"id" text PRIMARY KEY NOT NULL,
	"group_id" text NOT NULL,
	"name" text NOT NULL,
	"key" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "game_queue" ADD CONSTRAINT "game_queue_group_id_groups_id_fk" FOREIGN KEY ("group_id") REFERENCES "public"."groups"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "game_queue" ADD CONSTRAINT "game_queue_item_id_items_id_fk" FOREIGN KEY ("item_id") REFERENCES "public"."items"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "game_queue" ADD CONSTRAINT "game_queue_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "item_tags" ADD CONSTRAINT "item_tags_item_id_items_id_fk" FOREIGN KEY ("item_id") REFERENCES "public"."items"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "item_tags" ADD CONSTRAINT "item_tags_tag_id_tags_id_fk" FOREIGN KEY ("tag_id") REFERENCES "public"."tags"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "meetup_nights" ADD CONSTRAINT "meetup_nights_group_id_groups_id_fk" FOREIGN KEY ("group_id") REFERENCES "public"."groups"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "meetup_nights" ADD CONSTRAINT "meetup_nights_series_id_meetup_series_id_fk" FOREIGN KEY ("series_id") REFERENCES "public"."meetup_series"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "meetup_nights" ADD CONSTRAINT "meetup_nights_picker_id_users_id_fk" FOREIGN KEY ("picker_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "meetup_series" ADD CONSTRAINT "meetup_series_group_id_groups_id_fk" FOREIGN KEY ("group_id") REFERENCES "public"."groups"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "meetup_series" ADD CONSTRAINT "meetup_series_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "night_games" ADD CONSTRAINT "night_games_night_id_meetup_nights_id_fk" FOREIGN KEY ("night_id") REFERENCES "public"."meetup_nights"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "night_games" ADD CONSTRAINT "night_games_item_id_items_id_fk" FOREIGN KEY ("item_id") REFERENCES "public"."items"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "night_games" ADD CONSTRAINT "night_games_added_by_users_id_fk" FOREIGN KEY ("added_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tags" ADD CONSTRAINT "tags_group_id_groups_id_fk" FOREIGN KEY ("group_id") REFERENCES "public"."groups"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "game_queue_group_idx" ON "game_queue" USING btree ("group_id");--> statement-breakpoint
CREATE INDEX "item_tags_tag_idx" ON "item_tags" USING btree ("tag_id");--> statement-breakpoint
CREATE INDEX "meetup_nights_group_idx" ON "meetup_nights" USING btree ("group_id","starts_at");--> statement-breakpoint
CREATE UNIQUE INDEX "meetup_nights_series_start_uq" ON "meetup_nights" USING btree ("series_id","starts_at");--> statement-breakpoint
CREATE INDEX "meetup_series_group_idx" ON "meetup_series" USING btree ("group_id");--> statement-breakpoint
CREATE INDEX "night_games_item_idx" ON "night_games" USING btree ("item_id");--> statement-breakpoint
CREATE UNIQUE INDEX "tags_group_key_uq" ON "tags" USING btree ("group_id","key");