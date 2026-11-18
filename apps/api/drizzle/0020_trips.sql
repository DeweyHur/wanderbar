CREATE TYPE "public"."trip_transport" AS ENUM('car', 'flight', 'train', 'bus', 'other');--> statement-breakpoint
CREATE TABLE "trip_hotels" (
	"id" text PRIMARY KEY NOT NULL,
	"trip_id" text NOT NULL,
	"name" text NOT NULL,
	"address" text DEFAULT '' NOT NULL,
	"lat" double precision,
	"lng" double precision,
	"google_place_id" text DEFAULT '' NOT NULL,
	"maps_url" text DEFAULT '' NOT NULL,
	"check_in" date NOT NULL,
	"check_out" date NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "trips" (
	"id" text PRIMARY KEY NOT NULL,
	"group_id" text NOT NULL,
	"user_id" text NOT NULL,
	"title" text NOT NULL,
	"start_date" date NOT NULL,
	"end_date" date NOT NULL,
	"transport" "trip_transport" DEFAULT 'car' NOT NULL,
	"rental_car" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "plans" ADD COLUMN "trip_id" text;--> statement-breakpoint
ALTER TABLE "trip_hotels" ADD CONSTRAINT "trip_hotels_trip_id_trips_id_fk" FOREIGN KEY ("trip_id") REFERENCES "public"."trips"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "trips" ADD CONSTRAINT "trips_group_id_groups_id_fk" FOREIGN KEY ("group_id") REFERENCES "public"."groups"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "trips" ADD CONSTRAINT "trips_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "trip_hotels_trip_idx" ON "trip_hotels" USING btree ("trip_id");--> statement-breakpoint
CREATE INDEX "trips_group_user_idx" ON "trips" USING btree ("group_id","user_id");--> statement-breakpoint
ALTER TABLE "plans" ADD CONSTRAINT "plans_trip_id_trips_id_fk" FOREIGN KEY ("trip_id") REFERENCES "public"."trips"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "plans_trip_idx" ON "plans" USING btree ("trip_id");