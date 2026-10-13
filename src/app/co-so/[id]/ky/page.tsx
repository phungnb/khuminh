import Link from "next/link";
import { Flash, PageTitle } from "@/components/ui";
import { addDays } from "@/domain/dates";
import { dmy } from "@/lib/format";
import { requireActor } from "@/lib/session";
import { listPeriods, today } from "@/server/queries";
import { openPeriodAction } from "../../actions";

function suggestNext(lastEnd: string | undefined): { start: string; end: string } {
  const t = today();
  const start = lastEnd ? addDays(lastEnd, 1) : `${t.slice(0, 7)}-01`;
  const [y, m] = start.split("-").map(Number) as [number, number];
  const end = new Date(Date.UTC(y, m, 0)).toISOString().slice(0, 10);
  return { start, end: end < start ? start : end };
}

export default async function Page({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ loi?: string; ok?: string }>;
}) {
  const { id } = await params;
  const actor = await requireActor();
  const periods = await listPeriods(actor, id);
  const next = suggestNext(periods[0]?.periodEnd);
  return (
    <>
      <PageTitle>Kỳ tính tiền</PageTitle>
      <Flash params={await searchParams} />
      <form action={openPeriodAction} className="card mb-6 flex flex-wrap items-end gap-2">
        <input type="hidden" name="propertyId" value={id} />
        <div>
          <label className="label">Từ ngày</label>
          <input className="input" type="date" name="start" defaultValue={next.start} required />
        </div>
        <div>
          <label className="label">Đến ngày</label>
          <input className="input" type="date" name="end" defaultValue={next.end} required />
        </div>
        <button className="btn">Mở kỳ mới</button>
      </form>
      <ul className="space-y-2">
        {periods.map((p) => (
          <li key={p.id}>
            <Link href={`/co-so/${id}/ky/${p.id}`} className="card block hover:border-brand-strong">
              <b>
                {dmy(p.periodStart)} – {dmy(p.periodEnd)}
              </b>
              <span className="ml-2 text-sm text-fg-subtle">hạn trả {dmy(p.dueDate)}</span>
            </Link>
          </li>
        ))}
      </ul>
    </>
  );
}
