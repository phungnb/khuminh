---
name: security-review
description: Kiểm bảo mật sau MỖI task và trong CI — secret, phân quyền/RLS, injection, ranh giới dữ liệu. Luôn chạy song song với code-review.
---
# security-review
Kiểm: không lộ/commit secret (service_role, token); phân quyền đúng (RLS nếu dùng Postgres/Supabase);
không injection; dữ liệu nhạy cảm không phơi ra client; đầu vào được kiểm. Với dự án Supabase: gợi
ý chạy secscan. Trả phát hiện theo mức nghiêm trọng; chặn "XONG" nếu có lỗ hổng.
