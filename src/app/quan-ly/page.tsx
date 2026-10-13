import Link from "next/link";
import { wallBackground } from "@/lib/club-themes";
import { requireActor } from "@/lib/session";
import { listProperties } from "@/server/queries";
import { logoutAction } from "../auth-actions";

export const dynamic = "force-dynamic";

// Module quản lý khu: danh sách cơ sở như các CLB; vào từng cơ sở dùng các trang /co-so/*.
export default async function Page() {
  const actor = await requireActor();
  const props = await listProperties(actor);
  return (
    <div>
      <header className="border-b border-border bg-surface">
        <div className="mx-auto flex max-w-5xl items-center justify-between gap-2 px-4 py-3">
          <div className="flex items-center gap-2">
            <Link href="/app" className="font-bold text-fg">Khu<span className="text-brand-ink">Mình</span></Link>
            <span className="text-fg-subtle">/</span>
            <span className="font-semibold">Quản lý khu</span>
          </div>
          <div className="flex items-center gap-3">
            <Link href="/app" className="text-sm font-medium text-brand-ink">Về chợ</Link>
            <form action={logoutAction}>
              <button className="text-sm text-fg-subtle hover:text-fg">Đăng xuất</button>
            </form>
          </div>
        </div>
      </header>
      <main className="mx-auto max-w-5xl px-4 py-6">
        <div className="mb-4 flex items-center justify-between gap-2">
          <h1 className="text-xl font-bold">Cơ sở của bạn</h1>
          {actor.role === "owner" ? <Link href="/co-so/moi" className="btn">Thêm cơ sở</Link> : null}
        </div>
        {props.length === 0 ? (
          <div className="card text-center text-sm text-fg-muted">
            Chưa có cơ sở nào. Tạo cơ sở đầu tiên để quản lý phòng, hóa đơn và mở chợ cho cư dân.
          </div>
        ) : (
          <div className="grid gap-4 md:grid-cols-2">
            {props.map((p) => (
              <Link key={p.id} href={`/co-so/${p.id}`} className="club-wall block" style={{ background: wallBackground(p.id) }}>
                <div className="relative z-[1]">
                  <div className="text-[11px] font-semibold uppercase tracking-wide text-white/70">Cơ sở</div>
                  <h2 className="truncate text-xl font-bold">{p.name}</h2>
                  {p.address ? <p className="truncate text-sm text-white/80">{p.address}</p> : null}
                  <p className="mt-3 text-xs text-white/80">
                    {p.lat !== null && p.lng !== null ? "Đã mở Chợ quanh đây" : "Chưa đặt vị trí, cư dân chưa dùng được chợ"}
                  </p>
                </div>
              </Link>
            ))}
          </div>
        )}
      </main>
    </div>
  );
}
