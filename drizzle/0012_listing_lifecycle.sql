ALTER TABLE "listings" ADD COLUMN "expires_at" timestamp with time zone DEFAULT now() + interval '30 days' NOT NULL;--> statement-breakpoint
-- Gian hàng v1: người đăng xoá hẳn được tin của mình. Trước đây listings chỉ cấp
-- SELECT/INSERT/UPDATE cho khuminh_app (drizzle/0007_market_rls.sql), không có DELETE.
CREATE POLICY listing_delete ON listings FOR DELETE
  USING (author_user_id = app_user_id());
--> statement-breakpoint
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'khuminh_app') THEN
    GRANT DELETE ON listings TO khuminh_app;
  END IF;
END $$;
