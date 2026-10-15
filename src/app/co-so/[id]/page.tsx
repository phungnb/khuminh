import { AlarmClock, BadgeCheck, Calculator, CircleCheck, CircleDollarSign, Circle, DoorOpen, Gauge, House, MapPinOff, TriangleAlert, Users, Wrench } from "lucide-react";
import Link from "next/link";
import { CoSoWall } from "@/components/co-so-wall";
import { ActionList } from "@/components/org-overview";
import { Flash, Stat } from "@/components/ui";
import { vnd } from "@/lib/format";
import { requireActor } from "@/lib/session";
import { orgOverview } from "@/server/overview";
import { actionItems } from "@/server/overview-items";
import { dashboard, getProperty, listFeeRules, listPeriods, today } from "@/server/queries";

export default async function Page({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ loi?: string; ok?: string }>;
}) {
  const { id } = await params;
  const actor = await requireActor();
  const t = today();
  const [property, d, summary, periods, fees] = await Promise.all([
    getProperty(actor, id),
    dashboard(actor, id),
    orgOverview(actor, t, id),
    listPeriods(actor, id),
    listFeeRules(actor, id),
  ]);
  const items = actionItems(summary, t, vnd);
  // Kỳ đang mở gần nhất đã bắt đầu: nút "Tính tiền" đưa thẳng vào màn tính theo phòng.
  const current = periods.find((p) => p.status === "open" && p.periodStart <= t);
  const month = (d: string) => `${d.slice(5, 7)}/${d.slice(0, 4)}`;
  // Cơ sở chưa có ai thuê: hướng dẫn các bước để ra hóa đơn đầu tiên.
  const steps = [
    { done: fees.length > 0, label: "Đặt biểu phí điện, nước, dịch vụ", href: `/co-so/${id}/bieu-phi` },
    { done: d.units.total > 0, label: "Thêm phòng", href: `/co-so/${id}/phong` },
    { done: d.units.occupied > 0, label: "Thêm người thuê vào phòng (giá thuê, cọc, ngày thu)", href: `/co-so/${id}/phong` },
    { done: false, label: "Ghi chỉ số điện nước ngày vào ở", href: `/co-so/${id}/chi-so` },
    { done: periods.length > 0, label: "Mở kỳ tháng rồi tính tiền từng phòng", href: `/co-so/${id}/ky` },
  ];
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
      <div className="mt-4 mb-4 flex flex-wrap items-center justify-between gap-2">
        <h2 className="shrink-0 font-semibold">Tổng quan</h2>
        <div className="flex flex-wrap gap-2">
          <Link className="btn-secondary whitespace-nowrap" href={`/co-so/${id}/chi-so`}>
            <Gauge className="size-4" />
            Ghi chỉ số
          </Link>
          <Link className="btn whitespace-nowrap" href={current ? `/co-so/${id}/ky/${current.id}` : `/co-so/${id}/ky`}>
            <Calculator className="size-4" />
            {current ? `Tính tiền T${month(current.periodStart)}` : "Mở kỳ tính tiền"}
          </Link>
        </div>
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
      {d.units.occupied === 0 ? (
        <section className="card mt-6">
          <h2 className="mb-2 font-semibold">Bắt đầu với cơ sở này</h2>
          <ol className="space-y-1 text-sm">
            {steps.map((st) => (
              <li key={st.label}>
                <Link href={st.href} className="flex items-center gap-2 rounded-md px-1 py-1.5 hover:bg-surface-2">
                  {st.done ? <CircleCheck className="size-4 shrink-0 text-success" /> : <Circle className="size-4 shrink-0 text-fg-subtle" />}
                  <span className={st.done ? "text-fg-muted line-through" : ""}>{st.label}</span>
                </Link>
              </li>
            ))}
          </ol>
        </section>
      ) : null}
      <ActionList items={items} showProperty={false} />
    </>
  );
}
