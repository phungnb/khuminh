import Link from "next/link";
import { notFound } from "next/navigation";
import { EmptyState, Logo, Stat } from "@/components/ui";
import { ago } from "@/components/listing-card";
import { requireUser } from "@/lib/session";
import { adminStats, isPlatformAdmin, reportedListings } from "@/server/admin";
import { Flag } from "lucide-react";

export const dynamic = "force-dynamic";

// Trang admin nền tảng (KM-HN2 T6): số tổng và tin bị báo cáo. Người không phải admin gặp 404.
export default async function Page() {
  const user = await requireUser();
  if (!(await isPlatformAdmin(user.id))) notFound();
  const [st, reported] = await Promise.all([adminStats(user.id), reportedListings(user.id)]);
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
              </li>
            ))}
          </ul>
        )}
        <p className="mt-6 text-xs text-fg-subtle">
          Trang này chỉ hiện số tổng và tin bị báo cáo; không có hóa đơn, tiền hay liên hệ của người dùng. Ẩn tin, khóa tài khoản là bước T7.
        </p>
      </main>
    </div>
  );
}
