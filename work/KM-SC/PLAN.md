# KM-SC plan v1.0 — Yêu cầu sửa chữa từ người thuê

Trạng thái: APPROVED (anh, 2026-10-14, "APPROVED: KM-SC plan v1.0"). Preview: chặn migrate trong setup-db thay vì xác nhận DB. Có migration + RLS, nên là cổng HIGH. Thuộc mục 4 "Làm trong V1" của [KhuMình PRD V1.0](https://docs.google.com/document/d/1zCGJxekmEItXVrRQrNAa-vEtMQL-W0IZmxUm1qU0NNg/edit).

## 1. Mục tiêu
Người thuê báo sự cố phòng trong app (vòi nước hỏng, cúp điện...). Chủ trọ hoặc nhân viên của cơ sở thấy yêu cầu, nhận việc và đánh dấu xong. Người thuê thấy trạng thái. Đây là lý do thứ hai để người thuê mở app, ngoài hóa đơn.

## 2. Phạm vi tối thiểu
- Người thuê: tạo yêu cầu (tiêu đề, mô tả ≤ 1000 ký tự, mức "gấp/bình thường"), xem danh sách yêu cầu của phòng mình và trạng thái.
- Chủ trọ/nhân viên được giao: danh sách theo cơ sở, đổi trạng thái `mới → đang xử lý → xong` (hoặc `từ chối` kèm lý do), ghi chú xử lý.
- Thông báo đẩy: chủ trọ/nhân viên nhận khi có yêu cầu mới; người thuê nhận khi trạng thái đổi.

**Non-goals:** ảnh (cần kho lưu file, phát sinh chi phí), chi phí sửa chữa, lịch bảo trì, phân công cho người ngoài, chat.

## 3. Thiết kế dữ liệu (đề xuất)
Bảng `maintenance_requests`: `id, org_id, property_id, unit_id, lease_id, created_by (user), title, body, urgent, status, resolution_note, resolved_by, resolved_at, created_at`.

RLS:
- `org_isolation` như mọi bảng nghiệp vụ (chủ trọ/nhân viên trong tổ chức).
- Phía người thuê: đi qua `withOrg` + lọc `lease_id` thuộc hồ sơ người thuê của chính họ, giống `tenantInvoice` (`src/server/tenant.ts`). Không thêm policy mới cho người thuê.
- Nhân viên chỉ thấy cơ sở được giao: lọc bằng `assertPropertyAccess`, giống các luồng khác.

## 4. Task (DAG tuần tự)

| ID | Phạm vi | Rủi ro | Nghiệm thu |
|---|---|---|---|
| T1 | Migration 0008 + RLS + grant | **HIGH** | `check:rls` PASS; test DB: chủ trọ B không đọc/sửa yêu cầu của A |
| T2 | `src/server/maintenance.ts`: tạo, liệt kê, đổi trạng thái; audit | MEDIUM | test DB: người thuê chỉ thấy yêu cầu phòng mình; người đã chuyển đi không tạo được; nhân viên ngoài cơ sở bị chặn |
| T3 | UI người thuê: tab "Nhà tôi" → "Báo sự cố" | LOW | ảnh màn hình 390 px |
| T4 | UI quản lý: mục "Sự cố" trong cơ sở + số yêu cầu mở trên tổng quan | LOW | ảnh màn hình |
| T5 | Thông báo đẩy hai chiều | LOW | test gọi hàm gửi đúng người nhận |
| T6 | `scripts/metrics.ts` thêm số yêu cầu/khu; docs/brain | LOW | — |

Ước tính: 8–12 giờ công Claude, khoảng 1 tuần với quỹ 6 giờ/tuần của anh để duyệt và thử (ước tính).

## 5. Điều kiện trước khi code
- **Bắt buộc:** anh xác nhận bản Preview trên Vercel KHÔNG dùng chung DB với Production. `vercel-build` chạy migrate, nên push nhánh có migration 0008 sẽ migrate DB mà Preview trỏ tới. Đây là migration thêm bảng (không phá dữ liệu), nhưng vẫn là thay đổi production chưa được duyệt.
- PR #5 nên merge trước để tránh xung đột ở `src/server/tenant.ts`.

## 6. Rủi ro lớn nhất
Người thuê ở trọ quen gọi/Zalo chủ trọ khi có sự cố, nên tính năng có thể không ai dùng. Cách kiểm chứng rẻ: ở kỳ thật đầu tiên, hỏi 5 người thuê "nếu có nút báo sự cố trong app thì có dùng không", trước khi duyệt T1.

## 7. Cần anh
`APPROVED: KM-SC plan v1.0` + trả lời câu Preview/Production ở mục 5.
