import Link from "next/link";
import { notFound } from "next/navigation";
import { and, eq } from "drizzle-orm";
import { Badge, Empty, Flash, PageTitle } from "@/components/ui";
import { withOrg } from "@/db/client";
import { billingPeriods } from "@/db/schema";
import { PAYMENT_STATE_LABEL } from "@/domain/payments";
import { dmy, vnd } from "@/lib/format";
import { requireActor } from "@/lib/session";
import { invoicesForPeriod } from "@/server/queries";
import { generateDraftsAction, issueAllAction } from "../../../actions";

export default async function Page({
  params,
  searchParams,
}: {
  params: Promise<{ id: string; periodId: string }>;
  searchParams: Promise<{ loi?: string; ok?: string }>;
}) {
  const { id, periodId } = await params;
  const actor = await requireActor();
  const [period] = await withOrg(actor, (tx) =>
    tx.select().from(billingPeriods).where(and(eq(billingPeriods.id, periodId), eq(billingPeriods.propertyId, id))),
  );
  if (!period) notFound();
  const rows = await invoicesForPeriod(actor, periodId);
  const live = rows.filter((r) => r.status !== "void");
  const drafts = live.filter((r) => r.status === "draft");
  const total = live.reduce((s, r) => s + r.total, 0);
  const paid = live.reduce((s, r) => s + r.paid, 0);
  const hidden = (
    <>
      <input type="hidden" name="propertyId" value={id} />
      <input type="hidden" name="periodId" value={periodId} />
    </>
  );

  return (
    <>
      <PageTitle>
        Kỳ {dmy(period.periodStart)} – {dmy(period.periodEnd)}
      </PageTitle>
      <Flash params={await searchParams} />
      <div className="mb-4 flex flex-wrap gap-2">
        <form action={generateDraftsAction}>
          {hidden}
          <button className="btn-secondary">{rows.length ? "Lập lại hóa đơn nháp" : "Lập hóa đơn nháp"}</button>
        </form>
        {drafts.length ? (
          <form action={issueAllAction}>
            {hidden}
            {drafts.map((d) => (
              <input key={d.id} type="hidden" name="invoiceId" value={d.id} />
            ))}
            <button className="btn">Phát hành {drafts.length} hóa đơn</button>
          </form>
        ) : null}
      </div>
      <p className="mb-4 text-sm text-stone-600">
        Tổng {vnd(total)} · đã thu {vnd(paid)} · còn {vnd(total - paid)} · hạn {dmy(period.dueDate)}
      </p>
      {rows.length === 0 ? (
        <Empty>Chưa có hóa đơn. Ghi đủ chỉ số đầu và cuối kỳ rồi bấm Lập hóa đơn nháp.</Empty>
      ) : (
        <div className="card overflow-x-auto p-0">
          <table className="table">
            <thead>
              <tr>
                <th>Phòng</th>
                <th>Người thuê</th>
                <th className="text-right">Tổng</th>
                <th className="text-right">Đã trả</th>
                <th>Trạng thái</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id}>
                  <td>
                    <Link className="font-semibold text-brand" href={`/co-so/${id}/hoa-don/${r.id}`}>
                      {r.unitCode}
                    </Link>
                  </td>
                  <td>{r.tenantName}</td>
                  <td className="text-right">{vnd(r.total)}</td>
                  <td className="text-right">{vnd(r.paid)}</td>
                  <td>
                    <Badge state={r.state}>{PAYMENT_STATE_LABEL[r.state]}</Badge>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}
