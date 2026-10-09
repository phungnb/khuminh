-- Cô lập dữ liệu giữa các tổ chức (chủ trọ) bằng Row Level Security.
--
-- Ứng dụng PHẢI kết nối bằng role khuminh_app (không phải chủ sở hữu bảng), và đặt
-- app.org_id (và app.user_id) bằng set_config(..., true) trong từng giao dịch.
-- Thiếu app.org_id thì không đọc/ghi được dòng nào.
-- Role khuminh_app được tạo bởi scripts/create-app-role.sql (cần quyền tạo role).

CREATE EXTENSION IF NOT EXISTS btree_gist;
--> statement-breakpoint
CREATE OR REPLACE FUNCTION app_org_id() RETURNS uuid
  LANGUAGE sql STABLE AS $$ SELECT nullif(current_setting('app.org_id', true), '')::uuid $$;
--> statement-breakpoint
CREATE OR REPLACE FUNCTION app_user_id() RETURNS uuid
  LANGUAGE sql STABLE AS $$ SELECT nullif(current_setting('app.user_id', true), '')::uuid $$;
--> statement-breakpoint
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'properties','property_staff','units','tenants','leases','lease_rents','lease_quantities',
    'meters','meter_readings','fee_rules','billing_periods','invoices','invoice_lines',
    'invoice_adjustments','payments','payment_allocations','invoice_share_tokens','posts','audit_logs'
  ] LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format(
      'CREATE POLICY org_isolation ON %I USING (org_id = app_org_id()) WITH CHECK (org_id = app_org_id())', t);
  END LOOP;
END $$;
--> statement-breakpoint
ALTER TABLE organizations ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY org_self ON organizations USING (id = app_org_id()) WITH CHECK (id = app_org_id());
--> statement-breakpoint
-- Người dùng xem được các membership của chính mình để chọn tổ chức khi đăng nhập.
ALTER TABLE memberships ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY membership_access ON memberships
  USING (org_id = app_org_id() OR user_id = app_user_id())
  WITH CHECK (org_id = app_org_id());
--> statement-breakpoint
-- Một phòng không có hai hợp đồng hiệu lực chồng thời gian.
ALTER TABLE leases ADD CONSTRAINT leases_no_overlap EXCLUDE USING gist (
  unit_id WITH =,
  daterange(start_date, coalesce(moved_out_on, 'infinity'::date), '[]') WITH &&
) WHERE (status <> 'draft');
--> statement-breakpoint
ALTER TABLE leases ADD CONSTRAINT leases_dates_valid CHECK (moved_out_on IS NULL OR moved_out_on >= start_date);
--> statement-breakpoint
ALTER TABLE leases ADD CONSTRAINT leases_occupants_valid CHECK (occupants >= 0);
--> statement-breakpoint
ALTER TABLE invoices ADD CONSTRAINT invoices_void_reason CHECK (status <> 'void' OR void_reason IS NOT NULL);
--> statement-breakpoint
ALTER TABLE payments ADD CONSTRAINT payments_amount_positive CHECK (amount > 0);
--> statement-breakpoint
ALTER TABLE payment_allocations ADD CONSTRAINT allocations_amount_positive CHECK (amount > 0);
--> statement-breakpoint
-- Tra link hóa đơn công khai: chạy với quyền chủ bảng nên bỏ qua RLS, chỉ trả về một dòng
-- khớp băm và còn hạn.
CREATE OR REPLACE FUNCTION resolve_invoice_share(p_token_hash text)
RETURNS TABLE (org_id uuid, invoice_id uuid)
LANGUAGE sql SECURITY DEFINER SET search_path = public AS $$
  SELECT s.org_id, s.invoice_id FROM invoice_share_tokens s
  WHERE s.token_hash = p_token_hash AND s.expires_at > now()
  LIMIT 1
$$;
--> statement-breakpoint
-- Tra người dùng theo email khi đăng nhập không cần quyền tổ chức: users/sessions không bật RLS.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'khuminh_app') THEN
    GRANT USAGE ON SCHEMA public TO khuminh_app;
    GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO khuminh_app;
    GRANT EXECUTE ON FUNCTION resolve_invoice_share(text) TO khuminh_app;
    ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO khuminh_app;
  END IF;
END $$;
