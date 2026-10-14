// Đặt lại mật khẩu cho một tài khoản (chủ trọ/nhân viên quên mật khẩu, khi chưa có dịch vụ gửi email).
// Chạy bởi người vận hành bằng tài khoản chủ bảng, KHÔNG phải từ app:
//   DATABASE_URL=... NEW_PASSWORD=... npx tsx scripts/reset-password.ts <email|sđt>
// Mật khẩu lấy từ biến môi trường để không lưu vào lịch sử shell. Mọi phiên đăng nhập cũ bị thu hồi.

import postgres from "postgres";
import { hashPassword, MIN_PASSWORD_LENGTH, normalizePhone } from "../src/server/auth";

const url = process.env.DATABASE_URL;
const login = process.argv[2]?.trim();
const password = process.env.NEW_PASSWORD ?? "";
if (!url) throw new Error("Thiếu DATABASE_URL (tài khoản chủ bảng)");
if (!login) throw new Error("Cách dùng: NEW_PASSWORD=... npx tsx scripts/reset-password.ts <email|sđt>");
if (password.length < MIN_PASSWORD_LENGTH) throw new Error(`NEW_PASSWORD cần ít nhất ${MIN_PASSWORD_LENGTH} ký tự`);

const phone = login.includes("@") ? null : normalizePhone(login);
if (!login.includes("@") && !phone) throw new Error("Số điện thoại không hợp lệ");

const sql = postgres(url, { max: 1, onnotice: () => {} });
try {
  const hash = await hashPassword(password);
  const done = await sql.begin(async (tx) => {
    const rows = phone
      ? await tx`update users set password_hash = ${hash} where phone = ${phone} returning id`
      : await tx`update users set password_hash = ${hash} where email = ${login.toLowerCase()} returning id`;
    if (rows.length !== 1) return null;
    const revoked = await tx`delete from sessions where user_id = ${rows[0]!.id} returning id`;
    return { revoked: revoked.length };
  });
  if (!done) {
    console.error("Không tìm thấy tài khoản");
    process.exitCode = 1;
  } else {
    console.log(`Đã đặt lại mật khẩu, thu hồi ${done.revoked} phiên đăng nhập`);
  }
} finally {
  await sql.end();
}
