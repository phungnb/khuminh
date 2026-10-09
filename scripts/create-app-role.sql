-- Chạy một lần bằng tài khoản quản trị Postgres, trước khi chạy migration.
-- Đổi mật khẩu trước khi dùng thật.
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'khuminh_app') THEN
    CREATE ROLE khuminh_app LOGIN PASSWORD 'change-me' NOSUPERUSER NOBYPASSRLS;
  END IF;
END $$;
