"use client";

// Form trả phòng – quyết toán cọc (KM-COC): nhập → Xem trước (không ghi) → Xác nhận ghi đúng bộ số vừa xem.

import { startTransition, useActionState, useState } from "react";
import { previewSettlementAction, settleDepositAction, type PreviewState } from "@/app/co-so/deposit-actions";
import { vnd } from "@/lib/format";

const ROWS = 5;

export function SettlementForm(props: {
  propertyId: string;
  unitId: string;
  leaseId: string;
  deposit: number;
  settledOn: string;
}) {
  const [state, preview, pending] = useActionState<PreviewState, FormData>(previewSettlementAction, null);
  const [rows, setRows] = useState(1);
  const r = state?.result;

  return (
    <div className="space-y-3">
      {/* onSubmit thay vì action: giữ số đã nhập để sửa và xem lại (form action tự xóa trắng sau khi gửi). */}
      <form
        className="space-y-3"
        onSubmit={(e) => {
          e.preventDefault();
          const fd = new FormData(e.currentTarget);
          startTransition(() => preview(fd));
        }}
      >
        <input type="hidden" name="leaseId" value={props.leaseId} />
        <fieldset className="space-y-1">
          <legend className="label">Tiền phòng tháng cuối</legend>
          <label className="flex items-center gap-2 text-sm">
            <input type="radio" name="lastMonthMode" value="daily" defaultChecked /> Tính theo ngày ở (như hóa đơn cuối)
          </label>
          <label className="flex items-center gap-2 text-sm">
            <input type="radio" name="lastMonthMode" value="full_month" /> Thu đủ tháng dở
          </label>
        </fieldset>
        <div className="grid gap-3 md:grid-cols-2">
          <div>
            <label className="label">Ngày quyết toán</label>
            <input className="input" type="date" name="settledOn" defaultValue={props.settledOn} required />
          </div>
          <div>
            <label className="label">Cọc thực giữ</label>
            <input className="input" name="depositHeld" inputMode="numeric" defaultValue={props.deposit.toLocaleString("vi-VN")} required />
          </div>
        </div>
        <div>
          <label className="label">Lý do nếu cọc thực giữ khác hợp đồng ({vnd(props.deposit)})</label>
          <input className="input" name="depositHeldNote" />
        </div>
        <div className="space-y-2">
          <p className="label">Khấu trừ (hư hỏng, vệ sinh, phạt theo thỏa thuận…)</p>
          {Array.from({ length: rows }, (_, i) => (
            <div key={i} className="grid grid-cols-[1fr_9rem] gap-2">
              <input className="input" name={`d_reason_${i}`} placeholder="Lý do" />
              <input className="input" name={`d_amount_${i}`} inputMode="numeric" placeholder="Số tiền" />
            </div>
          ))}
          {rows < ROWS ? (
            <button type="button" className="text-sm text-brand-ink underline" onClick={() => setRows(rows + 1)}>
              + Thêm khoản
            </button>
          ) : null}
        </div>
        <div>
          <label className="label">Ghi chú</label>
          <input className="input" name="note" />
        </div>
        <button className="btn-secondary" disabled={pending}>{pending ? "Đang tính…" : "Xem trước"}</button>
      </form>

      {state?.error ? <p className="text-sm text-danger">{state.error}</p> : null}

      {r && state?.key ? (
        <div className="rounded-md bg-surface-2 p-3 text-sm">
          <table className="w-full">
            <tbody>
              <Row label="Nợ hóa đơn" value={r.debtBefore} />
              {r.topUp > 0 ? <Row label="Bù tiền phòng đủ tháng dở" value={r.topUp} /> : null}
              {r.deductionTotal > 0 ? <Row label="Khấu trừ" value={r.deductionTotal} /> : null}
              <Row label="Tổng phải thanh toán" value={r.debtAfter} strong />
              {r.creditApplied > 0 ? <Row label="Trừ tiền khách đã trả dư" value={-r.creditApplied} /> : null}
              <Row label="Cấn trừ cọc" value={-r.depositApplied} />
              {r.refundDue > 0 ? <Row label="Chủ trọ hoàn lại khách" value={r.refundDue} strong /> : null}
              {r.tenantOwes > 0 ? <Row label="Khách trả thêm" value={r.tenantOwes} strong /> : null}
              {r.refundDue === 0 && r.tenantOwes === 0 ? <tr><td colSpan={2} className="pt-1 font-semibold">Tất toán, không ai trả thêm</td></tr> : null}
            </tbody>
          </table>
          <form action={settleDepositAction} className="mt-3">
            <input type="hidden" name="propertyId" value={props.propertyId} />
            <input type="hidden" name="unitId" value={props.unitId} />
            <input type="hidden" name="key" value={state.key} />
            <button className="btn">Xác nhận quyết toán</button>
            <p className="mt-1 text-xs text-fg-subtle">Ghi điều chỉnh vào hóa đơn cuối và cấn trừ cọc. Làm nhầm thì hủy được khi chưa hoàn tiền.</p>
          </form>
        </div>
      ) : null}
    </div>
  );
}

function Row({ label, value, strong }: { label: string; value: number; strong?: boolean }) {
  return (
    <tr className={strong ? "font-semibold" : undefined}>
      <td className="py-0.5">{label}</td>
      <td className="py-0.5 text-right tabular-nums">{value < 0 ? `−${vnd(-value)}` : vnd(value)}</td>
    </tr>
  );
}
