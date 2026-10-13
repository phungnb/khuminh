# CURRENT_STATE — KhuMình
Cập nhật: 2026-10-13 (rút từ code; mục [ASSUMED] là suy luận từ mã, cần anh xác nhận).

## Đang có (CONFIRMED từ code)
- App Next.js 15 quản lý nhà trọ: cơ sở, phòng, hợp đồng thuê, kỳ, hóa đơn, thanh toán.
- DB Drizzle/Postgres, migration trong drizzle/ (0000_init, 0001_rls, 0002_tenant_invites, 0003_tenant_rls).
- Mô hình hai role: khuminh_app (chịu RLS) + khuminh_owner (chủ bảng, chỉ migrate).
- Auth: chủ nhà đăng ký (email/mật khẩu); người thuê đăng nhập bằng SĐT qua link mời.
- Domain tách lớp: src/domain (billing, payments, money), src/server, src/db.
- Test: 5 file — billing, payments, money (nghiệp vụ) + tenant.db, flow.db (DB thật).

## Môi trường
- Triển khai: Vercel (vercel-build chạy setup-db trước next build). [ASSUMED]
- Biến môi trường: DATABASE_URL (owner), DATABASE_URL_APP (app), APP_DB_PASSWORD, APP_URL.

## Bị chặn / cần làm (sau khi lên chuẩn phung-os)
- Trước PR này: CHƯA có CI → test không tự chạy mỗi thay đổi.
- Cần xác nhận: RLS đã phủ hết bảng chưa (CI check-rls sẽ trả lời bằng bằng chứng).
