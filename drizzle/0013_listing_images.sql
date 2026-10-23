CREATE TABLE "listing_images" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"listing_id" uuid NOT NULL,
	"position" integer NOT NULL,
	"content_type" text NOT NULL,
	"data" "bytea" NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "listing_images" ADD CONSTRAINT "listing_images_listing_id_listings_id_fk" FOREIGN KEY ("listing_id") REFERENCES "public"."listings"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "listing_images_pos" ON "listing_images" USING btree ("listing_id","position");--> statement-breakpoint
CREATE INDEX "listing_images_listing" ON "listing_images" USING btree ("listing_id");--> statement-breakpoint
-- Ảnh tin: người đã đăng nhập xem được ảnh của tin chưa bị ẩn; người đăng luôn thấy ảnh tin mình.
-- Ghi (thêm/xoá) chỉ người đăng của tin đó. Sửa/xoá tin gốc xoá ảnh theo cascade.
ALTER TABLE "listing_images" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY listing_image_read ON listing_images FOR SELECT
  USING (
    app_user_id() IS NOT NULL
    AND EXISTS (
      SELECT 1 FROM listings l
      WHERE l.id = listing_id AND (l.hidden_at IS NULL OR l.author_user_id = app_user_id())
    )
  );--> statement-breakpoint
CREATE POLICY listing_image_insert ON listing_images FOR INSERT
  WITH CHECK (EXISTS (SELECT 1 FROM listings l WHERE l.id = listing_id AND l.author_user_id = app_user_id()));--> statement-breakpoint
CREATE POLICY listing_image_delete ON listing_images FOR DELETE
  USING (EXISTS (SELECT 1 FROM listings l WHERE l.id = listing_id AND l.author_user_id = app_user_id()));--> statement-breakpoint
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'khuminh_app') THEN
    GRANT SELECT, INSERT, DELETE ON listing_images TO khuminh_app;
  END IF;
END $$;
