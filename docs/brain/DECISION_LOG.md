# DECISION_LOG — KhuMình
ngày | quyết định | nhãn | lý do | người duyệt
2026-10-13 | Dùng mô hình hai role DB (khuminh_app chịu RLS, khuminh_owner chỉ migrate) | CONFIRMED (từ code) | least-privilege, RLS bảo vệ dữ liệu tiền trọ | (có sẵn trong repo)
2026-10-13 | Đưa KhuMình lên chuẩn phung-os v1 (CLAUDE.md, .phung-os, CI, docs/brain) | PROPOSED | chuẩn hóa quy trình + chất lượng chạy liên tục | chờ anh duyệt PR
2026-10-13 | check-rls miễn RLS cho `users`, `sessions` (allowlist có ghi chú) | CONFIRMED (từ code) | login tra user theo email/điện thoại và tra session theo token hash xảy ra TRƯỚC khi có ngữ cảnh tổ chức; RLS theo org_id sẽ chặn chính luồng login. Đã ghi chú sẵn trong drizzle/0001_rls.sql; bảo vệ nằm ở tầng truy vấn, không phải RLS | (quyết định có sẵn trong repo; check-rls chỉ phản ánh đúng)
