# DESIGN — KM-HUB-A

## Điều hướng mới (route giữ nguyên, chỉ đổi lối vào)

| Route | Trước | Sau |
|---|---|---|
| `/` | Yêu cầu đăng nhập, rồi redirect sang `/co-so/<đầu tiên>` | Landing công khai. Nếu đã đăng nhập thì redirect sang `/app`. |
| login (`auth-actions.loginAction`) | Trả về `/` | Trả về `/app` |
| signup chủ trọ | Trả về `/co-so/moi` | Giữ nguyên (chủ trọ mới cần tạo cơ sở) |
| `/app` | Hóa đơn người thuê. Người chưa có phòng thấy câu "chưa gắn phòng" | Hub cư dân: khu của tôi, bảng tin mới, việc cần trả, Quản lý khu |
| `/app/hoa-don` (mới) | Không có | Danh sách hóa đơn người thuê, chuyển từ `/app` cũ sang (giữ nguyên logic hiển thị) |
| `/quan-ly` (mới) | Không có | Danh sách cơ sở dạng thẻ CLB và nút tạo cơ sở. Cần `requireActor` |
| `/co-so/[id]/*` | Module | Giữ nguyên. Header thêm "Quản lý khu" và nút "Về khu của tôi" |
| `requireActor` khi không phải người quản lý | Redirect sang `/app` | Giữ nguyên |

## Dữ liệu (chỉ đọc qua các hàm có sẵn, không viết query mới chạm tiền)
- `tenantHome(userId)` lấy khu đang ở, phòng và hóa đơn.
- `actorFor(userId)` cho biết người dùng có quản lý khu nào không.
- `listProperties(actor)` lấy danh sách cơ sở được quản lý.
- `listPosts(tenantBoardViewer|managerBoardViewer)` lấy 3 tin mới nhất cho hub.
- "Tường CLB" dùng `wallBackground(id)` có sẵn.

Không thêm hàm server mới, không thêm bảng, không có câu SQL mới. Mọi quyền vẫn đi qua `withOrg` và RLS như hiện tại.

## Bảo mật
- Nút "Quản lý" chỉ là lối vào trên giao diện. Quyền thật vẫn do `requireActor` và RLS chặn ở từng trang `/co-so` và `/quan-ly`.
- Landing `/` công khai không đọc dữ liệu nào.
