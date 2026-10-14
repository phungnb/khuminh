CREATE TABLE "platform_admins" (
	"user_id" uuid PRIMARY KEY NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "platform_admins" ADD CONSTRAINT "platform_admins_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
-- Admin nền tảng (KM-HN2 T6). Bật RLS, KHÔNG tạo policy: khuminh_app không đọc/ghi được bảng này.
-- Chỉ các hàm SECURITY DEFINER bên dưới đọc. Thêm admin bằng scripts/grant-admin.ts (role chủ bảng).
ALTER TABLE platform_admins ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE OR REPLACE FUNCTION assert_platform_admin() RETURNS void
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF app_user_id() IS NULL OR NOT EXISTS (SELECT 1 FROM platform_admins WHERE user_id = app_user_id()) THEN
    RAISE EXCEPTION 'not_platform_admin' USING ERRCODE = '42501';
  END IF;
END $$;
--> statement-breakpoint
CREATE OR REPLACE FUNCTION is_platform_admin() RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT app_user_id() IS NOT NULL AND EXISTS (SELECT 1 FROM platform_admins WHERE user_id = app_user_id())
$$;
--> statement-breakpoint
-- Chỉ số tổng. Không trả dữ liệu cá nhân hay tiền.
CREATE OR REPLACE FUNCTION admin_stats()
RETURNS TABLE (orgs bigint, properties bigint, units bigint, active_leases bigint, users bigint,
               open_listings bigint, hidden_listings bigint, open_incidents bigint)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
BEGIN
  PERFORM assert_platform_admin();
  RETURN QUERY SELECT
    (SELECT count(*) FROM organizations),
    (SELECT count(*) FROM properties WHERE archived_at IS NULL),
    (SELECT count(*) FROM units),
    (SELECT count(*) FROM leases WHERE status = 'active'),
    (SELECT count(*) FROM users),
    (SELECT count(*) FROM listings WHERE status = 'open' AND hidden_at IS NULL),
    (SELECT count(*) FROM listings WHERE hidden_at IS NOT NULL),
    (SELECT count(*) FROM maintenance_requests WHERE status IN ('open', 'in_progress'));
END $$;
--> statement-breakpoint
-- Tin bị báo cáo, nhiều báo cáo nhất trước. Không trả liên hệ người đăng.
CREATE OR REPLACE FUNCTION admin_reported_listings(p_limit int DEFAULT 100)
RETURNS TABLE (listing_id uuid, title text, area_label text, author_name text, reports bigint,
               reasons text[], hidden_at timestamptz, status text, created_at timestamptz)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
BEGIN
  PERFORM assert_platform_admin();
  RETURN QUERY
    SELECT l.id, l.title, l.area_label, u.display_name, count(r.id), array_agg(r.reason ORDER BY r.created_at DESC),
           l.hidden_at, l.status::text, l.created_at
    FROM listings l
    JOIN listing_reports r ON r.listing_id = l.id
    JOIN users u ON u.id = l.author_user_id
    GROUP BY l.id, u.display_name
    ORDER BY count(r.id) DESC, l.created_at DESC
    LIMIT least(greatest(p_limit, 1), 500);
END $$;
--> statement-breakpoint
REVOKE ALL ON FUNCTION assert_platform_admin(), is_platform_admin(), admin_stats(), admin_reported_listings(int) FROM PUBLIC;
--> statement-breakpoint
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'khuminh_app') THEN
    REVOKE ALL ON platform_admins FROM khuminh_app;
    GRANT EXECUTE ON FUNCTION is_platform_admin(), admin_stats(), admin_reported_listings(int) TO khuminh_app;
  END IF;
END $$;
