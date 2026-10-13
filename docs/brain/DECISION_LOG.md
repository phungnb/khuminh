# DECISION_LOG — KhuMình
ngày | quyết định | nhãn | lý do | người duyệt
2026-10-13 | Dùng mô hình hai role DB (khuminh_app chịu RLS, khuminh_owner chỉ migrate) | CONFIRMED (từ code) | least-privilege, RLS bảo vệ dữ liệu tiền trọ | (có sẵn trong repo)
2026-10-13 | Đưa KhuMình lên chuẩn phung-os v1 (CLAUDE.md, .phung-os, CI, docs/brain) | PROPOSED | chuẩn hóa quy trình + chất lượng chạy liên tục | chờ anh duyệt PR
2026-10-13 | check-rls miễn RLS cho `users`, `sessions`, `push_subscriptions` (allowlist có ghi chú) | CONFIRMED (từ code) | users/sessions: login tra trước khi có ngữ cảnh org (drizzle/0001_rls.sql). push_subscriptions: thuộc người dùng như sessions, app lọc theo user_id (drizzle/0005_staff_push_rls.sql). Bảo vệ ở tầng truy vấn, không phải RLS | (quyết định có sẵn trong repo; check-rls chỉ phản ánh đúng)
2026-10-13 | Merge origin/main vào nhánh onboard (đưa feature staff/push + community vào trước khi hoàn tất PR) | PROPOSED | base đã tiến sau khi tách nhánh; giữ nhánh không trôi, CI chạy đúng tree hợp nhất | chờ anh duyệt PR
