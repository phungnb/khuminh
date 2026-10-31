# KhuMình

Chợ tiện ích quanh nhà: cư dân khu phố, phường, xã mua bán, cho tặng, tìm dịch vụ với hàng xóm
trong bán kính 1–20 km. **Quản lý nhà trọ là một module** (miễn phí cho khu nhỏ), để kéo người
dùng từ các dãy trọ, chung cư: người thuê có sẵn tài khoản và vào chợ quanh khu của mình.
Đặc tả gốc và kế hoạch: thư mục `khuminh/` trong project KhuMình (`dac-ta-goc/`, `KM-CHO_plan-v2.0.md`).

## Công nghệ

- **Next.js 15** (App Router, server actions) + **TypeScript** + **Tailwind 4** — giao diện.
- **Postgres 16** + **Drizzle ORM** (driver `postgres`) — CSDL; local dùng Postgres, deploy dùng Neon (vùng Singapore).
- **Vercel** — hosting (region `sin1` Singapore, gần DB Neon; xem `vercel.json`).
- **Web Push** (khóa VAPID) — thông báo đẩy cho app người thuê.
- **Vitest** — kiểm thử unit; kiểm thử DB và kiểm RLS chạy trên Postgres thật.
- Đăng nhập chống brute-force: giới hạn 5 lần sai / 1 phút / (IP, tài khoản) — xem `src/server/rate-limit.ts`.

## Chợ quanh đây (giai đoạn 1)

- Mở cho người đã có tài khoản: người thuê (qua link mời), chủ trọ, nhân viên. Đăng ký công khai bằng SĐT là giai đoạn 2.
- Vị trí lấy theo tọa độ cơ sở (chủ trọ đặt trong Cài đặt), tin đăng làm mờ ~500 m, chưa xin GPS.
- Tin: cần bán, cần mua, cho tặng, dịch vụ; lọc bán kính 1/3/10/20 km (mặc định 3 km).
- "Tôi quan tâm" → người đăng đồng ý thì hai bên thấy SĐT/Zalo của nhau. Không thanh toán trong app.
- 3 người báo cáo thì tin tự ẩn.
- RLS theo người dùng (`app.user_id`), không theo tổ chức: `drizzle/0007_market_rls.sql`.

## Module quản lý trọ

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
- App người thuê (PWA, cài ra màn hình chính): vào bằng link mời của chủ trọ, đăng nhập bằng số điện thoại, xem hóa đơn và mã QR, một tài khoản cho nhiều nơi thuê.
- Bảng tin khu trọ: chủ trọ/nhân viên đăng thông báo, người thuê đăng cần bán, cho tặng, cần tìm; chủ trọ ẩn tin.
- Thông báo đẩy khi phát hành hóa đơn và khi chủ trọ đăng thông báo (cần khóa VAPID).
- Nhân viên: mời bằng link theo cơ sở; chỉ thấy cơ sở được giao; không phát hành, điều chỉnh, hủy hóa đơn.
- Xuất Excel hóa đơn từng kỳ (tổng hợp và chi tiết từng khoản).

## Chưa có

- Đăng nhập Zalo/OTP, quên mật khẩu (hiện chủ trọ tạo link mời mới).
- Bình luận dưới tin, báo hỏng hóc.
- Gói trả phí trên 15 phòng (chưa có cổng thanh toán).
- Bọc Capacitor lên App Store / CH Play.
- Nhập phòng từ file .xlsx (hiện dán text).
- Sao lưu tự động: dùng tính năng backup của nhà cung cấp Postgres.

## Kiến trúc

- `src/domain/`: hàm thuần (tính hóa đơn, phân bổ thanh toán, VietQR). Không chạm DB.
  Tiền là số nguyên đồng (`bigint`), chỉ số đồng hồ là số nguyên phần trăm đơn vị.
- `src/server/`: nghiệp vụ trên DB, kiểm tra quyền, ghi nhật ký.
- `src/app/`: giao diện.

### Cô lập dữ liệu giữa chủ trọ

Mọi bảng nghiệp vụ có `org_id` và bật Row Level Security (`drizzle/0001_rls.sql`).
Ứng dụng kết nối bằng role `khuminh_app` (không phải chủ bảng) và chỉ truy cập qua `withOrg()`,
hàm này đặt `app.org_id` trong giao dịch. Thiếu `app.org_id` thì không thấy dòng nào.
Kiểm thử `src/server/flow.db.test.ts` chứng minh chủ trọ B không đọc/sửa/chèn được dữ liệu của A.

## Chạy trên máy

