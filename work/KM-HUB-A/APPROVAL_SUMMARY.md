> OUTDATED: thay bằng work/KM-CHO/PLAN.md (v2.0) ngày 2026-10-13.

# APPROVAL_SUMMARY — KM-HUB-A plan v1.0

- **Làm gì.** Trang chủ thành hub cư dân. Quản lý trọ gom vào mục "Quản lý khu". Thêm landing công khai "tiện ích khu dân cư". Có 6 task tuần tự.
- **Không chạm.** Migration, RLS, src/domain, logic hóa đơn và thanh toán, logic xác thực. Route module `/co-so/*` giữ nguyên.
- **Ước tính.** 8–12 giờ công Claude. Phần anh cần làm khoảng 30 phút: xem bản preview Vercel và duyệt PR. Đây là số ước tính, chưa đo.
- **Rủi ro lớn nhất.** Hub cư dân mỏng vì hiện chỉ có bảng tin và hóa đơn. Mở ra trông vẫn nghèo cho tới khi làm B (khu dân cư, cư dân tự tham gia). Giảm rủi ro bằng cách đo trên các cơ sở của anh: ≥40% người thuê tạo tài khoản, ≥1 tin/khu/tuần.
- **Duyệt.** Trả lời `APPROVED: KM-HUB-A plan v1.0`, hoặc chỉ ra chỗ cần sửa. Duyệt xong em làm hết 6 task, mở PR, chạy CI xanh, gửi link preview.
