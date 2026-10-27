ALTER TABLE "listing_interests" ADD COLUMN "offer_price" integer;--> statement-breakpoint
ALTER TABLE "listings" ADD COLUMN "sold_at" timestamp with time zone;