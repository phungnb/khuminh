-- Tài khoản người thuê.
ALTER TABLE tenant_invites ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY org_isolation ON tenant_invites USING (org_id = app_org_id()) WITH CHECK (org_id = app_org_id());
--> statement-breakpoint
-- Người thuê đăng nhập (chưa chọn tổ chức) thấy các hồ sơ người thuê gắn với chính mình,
-- để biết mình thuê ở những khu nào. Khi đã gắn tổ chức thì chỉ áp dụng org_isolation.
CREATE POLICY tenant_self ON tenants FOR SELECT
  USING (app_org_id() IS NULL AND user_id = app_user_id());
--> statement-breakpoint
-- Tra link mời công khai: chỉ trả về lời mời khớp băm, còn hạn, chưa dùng.
CREATE OR REPLACE FUNCTION resolve_tenant_invite(p_token_hash text)
RETURNS TABLE (org_id uuid, invite_id uuid, tenant_id uuid)
LANGUAGE sql SECURITY DEFINER SET search_path = public AS $$
  SELECT i.org_id, i.id, i.tenant_id FROM tenant_invites i
  WHERE i.token_hash = p_token_hash AND i.expires_at > now() AND i.used_at IS NULL
  LIMIT 1
$$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS tenants_user ON tenants (user_id) WHERE user_id IS NOT NULL;
--> statement-breakpoint
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'khuminh_app') THEN
    GRANT SELECT, INSERT, UPDATE, DELETE ON tenant_invites TO khuminh_app;
    GRANT EXECUTE ON FUNCTION resolve_tenant_invite(text) TO khuminh_app;
  END IF;
END $$;
