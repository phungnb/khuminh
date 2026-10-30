-- Xe và sổ chi: chỉ tổ chức sở hữu thấy/sửa (theo mẫu 0003_tenant_rls.sql).
ALTER TABLE vehicles ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY org_isolation ON vehicles USING (org_id = app_org_id()) WITH CHECK (org_id = app_org_id());
--> statement-breakpoint
ALTER TABLE expenses ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY org_isolation ON expenses USING (org_id = app_org_id()) WITH CHECK (org_id = app_org_id());
--> statement-breakpoint
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'khuminh_app') THEN
    GRANT SELECT, INSERT, UPDATE, DELETE ON vehicles TO khuminh_app;
    GRANT SELECT, INSERT, UPDATE, DELETE ON expenses TO khuminh_app;
  END IF;
END $$;
