-- Link mời nhân viên: cô lập theo tổ chức; tra công khai qua hàm SECURITY DEFINER.
ALTER TABLE staff_invites ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY org_isolation ON staff_invites USING (org_id = app_org_id()) WITH CHECK (org_id = app_org_id());
--> statement-breakpoint
CREATE OR REPLACE FUNCTION resolve_staff_invite(p_token_hash text)
RETURNS TABLE (org_id uuid, invite_id uuid, property_id uuid)
LANGUAGE sql SECURITY DEFINER SET search_path = public AS $$
  SELECT i.org_id, i.id, i.property_id FROM staff_invites i
  WHERE i.token_hash = p_token_hash AND i.expires_at > now() AND i.used_at IS NULL
  LIMIT 1
$$;
--> statement-breakpoint
-- push_subscriptions thuộc người dùng như sessions: không bật RLS, mã ứng dụng lọc theo user_id.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'khuminh_app') THEN
    GRANT SELECT, INSERT, UPDATE, DELETE ON staff_invites, push_subscriptions TO khuminh_app;
    GRANT EXECUTE ON FUNCTION resolve_staff_invite(text) TO khuminh_app;
  END IF;
END $$;
