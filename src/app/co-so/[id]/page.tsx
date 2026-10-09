import Link from "next/link";
import { Flash, PageTitle, Stat } from "@/components/ui";
import { dmy, vnd } from "@/lib/format";
import { requireActor } from "@/lib/session";
import { dashboard } from "@/server/queries";

export default async function Page({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ loi?: string; ok?: string }>;
}) {
  const { id } = await params;
  const actor = await requireActor();
  const d = await dashboard(actor, id);
  return (
    <>
      <PageTitle action={<Link className="btn" href={`/co-so/${id}/chi-so`}>Ghi chỉ số</Link>}>Tổng quan</PageTitle>
      <Flash params={await searchParams} />
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <Stat label="Phải thu (đã phát hành)" value={vnd(d.receivable)} />
        <Stat label="Đã thu" value={vnd(d.collected)} tone="ok" />
        <Stat label="Còn nợ" value={vnd(d.outstanding)} tone={d.outstanding > 0 ? "warn" : undefined} />
        <Stat label="Quá hạn" value={vnd(d.overdue)} tone={d.overdue > 0 ? "warn" : undefined} />
      </div>
      <div className="mt-3 grid grid-cols-2 gap-3 md:grid-cols-4">
        <Stat label="Tổng phòng" value={String(d.units.total)} />
        <Stat label="Đang thuê" value={String(d.units.occupied)} />
        <Stat label="Trống" value={String(d.units.vacant)} />
        <Stat label="Bảo trì" value={String(d.units.maintenance)} />
      </div>
      <section className="card mt-6">
        <h2 className="mb-2 font-semibold">Hợp đồng hết hạn trong 30 ngày</h2>
        {d.expiring.length === 0 ? (
          <p className="text-sm text-stone-500">Không có.</p>
        ) : (
          <ul className="space-y-1 text-sm">
            {d.expiring.map((e) => (
              <li key={e.unitCode + e.expiresOn}>
                Phòng <b>{e.unitCode}</b> — {e.tenantName} — hết hạn {dmy(e.expiresOn)}
              </li>
            ))}
          </ul>
        )}
      </section>
    </>
  );
}
