// Kiểm bảo mật: mọi bảng schema public phải bật RLS. Chạy trong CI sau khi migrate.
// Dùng DATABASE_URL (tài khoản chủ bảng). Thoát 1 nếu có bảng chưa bật RLS.
import postgres from "postgres";

const url = process.env.DATABASE_URL;
if (!url) throw new Error("Thiếu DATABASE_URL");
const sql = postgres(url, { max: 1, onnotice: () => {} });

const bad = await sql<{ relname: string }[]>`
  select c.relname
  from pg_class c
  join pg_namespace n on n.oid = c.relnamespace
  where n.nspname = 'public' and c.relkind = 'r' and c.relrowsecurity = false
  order by c.relname
`;
await sql.end();

if (bad.length) {
  console.error("Bảng public CHƯA bật RLS: " + bad.map((r) => r.relname).join(", "));
  process.exit(1);
}
console.log("RLS: mọi bảng public đã bật.");
