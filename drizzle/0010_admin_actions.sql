CREATE TABLE "admin_actions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"admin_user_id" uuid NOT NULL,
	"action" text NOT NULL,
	"target_id" uuid NOT NULL,
	"reason" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "locked_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "admin_actions" ADD CONSTRAINT "admin_actions_admin_user_id_users_id_fk" FOREIGN KEY ("admin_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
-- KM-HN2 T7: admin ẩn/hiện tin, khóa/mở khóa tài khoản. Nhật ký riêng, app không đọc/ghi (RLS không policy).
ALTER TABLE admin_actions ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE OR REPLACE FUNCTION admin_set_listing_hidden(p_listing uuid, p_hidden boolean, p_reason text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  PERFORM assert_platform_admin();
  IF p_hidden AND coalesce(trim(p_reason), '') = '' THEN RAISE EXCEPTION 'reason_required'; END IF;
  UPDATE listings SET hidden_at = CASE WHEN p_hidden THEN coalesce(hidden_at, now()) ELSE NULL END WHERE id = p_listing;
  IF NOT FOUND THEN RAISE EXCEPTION 'listing_not_found'; END IF;
  INSERT INTO admin_actions (admin_user_id, action, target_id, reason)
    VALUES (app_user_id(), CASE WHEN p_hidden THEN 'listing.hide' ELSE 'listing.unhide' END, p_listing, nullif(trim(p_reason), ''));
END $$;
--> statement-breakpoint
CREATE OR REPLACE FUNCTION admin_set_user_locked(p_user uuid, p_locked boolean, p_reason text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  PERFORM assert_platform_admin();
  IF p_user = app_user_id() OR EXISTS (SELECT 1 FROM platform_admins WHERE user_id = p_user) THEN
    RAISE EXCEPTION 'cannot_lock_admin';
  END IF;
  IF p_locked AND coalesce(trim(p_reason), '') = '' THEN RAISE EXCEPTION 'reason_required'; END IF;
  UPDATE users SET locked_at = CASE WHEN p_locked THEN coalesce(locked_at, now()) ELSE NULL END WHERE id = p_user;
  IF NOT FOUND THEN RAISE EXCEPTION 'user_not_found'; END IF;
  IF p_locked THEN
    DELETE FROM sessions WHERE user_id = p_user;
    UPDATE listings SET hidden_at = now() WHERE author_user_id = p_user AND status = 'open' AND hidden_at IS NULL;
  END IF;
  INSERT INTO admin_actions (admin_user_id, action, target_id, reason)
    VALUES (app_user_id(), CASE WHEN p_locked THEN 'user.lock' ELSE 'user.unlock' END, p_user, nullif(trim(p_reason), ''));
END $$;
--> statement-breakpoint
-- Nhật ký cho trang admin.
CREATE OR REPLACE FUNCTION admin_recent_actions(p_limit int DEFAULT 50)
RETURNS TABLE (action text, target_id uuid, reason text, admin_name text, created_at timestamptz)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
BEGIN
  PERFORM assert_platform_admin();
  RETURN QUERY SELECT a.action, a.target_id, a.reason, u.display_name, a.created_at
    FROM admin_actions a JOIN users u ON u.id = a.admin_user_id
    ORDER BY a.created_at DESC LIMIT least(greatest(p_limit, 1), 200);
END $$;
--> statement-breakpoint
-- Thêm author_user_id (để khóa người đăng) và trạng thái khóa; đổi kiểu trả về nên phải DROP rồi tạo lại.
DROP FUNCTION admin_reported_listings(int);
--> statement-breakpoint
CREATE FUNCTION admin_reported_listings(p_limit int DEFAULT 100)
RETURNS TABLE (listing_id uuid, title text, area_label text, author_user_id uuid, author_name text, author_locked boolean,
               reports bigint, reasons text[], hidden_at timestamptz, status text, created_at timestamptz)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
BEGIN
  PERFORM assert_platform_admin();
  RETURN QUERY
    SELECT l.id, l.title, l.area_label, u.id, u.display_name, u.locked_at IS NOT NULL, count(r.id),
           array_agg(r.reason ORDER BY r.created_at DESC), l.hidden_at, l.status::text, l.created_at
    FROM listings l
    JOIN listing_reports r ON r.listing_id = l.id
    JOIN users u ON u.id = l.author_user_id
    GROUP BY l.id, u.id
    ORDER BY count(r.id) DESC, l.created_at DESC
    LIMIT least(greatest(p_limit, 1), 500);
END $$;
--> statement-breakpoint
REVOKE ALL ON FUNCTION admin_set_listing_hidden(uuid, boolean, text), admin_set_user_locked(uuid, boolean, text),
  admin_recent_actions(int), admin_reported_listings(int) FROM PUBLIC;
--> statement-breakpoint
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'khuminh_app') THEN
    REVOKE ALL ON admin_actions FROM khuminh_app;
    GRANT EXECUTE ON FUNCTION admin_set_listing_hidden(uuid, boolean, text), admin_set_user_locked(uuid, boolean, text),
      admin_recent_actions(int), admin_reported_listings(int) TO khuminh_app;
  END IF;
END $$;
