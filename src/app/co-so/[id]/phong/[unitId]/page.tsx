import { notFound } from "next/navigation";
import { CopyBox } from "@/components/copy-box";
import { Flash, PageTitle } from "@/components/ui";
import { dmy, vnd } from "@/lib/format";
import { requireActor } from "@/lib/session";
import { baseUrl } from "@/lib/url";
import { today, unitDetail } from "@/server/queries";
import Link from "next/link";
import { SettlementForm } from "@/components/settlement-form";
import { ShareImage } from "@/components/share-image";
import { addDays } from "@/domain/dates";
import type { Actor } from "@/server/audit";
import { SETTLE_WITHIN_DAYS } from "@/server/overview-items";
import { settlementContext } from "@/server/deposit";
import { changeRentAction, createLeaseAction, createTenantInviteAction, extendLeaseAction, moveOutAction, setLeaseDueDayAction, addVehicleAction, deleteVehicleAction, setUnitFloorAction } from "../../../actions";
import { deriveFloor, floorLabel } from "@/domain/rooms";
import { listVehicles, VEHICLE_KINDS } from "@/server/vehicles";
import { markRefundedAction, voidSettlementAction } from "../../../deposit-actions";

export default async function Page({
  params,
  searchParams,
}: {
  params: Promise<{ id: string; unitId: string }>;
  searchParams: Promise<{ loi?: string; ok?: string; moi?: string }>;
}) {
  const { id, unitId } = await params;
  const sp = await searchParams;
  const actor = await requireActor();
  const d = await unitDetail(actor, unitId);
  if (!d || d.unit.propertyId !== id) notFound();
  const current = d.leases.find((l) => l.lease.status === "active" && !l.lease.movedOutOn);
  // Hợp đồng vừa trả phòng gần nhất: hiện quyết toán cọc kể cả khi phòng đã có người mới.
  const ended = d.leases.find((l) => l.lease.movedOutOn);
  const hidden = (
    <>
      <input type="hidden" name="propertyId" value={id} />
      <input type="hidden" name="unitId" value={unitId} />
    </>
  );
  const vehicles = await listVehicles(actor, unitId);

  return (
    <>
      <PageTitle>Phòng {d.unit.block ? `${d.unit.block}-` : ""}{d.unit.code}</PageTitle>
      <Flash params={sp} />
      {/* Phòng trống vừa trả: quyết toán cọc là việc đầu tiên, trước khi thêm người mới. */}
      {!current && ended ? (
        <div className="mb-6">
          <Settlement actor={actor} propertyId={id} unitId={unitId} leaseId={ended.lease.id} hideWhenDone={false} />
        </div>
      ) : null}

      {current ? (
        <section className="card space-y-4">
          <div>
            <h2 className="font-semibold">Đang thuê: {current.tenant.fullName}</h2>
            <p className="text-sm text-fg-muted">
              {current.tenant.phone ?? "Chưa có SĐT"} · vào ở {dmy(current.lease.startDate)} · {current.lease.occupants} người · cọc {vnd(current.lease.deposit)}
              {current.lease.expiresOn ? ` · hết hạn ${dmy(current.lease.expiresOn)}` : ""}
              {current.lease.dueDay ? ` · thu tiền ngày ${current.lease.dueDay}` : ""}
            </p>
            <ul className="mt-2 text-sm">
              {current.rents.map((r) => (
                <li key={r.id}>Giá thuê {vnd(r.amount)} từ {dmy(r.effectiveFrom)}</li>
              ))}
            </ul>
          </div>
          <div className="rounded-md bg-surface-2 p-3">
            <h3 className="text-sm font-semibold">App người thuê</h3>
            {sp.moi ? (
              <>
                <p className="mb-2 text-sm text-fg-muted">Gửi tin nhắn này cho người thuê. Link dùng được một lần, hết hạn sau 14 ngày.</p>
                <CopyBox
                  text={
                    current.tenant.userId
                      ? `Chào ${current.tenant.fullName}, đây là link đặt lại mật khẩu app KhuMình của bạn: ${await baseUrl()}/moi/${sp.moi}`
                      : `Chào ${current.tenant.fullName}, mời bạn vào app KhuMình để xem hóa đơn phòng ${d.unit.block ? `${d.unit.block}-` : ""}${d.unit.code} hằng tháng và chuyển khoản bằng mã QR: ${await baseUrl()}/moi/${sp.moi}`
                  }
                />
              </>
            ) : current.tenant.userId ? (
              <>
                <p className="text-sm text-success">Đã có tài khoản: người thuê xem hóa đơn và quét QR trong app.</p>
                {actor.role === "owner" ? (
                  <form action={createTenantInviteAction} className="mt-2 flex flex-wrap items-center gap-2">
                    {hidden}
                    <input type="hidden" name="leaseId" value={current.lease.id} />
                    <p className="flex-1 text-xs text-fg-muted">Người thuê quên mật khẩu? Tạo link để họ tự đặt mật khẩu mới.</p>
                    <button className="btn-secondary">Link đặt lại mật khẩu</button>
                  </form>
                ) : null}
              </>
            ) : (
              <form action={createTenantInviteAction} className="mt-1 flex flex-wrap items-center gap-2">
                {hidden}
                <input type="hidden" name="leaseId" value={current.lease.id} />
                <p className="flex-1 text-sm text-fg-muted">Chưa có tài khoản. Mời vào app để họ tự xem hóa đơn.</p>
                <button className="btn-secondary">Tạo link mời</button>
              </form>
            )}
          </div>
          {actor.role === "owner" ? (
            <div className="space-y-2">
              <h3 className="text-sm font-semibold">
                Gia hạn hợp đồng
                {current.lease.expiresOn && current.lease.expiresOn < today() ? (
                  <span className="ml-2 font-normal text-danger">đã hết hạn {dmy(current.lease.expiresOn)}</span>
                ) : null}
              </h3>
              <div className="flex flex-wrap items-end gap-2">
                {[6, 12].map((m) => (
                  <form key={m} action={extendLeaseAction}>
                    {hidden}
                    <input type="hidden" name="leaseId" value={current.lease.id} />
                    <input type="hidden" name="current" value={current.lease.expiresOn ?? ""} />
                    <input type="hidden" name="months" value={m} />
                    <button className="btn-secondary">+{m} tháng</button>
                  </form>
                ))}
                <form action={extendLeaseAction} className="flex flex-wrap items-end gap-2">
                  {hidden}
                  <input type="hidden" name="leaseId" value={current.lease.id} />
                  <div>
                    <label className="label">Hoặc tới ngày</label>
                    <input className="input" type="date" name="expiresOn" required />
                  </div>
                  <button className="btn-secondary">Lưu</button>
                </form>
              </div>
              <p className="text-xs text-fg-subtle">Gia hạn tính từ ngày hết hạn cũ; hợp đồng đã quá hạn thì tính từ hôm nay. Không đổi giá thuê.</p>
            </div>
          ) : null}
          <form action={changeRentAction} className="flex flex-wrap items-end gap-2">
            {hidden}
            <input type="hidden" name="leaseId" value={current.lease.id} />
            <div>
              <label className="label">Giá mới</label>
              <input className="input" name="amount" inputMode="numeric" required />
            </div>
            <div>
              <label className="label">Áp dụng từ</label>
              <input className="input" type="date" name="effectiveFrom" defaultValue={today()} required />
            </div>
            <button className="btn-secondary">Đổi giá thuê</button>
          </form>
          {actor.role === "owner" ? (
            <form action={setLeaseDueDayAction} className="flex flex-wrap items-end gap-2">
              {hidden}
              <input type="hidden" name="leaseId" value={current.lease.id} />
              <div>
                <label className="label">Ngày thu tiền hằng tháng (1–28)</label>
                <input className="input w-28" name="dueDay" inputMode="numeric" defaultValue={current.lease.dueDay ?? ""} placeholder="theo cơ sở" />
              </div>
              <button className="btn-secondary">Lưu ngày thu</button>
            </form>
          ) : null}
          <form action={moveOutAction} className="flex flex-wrap items-end gap-2">
            {hidden}
            <input type="hidden" name="leaseId" value={current.lease.id} />
            <div>
              <label className="label">Ngày ở cuối cùng</label>
              <input className="input" type="date" name="lastDay" defaultValue={today()} required />
            </div>
            <button className="btn-danger">Ghi nhận chuyển đi</button>
          </form>
          <p className="text-xs text-fg-subtle">
            Khi chuyển đi: ghi chỉ số điện nước ngày đó, lập hóa đơn cuối ở màn Tính tiền, rồi quyết toán cọc ngay tại trang này.
          </p>
        </section>
      ) : (
        <form action={createLeaseAction} className="card space-y-3">
          {hidden}
          <h2 className="font-semibold">Thêm người thuê</h2>
          <div className="grid gap-3 md:grid-cols-2">
            <div>
              <label className="label">Họ tên người đứng hợp đồng</label>
              <input className="input" name="fullName" required />
            </div>
            <div>
              <label className="label">Số điện thoại</label>
              <input className="input" name="phone" inputMode="tel" />
            </div>
            <div>
              <label className="label">Ngày vào ở</label>
              <input className="input" type="date" name="startDate" defaultValue={today()} required />
            </div>
            <div>
              <label className="label">Hợp đồng hết hạn (nếu có)</label>
              <input className="input" type="date" name="expiresOn" />
            </div>
            <div>
              <label className="label">Giá thuê / tháng</label>
              <input className="input" name="rent" inputMode="numeric" placeholder="3.000.000" required />
            </div>
            <div>
              <label className="label">Tiền cọc</label>
              <input className="input" name="deposit" inputMode="numeric" defaultValue="0" required />
            </div>
            <div>
              <label className="label">Số người ở</label>
              <input className="input" name="occupants" inputMode="numeric" defaultValue="1" required />
            </div>
            <div>
              <label className="label">Số xe gửi</label>
              <input className="input" name="parking" inputMode="numeric" defaultValue="0" />
            </div>
            <div>
              <label className="label">Ngày thu tiền hằng tháng (1–28, bỏ trống = theo cơ sở)</label>
              <input className="input" name="dueDay" inputMode="numeric" />
            </div>
          </div>
          <p className="text-xs text-fg-subtle">Nhớ ghi chỉ số điện nước ngày vào ở ở trang Chỉ số.</p>
          <button className="btn">Lưu hợp đồng</button>
        </form>
      )}

      <section className="card mt-6 space-y-3">
        <h2 className="font-semibold">Tầng</h2>
        <p className="text-sm text-fg-muted">
          Sơ đồ đang xếp phòng này ở: {floorLabel(deriveFloor(d.unit.code, d.unit.floor))}
          {d.unit.floor === null ? " (suy từ mã phòng)" : ""}.
        </p>
        {actor.role === "owner" ? (
          <form action={setUnitFloorAction} className="flex flex-wrap items-end gap-2">
            {hidden}
            <div>
              <label className="label">Tầng (0 = tầng trệt, bỏ trống = suy từ mã)</label>
              <input className="input w-28" name="floor" inputMode="numeric" defaultValue={d.unit.floor ?? ""} />
            </div>
            <button className="btn-secondary">Lưu tầng</button>
          </form>
        ) : null}
      </section>

      <section className="card mt-6 space-y-3">
        <h2 className="font-semibold">Xe của phòng</h2>
        {vehicles.length === 0 ? (
          <p className="text-sm text-fg-muted">Chưa ghi xe nào cho phòng này.</p>
        ) : (
          <ul className="space-y-2 text-sm">
            {vehicles.map((v) => (
              <li key={v.id} className="flex flex-wrap items-center justify-between gap-2">
                <span>
                  <strong>{v.plate}</strong> · {v.kind}
                  {v.monthlyFee > 0 ? ` · vé tháng ${vnd(v.monthlyFee)}` : ""}
                  {v.note ? ` · ${v.note}` : ""}
                </span>
                {actor.role === "owner" ? (
                  <form action={deleteVehicleAction}>
                    {hidden}
                    <input type="hidden" name="vehicleId" value={v.id} />
                    <button className="btn-danger">Xóa</button>
                  </form>
                ) : null}
              </li>
            ))}
          </ul>
        )}
        {actor.role === "owner" ? (
          <form action={addVehicleAction} className="flex flex-wrap items-end gap-2">
            {hidden}
            <div>
              <label className="label">Biển số</label>
              <input className="input" name="plate" required />
            </div>
            <div>
              <label className="label">Loại xe</label>
              <select className="input" name="kind" defaultValue={VEHICLE_KINDS[0]}>
                {VEHICLE_KINDS.map((k) => (
                  <option key={k} value={k}>
                    {k}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="label">Phí vé tháng</label>
              <input className="input" name="monthlyFee" inputMode="numeric" defaultValue="0" />
            </div>
            <div>
              <label className="label">Ghi chú</label>
              <input className="input" name="note" />
            </div>
            <button className="btn">Thêm xe</button>
          </form>
        ) : null}
        <p className="text-xs text-fg-subtle">Xe mới thêm gắn với người đang thuê phòng này (nếu có); phòng trống thì ghi là xe chung của phòng.</p>
      </section>

      {current && ended ? <Settlement actor={actor} propertyId={id} unitId={unitId} leaseId={ended.lease.id} hideWhenDone /> : null}

      {d.leases.filter((l) => l !== current).length > 0 ? (
        <section className="card mt-6">
          <h2 className="mb-2 font-semibold">Lịch sử thuê</h2>
          <ul className="space-y-1 text-sm">
            {d.leases
              .filter((l) => l !== current)
              .map((l) => (
                <li key={l.lease.id}>
                  {l.tenant.fullName}: {dmy(l.lease.startDate)} – {dmy(l.lease.movedOutOn) || "nay"}
                </li>
              ))}
          </ul>
        </section>
      ) : null}
    </>
  );
}

const METHOD: Record<string, string> = { cash: "tiền mặt", transfer: "chuyển khoản", other: "khác" };

/** Trả phòng – quyết toán cọc cho hợp đồng vừa kết thúc (KM-COC). */
async function Settlement(props: { actor: Actor; propertyId: string; unitId: string; leaseId: string; hideWhenDone: boolean }) {
  const { actor, propertyId, unitId, leaseId } = props;
  const ctx = await settlementContext(actor, leaseId);
  if (!ctx) return null;
  const st = ctx.settlement;
  // Phòng đã có người mới: chỉ giữ thẻ khi còn việc (chưa quyết toán hoặc chưa hoàn cọc).
  if (props.hideWhenDone && st && (st.refundDue === 0 || st.refundedOn)) return null;
  if (props.hideWhenDone && !st && ctx.movedOutOn && ctx.movedOutOn < addDays(today(), -SETTLE_WITHIN_DAYS)) return null;
  const ids = (
    <>
      <input type="hidden" name="propertyId" value={propertyId} />
      <input type="hidden" name="unitId" value={unitId} />
    </>
  );

  if (st) {
    return (
      <section className="card mt-6 space-y-3">
        <h2 className="font-semibold">Quyết toán cọc: {ctx.tenantName}</h2>
        <table className="w-full text-sm">
          <tbody>
            <tr><td>Cọc thực giữ</td><td className="text-right">{vnd(st.depositHeld)}</td></tr>
            <tr><td>Nợ hóa đơn</td><td className="text-right">{vnd(st.debtBefore)}</td></tr>
            {st.fullMonthTopUp > 0 ? <tr><td>Bù tiền phòng đủ tháng dở</td><td className="text-right">{vnd(st.fullMonthTopUp)}</td></tr> : null}
            {st.deductions.map((x, i) => (
              <tr key={i}><td>Khấu trừ: {x.reason}</td><td className="text-right">{vnd(x.amount)}</td></tr>
            ))}
            {st.creditApplied > 0 ? <tr><td>Trừ tiền khách đã trả dư</td><td className="text-right">−{vnd(st.creditApplied)}</td></tr> : null}
            <tr><td>Cấn trừ cọc</td><td className="text-right">−{vnd(st.depositApplied)}</td></tr>
            {st.refundDue > 0 ? <tr className="font-semibold"><td>Chủ trọ hoàn lại khách</td><td className="text-right">{vnd(st.refundDue)}</td></tr> : null}
            {st.tenantOwes > 0 ? <tr className="font-semibold"><td>Khách trả thêm</td><td className="text-right">{vnd(st.tenantOwes)}</td></tr> : null}
          </tbody>
        </table>
        <p className="text-sm text-fg-muted">
          Quyết toán ngày {dmy(st.settledOn)} · tháng cuối {st.lastMonthMode === "full_month" ? "thu đủ tháng" : "tính theo ngày"}
          {st.refundedOn ? ` · đã hoàn ${dmy(st.refundedOn)} (${METHOD[st.refundMethod ?? "other"]})` : ""}
        </p>
        {ctx.finalInvoice ? (
          <p className="text-sm">
            <Link className="text-brand-ink underline" href={`/co-so/${propertyId}/hoa-don/${ctx.finalInvoice.id}`}>Hóa đơn cuối {ctx.finalInvoice.code}</Link>
            {st.tenantOwes > 0 ? " (thu phần khách trả thêm ở đây)" : ""}
          </p>
        ) : null}
        <ShareImage
          src={`/co-so/${propertyId}/phong/${unitId}/quyet-toan/anh?hd=${ctx.leaseId}`}
          filename={`quyet-toan-phong-${ctx.unitCode}.png`}
          text={`Quyết toán trả phòng ${ctx.unitCode}`}
          label="Gửi phiếu quyết toán (Zalo)"
        />
        {actor.role === "owner" && st.refundDue > 0 && !st.refundedOn ? (
          <form action={markRefundedAction} className="flex flex-wrap items-end gap-2">
            {ids}
            <input type="hidden" name="settlementId" value={st.id} />
            <div>
              <label className="label">Ngày hoàn</label>
              <input className="input" type="date" name="refundedOn" defaultValue={today()} required />
            </div>
            <div>
              <label className="label">Hình thức</label>
              <select className="input" name="method" defaultValue="transfer">
                <option value="transfer">Chuyển khoản</option>
                <option value="cash">Tiền mặt</option>
                <option value="other">Khác</option>
              </select>
            </div>
            <button className="btn-secondary">Đã hoàn {vnd(st.refundDue)}</button>
          </form>
        ) : null}
        {actor.role === "owner" && !st.refundedOn ? (
          <details>
            <summary className="cursor-pointer text-sm text-fg-muted">Làm nhầm? Hủy quyết toán</summary>
            <form action={voidSettlementAction} className="mt-2 flex flex-wrap items-end gap-2">
              {ids}
              <input type="hidden" name="settlementId" value={st.id} />
              <div className="flex-1">
                <label className="label">Lý do hủy</label>
                <input className="input" name="reason" required />
              </div>
              <button className="btn-danger">Hủy quyết toán</button>
            </form>
          </details>
        ) : null}
      </section>
    );
  }

  return (
    <section className="card mt-6 space-y-3">
      <h2 className="font-semibold">Trả phòng: quyết toán cọc {ctx.tenantName}</h2>
      <p className="text-sm text-fg-muted">
        Chuyển đi {dmy(ctx.movedOutOn)} · cọc hợp đồng {vnd(ctx.deposit)}
        {ctx.unallocatedCredit > 0 ? ` · khách đang trả dư ${vnd(ctx.unallocatedCredit)}` : ""}
      </p>
      {ctx.openInvoices.length ? (
        <ul className="text-sm">
          {ctx.openInvoices.map((i) => (
            <li key={i.id}>
              <Link className="underline" href={`/co-so/${propertyId}/hoa-don/${i.id}`}>{i.code}</Link>: còn nợ {vnd(i.total - i.paid)}
            </li>
          ))}
        </ul>
      ) : null}
      {ctx.blocker ? (
        <p className="rounded-md bg-surface-2 p-3 text-sm">
          <span className="text-warning">Chưa quyết toán được: </span>
          {ctx.blocker}.{" "}
          {ctx.finalPeriodId ? (
            <Link className="text-brand-ink underline" href={`/co-so/${propertyId}/ky/${ctx.finalPeriodId}?phong=${ctx.leaseId}`}>Mở màn Tính tiền</Link>
          ) : (
            <Link className="text-brand-ink underline" href={`/co-so/${propertyId}/ky`}>Mở kỳ</Link>
          )}
        </p>
      ) : actor.role === "owner" ? (
        <SettlementForm propertyId={propertyId} unitId={unitId} leaseId={ctx.leaseId} deposit={ctx.deposit} settledOn={today()} suggestedTopUp={ctx.suggestedTopUp} />
      ) : (
        <p className="text-sm text-fg-muted">Chủ trọ quyết toán cọc.</p>
      )}
    </section>
  );
}
