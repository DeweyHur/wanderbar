CREATE TABLE "ratings" (
	"id" text PRIMARY KEY NOT NULL,
	"group_id" text NOT NULL,
	"item_id" text NOT NULL,
	"user_id" text NOT NULL,
	"score" integer NOT NULL,
	"review" text DEFAULT '' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "ratings" ADD CONSTRAINT "ratings_group_id_groups_id_fk" FOREIGN KEY ("group_id") REFERENCES "public"."groups"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ratings" ADD CONSTRAINT "ratings_item_id_items_id_fk" FOREIGN KEY ("item_id") REFERENCES "public"."items"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ratings" ADD CONSTRAINT "ratings_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "ratings_item_user_uq" ON "ratings" USING btree ("item_id","user_id");--> statement-breakpoint
CREATE INDEX "ratings_group_idx" ON "ratings" USING btree ("group_id");