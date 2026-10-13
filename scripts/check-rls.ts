// Kiểm bảo mật: mọi bảng schema public phải bật RLS, TRỪ các bảng auth được miễn
// có chủ đích. Chạy trong CI sau khi migrate. Dùng DATABASE_URL (tài khoản chủ bảng).
// Thoát 1 nếu có bảng (ngoài danh sách miễn) chưa bật RLS.
//
// Vì sao có danh sách miễn: đăng nhập tra `users` theo email/điện thoại và tra `sessions`
// theo token hash diễn ra TRƯỚC khi có ngữ cảnh tổ chức, nên RLS theo org_id không áp
// được cho chính luồng login. Quyết định này đã ghi chú trong drizzle/0001_rls.sql.
// Bảo vệ hai bảng này nằm ở tầng truy vấn (lọc đúng email/token + so khớp mật khẩu),
// không phải RLS. Thêm bảng mới vào đây PHẢI kèm lý do và cập nhật docs/brain/DECISION_LOG.md.
import postgres from "postgres";

const RLS_EXEMPT = new Set<string>(["users", "sessions"]);

const url = process.env.DATABASE_URL;
if (!url) throw new Error("Thiếu DATABASE_URL");
const sql = postgres(url, { max: 1, onnotice: () => {} });

const noRls = await sql<{ relname: string }[]>`
  select c.relname
  from pg_class c
  join pg_namespace n on n.oid = c.relnamespace
  where n.nspname = 'public' and c.relkind = 'r' and c.relrowsecurity = false
  order by c.relname
`;
await sql.end();

const offenders = noRls.map((r) => r.relname).filter((t) => !RLS_EXEMPT.has(t));
const exempted = noRls.map((r) => r.relname).filter((t) => RLS_EXEMPT.has(t));

if (exempted.length) {
  console.log("RLS miễn có chủ đích (xem 0001_rls.sql): " + exempted.join(", "));
}
if (offenders.length) {
  console.error("Bảng public CHƯA bật RLS (ngoài danh sách miễn): " + offenders.join(", "));
  process.exit(1);
}
console.log("RLS: mọi bảng public (ngoài danh sách miễn) đã bật.");
