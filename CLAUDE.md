# CLAUDE.md — KhuMình (quản lý nhà trọ / chung cư)

PHUNG_OS_VERSION: 1.0.0
Hồ sơ kinh doanh (Drive): <chưa có thư mục Project — tạo 07_KHUMINH khi cần>

@.phung-os/CLAUDE.md

## Nghiệp vụ & bất biến RIÊNG của KhuMình
- Quản lý: cơ sở (nhà trọ) → phòng (unit) → hợp đồng thuê (lease) → kỳ (period) → hóa đơn (hóa đơn điện/nước/tiền phòng) → thanh toán.
- Vai trò: chủ nhà/ban quản lý (owner) và người thuê (tenant). Người thuê đăng nhập bằng SĐT qua link mời, chỉ thấy hóa đơn của mình.
- **Tiền là quy tắc kinh tế (HIGH gate):** mọi thay đổi ở src/domain (billing, payments, money) hoặc cách tính hóa đơn/đối soát phải DỪNG xin phê duyệt trước khi sửa.

## Bất biến bảo mật (quan trọng — giữ nguyên)
- Ứng dụng kết nối DB bằng role **khuminh_app** (CHỊU RLS). Tài khoản chủ bảng **khuminh_owner** chỉ dùng để chạy migration, KHÔNG dùng cho app.
- **Mọi bảng schema public phải bật RLS** + policy trong migration. CI kiểm tự động (scripts/check-rls.ts).
- Không nới RLS/đổi phân quyền/đổi role mà chưa được phê duyệt (HIGH gate).

## Stack
- Next.js 15, Drizzle ORM + Postgres (KHÔNG dùng Supabase — không áp module supabase).
- Test: vitest (unit) + vitest test:db (cần Postgres thật).

## Nguồn chuẩn
- Schema & migration: src/db/schema.ts, drizzle/
- Trạng thái kỹ thuật: docs/brain/CURRENT_STATE.md
- Quyết định: docs/brain/DECISION_LOG.md
