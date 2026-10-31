// Chuẩn bị CSDL sau khi merge vào main (KHÔNG còn chạy trong `vercel-build`):
// 1. Tạo/cập nhật role khuminh_app (chịu RLS) với mật khẩu APP_DB_PASSWORD.
// 2. Chạy migration bằng tài khoản chủ bảng (DATABASE_URL).
// 3. Cấp quyền cho khuminh_app trên mọi bảng hiện có.
// Chạy lại nhiều lần không sao.
//
// Chạy bằng: `npm run db:migrate:ci` (GitHub Actions, workflow migrate.yml, sau
// khi merge vào main) hoặc `npm run db:setup` trên máy. Trên Vercel Preview
// (mỗi nhánh/PR) KHÔNG chạy bước này: chưa xác minh được Preview dùng DB riêng,
// nên một nhánh có migration chưa duyệt không được phép chạm DB.

import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { drizzle } from "drizzle-orm/postgres-js";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import postgres from "postgres";

if (process.env.VERCEL_ENV === "preview") {
  console.log("Bỏ qua setup-db trên Vercel Preview (không migrate DB từ nhánh chưa duyệt)");
  process.exit(0);
}

const url = process.env.DATABASE_URL;
const appPassword = process.env.APP_DB_PASSWORD;
if (!url) throw new Error("Thiếu DATABASE_URL (tài khoản chủ bảng)");
if (!appPassword || !/^[A-Za-z0-9]{16,}$/.test(appPassword)) {
  throw new Error("APP_DB_PASSWORD phải gồm ít nhất 16 chữ cái/số, không ký tự đặc biệt");
}

/**
 * Escape giá trị thành SQL string literal đúng chuẩn PostgreSQL (dấu nháy đơn
 * nhân đôi). Đây là lớp phòng vệ thứ hai sau regex /^[A-Za-z0-9]{16,}$/ ở trên:
 * kể cả khi regex bị nới lỏng trong tương lai, câu lệnh vẫn không thể vỡ.
 */
function escapeSqlLiteral(value: string): string {
  return `'${value.replace(/'/g, "''")}'`;
}

/**
 * Chạy câu lệnh DDL dựng động. PostgreSQL không cho bind parameter trong DDL
 * (CREATE/ALTER ROLE...), nên sau khi escape kỹ, câu lệnh được thực thi qua
 * driver ở chế độ raw SQL qua file (simple protocol) — mọi SQL động trong file
 * này đều đi qua đúng một điểm đã kiểm soát, không còn chỗ nào nối chuỗi rồi
 * bắn thẳng vào driver. File tạm mode 600, xoá ngay sau khi chạy xong
 * (kể cả khi lỗi).
 */
async function runDynamicDdl(statement: string): Promise<void> {
  const dir = await mkdtemp(join(tmpdir(), "khuminh-ddl-"));
  const path = join(dir, "stmt.sql");
  try {
    await writeFile(path, statement, { mode: 0o600 });
    await sql.file(path);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

const sql = postgres(url, { max: 1, onnotice: () => {} });
const [exists] = await sql`select 1 from pg_roles where rolname = 'khuminh_app'`;
const passwordLiteral = escapeSqlLiteral(appPassword);
await runDynamicDdl(
  exists
    ? `ALTER ROLE khuminh_app WITH LOGIN PASSWORD ${passwordLiteral}`
    : `CREATE ROLE khuminh_app WITH LOGIN PASSWORD ${passwordLiteral}`,
);

await migrate(drizzle(sql), { migrationsFolder: "drizzle" });

// Mỗi GRANT/REVOKE là một câu lệnh riêng, chạy qua simple protocol
// (`.simple()`). Không gộp nhiều câu lệnh trong một lần gọi như trước.
await sql`GRANT USAGE ON SCHEMA public TO khuminh_app`.simple();
await sql`GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO khuminh_app`.simple();
await sql`GRANT EXECUTE ON FUNCTION resolve_invoice_share(text) TO khuminh_app`.simple();
await sql`GRANT EXECUTE ON FUNCTION resolve_tenant_invite(text) TO khuminh_app`.simple();
await sql`GRANT EXECUTE ON FUNCTION resolve_staff_invite(text) TO khuminh_app`.simple();
await sql`GRANT EXECUTE ON FUNCTION is_platform_admin(), admin_stats(), admin_reported_listings(int) TO khuminh_app`.simple();
await sql`GRANT EXECUTE ON FUNCTION admin_set_listing_hidden(uuid, boolean, text), admin_set_user_locked(uuid, boolean, text), admin_recent_actions(int) TO khuminh_app`.simple();
// Danh sách admin: app không được chạm (lệnh GRANT ALL TABLES ở trên vô tình cấp lại). RLS không policy vẫn chặn thêm một lớp.
await sql`REVOKE ALL ON platform_admins, admin_actions FROM khuminh_app`.simple();
await sql.end();
console.log("CSDL sẵn sàng");
