# CURRENT_STATE — KhuMình
Cập nhật: 2026-10-14, KM-HN (điều hướng 4 tab + trang Hôm nay, PR chờ duyệt); thêm KM-SC (báo sự cố) và chặn migrate trên Preview; KM-VH (vá lỗ trước khi dùng thật); trước đó 2026-10-13 thêm chợ quanh đây (rút từ code; mục [ASSUMED] là suy luận từ mã, cần anh xác nhận).

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
- DB Drizzle/Postgres, migration trong drizzle/ (0000_init … 0005_staff_push_rls, 0006_market, 0007_market_rls, 0008_maintenance).
- Mô hình hai role: khuminh_app (chịu RLS) + khuminh_owner (chủ bảng, chỉ migrate).
- Auth: chủ nhà đăng ký (email/mật khẩu); người thuê đăng nhập bằng SĐT qua link mời.
- Domain tách lớp: src/domain (billing, payments, money), src/server, src/db.
- Test: unit (billing, payments, money, geo) + DB thật (flow, tenant, community, market).
- KM-VH (PR chờ duyệt): người thuê quên mật khẩu → chủ trọ cấp link đặt lại (dùng bảng tenant_invites, không migration);
  nhận lời mời phải đúng SĐT chủ trọ đã ghi; mật khẩu mới ≥ 8 ký tự; trang /dieu-khoan, /rieng-tu (bản nháp);
  error/not-found/loading toàn cục; scripts/reset-password.ts, scripts/metrics.ts. Vận hành: docs/brain/VAN_HANH.md.
- KM-SC (PR chờ duyệt, migration 0008_maintenance): người thuê báo sự cố ở /app/su-co (thẻ "Báo sự cố" trên Nhà tôi);
  chủ trọ/nhân viên được giao xử lý ở tab "Sự cố" của cơ sở (mới → đang xử lý → xong / từ chối kèm lý do), tổng quan cơ sở hiện số sự cố mở;
  thông báo đẩy hai chiều. Bảng maintenance_requests có RLS org_isolation; người thuê đi qua withOrg + lọc lease của mình. Không có ảnh.
- KM-HN (PR chờ duyệt, chỉ giao diện, không migration): tab dưới Hôm nay / Quanh đây / [Đăng tin] / Tiện ích / Tôi.
  /app = "Hôm nay có gì?" dựng từ dữ liệu đã có (hóa đơn còn nợ, sự cố mở + vừa xong 3 ngày, thông báo chủ trọ ≤ 14 ngày,
  sự cố chưa xong của cơ sở mình quản lý, 4 tin chợ gần 3 km); không có nội dung mẫu. Chợ chuyển sang /app/quanh-day
  (link cũ /app?o=… tự chuyển). "Nhà tôi" thành "Nhà và nơi ở" (/app/nha) trong Tôi (/app/toi). Logic chọn ở src/server/today.ts.
  Định vị CHƯA đổi (vẫn theo PRD V1.0); phản biện: khuminh/KM-HN_phan-bien-v1.0.md trên thư mục project.
- KM-HN2 gói 1 (PR chồng lên PR #6, không migration): Hôm nay có "Mới hôm nay quanh bạn" (tin 24 giờ);
  bán kính chọn ở Quanh đây được nhớ bằng cookie km_r (middleware) và Hôm nay dùng chung; Quanh đây lọc theo nhu cầu
  (Mua bán, Cần mua, Cho tặng, Sửa chữa, Dọn dẹp/giặt ủi, Dịch vụ khác); Tiện ích có 4 nhóm Xem tin/Đăng tin điền sẵn;
  Tôi có mục Quản lý khu; trang /app/nguoi/[id] "tin của người này" (chỉ trong 20 km quanh khu người xem). Plan: khuminh/KM-HN2_plan-v1.0.md.
- KM-HN2 T5 (không migration, dùng cột archived_at có sẵn): chủ trọ xóa hẳn khu NHÁP (chưa từng có hợp đồng/kỳ; gõ lại tên để xác nhận),
  hoặc lưu trữ khu đã dùng (không còn hợp đồng đang thuê) và khôi phục; ở Cài đặt khu (#khu) và /quan-ly "Khu đã lưu trữ". Có audit
  property.delete/archive/restore. Nhân viên không làm được. src/server/property-lifecycle.ts.
- KM-HN2 T6 (migration 0009_platform_admin): bảng platform_admins bật RLS không policy + REVOKE khỏi khuminh_app; hàm SECURITY DEFINER
  is_platform_admin/admin_stats/admin_reported_listings tự kiểm admin (assert_platform_admin). Trang /admin, cấp quyền bằng scripts/grant-admin.ts.
  setup-db REVOKE lại platform_admins sau lệnh GRANT ALL TABLES. Chưa có thao tác ẩn tin/khóa tài khoản (T7).
- CHƯA có: giới hạn đăng nhập sai (anh quyết chưa làm), gửi email/OTP, giám sát lỗi, xác nhận sao lưu.

## Môi trường
- Triển khai: Vercel (vercel-build chạy setup-db trước next build). [ASSUMED]
- setup-db THOÁT SỚM khi VERCEL_ENV=preview: bản Preview không migrate DB (chưa xác nhận Preview có dùng chung DB Production không).
  Hệ quả: trang dùng bảng mới (vd. Sự cố) lỗi trên Preview tới khi merge và Production migrate. [ASSUMED: VERCEL_ENV có ở bước build]
- Biến môi trường: DATABASE_URL (owner), DATABASE_URL_APP (app), APP_DB_PASSWORD, APP_URL.

## Bị chặn / cần làm (sau khi lên chuẩn phung-os)
- Trước PR này: CHƯA có CI → test không tự chạy mỗi thay đổi.
- Cần xác nhận: RLS đã phủ hết bảng chưa (CI check-rls sẽ trả lời bằng bằng chứng).
