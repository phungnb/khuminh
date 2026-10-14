// Cấp/thu quyền admin nền tảng. Chạy bằng DATABASE_URL của CHỦ BẢNG (khuminh_owner), không phải app.
//   npx tsx scripts/grant-admin.ts <email>            cấp quyền
//   npx tsx scripts/grant-admin.ts <email> --remove   thu quyền
import postgres from "postgres";

const url = process.env.DATABASE_URL;
if (!url) throw new Error("Thiếu DATABASE_URL (role chủ bảng)");
const [email, flag] = process.argv.slice(2);
if (!email) throw new Error("Cần email tài khoản: npx tsx scripts/grant-admin.ts <email> [--remove]");

const sql = postgres(url, { max: 1, onnotice: () => {} });
const [u] = await sql<{ id: string }[]>`select id from users where lower(email) = ${email.trim().toLowerCase()}`;
if (!u) {
  await sql.end();
  throw new Error(`Không có tài khoản email ${email}`);
}
if (flag === "--remove") {
  await sql`delete from platform_admins where user_id = ${u.id}`;
  console.log(`Đã thu quyền admin của ${email}`);
} else {
  await sql`insert into platform_admins (user_id) values (${u.id}) on conflict do nothing`;
  console.log(`Đã cấp quyền admin cho ${email}`);
}
await sql.end();
