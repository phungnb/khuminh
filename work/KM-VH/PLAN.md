# KM-VH plan v1.0 — Vá lỗ trước khi dùng thật

Trạng thái: anh trả lời "thực hiện toàn bộ" ngày 2026-10-14 sau báo cáo đối chiếu
(`/mnt/project-files/khuminh/danh-gia/doi-chieu-ban-danh-gia-2026-10-14.md`). Ghi nhận là duyệt
cho các task không cần migration. T4 có migration → tách ra, chờ duyệt riêng (lý do ở mục 3).

## 1. Mục tiêu
Đưa module trọ vào dùng thật ở cơ sở của anh mà không có lỗ: mất tài khoản, chiếm link mời,
thiếu trang pháp lý, không đo được hiệu quả.

## 2. Task (DAG tuần tự)

| ID | Phạm vi | Rủi ro | Nghiệm thu |
|---|---|---|---|
| T1 | Người thuê quên mật khẩu: chủ trọ (chỉ role owner) cấp link đặt lại qua bảng `tenant_invites` sẵn có. Đặt lại: SĐT phải trùng SĐT tài khoản, mật khẩu ≥ 8, thu hồi mọi phiên cũ, ghi audit. Chặn khi tài khoản còn gắn khu của chủ trọ khác hoặc là chủ/nhân viên (tránh chủ trọ A chiếm tài khoản đang dùng ở khu B). | HIGH (xác thực) | test DB: đặt lại thành công, sai SĐT bị từ chối, phiên cũ mất hiệu lực, nhân viên không cấp được, tài khoản dùng ở 2 khu bị chặn |
| T2 | Nhận lời mời: nếu chủ trọ đã ghi SĐT người thuê thì SĐT nhập phải trùng. Mật khẩu mới ≥ 8 ký tự (tài khoản cũ không bị ảnh hưởng). | HIGH (xác thực) | test DB: SĐT khác bị từ chối, SĐT trùng thì nhận |
| T3 | `scripts/reset-password.ts`: anh đặt lại mật khẩu chủ trọ/nhân viên bằng tài khoản chủ bảng, thu hồi phiên. Thay cho "quên mật khẩu qua email" (chưa có dịch vụ gửi email). | MEDIUM | chạy trên DB test |
| T4 | Giới hạn đăng nhập sai (bảng `login_attempts` + RLS/miễn RLS có ghi chú) | HIGH (migration + xác thực) | **TÁCH RA, chưa làm** |
| T5 | `error.tsx`, `not-found.tsx`, `loading.tsx` toàn cục | LOW | build PASS |
| T6 | Trang `/dieu-khoan`, `/rieng-tu` (bản nháp, anh duyệt nội dung), liên kết ở landing, đăng ký, đăng nhập, link mời; kênh hỗ trợ lấy từ biến `NEXT_PUBLIC_SUPPORT_CONTACT` (ẩn nếu chưa đặt) | LOW | build PASS, trang mở được |
| T7 | `scripts/metrics.ts` chỉ đọc: % người thuê có tài khoản, % hóa đơn đã phát hành được mở, số tin chợ/khu/tuần | LOW | chạy trên DB test |
| T8 | `docs/brain/VAN_HANH.md`: kiểm sao lưu + thử khôi phục, quy trình chạy kỳ thật song song sổ; cập nhật CURRENT_STATE, DECISION_LOG, OPEN_QUESTIONS | LOW | — |

## 3. Vì sao T4 tách ra
`vercel-build` chạy `scripts/setup-db.ts` (migrate) trước `next build`. Nếu môi trường Preview của
Vercel dùng chung `DATABASE_URL` với Production, chỉ cần push nhánh có migration là DB thật bị
migrate trước khi anh duyệt PR. Trạng thái: UNKNOWN. Cần anh xác nhận Preview dùng DB nào.

## 4. Non-goals
Không đổi logic tính tiền, RLS, role, migration. Không gửi SMS/OTP/email (phát sinh chi phí).
