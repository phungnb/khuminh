// Chuẩn bị CSDL khi triển khai (Vercel chạy trước `next build`):
// 1. Tạo/cập nhật role khuminh_app (chịu RLS) với mật khẩu APP_DB_PASSWORD.
// 2. Chạy migration bằng tài khoản chủ bảng (DATABASE_URL).
// 3. Cấp quyền cho khuminh_app trên mọi bảng hiện có.
// Chạy lại nhiều lần không sao.

import { drizzle } from "drizzle-orm/postgres-js";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import postgres from "postgres";

const url = process.env.DATABASE_URL;
const appPassword = process.env.APP_DB_PASSWORD;
if (!url) throw new Error("Thiếu DATABASE_URL (tài khoản chủ bảng)");
if (!appPassword || !/^[A-Za-z0-9]{16,}$/.test(appPassword)) {
  throw new Error("APP_DB_PASSWORD phải gồm ít nhất 16 chữ cái/số, không ký tự đặc biệt");
}

const sql = postgres(url, { max: 1, onnotice: () => {} });
const [exists] = await sql`select 1 from pg_roles where rolname = 'khuminh_app'`;
// Mật khẩu đã kiểm tra chỉ gồm chữ/số nên nối chuỗi an toàn (CREATE ROLE không nhận tham số).
if (exists) {
  await sql.unsafe(`ALTER ROLE khuminh_app WITH LOGIN PASSWORD '${appPassword}'`);
} else {
  await sql.unsafe(`CREATE ROLE khuminh_app WITH LOGIN PASSWORD '${appPassword}'`);
}

await migrate(drizzle(sql), { migrationsFolder: "drizzle" });

await sql.unsafe(`
  GRANT USAGE ON SCHEMA public TO khuminh_app;
  GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO khuminh_app;
  GRANT EXECUTE ON FUNCTION resolve_invoice_share(text) TO khuminh_app;
  GRANT EXECUTE ON FUNCTION resolve_tenant_invite(text) TO khuminh_app;
  GRANT EXECUTE ON FUNCTION resolve_staff_invite(text) TO khuminh_app;
`);
await sql.end();
console.log("CSDL sẵn sàng");
