# KM-QLA plan v1.0 — Gói A: việc tháng của chủ trọ (tổng quan gộp, tính tiền một màn, hóa đơn ảnh, gia hạn HĐ)

Trạng thái: APPROVED (anh, 2026-10-15: "làm theo hướng tốt nhất song song", rồi "làm hoàn thiện hệ thống"). Không phải câu lệnh duyệt đúng mẫu; cổng này LOW–MEDIUM nên làm luôn, PR chờ anh duyệt. Nguồn: [KM-DT_doi-thu-app-tro-v1.0.md] mục 3 (A1–A4). Căn cứ code: main 94deaa6.
Cổng: KHÔNG migration, KHÔNG sửa src/domain, KHÔNG sửa công thức trong src/server/billing.ts và payments.ts. Chỉ đọc số và gọi lại hàm có sẵn. Nếu lúc làm phát hiện cần đổi những chỗ này thì dừng xin phép.

## 1. Mục tiêu
Chủ trọ mở app đầu tháng thấy ngay việc phải làm trên mọi cơ sở, ghi chỉ số và ra hóa đơn trên một màn, gửi hóa đơn cho khách bằng ảnh qua Zalo. Đo được: số màn phải qua để ra một hóa đơn giảm từ 4 (Chỉ số → Kỳ → Lập nháp → Phát hành) xuống 1.

## 2. Phạm vi
- **A1. Tổng quan gộp ở /quan-ly** (trên danh sách cơ sở):
  - Hàng số: đã thu / phải thu, còn nợ, quá hạn; phòng đang thuê / trống / bảo trì, % lấp đầy. Có lọc "Tất cả" hoặc từng cơ sở.
  - Khối "Cần xử lý", mỗi dòng bấm tới đúng trang: (1) cơ sở chưa mở kỳ của tháng hiện tại; (2) N phòng chưa có hóa đơn trong kỳ đang mở, kèm mã phòng; (3) N hóa đơn chưa thu đủ + tổng tiền, tách số quá hạn; (4) hợp đồng đã hết hạn và sắp hết hạn trong 30 ngày; (5) sự cố đang mở.
  - Nhân viên chỉ thấy cơ sở được giao (dùng staffScope như listProperties). Số tiền hiển thị theo đúng quyền hiện tại của trang tổng quan cơ sở, không mở rộng.
- **A2. Màn "Tính tiền" của một kỳ** (/co-so/[id]/ky/[periodId], thay bố cục hiện tại):
  - Mỗi phòng một dòng với trạng thái: thiếu chỉ số / sẵn sàng / nháp / đã phát hành / đã thu đủ.
  - Bấm phòng thì mở ô nhập số mới cạnh số cũ (ngày đọc mặc định = ngày cuối kỳ), lưu bằng recordReadings, rồi tự gọi generateDrafts(kỳ), sau đó hiện ngay tổng tiền nháp của phòng.
  - Nút "Phát hành phòng này" gọi issueInvoices([id]). Nút "Phát hành tất cả" giữ như cũ.
- **A3. Hóa đơn dạng ảnh**:
  - Route ảnh PNG dựng bằng next/og (ImageResponse) từ đúng dữ liệu PublicInvoice: các dòng, điều chỉnh, đã trả, còn phải trả, QR VietQR, mã hóa đơn và dòng "Bản mới nhất: link".
  - Hai lối vào: chủ trọ (cần đăng nhập, kiểm quyền như trang hóa đơn) và qua token chia sẻ (/hd/[token]/anh), dùng cùng quy tắc hết hạn như trang /hd.
  - Nút "Chia sẻ ảnh" dùng Web Share API kèm tệp, để chọn Zalo trên điện thoại. Máy không hỗ trợ thì tải ảnh về. Giữ nút "Sao chép để gửi Zalo" hiện có.
- **A4. Gia hạn hợp đồng**: trên trang phòng có nút +6 tháng / +12 tháng / chọn ngày, cập nhật leases.expires_on, ghi audit `lease.extend`, chỉ owner làm được. Danh sách phòng hiện "HĐ đến dd/mm/yyyy" và nhãn "sắp hết hạn" hoặc "đã hết hạn". Không tự gia hạn ngầm.

