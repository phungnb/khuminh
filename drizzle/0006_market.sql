CREATE TYPE "public"."interest_status" AS ENUM('pending', 'accepted', 'declined');--> statement-breakpoint
CREATE TYPE "public"."listing_kind" AS ENUM('sell', 'want', 'give', 'service');--> statement-breakpoint
CREATE TYPE "public"."listing_status" AS ENUM('open', 'closed');--> statement-breakpoint
CREATE TABLE "listing_contacts" (
	"listing_id" uuid PRIMARY KEY NOT NULL,
	"contact" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "listing_interests" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"listing_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"contact" text NOT NULL,
	"note" text,
	"status" "interest_status" DEFAULT 'pending' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "listing_reports" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"listing_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"reason" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "listings" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"author_user_id" uuid NOT NULL,
	"kind" "listing_kind" NOT NULL,
	"category" text NOT NULL,
	"title" text NOT NULL,
	"body" text,
	"price" bigint,
	"lat" double precision NOT NULL,
	"lng" double precision NOT NULL,
	"area_label" text NOT NULL,
	"status" "listing_status" DEFAULT 'open' NOT NULL,
	"hidden_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "properties" ADD COLUMN "lat" double precision;--> statement-breakpoint
ALTER TABLE "properties" ADD COLUMN "lng" double precision;--> statement-breakpoint
ALTER TABLE "listing_contacts" ADD CONSTRAINT "listing_contacts_listing_id_listings_id_fk" FOREIGN KEY ("listing_id") REFERENCES "public"."listings"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "listing_interests" ADD CONSTRAINT "listing_interests_listing_id_listings_id_fk" FOREIGN KEY ("listing_id") REFERENCES "public"."listings"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "listing_interests" ADD CONSTRAINT "listing_interests_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "listing_reports" ADD CONSTRAINT "listing_reports_listing_id_listings_id_fk" FOREIGN KEY ("listing_id") REFERENCES "public"."listings"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "listing_reports" ADD CONSTRAINT "listing_reports_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "listings" ADD CONSTRAINT "listings_author_user_id_users_id_fk" FOREIGN KEY ("author_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "listing_interests_unique" ON "listing_interests" USING btree ("listing_id","user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "listing_reports_unique" ON "listing_reports" USING btree ("listing_id","user_id");--> statement-breakpoint
CREATE INDEX "listings_geo" ON "listings" USING btree ("lat","lng");--> statement-breakpoint
CREATE INDEX "listings_author" ON "listings" USING btree ("author_user_id");