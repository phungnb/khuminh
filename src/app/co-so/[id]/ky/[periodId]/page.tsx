import Link from "next/link";
import { notFound } from "next/navigation";
import { ChevronDown } from "lucide-react";
import { Badge, Empty, Flash, PageTitle } from "@/components/ui";
import { PAYMENT_STATE_LABEL } from "@/domain/payments";
import { dmy, vnd } from "@/lib/format";
import { requireActor } from "@/lib/session";
import { invoicesForPeriod } from "@/server/queries";
import { periodWorksheet, type RowStatus, type WorksheetRow } from "@/server/worksheet";
import { calcRoomAction, generateDraftsAction, issueAllAction, issueOneAction } from "../../../actions";

const STATUS: Record<RowStatus, { label: string; badge: string }> = {
  missing_reading: { label: "Thiếu chỉ số", badge: "overdue" },
  ready: { label: "Sẵn sàng tính", badge: "partial" },
  draft: { label: "Nháp", badge: "draft" },
  void: { label: "Đã hủy", badge: "void" },
  unpaid: { label: PAYMENT_STATE_LABEL.unpaid, badge: "unpaid" },
  partial: { label: PAYMENT_STATE_LABEL.partial, badge: "partial" },
  paid: { label: PAYMENT_STATE_LABEL.paid, badge: "paid" },
  overdue: { label: PAYMENT_STATE_LABEL.overdue, badge: "overdue" },
};

