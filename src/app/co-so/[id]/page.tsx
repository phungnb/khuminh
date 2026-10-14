import { AlarmClock, BadgeCheck, CalendarClock, CircleDollarSign, DoorClosed, DoorOpen, Gauge, House, MapPinOff, TriangleAlert, Users, Wrench } from "lucide-react";
import Link from "next/link";
import { CoSoWall } from "@/components/co-so-wall";
import { Flash, Stat } from "@/components/ui";
import { dmy, vnd } from "@/lib/format";
import { requireActor } from "@/lib/session";
import { dashboard, getProperty } from "@/server/queries";

export default async function Page({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ loi?: string; ok?: string }>;
}) {
  const { id } = await params;
  const actor = await requireActor();
  const [property, d] = await Promise.all([getProperty(actor, id), dashboard(actor, id)]);
  return (
    <>
      <CoSoWall
        id={id}
        name={property?.name ?? "Cơ sở"}
        address={property?.address}
        total={d.units.total}
        occupied={d.units.occupied}
      />
      <Flash params={await searchParams} />
      {property && (property.lat === null || property.lng === null) ? (
        <div className="mt-4 flex items-start gap-2 rounded-xl border border-warning/40 bg-warning/10 px-3 py-2.5 text-sm text-warning">
          <MapPinOff className="mt-0.5 size-4 shrink-0" />
          <span>
            Cơ sở chưa có vị trí nên cư dân chưa dùng được Chợ quanh đây.{" "}
            <Link className="font-semibold underline" href={`/co-so/${id}/bieu-phi#vi-tri`}>Đặt vị trí</Link>
          </span>
        </div>
      ) : null}
      <div className="mt-4 mb-4 flex items-center justify-between gap-2">
        <h2 className="font-semibold">Tổng quan</h2>
        <Link className="btn" href={`/co-so/${id}/chi-so`}>
          <Gauge className="size-4" />
          Ghi chỉ số
        </Link>
      </div>
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <Stat icon={CircleDollarSign} label="Phải thu (đã phát hành)" value={vnd(d.receivable)} />
        <Stat icon={BadgeCheck} label="Đã thu" value={vnd(d.collected)} tone="ok" />
        <Stat icon={AlarmClock} label="Còn nợ" value={vnd(d.outstanding)} tone={d.outstanding > 0 ? "warn" : undefined} />
        <Stat icon={TriangleAlert} label="Quá hạn" value={vnd(d.overdue)} tone={d.overdue > 0 ? "warn" : undefined} />
      </div>
      <div className="mt-3 grid grid-cols-2 gap-3 md:grid-cols-4">
        <Stat icon={House} label="Tổng phòng" value={String(d.units.total)} />
        <Stat icon={Users} label="Đang thuê" value={String(d.units.occupied)} />
        <Stat icon={DoorOpen} label="Trống" value={String(d.units.vacant)} />
        <Stat icon={Wrench} label="Bảo trì" value={String(d.units.maintenance)} />
      </div>
      <section className="card mt-6">
        <h2 className="mb-2 flex items-center gap-2 font-semibold">
          <CalendarClock className="size-4 text-fg-muted" />
          Hợp đồng hết hạn trong 30 ngày
        </h2>
        {d.expiring.length === 0 ? (
          <p className="text-sm text-fg-subtle">Không có.</p>
        ) : (
          <ul className="divide-y divide-border text-sm">
            {d.expiring.map((e) => (
              <li key={e.unitCode + e.expiresOn} className="flex items-center justify-between gap-3 py-2">
                <span className="flex min-w-0 items-center gap-2">
                  <DoorClosed className="size-4 shrink-0 text-fg-subtle" />
                  <span className="truncate">
                    Phòng <b>{e.unitCode}</b> · {e.tenantName}
                  </span>
                </span>
                <span className="shrink-0 text-warning">{dmy(e.expiresOn)}</span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </>
  );
}
