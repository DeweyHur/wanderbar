CREATE TYPE "public"."device_platform" AS ENUM('android', 'ios');--> statement-breakpoint
CREATE TYPE "public"."stop_status" AS ENUM('pending', 'current', 'done', 'skipped');--> statement-breakpoint
CREATE TYPE "public"."tesla_format" AS ENUM('address', 'nameAddress', 'coords', 'link', 'full');--> statement-breakpoint
CREATE TABLE "plan_stops" (
	"id" text PRIMARY KEY NOT NULL,
	"plan_id" text NOT NULL,
	"item_id" text,
	"name" text NOT NULL,
	"memo" text DEFAULT '' NOT NULL,
	"address" text DEFAULT '' NOT NULL,
	"maps_url" text DEFAULT '' NOT NULL,
	"hours_raw" text DEFAULT '' NOT NULL,
	"lat" double precision,
	"lng" double precision,
	"google_place_id" text DEFAULT '' NOT NULL,
	"order_index" integer DEFAULT 0 NOT NULL,
	"status" "stop_status" DEFAULT 'pending' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "plans" (
	"id" text PRIMARY KEY NOT NULL,
	"group_id" text NOT NULL,
	"user_id" text NOT NULL,
	"title" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "tesla_formats" (
	"user_id" text NOT NULL,
	"platform" "device_platform" NOT NULL,
	"format" "tesla_format" NOT NULL,
	CONSTRAINT "tesla_formats_user_id_platform_pk" PRIMARY KEY("user_id","platform")
);
--> statement-breakpoint
ALTER TABLE "plan_stops" ADD CONSTRAINT "plan_stops_plan_id_plans_id_fk" FOREIGN KEY ("plan_id") REFERENCES "public"."plans"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "plans" ADD CONSTRAINT "plans_group_id_groups_id_fk" FOREIGN KEY ("group_id") REFERENCES "public"."groups"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "plans" ADD CONSTRAINT "plans_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tesla_formats" ADD CONSTRAINT "tesla_formats_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "plan_stops_plan_idx" ON "plan_stops" USING btree ("plan_id","order_index");--> statement-breakpoint
CREATE INDEX "plans_group_user_idx" ON "plans" USING btree ("group_id","user_id");