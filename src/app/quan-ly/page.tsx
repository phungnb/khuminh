import Link from "next/link";
import { Building2, MapPin, MapPinOff, Plus } from "lucide-react";
import { ManageHeader } from "@/components/manage-header";
import { EmptyState } from "@/components/ui";
import { wallBackground } from "@/lib/club-themes";
import { requireActor } from "@/lib/session";
import { listProperties } from "@/server/queries";

export const dynamic = "force-dynamic";

// Module quản lý khu: danh sách cơ sở như các CLB; vào từng cơ sở dùng các trang /co-so/*.
export default async function Page() {
  const actor = await requireActor();
  const props = await listProperties(actor);
  return (
    <div>
      <ManageHeader crumbs={[{ label: "Quản lý khu" }]} />
      <main className="mx-auto max-w-5xl px-4 py-6">
        <div className="mb-4 flex items-center justify-between gap-2">
          <h1 className="text-xl font-bold">Cơ sở của bạn</h1>
          {actor.role === "owner" ? (
            <Link href="/co-so/moi" className="btn">
              <Plus className="size-4" />
              Thêm cơ sở
            </Link>
          ) : null}
        </div>
        {props.length === 0 ? (
          <EmptyState
            icon={Building2}
            title="Chưa có cơ sở nào"
            description="Tạo cơ sở đầu tiên để quản lý phòng, hóa đơn và mở chợ cho cư dân."
            action={actor.role === "owner" ? <Link href="/co-so/moi" className="btn">Tạo cơ sở</Link> : undefined}
          />
        ) : (
          <div className="grid gap-4 md:grid-cols-2">
            {props.map((p) => (
              <Link key={p.id} href={`/co-so/${p.id}`} className="club-wall block" style={{ background: wallBackground(p.id) }}>
                <div className="relative z-[1]">
                  <div className="text-[11px] font-semibold uppercase tracking-wide text-white/70">Cơ sở</div>
                  <h2 className="truncate text-xl font-bold">{p.name}</h2>
                  {p.address ? <p className="truncate text-sm text-white/80">{p.address}</p> : null}
                  <p className="mt-3 flex items-center gap-1.5 text-xs text-white/80">
                    {p.lat !== null && p.lng !== null ? (
                      <>
                        <MapPin className="size-3.5" /> Đã mở Chợ quanh đây
                      </>
                    ) : (
                      <>
                        <MapPinOff className="size-3.5" /> Chưa đặt vị trí, cư dân chưa dùng được chợ
                      </>
                    )}
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
