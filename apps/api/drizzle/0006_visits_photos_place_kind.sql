CREATE TABLE "visits" (
	"id" text PRIMARY KEY NOT NULL,
	"group_id" text NOT NULL,
	"item_id" text NOT NULL,
	"user_id" text NOT NULL,
	"visited_at" timestamp with time zone DEFAULT now() NOT NULL,
	"stop_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "plan_stops" ADD COLUMN "place_kind" text;--> statement-breakpoint
ALTER TABLE "restaurant_details" ADD COLUMN "photo_name" text;--> statement-breakpoint
ALTER TABLE "visits" ADD CONSTRAINT "visits_group_id_groups_id_fk" FOREIGN KEY ("group_id") REFERENCES "public"."groups"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "visits" ADD CONSTRAINT "visits_item_id_items_id_fk" FOREIGN KEY ("item_id") REFERENCES "public"."items"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "visits" ADD CONSTRAINT "visits_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "visits" ADD CONSTRAINT "visits_stop_id_plan_stops_id_fk" FOREIGN KEY ("stop_id") REFERENCES "public"."plan_stops"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "visits_item_idx" ON "visits" USING btree ("item_id","visited_at");--> statement-breakpoint
CREATE UNIQUE INDEX "visits_stop_uq" ON "visits" USING btree ("stop_id");