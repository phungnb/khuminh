# TASKS — KM-HUB-A (DAG, chạy tuần tự)

| ID | Phạm vi | File | Phụ thuộc | Rủi ro | Nghiệm thu |
|---|---|---|---|---|---|
| T1 | Tách danh sách hóa đơn người thuê từ `/app` sang `/app/hoa-don` (logic giữ nguyên) | src/app/app/page.tsx, src/app/app/hoa-don/page.tsx (mới) | — | LOW | Người thuê vào /app/hoa-don thấy đúng các hóa đơn và số tiền như /app cũ |
| T2 | Hub cư dân `/app`: thẻ khu (tường CLB), 3 tin bảng tin mới, thẻ "cần thanh toán" (dùng lại phép cộng đang có), thẻ "Quản lý khu" nếu là người quản lý; trạng thái rỗng thân thiện | src/app/app/page.tsx | T1 | MEDIUM | Có 4 vai đều không lỗi: người thuê, chủ trọ, nhân viên, người chưa gắn phòng. Thẻ Quản lý chỉ hiện với chủ trọ và nhân viên |
| T3 | Thanh điều hướng hub: Trang chủ, Bảng tin, Hóa đơn, Quản lý (có điều kiện) | src/app/app/layout.tsx | T2 | LOW | Tab Quản lý chỉ hiện với người quản lý |
| T4 | `/quan-ly`: danh sách cơ sở dạng thẻ CLB và nút tạo cơ sở. Header module có "Quản lý khu" và nút "Về khu của tôi" | src/app/quan-ly/page.tsx (mới), src/app/co-so/[id]/layout.tsx | — | LOW | Người thuê mở /quan-ly bị chuyển về /app. Chủ trọ thấy đủ các cơ sở của mình |
| T5 | Landing `/` công khai. Sau login thì vào `/app`. Đổi chữ trên trang đăng nhập và đăng ký, metadata "Tiện ích khu dân cư" | src/app/page.tsx, src/app/auth-actions.ts (chỉ đổi đích redirect), src/app/layout.tsx, src/app/dang-nhap, src/app/dang-ky | T2, T4 | MEDIUM (chạm file auth, nhưng chỉ đổi đường dẫn, không đổi logic xác thực) | Chưa đăng nhập: thấy landing. Đã đăng nhập: vào /app. Đăng nhập/đăng ký vẫn chạy |
| T6 | Sửa README, docs/brain/CURRENT_STATE và DECISION_LOG cho đúng trục sản phẩm | README.md, docs/brain/* | T5 | LOW | Không còn mô tả "app quản lý nhà trọ" làm sản phẩm chính |

Không có task HIGH. Nếu lúc thực thi phát hiện cần đổi query, auth, RLS hoặc logic tiền thì dừng lại và xin duyệt.
