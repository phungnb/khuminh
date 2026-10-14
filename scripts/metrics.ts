// Chỉ số dùng thật cho từng cơ sở (chỉ đọc). Dùng để quyết có mở rộng hay không:
// - người thuê đang ở đã có tài khoản app (ngưỡng ≥ 40%);
// - hóa đơn đã phát hành được mở qua link chia sẻ (xem trong app người thuê chưa được đếm);
// - tin chợ mỗi tuần quanh khu (ngưỡng ≥ 1 tin/khu/tuần), đếm theo người đăng thuộc cơ sở;
// - yêu cầu sửa chữa người thuê gửi trong khoảng đo, và số còn mở (chưa xong/từ chối).
//   DATABASE_URL=... npx tsx scripts/metrics.ts [số tuần, mặc định 4]
// Chạy bằng tài khoản chủ bảng trong giao dịch READ ONLY: không ghi gì.

import postgres from "postgres";

const url = process.env.DATABASE_URL;
if (!url) throw new Error("Thiếu DATABASE_URL (tài khoản chủ bảng)");
const weeks = Math.max(1, Number(process.argv[2] ?? 4) || 4);

const sql = postgres(url, { max: 1, onnotice: () => {} });
try {
  const rows = await sql.begin("read only", (tx) => tx`
    with active as (
      select u.property_id, t.id as tenant_id, t.user_id
      from leases l
      join units u on u.id = l.unit_id
      join tenants t on t.id = l.tenant_id
      where l.status = 'active' and (l.moved_out_on is null or l.moved_out_on >= current_date)
    ),
    tenant_stats as (
      select property_id, count(*)::int as tenants, count(user_id)::int as with_account
      from active group by property_id
    ),
    invoice_stats as (
      select i.property_id,
             count(*)::int as issued,
             count(*) filter (where exists (
               select 1 from invoice_share_tokens s where s.invoice_id = i.id and s.open_count > 0
             ))::int as opened_link
      from invoices i
      where i.status = 'issued' and i.issued_at >= now() - make_interval(weeks => ${weeks})
      group by i.property_id
    ),
    residents as (
      select property_id, user_id from active where user_id is not null
      union
      select ps.property_id, ps.user_id from property_staff ps
      union
      select p.id, m.user_id from properties p join memberships m on m.org_id = p.org_id and m.role = 'owner'
    ),
    listing_stats as (
      select r.property_id, count(distinct li.id)::int as listings,
             count(distinct li.id) filter (where exists (select 1 from listing_interests x where x.listing_id = li.id))::int as with_interest
      from residents r
      join listings li on li.author_user_id = r.user_id
      where li.created_at >= now() - make_interval(weeks => ${weeks})
      group by r.property_id
    ),
    maintenance_stats as (
      select property_id,
             count(*) filter (where created_at >= now() - make_interval(weeks => ${weeks}))::int as reported,
             count(*) filter (where status in ('open', 'in_progress'))::int as still_open
      from maintenance_requests group by property_id
    )
    select p.name,
           coalesce(ts.tenants, 0) as tenants, coalesce(ts.with_account, 0) as with_account,
           coalesce(iv.issued, 0) as issued, coalesce(iv.opened_link, 0) as opened_link,
           coalesce(ls.listings, 0) as listings, coalesce(ls.with_interest, 0) as with_interest,
           coalesce(ms.reported, 0) as reported, coalesce(ms.still_open, 0) as still_open
    from properties p
    left join tenant_stats ts on ts.property_id = p.id
    left join invoice_stats iv on iv.property_id = p.id
    left join listing_stats ls on ls.property_id = p.id
    left join maintenance_stats ms on ms.property_id = p.id
    where p.archived_at is null
    order by p.name
  `);
  const pct = (a: number, b: number) => (b ? `${Math.round((a * 100) / b)}%` : "—");
  console.log(`Chỉ số ${weeks} tuần gần nhất (hóa đơn và tin chợ tính trong khoảng này)`);
  console.table(
    rows.map((r) => ({
      "Cơ sở": r.name,
      "Người thuê có TK": `${r.with_account}/${r.tenants} (${pct(r.with_account, r.tenants)})`,
      "HĐ mở qua link": `${r.opened_link}/${r.issued} (${pct(r.opened_link, r.issued)})`,
      "Tin chợ/tuần": (r.listings / weeks).toFixed(1),
      "Tin có quan tâm": `${r.with_interest}/${r.listings} (${pct(r.with_interest, r.listings)})`,
      "Sự cố báo (đang mở)": `${r.reported} (${r.still_open})`,
    })),
  );
} finally {
  await sql.end();
}
