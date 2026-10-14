# VAN_HANH — vận hành KhuMình khi có người dùng thật
Cập nhật: 2026-10-14 (KM-VH). Mục [UNKNOWN] cần anh điền.

## 1. Sao lưu và khôi phục
- Nhà cung cấp Postgres production: [UNKNOWN]. Ghi vào đây khi xác nhận.
- Việc phải làm một lần trước khi mời người thuê:
  1. Bật sao lưu tự động / khôi phục theo thời điểm (PITR) ở nhà cung cấp, ghi số ngày giữ.
  2. Thử khôi phục THẬT một lần ra một DB tạm (nhánh/bản sao), chạy `scripts/metrics.ts` trên bản đó để thấy số liệu khớp.
  3. Ghi ngày thử và thời gian khôi phục vào đây. Chưa thử khôi phục = chưa có sao lưu.
- Ngoài sao lưu của nhà cung cấp: cuối mỗi kỳ, xuất Excel hóa đơn của kỳ (nút Xuất ở trang kỳ) và lưu vào Drive 07_KHUMINH.

## 2. Quên mật khẩu
- Người thuê: chủ trọ mở trang phòng → "Link đặt lại mật khẩu" → gửi Zalo. Người thuê nhập đúng SĐT tài khoản + mật khẩu mới; mọi phiên cũ bị đăng xuất.
  Bị chặn nếu tài khoản còn thuê ở khu của chủ trọ khác (tránh chủ trọ A chiếm tài khoản dùng ở khu B) → người vận hành dùng script bên dưới.
- Chủ trọ/nhân viên (chưa có gửi email): người vận hành xác minh danh tính ngoài app rồi chạy
  `DATABASE_URL=<chủ bảng> NEW_PASSWORD=<mới> npx tsx scripts/reset-password.ts <email|sđt>`.

## 3. Chạy kỳ thật đầu tiên (song song sổ/Excel)
1. Nhập cơ sở, phòng, người thuê, biểu phí đúng như đang thu.
2. Ghi chỉ số cuối kỳ trên app VÀ trên sổ như cũ.
3. Lập nháp, so từng hóa đơn với cách tính tay. Lệch dù 1 đồng → ghi lại phòng, khoản, số tay, số app; KHÔNG phát hành. Sửa cách tính là cổng HIGH.
4. Khớp hết thì phát hành, gửi link/mời người thuê. Thu tiền vẫn ghi nhận tay trên app.
5. Lặp ít nhất 2 kỳ trước khi bỏ sổ.

## 4. Đo
`DATABASE_URL=<chủ bảng> npx tsx scripts/metrics.ts 4` (giao dịch chỉ đọc). Ngưỡng đã đặt trong OPEN_QUESTIONS:
≥ 40% người thuê có tài khoản; ≥ 1 tin chợ/khu/tuần; ≥ 20% tin có quan tâm. Cột "Sự cố báo (đang mở)" cho biết người thuê có dùng báo sự cố trong app không. Giới hạn: lượt xem hóa đơn trong app người thuê chưa được đếm, chỉ đếm link.

## 5. Hỗ trợ
Đặt `NEXT_PUBLIC_SUPPORT_CONTACT` (Zalo/SĐT) trên Vercel; hiện ở chân trang, điều khoản, riêng tư. Chưa đặt thì ẩn.
Trang /dieu-khoan và /rieng-tu là BẢN NHÁP, cần anh duyệt nội dung.

## 6. Sự cố và bản Preview
- Người thuê báo sự cố trong app; chủ trọ và nhân viên được giao cơ sở nhận thông báo đẩy, xử lý ở tab "Sự cố". Sự cố đã xong/từ chối không mở lại được: người thuê gửi yêu cầu mới.
- Bản Preview trên Vercel KHÔNG chạy migration. Trang dùng bảng mới sẽ lỗi trên Preview tới khi merge; muốn thử trước thì dùng DB riêng cho Preview và gỡ chặn trong scripts/setup-db.ts.

## 7. Admin nền tảng
- Cấp quyền: `DATABASE_URL=<chủ bảng> npx tsx scripts/grant-admin.ts <email>`; thu quyền thêm `--remove`. App không đọc/ghi được danh sách admin.
- Trang /admin (lối vào ở Tôi): số tổng và tin bị báo cáo. Không có hóa đơn, tiền, liên hệ. Người không phải admin gặp trang 404.
