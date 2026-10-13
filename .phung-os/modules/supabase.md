# Module Supabase (tùy chọn)
Nạp module này trong CLAUDE.md gốc nếu dự án dùng Supabase/Postgres.
- Mọi thay đổi schema = một migration trong supabase/migrations/, review cùng PR; không sửa tay
  trên dashboard.
- Mọi bảng schema public: bật RLS + policy ngay trong migration.
- Token/bí mật không nằm trong bảng ai cũng đọc (schema private hoặc bảng chỉ service_role).
- anon key công khai được; service_role chỉ ở phía máy chủ / secrets CI, không vào client/log.
- seed.sql cho dữ liệu test/demo.
- secscan (github.com/phungnb/secscan) chạy trong CI mỗi PR; phát hiện anon đọc/ghi được bảng,
  token lộ, service_role lọt front-end. CI đỏ thì không merge.
