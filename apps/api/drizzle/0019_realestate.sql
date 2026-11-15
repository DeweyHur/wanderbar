ALTER TYPE "public"."group_module" ADD VALUE 'realestate';--> statement-breakpoint
ALTER TYPE "public"."item_type" ADD VALUE 'property';--> statement-breakpoint
ALTER TYPE "public"."link_kind" ADD VALUE 'zillow';--> statement-breakpoint
ALTER TYPE "public"."link_kind" ADD VALUE 'redfin';--> statement-breakpoint
ALTER TYPE "public"."link_kind" ADD VALUE 'realtor';--> statement-breakpoint
CREATE TABLE "property_details" (
	"item_id" text PRIMARY KEY NOT NULL,
	"group_id" text NOT NULL,
	"address" text NOT NULL,
	"address_key" text NOT NULL,
	"city" text DEFAULT '' NOT NULL,
	"zip" text DEFAULT '' NOT NULL,
	"lat" double precision,
	"lng" double precision,
	"google_place_id" text,
	"price" integer,
	"beds" double precision,
	"baths" double precision,
	"sqft" integer,
	"lot_sqft" integer,
	"year_built" integer,
	"hoa_monthly" integer,
	"stage" text DEFAULT 'interested' NOT NULL,
	"reject_reason" text DEFAULT '' NOT NULL,
	"open_house" text DEFAULT '' NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "tours" (
	"id" text PRIMARY KEY NOT NULL,
	"group_id" text NOT NULL,
	"item_id" text NOT NULL,
	"user_id" text NOT NULL,
	"visited_on" date NOT NULL,
	"overall" integer,
	"quick" text,
	"scores" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"checks" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"room_notes" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"pros" text DEFAULT '' NOT NULL,
	"cons" text DEFAULT '' NOT NULL,
	"agent" text DEFAULT '' NOT NULL,
	"heard" text DEFAULT '' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "photos" ADD COLUMN "room" text;--> statement-breakpoint
ALTER TABLE "photos" ADD COLUMN "tour_id" text;--> statement-breakpoint
ALTER TABLE "property_details" ADD CONSTRAINT "property_details_item_id_items_id_fk" FOREIGN KEY ("item_id") REFERENCES "public"."items"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "property_details" ADD CONSTRAINT "property_details_group_id_groups_id_fk" FOREIGN KEY ("group_id") REFERENCES "public"."groups"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tours" ADD CONSTRAINT "tours_group_id_groups_id_fk" FOREIGN KEY ("group_id") REFERENCES "public"."groups"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tours" ADD CONSTRAINT "tours_item_id_items_id_fk" FOREIGN KEY ("item_id") REFERENCES "public"."items"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tours" ADD CONSTRAINT "tours_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "property_details_group_address_uq" ON "property_details" USING btree ("group_id","address_key");--> statement-breakpoint
CREATE INDEX "tours_item_idx" ON "tours" USING btree ("item_id","visited_on");--> statement-breakpoint
CREATE INDEX "tours_group_idx" ON "tours" USING btree ("group_id");--> statement-breakpoint
ALTER TABLE "photos" ADD CONSTRAINT "photos_tour_id_tours_id_fk" FOREIGN KEY ("tour_id") REFERENCES "public"."tours"("id") ON DELETE set null ON UPDATE no action;