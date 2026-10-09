# KhuMình

Quản lý nhà trọ (miễn phí cho khu nhỏ) làm cửa vào cho ứng dụng tiện ích khu dân cư.
Đặc tả và phản biện: thư mục `khuminh/` trong project SOFTWARE STUDIO.

## Đã có (mốc 1)

- Chủ trọ đăng ký/đăng nhập (email + mật khẩu), nhiều cơ sở trong một tài khoản.
- Phòng: thêm hàng loạt (dán từ Excel), báo lỗi theo dòng, chặn trùng mã.
- Hợp đồng: người thuê, giá thuê có lịch sử, cọc, số người, số xe; chặn hai hợp đồng chồng thời gian trên một phòng.
- Chỉ số điện/nước: nhập trên điện thoại, xem lượng dùng ngay, cảnh báo chỉ số giảm, lưu tạm khi mất mạng.
- Biểu phí: cố định, theo người, theo số lượng, theo chỉ số (có bậc thang); đổi giá giữ lịch sử.
- Hóa đơn: lập nháp, chia theo ngày khi vào/ra giữa kỳ, làm tròn minh bạch, phát hành, điều chỉnh có lý do, hủy.
- Thanh toán: ghi nhận thủ công, trả một phần/trả thừa (tự trừ kỳ sau), chống ghi trùng, hủy có lý do.
- Link hóa đơn cho người thuê: không cần đăng nhập, mã QR chuyển khoản đúng số tiền và nội dung (VietQR), hết hạn 60 ngày.
- Tổng quan: phải thu, đã thu, còn nợ, quá hạn, phòng trống, hợp đồng sắp hết hạn.
- Nhật ký thao tác cho mọi thay đổi tiền và hợp đồng.

## Chưa có

- Tài khoản người thuê (Google/Zalo/OTP), PWA, thông báo đẩy, bảng tin khu trọ (bảng `posts` đã có trong lược đồ).
- Tài khoản nhân viên (quyền đã có ở tầng nghiệp vụ, chưa có màn mời).
- Xuất Excel, nhập phòng từ file .xlsx (hiện dán text).
- Sao lưu tự động: dùng tính năng backup của nhà cung cấp Postgres.

## Kiến trúc

- Next.js 15 (App Router, server actions), TypeScript, Tailwind 4.
- Postgres 16 + Drizzle ORM. Tiền là số nguyên đồng (`bigint`), chỉ số đồng hồ là số nguyên phần trăm đơn vị.
- `src/domain/`: hàm thuần (tính hóa đơn, phân bổ thanh toán, VietQR). Không chạm DB.
- `src/server/`: nghiệp vụ trên DB, kiểm tra quyền, ghi nhật ký.
- `src/app/`: giao diện.

### Cô lập dữ liệu giữa chủ trọ

Mọi bảng nghiệp vụ có `org_id` và bật Row Level Security (`drizzle/0001_rls.sql`).
Ứng dụng kết nối bằng role `khuminh_app` (không phải chủ bảng) và chỉ truy cập qua `withOrg()`,
hàm này đặt `app.org_id` trong giao dịch. Thiếu `app.org_id` thì không thấy dòng nào.
Kiểm thử `src/server/flow.db.test.ts` chứng minh chủ trọ B không đọc/sửa/chèn được dữ liệu của A.

## Chạy trên máy

```bash
npm install
# Postgres: tạo role chủ bảng và database, rồi role ứng dụng
psql -U postgres -c "CREATE ROLE khuminh_owner LOGIN PASSWORD 'owner'"
psql -U postgres -f scripts/create-app-role.sql
psql -U postgres -c "CREATE DATABASE khuminh OWNER khuminh_owner"
cp .env.example .env.local   # sửa mật khẩu
DATABASE_URL=... npm run db:migrate
npm run dev
```

## Đưa lên mạng (Vercel + Neon)

1. Neon (https://neon.tech): tạo project, vùng Singapore. Vào Connection details, chọn bật **Pooled connection**, sao chép chuỗi kết nối.
2. Vercel (https://vercel.com): Add New → Project → Import repo `khuminh`.
3. Trước khi bấm Deploy, thêm Environment Variables:
   - `DATABASE_URL` = chuỗi kết nối Neon ở bước 1
   - `APP_DB_PASSWORD` = chuỗi ngẫu nhiên ít nhất 16 chữ cái/số (không ký tự đặc biệt)
4. Deploy. Lệnh `vercel-build` tự tạo role `khuminh_app`, chạy migration, rồi build.
5. Sau khi có tên miền, thêm `APP_URL` = `https://<tên>.vercel.app` và Redeploy để link hóa đơn dùng đúng địa chỉ.

Mỗi lần đẩy code lên nhánh khác `main`, Vercel tạo một link xem trước riêng; nhánh `main` là bản chính.

## Kiểm thử

```bash
npm test          # hàm thuần
npm run test:db   # cần Postgres; biến TEST_DATABASE_ADMIN_URL (mặc định postgres://postgres@localhost:5433/postgres)
npm run lint      # kiểm tra kiểu
```