Biến môi trường (copy `.env.example` thành `.env.local` rồi điền):

| Biến | Bắt buộc | Ý nghĩa |
|---|---|---|
| `DATABASE_URL` | có | Connection string của **tài khoản chủ bảng** (local: role postgres/khuminh_owner; Neon: owner). **Chỉ dùng khi chạy migration** (`npm run db:setup`, `db:migrate`, CI) — app không bao giờ dùng để phục vụ request. |
| `DATABASE_URL_APP` | có* | Connection string của role `khuminh_app` (chịu RLS) — app dùng để phục vụ request. *Được bỏ trống nếu có `APP_DB_PASSWORD`: app tự ghép từ `DATABASE_URL`. |
| `APP_DB_PASSWORD` | có* | Mật khẩu của role `khuminh_app` (ít nhất 16 chữ cái/số, không ký tự đặc biệt). Dùng khi tạo role (`db:setup`) và khi app tự ghép `DATABASE_URL_APP`. |
| `APP_URL` | có | Địa chỉ công khai, để tạo link hóa đơn gửi người thuê. |
| `VAPID_PUBLIC_KEY` | không | Thông báo đẩy cho app người thuê. Tạo bằng `npx web-push generate-vapid-keys`. |
| `VAPID_PRIVATE_KEY` | không | (cùng bộ với trên) Thiếu thì app vẫn chạy, chỉ không có nút bật thông báo. |
| `VAPID_SUBJECT` | không | (cùng bộ với trên, dạng `mailto:email-của-bạn`) |
| `NEXT_PUBLIC_SUPPORT_CONTACT` | không | Kênh hỗ trợ hiện ở chân trang, điều khoản, riêng tư (Zalo/SĐT/email). Bỏ trống thì ẩn. |

```bash
npm install
# Postgres: tạo role chủ bảng và database
psql -U postgres -c "CREATE ROLE khuminh_owner LOGIN PASSWORD 'owner'"
psql -U postgres -c "CREATE DATABASE khuminh OWNER khuminh_owner"
cp .env.example .env.local   # điền DATABASE_URL (của chủ bảng), APP_DB_PASSWORD, APP_URL...
# Tạo role khuminh_app + chạy migration + cấp quyền (dùng DATABASE_URL của CHỦ BẢNG, không phải app role):
npm run db:setup
npm run dev
```

Lưu ý phân biệt: **migration luôn chạy bằng tài khoản chủ bảng** (`DATABASE_URL`);
app khi chạy chỉ dùng role `khuminh_app` (`DATABASE_URL_APP`, chịu RLS).

## Đưa lên mạng (Vercel + Neon)

1. Neon (https://neon.tech): tạo project, vùng Singapore. Vào Connection details, chọn bật **Pooled connection**, sao chép chuỗi kết nối.
2. Vercel (https://vercel.com): Add New → Project → Import repo `khuminh`.
3. Trước khi bấm Deploy, thêm Environment Variables:
   - `DATABASE_URL` = chuỗi kết nối Neon ở bước 1
   - `APP_DB_PASSWORD` = chuỗi ngẫu nhiên ít nhất 16 chữ cái/số (không ký tự đặc biệt)
4. Deploy. Lệnh `vercel-build` chỉ chạy `next build` (không chạm DB). Migration (tạo role
   `khuminh_app`, chạy drizzle migrate, cấp quyền) chạy tự động qua GitHub Actions
   (workflow `.github/workflows/migrate.yml`) mỗi khi merge vào `main` — cần thêm 2 secret
   vào repo (Settings → Secrets and variables → Actions): `DATABASE_URL_OWNER`
   (connection string của **tài khoản chủ bảng** Neon) và `APP_DB_PASSWORD`.
5. Sau khi có tên miền, thêm `APP_URL` = `https://<tên>.vercel.app` và Redeploy để link hóa đơn dùng đúng địa chỉ.
6. Thông báo đẩy (tùy chọn): chạy `npx web-push generate-vapid-keys` trên máy, thêm `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `VAPID_SUBJECT` (`mailto:email-của-bạn`) rồi Redeploy. Thiếu khóa thì app vẫn chạy, chỉ không có nút bật thông báo.

Mỗi lần đẩy code lên nhánh khác `main`, Vercel tạo một link xem trước riêng; nhánh `main` là bản chính.

## Kiểm thử

```bash
npm test          # hàm thuần
npm run test:db   # cần Postgres; biến TEST_DATABASE_ADMIN_URL (mặc định postgres://postgres@localhost:5433/postgres)
npm run lint      # kiểm tra kiểu
```
