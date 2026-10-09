import { randomUUID } from "node:crypto";
import Link from "next/link";
import { headers } from "next/headers";
import { notFound } from "next/navigation";
import { CopyBox } from "@/components/copy-box";
import { Badge, Flash, PageTitle } from "@/components/ui";
import { paymentState, PAYMENT_STATE_LABEL } from "@/domain/payments";
import { dmy, vnd } from "@/lib/format";
import { requireActor } from "@/lib/session";
import { invoiceDetail, today } from "@/server/queries";
import {
  adjustInvoiceAction,
  createShareLinkAction,
  recordPaymentAction,
  voidInvoiceAction,
  voidPaymentAction,
} from "../../../actions";

async function baseUrl(): Promise<string> {
  if (process.env.APP_URL) return process.env.APP_URL.replace(/\/$/, "");
  const h = await headers();
  const host = h.get("x-forwarded-host") ?? h.get("host") ?? "localhost:3000";
  const proto = h.get("x-forwarded-proto") ?? "http";
  return `${proto}://${host}`;
}

export default async function Page({
  params,
  searchParams,
}: {
  params: Promise<{ id: string; invoiceId: string }>;
  searchParams: Promise<{ loi?: string; ok?: string; link?: string }>;
}) {
  const { id, invoiceId } = await params;
  const sp = await searchParams;
  const actor = await requireActor();
  const d = await invoiceDetail(actor, invoiceId);
  if (!d || d.inv.propertyId !== id) notFound();
  const { inv, ctx } = d;
  const due = inv.total - d.paid;
  const state = paymentState(inv.status, inv.total, d.paid, inv.dueDate, today());
  const back = `/co-so/${id}/hoa-don/${invoiceId}`;
  const month = `${ctx.periodStart.slice(5, 7)}/${ctx.periodStart.slice(0, 4)}`;
  const shareText = sp.link
    ? `Phòng ${ctx.unitCode} - tiền nhà tháng ${month}: ${vnd(due > 0 ? due : inv.total)}. Hạn trả ${dmy(inv.dueDate)}. Xem chi tiết và quét mã QR chuyển khoản: ${await baseUrl()}/hd/${sp.link}`
    : null;

  return (
    <>
      <PageTitle action={<Link className="btn-secondary" href={`/co-so/${id}/ky/${inv.billingPeriodId}`}>Về kỳ</Link>}>
        Hóa đơn {inv.code}
      </PageTitle>
      <Flash params={sp} />
      <p className="mb-4 text-sm text-stone-600">
        Phòng <b>{ctx.unitCode}</b> · {ctx.tenantName} {ctx.phone ? `· ${ctx.phone}` : ""} · hạn {dmy(inv.dueDate)} ·{" "}
        <Badge state={state}>{PAYMENT_STATE_LABEL[state]}</Badge>
      </p>

      <section className="card overflow-x-auto p-0">
        <table className="table">
          <tbody>
            {d.lines.map((l) => (
              <tr key={l.id}>
                <td>{l.description}</td>
                <td className="text-right">{vnd(l.amount)}</td>
              </tr>
            ))}
            {d.adjustments.map((a) => (
              <tr key={a.id}>
                <td>Điều chỉnh: {a.reason}</td>
                <td className="text-right">{vnd(a.amount)}</td>
              </tr>
            ))}
            <tr>
              <td className="font-bold">Tổng</td>
              <td className="text-right font-bold">{vnd(inv.total)}</td>
            </tr>
            {d.payments.map((p) => (
              <tr key={p.payment.id}>
                <td>
                  Đã trả {dmy(p.payment.receivedOn)} ({p.payment.method === "cash" ? "tiền mặt" : p.payment.method === "transfer" ? "chuyển khoản" : "khác"})
                </td>
                <td className="text-right text-emerald-700">−{vnd(p.allocated)}</td>
              </tr>
            ))}
            <tr>
              <td className="font-bold">Còn phải trả</td>
              <td className="text-right font-bold">{vnd(Math.max(0, due))}</td>
            </tr>
          </tbody>
        </table>
      </section>

      {inv.status === "draft" ? (
        <p className="mt-4 text-sm text-stone-600">Hóa đơn nháp. Phát hành ở trang kỳ để gửi cho người thuê.</p>
      ) : null}

      {inv.status === "issued" ? (
        <div className="mt-6 grid gap-4 md:grid-cols-2">
          <section className="card space-y-3">
            <h2 className="font-semibold">Gửi cho người thuê</h2>
            {shareText ? (
              <CopyBox text={shareText} />
            ) : (
              <form action={createShareLinkAction}>
                <input type="hidden" name="invoiceId" value={invoiceId} />
                <input type="hidden" name="back" value={back} />
                <button className="btn">Tạo link hóa đơn</button>
                <p className="mt-2 text-xs text-stone-500">Link xem được không cần đăng nhập, hết hạn sau 60 ngày.</p>
              </form>
            )}
          </section>

          {due > 0 ? (
            <form action={recordPaymentAction} className="card space-y-3">
              <h2 className="font-semibold">Ghi nhận đã thu</h2>
              <input type="hidden" name="back" value={back} />
              <input type="hidden" name="leaseId" value={inv.leaseId} />
              <input type="hidden" name="invoiceId" value={invoiceId} />
              <input type="hidden" name="idempotencyKey" value={randomUUID()} />
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="label">Số tiền</label>
                  <input className="input" name="amount" inputMode="numeric" defaultValue={String(due)} required />
                </div>
                <div>
                  <label className="label">Ngày nhận</label>
                  <input className="input" type="date" name="receivedOn" defaultValue={today()} required />
                </div>
                <div>
                  <label className="label">Hình thức</label>
                  <select className="input" name="method" defaultValue="transfer">
                    <option value="transfer">Chuyển khoản</option>
                    <option value="cash">Tiền mặt</option>
                    <option value="other">Khác</option>
                  </select>
                </div>
                <div>
                  <label className="label">Mã giao dịch / ghi chú</label>
                  <input className="input" name="reference" />
                </div>
              </div>
              <button className="btn">Ghi nhận</button>
            </form>
          ) : null}

          <form action={adjustInvoiceAction} className="card space-y-3">
            <h2 className="font-semibold">Điều chỉnh</h2>
            <input type="hidden" name="back" value={back} />
            <input type="hidden" name="invoiceId" value={invoiceId} />
            <div>
              <label className="label">Số tiền (âm là giảm, ví dụ -3000000 để trừ cọc)</label>
              <input className="input" name="amount" inputMode="numeric" required />
            </div>
            <div>
              <label className="label">Lý do</label>
              <input className="input" name="reason" required />
            </div>
            <button className="btn-secondary">Lưu điều chỉnh</button>
          </form>

          <section className="card space-y-3">
            <h2 className="font-semibold">Hủy</h2>
            {d.payments.map((p) => (
              <form key={p.payment.id} action={voidPaymentAction} className="flex flex-wrap items-end gap-2">
                <input type="hidden" name="back" value={back} />
                <input type="hidden" name="paymentId" value={p.payment.id} />
                <input className="input flex-1" name="reason" placeholder="Lý do hủy thanh toán" required />
                <button className="btn-danger">Hủy khoản thu {vnd(p.payment.amount)}</button>
              </form>
            ))}
            <form action={voidInvoiceAction} className="flex flex-wrap items-end gap-2">
              <input type="hidden" name="back" value={back} />
              <input type="hidden" name="invoiceId" value={invoiceId} />
              <input className="input flex-1" name="reason" placeholder="Lý do hủy hóa đơn" required />
              <button className="btn-danger">Hủy hóa đơn</button>
            </form>
          </section>
        </div>
      ) : null}
    </>
  );
}
