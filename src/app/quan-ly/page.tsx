import Link from "next/link";
import type { Metadata } from "next";
import SubmitButton from "@/components/submit-button";
import { Building2, MapPin, MapPinOff, Plus } from "lucide-react";
import { ManageHeader } from "@/components/manage-header";
import { OrgOverview } from "@/components/org-overview";
import { EmptyState, Flash } from "@/components/ui";
import { wallBackground } from "@/lib/club-themes";
import { vnd } from "@/lib/format";
import { requireActor } from "@/lib/session";
import { listArchivedProperties } from "@/server/property-lifecycle";
import { orgOverview } from "@/server/overview";
import { listProperties, today } from "@/server/queries";
import { restorePropertyAction } from "../co-so/actions";

export const metadata: Metadata = { title: "Quản lý khu — KhuMình" };

export const dynamic = "force-dynamic";

// Module quản lý khu: danh sách cơ sở như các CLB; vào từng cơ sở dùng các trang /co-so/*.
export default async function Page({
  searchParams,
}: {
  searchParams: Promise<{ loi?: string; ok?: string; "co-so"?: string }>;
}) {
  const actor = await requireActor();
  const sp = await searchParams;
  const t = today();
  const [props, archived, summaries] = await Promise.all([listProperties(actor), listArchivedProperties(actor), orgOverview(actor, t)]);
  const selected = summaries.some((p) => p.id === sp["co-so"]) ? sp["co-so"]! : null;
  return (
    <div>
      <ManageHeader crumbs={[{ label: "Quản lý khu" }]} />
      <main className="mx-auto max-w-5xl px-4 py-6">
        {summaries.length > 0 ? (
          <>
            <h1 className="mb-3 text-xl font-bold">Tổng quan</h1>
            <OrgOverview props={summaries} selected={selected} t={t} />
          </>
        ) : null}
        <div className="mb-4 flex items-center justify-between gap-2">
          <h2 className="text-xl font-bold">Cơ sở của bạn</h2>
          {actor.role === "owner" ? (
            <Link href="/co-so/moi" className="btn">
              <Plus className="size-4" />
              Thêm cơ sở
            </Link>
          ) : null}
        </div>
        <Flash params={sp} />
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
                  {(() => {
                    const sum = summaries.find((x) => x.id === p.id);
                    if (!sum) return null;
                    const owed = sum.money.receivable - sum.money.collected;
                    return (
                      <p className="tabular mt-2 text-sm text-white/90">
                        {sum.units.occupied}/{sum.units.total} phòng đang thuê
                        {owed > 0 ? ` · còn nợ ${vnd(owed)}` : ""}
                      </p>
                    );
                  })()}
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
        {archived.length > 0 ? (
          <section className="mt-8">
            <h2 className="mb-2 text-sm font-semibold text-fg-subtle">Khu đã lưu trữ</h2>
            <ul className="space-y-2">
              {archived.map((p) => (
                <li key={p.id} className="card flex items-center justify-between gap-3">
                  <Link href={`/co-so/${p.id}`} className="min-w-0">
                    <span className="block truncate font-semibold">{p.name}</span>
                    {p.address ? <span className="block truncate text-sm text-fg-subtle">{p.address}</span> : null}
                  </Link>
                  <form action={restorePropertyAction}>
                    <input type="hidden" name="propertyId" value={p.id} />
                    <SubmitButton className="btn-secondary">Khôi phục</SubmitButton>
                  </form>
                </li>
              ))}
            </ul>
          </section>
        ) : null}
      </main>
    </div>
  );
}