**Non-goals:** hoàn cọc (KM-COC, đặc tả riêng); chi phí cơ sở, lãi/lỗ, đối soát bill EVN (B2); nút "đã thu đủ" một chạm; ảnh CCCD; giao diện tối.

## 3. Thiết kế
- `src/server/overview.ts` (mới): `orgOverview(actor, propertyId?)`. Tách phần SQL tiền trong `dashboard()` (queries.ts) thành một hàm dùng chung nhận danh sách propertyId. Trang cơ sở và trang tổng quan gọi cùng một hàm, để số không thể lệch. "Phòng chưa có hóa đơn" = hợp đồng có ngày ở trong kỳ đang mở (cùng điều kiện lọc với generateDrafts) mà không có hóa đơn khác void.
- Phần chọn dòng "Cần xử lý" viết thành hàm thuần (`src/server/overview-items.ts`) để unit test, giống cách làm today.ts.
- A3: font Be Vietnam Pro dạng .ttf (giấy phép OFL) đặt trong repo, vì ImageResponse không dùng được next/font. QR dựng SVG bằng thư viện qrcode có sẵn, nhúng dạng data URI. Không thêm thư viện mới.
- A4: `extendLease(actor, leaseId, expiresOn)` đặt trong setup.ts. Kiểm tra: ngày mới phải sau ngày bắt đầu, hợp đồng đang active.

## 4. Task (DAG tuần tự, một nhánh, một PR, mỗi task một commit)
| ID | Phạm vi | Rủi ro | Nghiệm thu |
|---|---|---|---|
| T1 | Tách hàm tiền dùng chung + `orgOverview` + hàm chọn "Cần xử lý" | MEDIUM (đọc số tiền) | Test DB: tổng gộp = tổng các trang cơ sở trên cùng dữ liệu; nhân viên không thấy cơ sở không được giao; tổ chức B không thấy A. Unit test chọn dòng. |
| T2 | UI /quan-ly: hàng số, lọc cơ sở, khối Cần xử lý | LOW | Ảnh 390 px và 1280 px; mọi link tới đúng trang |
| T3 | Route ảnh hóa đơn (chủ trọ + token) + nút Chia sẻ/Tải | MEDIUM (đường công khai qua token) | Test: token sai/hết hạn trả 404; người không có quyền trả 404; ảnh có đủ dấu tiếng Việt và QR quét được (thử bằng app ngân hàng thật: anh làm). |
| T4 | Màn Tính tiền trong kỳ | MEDIUM (luồng hóa đơn, không đổi công thức) | Test DB: ghi chỉ số qua màn mới ra hóa đơn nháp giống hệt luồng cũ (so dòng và tổng); phòng thiếu chỉ số báo lỗi, không tạo hóa đơn. Ảnh màn hình. |
| T5 | Gia hạn HĐ + nhãn trên danh sách phòng | LOW | Test DB: chỉ owner; ghi audit; ngày sai bị chặn |
| T6 | docs/brain CURRENT_STATE + ảnh nghiệm thu vào khuminh/anh-km-qla/ | LOW | — |

Mỗi task chạy code-review + security-review + nghiệm thu trước khi sang task sau. CI phải xanh (lint, unit, test:db, check:rls, gitleaks, phungos-version).
Ước tính: 10–14 giờ công Claude, khoảng 1–2 tuần với 6 giờ/tuần của anh để duyệt và thử (ước tính).

## 5. Rủi ro
- Lớn nhất: số "chưa thu" hoặc "phòng chưa có hóa đơn" trên tổng quan lệch với trang kỳ. Chủ trọ mất niềm tin vào số tiền. Chặn bằng hàm dùng chung và test so khớp ở T1.
- Ảnh hóa đơn: chữ tiếng Việt lỗi dấu nếu font không đủ glyph; ảnh tĩnh cũ sau khi hóa đơn được điều chỉnh. Có dòng "bản mới nhất ở link" trên ảnh.
- Web Share API kèm tệp không chạy trên một số trình duyệt máy tính. Khi đó tải ảnh về thay thế.

## 6. Cần anh
`APPROVED: KM-QLA plan v1.0`. Mặc định tôi đã chọn: một PR cho cả gói và thứ tự T1→T6. Muốn đổi thì nói.
