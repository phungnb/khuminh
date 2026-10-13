import { notFound } from "next/navigation";
import { CopyBox } from "@/components/copy-box";
import { Flash, PageTitle } from "@/components/ui";
import { dmy, vnd } from "@/lib/format";
import { requireActor } from "@/lib/session";
import { baseUrl } from "@/lib/url";
import { today, unitDetail } from "@/server/queries";
import { changeRentAction, createLeaseAction, createTenantInviteAction, moveOutAction } from "../../../actions";

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
  const hidden = (
    <>
      <input type="hidden" name="propertyId" value={id} />
      <input type="hidden" name="unitId" value={unitId} />
    </>
  );

  return (
    <>
      <PageTitle>Phòng {d.unit.block ? `${d.unit.block}-` : ""}{d.unit.code}</PageTitle>
      <Flash params={sp} />

      {current ? (
        <section className="card space-y-4">
          <div>
            <h2 className="font-semibold">Đang thuê: {current.tenant.fullName}</h2>
            <p className="text-sm text-stone-600">
              {current.tenant.phone ?? "Chưa có SĐT"} · vào ở {dmy(current.lease.startDate)} · {current.lease.occupants} người · cọc {vnd(current.lease.deposit)}
              {current.lease.expiresOn ? ` · hết hạn ${dmy(current.lease.expiresOn)}` : ""}
            </p>
            <ul className="mt-2 text-sm">
              {current.rents.map((r) => (
                <li key={r.id}>Giá thuê {vnd(r.amount)} từ {dmy(r.effectiveFrom)}</li>
              ))}
            </ul>
          </div>
          <div className="rounded-md bg-stone-50 p-3">
            <h3 className="text-sm font-semibold">App người thuê</h3>
            {current.tenant.userId ? (
              <p className="text-sm text-emerald-700">Đã có tài khoản: người thuê xem hóa đơn và quét QR trong app.</p>
            ) : sp.moi ? (
              <>
                <p className="mb-2 text-sm text-stone-600">Gửi tin nhắn này cho người thuê. Link dùng được một lần, hết hạn sau 14 ngày.</p>
                <CopyBox
                  text={`Chào ${current.tenant.fullName}, mời bạn vào app KhuMình để xem hóa đơn phòng ${d.unit.block ? `${d.unit.block}-` : ""}${d.unit.code} hằng tháng và chuyển khoản bằng mã QR: ${await baseUrl()}/moi/${sp.moi}`}
                />
              </>
            ) : (
              <form action={createTenantInviteAction} className="mt-1 flex flex-wrap items-center gap-2">
                {hidden}
                <input type="hidden" name="leaseId" value={current.lease.id} />
                <p className="flex-1 text-sm text-stone-600">Chưa có tài khoản. Mời vào app để họ tự xem hóa đơn.</p>
                <button className="btn-secondary">Tạo link mời</button>
              </form>
            )}
          </div>
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
          <form action={moveOutAction} className="flex flex-wrap items-end gap-2">
            {hidden}
            <input type="hidden" name="leaseId" value={current.lease.id} />
            <div>
              <label className="label">Ngày ở cuối cùng</label>
              <input className="input" type="date" name="lastDay" defaultValue={today()} required />
            </div>
            <button className="btn-danger">Ghi nhận chuyển đi</button>
          </form>
          <p className="text-xs text-stone-500">
            Khi chuyển đi: ghi chỉ số điện nước ngày đó, lập hóa đơn kỳ, rồi điều chỉnh trừ tiền cọc trên hóa đơn cuối.
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
          </div>
          <p className="text-xs text-stone-500">Nhớ ghi chỉ số điện nước ngày vào ở ở trang Chỉ số.</p>
          <button className="btn">Lưu hợp đồng</button>
        </form>
      )}

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
