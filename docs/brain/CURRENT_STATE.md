# CURRENT_STATE — KhuMình
Cập nhật: 2026-10-14, thêm KM-VH (vá lỗ trước khi dùng thật); trước đó 2026-10-13 thêm chợ quanh đây (rút từ code; mục [ASSUMED] là suy luận từ mã, cần anh xác nhận).

## Định vị sản phẩm (CONFIRMED, anh xác nhận 2026-10-13)
- KhuMình = chợ tiện ích quanh nhà (mua bán, cho tặng, dịch vụ trong bán kính tới 20 km).
- Quản lý trọ là MODULE kéo người dùng (như module CLB của RaceHub), không phải sản phẩm chính.
- Kế hoạch: work/KM-CHO/PLAN.md (v2.0). KM-HUB-A v1.0 đã OUTDATED.

## Đang có (CONFIRMED từ code)
- Chợ quanh đây (giai đoạn 1, đã merge PR #2): trang chủ /app là chợ; tin đăng theo
  bán kính 1/3/10/20 km quanh tọa độ cơ sở; quan tâm → người đăng đồng ý mới lộ liên hệ; 3 báo cáo thì ẩn.
  Bảng listings/listing_contacts/listing_interests/listing_reports, RLS theo app.user_id (0006, 0007).
  Landing công khai `/`; module quản lý ở /quan-ly → /co-so/*.
- Giao diện (PR #3, chờ duyệt): nền tối theo RaceHub, tab dưới 5 ô (Chợ, Nhà tôi, Đăng tin, Của tôi, Quản lý/Bảng tin),
  tìm từ khóa + lọc danh mục, thẻ lưới, chia sẻ, nút gọi. Component chung: src/components/{ui,category,listing-card}.tsx.
- Module quản lý trọ: cơ sở, phòng, hợp đồng thuê, kỳ, hóa đơn, thanh toán.
- DB Drizzle/Postgres, migration trong drizzle/ (0000_init … 0005_staff_push_rls, 0006_market, 0007_market_rls).
- Mô hình hai role: khuminh_app (chịu RLS) + khuminh_owner (chủ bảng, chỉ migrate).
- Auth: chủ nhà đăng ký (email/mật khẩu); người thuê đăng nhập bằng SĐT qua link mời.
- Domain tách lớp: src/domain (billing, payments, money), src/server, src/db.
- Test: unit (billing, payments, money, geo) + DB thật (flow, tenant, community, market).
- KM-VH (PR chờ duyệt): người thuê quên mật khẩu → chủ trọ cấp link đặt lại (dùng bảng tenant_invites, không migration);
  nhận lời mời phải đúng SĐT chủ trọ đã ghi; mật khẩu mới ≥ 8 ký tự; trang /dieu-khoan, /rieng-tu (bản nháp);
  error/not-found/loading toàn cục; scripts/reset-password.ts, scripts/metrics.ts. Vận hành: docs/brain/VAN_HANH.md.
- CHƯA có: giới hạn đăng nhập sai (cần migration, chờ duyệt), gửi email/OTP, giám sát lỗi, xác nhận sao lưu.

## Môi trường
- Triển khai: Vercel (vercel-build chạy setup-db trước next build). [ASSUMED]
- Biến môi trường: DATABASE_URL (owner), DATABASE_URL_APP (app), APP_DB_PASSWORD, APP_URL.

## Bị chặn / cần làm (sau khi lên chuẩn phung-os)
- Trước PR này: CHƯA có CI → test không tự chạy mỗi thay đổi.
- Cần xác nhận: RLS đã phủ hết bảng chưa (CI check-rls sẽ trả lời bằng bằng chứng).