/** Màn Tính tiền của một kỳ: mỗi phòng một dòng, bấm vào để nhập chỉ số, lập nháp và phát hành tại chỗ. */
export default async function Page({
  params,
  searchParams,
}: {
  params: Promise<{ id: string; periodId: string }>;
  searchParams: Promise<{ loi?: string; ok?: string; phong?: string }>;
}) {
  const { id, periodId } = await params;
  const sp = await searchParams;
  const actor = await requireActor();
  const ws = await periodWorksheet(actor, periodId);
  if (!ws || ws.period.propertyId !== id) notFound();
  const { period, rows } = ws;
  const voided = (await invoicesForPeriod(actor, periodId)).filter((r) => r.status === "void");
  const drafts = rows.filter((r) => r.invoice?.status === "draft");
  const issued = rows.filter((r) => r.invoice?.status === "issued");
  const total = issued.reduce((s, r) => s + r.invoice!.total, 0);
  const paid = issued.reduce((s, r) => s + r.invoice!.paid, 0);
  const todo = rows.filter((r) => r.status === "missing_reading" || r.status === "ready").length;
  const hidden = (
    <>
      <input type="hidden" name="propertyId" value={id} />
      <input type="hidden" name="periodId" value={periodId} />
    </>
  );

  return (
    <>
      <PageTitle>
        Tính tiền kỳ {dmy(period.periodStart)} – {dmy(period.periodEnd)}
      </PageTitle>
      <Flash params={sp} />
      <div className="card mb-4 grid grid-cols-3 gap-3 text-sm">
        <div>
          <div className="text-fg-subtle">Chưa lập</div>
          <div className="tabular text-lg font-bold">{todo}</div>
        </div>
        <div>
          <div className="text-fg-subtle">Nháp</div>
          <div className="tabular text-lg font-bold">{drafts.length}</div>
        </div>
        <div>
          <div className="text-fg-subtle">Đã phát hành</div>
          <div className="tabular text-lg font-bold">{issued.length}</div>
        </div>
        <p className="col-span-3 text-fg-muted">
          Đã phát hành {vnd(total)} · đã thu {vnd(paid)} · còn {vnd(total - paid)} · hạn {dmy(period.dueDate)}
        </p>
      </div>
      <div className="mb-4 flex flex-wrap gap-2">
        <form action={generateDraftsAction}>
          {hidden}
          <button className="btn-secondary">Lập nháp cả kỳ</button>
        </form>
        {drafts.length ? (
          <form action={issueAllAction}>
            {hidden}
            {drafts.map((d) => (
              <input key={d.invoice!.id} type="hidden" name="invoiceId" value={d.invoice!.id} />
            ))}
            <button className="btn">Phát hành {drafts.length} hóa đơn</button>
          </form>
        ) : null}
        {issued.length ? (
          <a className="btn-secondary" href={`/co-so/${id}/ky/${periodId}/xuat`}>
            Xuất Excel
          </a>
        ) : null}
      </div>

      {rows.length === 0 ? (
        <Empty>Kỳ này chưa có phòng nào có người ở.</Empty>
      ) : (
        <ul className="space-y-2">
          {rows.map((r) => (
            <RoomRow
              key={r.leaseId}
              r={r}
              open={sp.phong === r.leaseId}
              hidden={hidden}
              propertyId={id}
              periodStart={period.periodStart}
              periodEnd={period.periodEnd}
            />
          ))}
        </ul>
      )}

      {voided.length ? (
        <section className="mt-6">
          <h2 className="mb-2 text-sm font-semibold text-fg-subtle">Hóa đơn đã hủy</h2>
          <ul className="space-y-1 text-sm">
            {voided.map((v) => (
              <li key={v.id}>
                <Link className="text-fg-muted underline" href={`/co-so/${id}/hoa-don/${v.id}`}>
                  {v.code} · phòng {v.unitCode} · {vnd(v.total)}
                </Link>
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </>
  );
}

function RoomRow({
  r,
  open,
  hidden,
  propertyId,
  periodStart,
  periodEnd,
}: {
  r: WorksheetRow;
  open: boolean;
  hidden: React.ReactNode;
  propertyId: string;
  periodStart: string;
  periodEnd: string;
}) {
  const st = STATUS[r.status];
  const editable = !r.invoice || r.invoice.status === "draft";
  // Chỉ ghi khoảng ngày khi phòng không ở trọn kỳ (vào hoặc chuyển đi giữa kỳ).
  const partial = r.segStart !== periodStart || r.segEnd !== periodEnd ? `${dmy(r.segStart)} – ${dmy(r.segEnd)}` : null;
  return (
    <li id={`p-${r.leaseId}`}>
      <details className="card group p-0" open={open || undefined}>
        <summary className="flex cursor-pointer list-none items-center gap-3 px-4 py-3">
          <span className="min-w-0 flex-1">
            <span className="block font-semibold">Phòng {r.unitCode}</span>
            <span className="block truncate text-sm text-fg-subtle">{r.tenantName}</span>
            {partial ? <span className="block text-xs text-warning">Ở {partial}</span> : null}
          </span>
          {r.invoice ? <span className="tabular shrink-0 text-sm font-semibold">{vnd(r.invoice.total)}</span> : null}
          <span className="shrink-0">
            <Badge state={st.badge}>{st.label}</Badge>
          </span>
          <ChevronDown className="size-4 shrink-0 text-fg-subtle transition group-open:rotate-180" />
        </summary>
        <div className="space-y-3 border-t border-border px-4 py-3">
          {editable ? (
            <form action={calcRoomAction} className="space-y-3">
              {hidden}
              <input type="hidden" name="leaseId" value={r.leaseId} />
              <input type="hidden" name="startDate" value={r.segStart} />
              {r.meters.length === 0 ? (
                <p className="text-sm text-fg-subtle">Phòng không có đồng hồ điện nước.</p>
              ) : (
                <>
                  <div>
                    <label className="label" htmlFor={`d-${r.leaseId}`}>Ngày chốt số cuối</label>
                    <input className="input" type="date" id={`d-${r.leaseId}`} name="endDate" defaultValue={r.meters.find((m) => m.end)?.end?.date ?? r.segEnd} />
                  </div>
                  {r.meters.map((m) => (
                    <div key={m.meterId} className="grid grid-cols-2 gap-3">
                      <div>
                        <label className="label" htmlFor={`s-${m.meterId}`}>{m.name}: số đầu</label>
                        {m.start ? (
                          <div className="tabular flex min-h-11 items-center text-fg-muted">
                            {m.start.value.toLocaleString("vi-VN")} <span className="ml-1 text-xs">({dmy(m.start.date)})</span>
                          </div>
                        ) : (
                          <input className="input" id={`s-${m.meterId}`} name={`s_${m.meterId}`} inputMode="decimal" placeholder={`ngày ${dmy(r.segStart)}`} />
                        )}
                      </div>
                      <div>
                        <label className="label" htmlFor={`e-${m.meterId}`}>{m.name}: số cuối</label>
                        <input
                          className="input"
                          id={`e-${m.meterId}`}
                          name={`e_${m.meterId}`}
                          inputMode="decimal"
                          defaultValue={m.end ? String(m.end.value) : ""}
                        />
                      </div>
                    </div>
                  ))}
                </>
              )}
              <button className="btn w-full sm:w-auto">{r.invoice ? "Lưu & tính lại" : "Lưu & tính tiền"}</button>
            </form>
          ) : null}
          {r.invoice ? (
            <div className="flex flex-wrap items-center gap-2">
              <Link className="btn-secondary" href={`/co-so/${propertyId}/hoa-don/${r.invoice.id}`}>
                {r.invoice.status === "draft" ? "Xem nháp" : "Hóa đơn, gửi ảnh, thu tiền"}
              </Link>
              {r.invoice.status === "draft" ? (
                <form action={issueOneAction}>
                  {hidden}
                  <input type="hidden" name="leaseId" value={r.leaseId} />
                  <input type="hidden" name="invoiceId" value={r.invoice.id} />
                  <button className="btn">Phát hành phòng này</button>
                </form>
              ) : null}
            </div>
          ) : null}
        </div>
      </details>
    </li>
  );
}
