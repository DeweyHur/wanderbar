CREATE TYPE "public"."item_type" AS ENUM('restaurant', 'menu');--> statement-breakpoint
CREATE TYPE "public"."link_kind" AS ENUM('yelp', 'gmaps', 'bgg', 'bga', 'rulebook', 'video', 'other');--> statement-breakpoint
CREATE TABLE "external_links" (
	"id" text PRIMARY KEY NOT NULL,
	"item_id" text NOT NULL,
	"kind" "link_kind" NOT NULL,
	"url" text NOT NULL,
	"label" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "items" (
	"id" text PRIMARY KEY NOT NULL,
	"group_id" text NOT NULL,
	"module" "group_module" NOT NULL,
	"type" "item_type" NOT NULL,
	"parent_id" text,
	"name" text NOT NULL,
	"category" text,
	"memo" text DEFAULT '' NOT NULL,
	"extra" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_by" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "menu_details" (
	"item_id" text PRIMARY KEY NOT NULL,
	"price_minor" integer,
	"currency" text DEFAULT 'USD' NOT NULL
);
--> statement-breakpoint
CREATE TABLE "restaurant_details" (
	"item_id" text PRIMARY KEY NOT NULL,
	"group_id" text NOT NULL,
	"yelp_alias" text,
	"google_place_key" text,
	"address" text DEFAULT '' NOT NULL,
	"lat" double precision,
	"lng" double precision,
	"hours_raw" text DEFAULT '' NOT NULL,
	"hours_fetched_at" timestamp with time zone
);
--> statement-breakpoint
ALTER TABLE "external_links" ADD CONSTRAINT "external_links_item_id_items_id_fk" FOREIGN KEY ("item_id") REFERENCES "public"."items"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "items" ADD CONSTRAINT "items_group_id_groups_id_fk" FOREIGN KEY ("group_id") REFERENCES "public"."groups"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "items" ADD CONSTRAINT "items_parent_id_items_id_fk" FOREIGN KEY ("parent_id") REFERENCES "public"."items"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "items" ADD CONSTRAINT "items_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "menu_details" ADD CONSTRAINT "menu_details_item_id_items_id_fk" FOREIGN KEY ("item_id") REFERENCES "public"."items"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "restaurant_details" ADD CONSTRAINT "restaurant_details_item_id_items_id_fk" FOREIGN KEY ("item_id") REFERENCES "public"."items"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "restaurant_details" ADD CONSTRAINT "restaurant_details_group_id_groups_id_fk" FOREIGN KEY ("group_id") REFERENCES "public"."groups"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "external_links_item_kind_url_uq" ON "external_links" USING btree ("item_id","kind","url");--> statement-breakpoint
CREATE INDEX "items_group_type_idx" ON "items" USING btree ("group_id","type");--> statement-breakpoint
CREATE INDEX "items_parent_idx" ON "items" USING btree ("parent_id");--> statement-breakpoint
CREATE UNIQUE INDEX "restaurant_details_group_yelp_uq" ON "restaurant_details" USING btree ("group_id","yelp_alias");--> statement-breakpoint
CREATE UNIQUE INDEX "restaurant_details_group_google_uq" ON "restaurant_details" USING btree ("group_id","google_place_key");--> statement-breakpoint
ALTER TABLE "plan_stops" ADD CONSTRAINT "plan_stops_item_id_items_id_fk" FOREIGN KEY ("item_id") REFERENCES "public"."items"("id") ON DELETE set null ON UPDATE no action;