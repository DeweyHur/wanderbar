CREATE TYPE "public"."rsvp_status" AS ENUM('going', 'maybe', 'no');--> statement-breakpoint
CREATE TABLE "night_guests" (
	"id" text PRIMARY KEY NOT NULL,
	"night_id" text NOT NULL,
	"name" text NOT NULL,
	"added_by" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "night_rsvps" (
	"night_id" text NOT NULL,
	"user_id" text NOT NULL,
	"status" "rsvp_status" NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "night_rsvps_night_id_user_id_pk" PRIMARY KEY("night_id","user_id")
);
--> statement-breakpoint
ALTER TABLE "night_guests" ADD CONSTRAINT "night_guests_night_id_meetup_nights_id_fk" FOREIGN KEY ("night_id") REFERENCES "public"."meetup_nights"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "night_guests" ADD CONSTRAINT "night_guests_added_by_users_id_fk" FOREIGN KEY ("added_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "night_rsvps" ADD CONSTRAINT "night_rsvps_night_id_meetup_nights_id_fk" FOREIGN KEY ("night_id") REFERENCES "public"."meetup_nights"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "night_rsvps" ADD CONSTRAINT "night_rsvps_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "night_guests_night_idx" ON "night_guests" USING btree ("night_id");