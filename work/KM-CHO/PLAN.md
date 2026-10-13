# KM-CHO plan v2.0 — Chợ tiện ích quanh đây (thay KM-HUB-A v1.0)

Trạng thái: PROPOSED, chờ duyệt. KM-HUB-A v1.0 bị thay thế (OUTDATED), vì nó xây hub quanh "khu trọ của tôi" chứ không phải quanh chợ.

## 1. Định nghĩa đã chốt
Anh xác nhận ngày 13/10 (CONFIRMED):
- KhuMình là app trao đổi, mua bán tiện ích của khu dân cư (khu phố, phường, xã) trong bán kính khoảng 20 km.
- Quản lý trọ là module để kéo người dùng từ dãy trọ và chung cư.

## 2. Phản biện (phải chốt trước khi code)
1. **20 km quá rộng để gọi là "khu dân cư".** [kiến thức chung, chưa đo]
   - Ở nội thành TP.HCM hay Hà Nội, 20 km gần như phủ cả thành phố. Khi đó KhuMình đánh thẳng vào Chợ Tốt và Facebook Marketplace (cũng lọc theo bán kính), mà không có lợi thế gì.
   - Lợi thế thật của KhuMình là "người gần nhà, cùng khu trọ".
   - Đề xuất: mặc định 3 km, người dùng chọn 1/3/10/20 km.
2. **Chợ rỗng thì chết** (bài toán khởi động).
   - Module trọ cung cấp người dùng, nhưng không cung cấp tin đăng.
   - Cách giảm: giai đoạn 1 chỉ mở cho cư dân các cơ sở của anh, đo xong mới mở đăng ký công khai.
3. **Không thanh toán, ví hay escrow trong v1.**
   - Giữ tiền hộ là hoạt động trung gian thanh toán, cần giấy phép. [kiến thức chung, cần kiểm lại nếu làm]
   - Thay bằng nút "Tôi quan tâm". Người đăng tin bấm đồng ý thì hai bên mới thấy số điện thoại của nhau.
4. **Vị trí là dữ liệu cá nhân.**
   - Giai đoạn 1 không xin GPS. Vị trí của tin lấy theo tọa độ cơ sở nơi người đăng ở hoặc quản lý.
   - Tọa độ hiển thị làm tròn khoảng 500 m, kèm tên khu vực.

## 3. Phương án

| | Nội dung | Chi phí (ước tính, giờ công Claude) | Rủi ro lớn nhất |
|---|---|---|---|
| **P1 (khuyến nghị)** | Chợ giai đoạn 1 cho người dùng đã có (người thuê, chủ trọ, nhân viên ở các cơ sở của anh), vị trí theo cơ sở; trang chủ là "Chợ quanh đây", quản lý trọ là module. Giai đoạn 2 (plan riêng): mở đăng ký bằng SĐT và vị trí GPS | 30–45 giờ | Có migration và RLS mô hình mới (tin công khai giữa các tổ chức). Thiết kế sai thì lộ dữ liệu giữa các chủ trọ |
| P2 | Làm vỏ giao diện (KM-HUB-A) trước, chợ sau | 8–12 giờ + 30–45 giờ | Làm hub hai lần; bản đầu là vỏ rỗng |
| P3 | Kiểm chứng ngoài app: mở nhóm Zalo chợ cho 2–3 khu trọ của anh trong 2 tuần, đếm tin/tuần rồi mới code | 0 giờ code, khoảng 1 giờ/tuần của anh | Chậm 2 tuần; nhóm Zalo đo được nhu cầu nhưng không đo được hành vi trong app |

**Khuyến nghị: P1, chạy song song với P3 nếu anh có thời gian.** P1 giới hạn người dùng ở các cơ sở của anh, nên vừa là bản dùng thật vừa là phép đo.

**Cổng mở giai đoạn 2:** trong 4 tuần,
- ≥ 40% người thuê đăng nhập;
- ≥ 1 tin/khu/tuần;
- ≥ 20% tin có người bấm "quan tâm".

## 4. Task giai đoạn 1 (DAG tuần tự)

| ID | Phạm vi | Rủi ro | Nghiệm thu |
|---|---|---|---|
| T1 | Migration: thêm `properties.lat/lng`; các bảng `listings` (loại: bán/cần mua/cho tặng/dịch vụ, danh mục, giá, tọa độ làm tròn, trạng thái), `listing_interests`, `listing_reports`. RLS theo người dùng (`app.user_id`): ai đăng nhập cũng đọc được tin chưa ẩn, chỉ tác giả sửa hoặc đóng tin | **HIGH** (migration + RLS) | `check:rls` PASS; test DB chứng minh B không sửa, ẩn hay đọc liên hệ của A khi chưa được đồng ý |
| T2 | `src/server/market.ts`: đăng tin, tìm theo bán kính (lọc khung tọa độ + công thức haversine, không cần PostGIS), quan tâm và đồng ý lộ SĐT, báo cáo tin, chủ cơ sở ẩn tin vi phạm trong khu mình | MEDIUM | Test đơn vị khoảng cách; test DB bán kính 1/3/20 km cho đúng tập tin |
| T3 | Chủ trọ đặt vị trí cơ sở: dán link Google Maps hoặc nhập tọa độ | LOW | Link Maps hợp lệ ra đúng lat/lng; link sai báo lỗi |
| T4 | Trang chợ `/app`: lọc bán kính và loại tin, đăng tin, chi tiết tin, tin của tôi | MEDIUM | Ảnh chụp màn hình ở 390 px và desktop; người không có cơ sở thấy hướng dẫn |
| T5 | Điều hướng: landing `/` "Chợ tiện ích quanh nhà"; các tab Chợ · Đăng tin · Nhà tôi (hóa đơn + bảng tin khu trọ) · Quản lý (chỉ hiện với người quản lý); trang `/quan-ly` | LOW | Bốn vai đều đi đúng luồng; module `/co-so/*` chạy như cũ |
| T6 | README, docs/brain, instructions | LOW | Không còn mô tả "app quản lý trọ" |

**Không chạm:** `src/domain`, hóa đơn, thanh toán, logic đăng nhập. Không có ảnh tin đăng ở v1, vì lưu trữ file làm phát sinh chi phí hạ tầng và cần duyệt riêng.

## 5. Cần anh trả lời (tối đa 3)
1. Bán kính mặc định 3 km, cho chọn tới 20 km, được không? Hay cố định 20 km?
2. Mục "dịch vụ" ở v1: chỉ cư dân tự đăng, hay cần hồ sơ thợ/cửa hàng riêng? Mặc định: cư dân tự đăng như một loại tin.
3. Bản v1 không có ảnh tin, có chấp nhận được không? Thêm ảnh cần kho lưu file (Vercel Blob hoặc S3), có chi phí, phải duyệt riêng.

## 6. Duyệt
- Trả lời `APPROVED: KM-CHO plan v2.0`, kèm câu trả lời 3 câu trên (không trả lời thì em dùng mặc định).
- T1 là cổng HIGH. Em sẽ gửi SQL migration và policy RLS cho anh xem riêng trước khi chạy, kể cả khi plan đã được duyệt.
