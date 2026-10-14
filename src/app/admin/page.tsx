import Link from "next/link";
import { notFound } from "next/navigation";
import { EmptyState, Flash, Logo, Stat } from "@/components/ui";
import { ago } from "@/components/listing-card";
import { requireUser } from "@/lib/session";
import { adminStats, isPlatformAdmin, recentAdminActions, reportedListings, type AdminAction } from "@/server/admin";
import { setListingHiddenAction, setUserLockedAction } from "./actions";
import { Flag } from "lucide-react";

export const dynamic = "force-dynamic";

// Trang admin nền tảng (KM-HN2 T6): số tổng và tin bị báo cáo. Người không phải admin gặp 404.
const ACTION_LABEL: Record<AdminAction["action"], string> = {
  "listing.hide": "Ẩn tin",
  "listing.unhide": "Hiện lại tin",
  "user.lock": "Khóa tài khoản",
  "user.unlock": "Mở khóa tài khoản",
};

export default async function Page({ searchParams }: { searchParams: Promise<{ loi?: string; ok?: string }> }) {
  const user = await requireUser();
  if (!(await isPlatformAdmin(user.id))) notFound();
  const [st, reported, log] = await Promise.all([adminStats(user.id), reportedListings(user.id), recentAdminActions(user.id, 20)]);
  const n = (v: number) => v.toLocaleString("vi-VN");

  return (
    <div>
      <header className="sticky top-0 z-40 border-b border-border bg-bg/85 backdrop-blur-md">
        <div className="mx-auto flex max-w-5xl items-center justify-between gap-2 px-4 py-3">
          <div className="flex items-center gap-2">
            <Link href="/app" aria-label="KhuMình — Hôm nay"><Logo /></Link>
            <span className="text-fg-subtle">/</span>
            <span className="font-semibold">Admin</span>
          </div>
          <Link href="/app" className="text-sm font-medium text-brand-ink">Về app</Link>
        </div>
      </header>
      <main className="mx-auto max-w-5xl px-4 py-6">
        <h1 className="mb-4 text-xl font-bold">Toàn nền tảng</h1>
        <Flash params={await searchParams} />
        <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
          <Stat label="Tổ chức (chủ trọ)" value={n(st.orgs)} />
          <Stat label="Khu đang hoạt động" value={n(st.properties)} />
          <Stat label="Phòng" value={n(st.units)} />
          <Stat label="Hợp đồng đang thuê" value={n(st.activeLeases)} />
          <Stat label="Người dùng" value={n(st.users)} />
          <Stat label="Tin đang mở" value={n(st.openListings)} />
          <Stat label="Tin bị ẩn" value={n(st.hiddenListings)} tone={st.hiddenListings > 0 ? "warn" : undefined} />
          <Stat label="Sự cố chưa xong" value={n(st.openIncidents)} tone={st.openIncidents > 0 ? "warn" : undefined} />
        </div>

        <h2 className="mt-8 mb-2 text-lg font-semibold">Tin bị báo cáo</h2>
        {reported.length === 0 ? (
          <EmptyState icon={Flag} title="Chưa có tin nào bị báo cáo" description="Tin có người báo cáo sẽ hiện ở đây, nhiều báo cáo nhất trước." />
        ) : (
          <ul className="space-y-2">
            {reported.map((r) => (
              <li key={r.listingId} className="card">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="truncate font-semibold">{r.title}</p>
                    <p className="text-xs text-fg-subtle">
                      {r.authorName} · gần {r.areaLabel} · đăng {ago(r.createdAt)}
                    </p>
                  </div>
                  <span className={`shrink-0 text-sm font-semibold ${r.hiddenAt ? "text-danger" : "text-warning"}`}>
                    {r.reports} báo cáo{r.hiddenAt ? " · đã ẩn" : r.status === "closed" ? " · đã đóng" : ""}
                  </span>
                </div>
                <p className="mt-2 text-sm text-fg-muted">{r.reasons.slice(0, 3).join(" · ")}</p>
                <div className="mt-3 grid gap-2 sm:grid-cols-2">
                  <form action={setListingHiddenAction} className="flex gap-2">
                    <input type="hidden" name="listingId" value={r.listingId} />
                    <input type="hidden" name="hidden" value={r.hiddenAt ? "0" : "1"} />
                    {r.hiddenAt ? null : <input className="input h-10 min-w-0 flex-1 text-sm" name="reason" placeholder="Lý do ẩn" required maxLength={300} />}
                    <button className={r.hiddenAt ? "btn-secondary text-sm" : "btn-danger text-sm"}>{r.hiddenAt ? "Hiện lại tin" : "Ẩn tin"}</button>
                  </form>
                  <form action={setUserLockedAction} className="flex gap-2">
                    <input type="hidden" name="userId" value={r.authorUserId} />
                    <input type="hidden" name="locked" value={r.authorLocked ? "0" : "1"} />
                    {r.authorLocked ? null : <input className="input h-10 min-w-0 flex-1 text-sm" name="reason" placeholder="Lý do khóa" required maxLength={300} />}
                    <button className={r.authorLocked ? "btn-secondary text-sm" : "btn-danger text-sm"}>
                      {r.authorLocked ? `Mở khóa ${r.authorName}` : "Khóa người đăng"}
                    </button>
                  </form>
                </div>
              </li>
            ))}
          </ul>
        )}
        <h2 className="mt-8 mb-2 text-lg font-semibold">Nhật ký admin</h2>
        {log.length === 0 ? (
          <p className="text-sm text-fg-muted">Chưa có thao tác nào.</p>
        ) : (
          <ul className="card divide-y divide-border p-0 text-sm">
            {log.map((a, i) => (
              <li key={i} className="px-4 py-2">
                <span className="font-semibold">{ACTION_LABEL[a.action] ?? a.action}</span>
                {a.reason ? <span className="text-fg-muted"> · {a.reason}</span> : null}
                <span className="block text-xs text-fg-subtle">
                  {a.adminName} · {ago(a.createdAt)}
                </span>
              </li>
            ))}
          </ul>
        )}
        <p className="mt-6 text-xs text-fg-subtle">
          Trang này chỉ hiện số tổng, tin bị báo cáo và nhật ký admin; không có hóa đơn, tiền hay liên hệ của người dùng. Khóa tài khoản sẽ
          đăng xuất người đó trên mọi thiết bị và ẩn các tin đang mở; mở khóa không tự hiện lại tin.
        </p>
      </main>
    </div>
  );
}
