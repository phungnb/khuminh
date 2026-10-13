-- Chợ tiện ích quanh đây: RLS theo NGƯỜI DÙNG (app.user_id), không theo tổ chức.
-- Tin đăng không thuộc chủ trọ nào; mọi truy cập của ứng dụng đi qua withUser().
ALTER TABLE listings ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE listing_contacts ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE listing_interests ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE listing_reports ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
-- Tin: người đã đăng nhập xem được tin chưa bị ẩn; người đăng luôn thấy tin của mình.
CREATE POLICY listing_read ON listings FOR SELECT
  USING (app_user_id() IS NOT NULL AND (hidden_at IS NULL OR author_user_id = app_user_id()));
--> statement-breakpoint
CREATE POLICY listing_insert ON listings FOR INSERT
  WITH CHECK (author_user_id = app_user_id() AND hidden_at IS NULL AND status = 'open');
--> statement-breakpoint
CREATE POLICY listing_update ON listings FOR UPDATE
  USING (author_user_id = app_user_id()) WITH CHECK (author_user_id = app_user_id());
--> statement-breakpoint
-- Người đăng không tự gỡ cờ ẩn do báo cáo; chỉ trigger báo cáo (chạy bằng chủ bảng) được đổi.
CREATE OR REPLACE FUNCTION listings_guard_hidden() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.hidden_at IS DISTINCT FROM OLD.hidden_at AND current_user = 'khuminh_app' THEN
    RAISE EXCEPTION 'hidden_at chỉ đổi qua báo cáo vi phạm';
  END IF;
  RETURN NEW;
END $$;
--> statement-breakpoint
CREATE TRIGGER listings_guard_hidden BEFORE UPDATE ON listings
  FOR EACH ROW EXECUTE FUNCTION listings_guard_hidden();
--> statement-breakpoint
-- Liên hệ của tin: chỉ người đăng, hoặc người quan tâm đã được người đăng đồng ý.
CREATE POLICY contact_read ON listing_contacts FOR SELECT
  USING (
    EXISTS (SELECT 1 FROM listings l WHERE l.id = listing_id AND l.author_user_id = app_user_id())
    OR EXISTS (
      SELECT 1 FROM listing_interests i
      WHERE i.listing_id = listing_contacts.listing_id AND i.user_id = app_user_id() AND i.status = 'accepted'
    )
  );
--> statement-breakpoint
CREATE POLICY contact_write ON listing_contacts FOR INSERT
  WITH CHECK (EXISTS (SELECT 1 FROM listings l WHERE l.id = listing_id AND l.author_user_id = app_user_id()));
--> statement-breakpoint
CREATE POLICY contact_update ON listing_contacts FOR UPDATE
  USING (EXISTS (SELECT 1 FROM listings l WHERE l.id = listing_id AND l.author_user_id = app_user_id()))
  WITH CHECK (EXISTS (SELECT 1 FROM listings l WHERE l.id = listing_id AND l.author_user_id = app_user_id()));
--> statement-breakpoint
-- Quan tâm: người quan tâm thấy của mình; người đăng thấy mọi quan tâm vào tin của mình.
CREATE POLICY interest_read ON listing_interests FOR SELECT
  USING (
    user_id = app_user_id()
    OR EXISTS (SELECT 1 FROM listings l WHERE l.id = listing_id AND l.author_user_id = app_user_id())
  );
--> statement-breakpoint
-- Chỉ quan tâm tin đang mở, chưa ẩn, không phải của mình.
CREATE POLICY interest_insert ON listing_interests FOR INSERT
  WITH CHECK (
    user_id = app_user_id()
    AND status = 'pending'
    AND EXISTS (
      SELECT 1 FROM listings l
      WHERE l.id = listing_id AND l.status = 'open' AND l.hidden_at IS NULL AND l.author_user_id <> app_user_id()
    )
  );
--> statement-breakpoint
-- Chỉ người đăng tin đổi trạng thái (đồng ý / từ chối).
CREATE POLICY interest_decide ON listing_interests FOR UPDATE
  USING (EXISTS (SELECT 1 FROM listings l WHERE l.id = listing_id AND l.author_user_id = app_user_id()))
  WITH CHECK (EXISTS (SELECT 1 FROM listings l WHERE l.id = listing_id AND l.author_user_id = app_user_id()));
--> statement-breakpoint
CREATE POLICY report_read ON listing_reports FOR SELECT USING (user_id = app_user_id());
--> statement-breakpoint
CREATE POLICY report_insert ON listing_reports FOR INSERT
  WITH CHECK (
    user_id = app_user_id()
    AND EXISTS (SELECT 1 FROM listings l WHERE l.id = listing_id AND l.author_user_id <> app_user_id())
  );
--> statement-breakpoint
-- Đủ 3 người khác nhau báo cáo thì ẩn tin. SECURITY DEFINER: đếm được báo cáo của người khác.
CREATE OR REPLACE FUNCTION listing_reports_autohide() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF (SELECT count(*) FROM listing_reports r WHERE r.listing_id = NEW.listing_id) >= 3 THEN
    UPDATE listings SET hidden_at = now() WHERE id = NEW.listing_id AND hidden_at IS NULL;
  END IF;
  RETURN NEW;
END $$;
--> statement-breakpoint
CREATE TRIGGER listing_reports_autohide AFTER INSERT ON listing_reports
  FOR EACH ROW EXECUTE FUNCTION listing_reports_autohide();
--> statement-breakpoint
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'khuminh_app') THEN
    GRANT SELECT, INSERT, UPDATE ON listings, listing_contacts, listing_interests TO khuminh_app;
    GRANT SELECT, INSERT ON listing_reports TO khuminh_app;
  END IF;
END $$;
