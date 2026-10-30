import { notFound } from "next/navigation";
import SubmitButton from "@/components/submit-button";
import { CopyBox } from "@/components/copy-box";
import LocationPicker from "@/components/location-picker";
import { Flash, PageTitle } from "@/components/ui";
import { dmy, vnd } from "@/lib/format";
import { requireActor } from "@/lib/session";
import { baseUrl } from "@/lib/url";
import { isDraft, propertyUsage } from "@/server/property-lifecycle";
import { listStaff } from "@/server/staff";
import { getProperty, listFeeRules, today } from "@/server/queries";
import {
  archivePropertyAction,
  createStaffInviteAction,
  deletePropertyAction,
  removeStaffAction,
  restorePropertyAction,
  setFeeRuleAction,
  setLocationAction,
  updatePropertyAction,
} from "../../actions";
import { PropertyFields } from "../../property-fields";

const METHOD_LABEL = {
  fixed: "Cố định / phòng",
  per_person: "Theo số người",
  per_quantity: "Theo số lượng (xe...)",
  metered: "Theo chỉ số đồng hồ",
} as const;

export default async function Page({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ loi?: string; ok?: string; nv?: string }>;
}) {
  const { id } = await params;
  const actor = await requireActor();
  const [property, rules] = await Promise.all([getProperty(actor, id), listFeeRules(actor, id)]);
  if (!property) notFound();
  const sp = await searchParams;
  // Nhân viên + mức dùng không phụ thuộc nhau nên đọc song song (chỉ chủ trọ).
  const [staff, usage] =
    actor.role === "owner"
      ? await Promise.all([listStaff(actor, id), propertyUsage(actor, id)])
      : [[], null];

  return (
    <>
      <PageTitle>Biểu phí và cài đặt</PageTitle>
      <Flash params={sp} />

      <section className="card overflow-x-auto p-0">
        <table className="table">
          <thead>
            <tr>
              <th>Khoản</th>
              <th>Cách tính</th>
              <th className="text-right">Đơn giá</th>
              <th>Chia theo ngày</th>
              <th>Từ ngày</th>
            </tr>
          </thead>
          <tbody>
            {rules.map((r) => (
              <tr key={r.id}>
                <td>
                  <b>{r.name}</b>
                </td>
                <td>{METHOD_LABEL[r.method]}</td>
                <td className="text-right">
                  {vnd(r.unitPrice)}
                  {r.unitLabel ? `/${r.unitLabel}` : ""}
                </td>
                <td>{r.method === "metered" ? "—" : r.prorate ? "Có" : "Không"}</td>
                <td>{r.effectiveFrom === "2000-01-01" ? "Từ đầu" : dmy(r.effectiveFrom)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      <form action={setFeeRuleAction} className="card mt-4 space-y-3">
        <input type="hidden" name="propertyId" value={id} />
        <h2 className="font-semibold">Thêm khoản phí hoặc đổi giá</h2>
        <p className="text-sm text-fg-muted">
          Đổi giá khoản đang có: chọn khoản trong danh sách, nhập giá mới và ngày áp dụng. Giá cũ được giữ cho các kỳ trước.
          Thêm khoản mới: chọn “Khoản mới”, nhập mã (chữ thường, không dấu, ví dụ internet) và tên hiển thị.
        </p>
        <div className="grid gap-3 md:grid-cols-3">
          <div>
            <label className="label">Khoản phí</label>
            <select className="input" name="key" required>
              {rules.map((r) => (
                <option key={r.id} value={r.key}>
                  {r.name} — {vnd(r.unitPrice)}
                  {r.unitLabel ? `/${r.unitLabel}` : ""}
                </option>
              ))}
              <option value="__new__">Khoản mới…</option>
            </select>
          </div>
          <div>
            <label className="label">Mã khoản mới</label>
            <input className="input" name="newKey" placeholder="internet" pattern="[a-z0-9_]+" />
          </div>
          <div>
            <label className="label">Tên hiển thị</label>
            <input className="input" name="name" placeholder="Internet" />
          </div>
          <div>
            <label className="label">Cách tính</label>
            <select className="input" name="method" defaultValue="fixed">
              {Object.entries(METHOD_LABEL).map(([k, v]) => (
                <option key={k} value={k}>{v}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="label">Đơn giá (đồng)</label>
            <input className="input" name="unitPrice" inputMode="numeric" required />
          </div>
          <div>
            <label className="label">Đơn vị (kWh, m³, xe...)</label>
            <input className="input" name="unitLabel" />
          </div>
          <div>
            <label className="label">Loại đồng hồ (nếu theo chỉ số)</label>
            <select className="input" name="meterKind" defaultValue="electricity">
              <option value="electricity">Điện</option>
              <option value="water">Nước</option>
            </select>
          </div>
          <div>
            <label className="label">Áp dụng từ</label>
            <input className="input" type="date" name="effectiveFrom" defaultValue={today()} required />
          </div>
          <label className="flex items-center gap-2 self-end pb-2 text-sm">
            <input type="checkbox" name="prorate" defaultChecked /> Chia theo ngày khi ở không trọn kỳ
          </label>
        </div>
        <SubmitButton>Lưu khoản phí</SubmitButton>
      </form>

      <form action={updatePropertyAction} className="card mt-6 space-y-3">
        <input type="hidden" name="propertyId" value={id} />
        <h2 className="font-semibold">Thông tin cơ sở</h2>
        <PropertyFields v={property} />
        <SubmitButton>Lưu</SubmitButton>
      </form>

      <form id="vi-tri" action={setLocationAction} className="card mt-6 space-y-3">
        <input type="hidden" name="propertyId" value={id} />
        <h2 className="font-semibold">Vị trí cơ sở cho Chợ quanh đây</h2>
        <p className="text-sm text-fg-muted">
          Cư dân của cơ sở xem và đăng tin trong bán kính quanh vị trí này. Tin đăng chỉ hiện vị trí gần đúng (khoảng 500 m).
          Tìm địa chỉ, bấm “Dùng vị trí của tôi”, hoặc chạm vào bản đồ để đặt ghim.
        </p>
        <LocationPicker defaultLat={property.lat} defaultLng={property.lng} />
        <SubmitButton>Lưu vị trí</SubmitButton>
      </form>

      {actor.role === "owner" ? (
        <section id="nhan-vien" className="card mt-6 space-y-3">
          <h2 className="font-semibold">Nhân viên</h2>
          <p className="text-sm text-fg-muted">
            Nhân viên được ghi chỉ số, thu tiền, đăng bảng tin của cơ sở này. Chỉ chủ trọ được phát hành, điều chỉnh, hủy hóa đơn.
          </p>
          {staff.length ? (
            <ul className="divide-y divide-border/60 text-sm">
              {staff.map((m) => (
                <li key={m.userId} className="flex items-center justify-between gap-2 py-2">
                  <span>
                    {m.displayName} <span className="text-fg-subtle">{m.email}</span>
                  </span>
                  <form action={removeStaffAction}>
                    <input type="hidden" name="propertyId" value={id} />
                    <input type="hidden" name="userId" value={m.userId} />
                    <SubmitButton className="btn-danger">Bỏ</SubmitButton>
                  </form>
                </li>
              ))}
            </ul>
          ) : null}
          {sp.nv ? (
            <>
              <p className="text-sm text-fg-muted">Gửi link này cho nhân viên. Link dùng một lần, hết hạn sau 7 ngày.</p>
              <CopyBox text={`Mời bạn quản lý ${property.name} trên KhuMình: ${await baseUrl()}/nhan-vien/${sp.nv}`} />
            </>
          ) : (
            <form action={createStaffInviteAction}>
              <input type="hidden" name="propertyId" value={id} />
              <SubmitButton className="btn-secondary">Tạo link mời nhân viên</SubmitButton>
            </form>
          )}
        </section>
      ) : null}

      {usage ? (
        <section id="khu" className="card mt-6 space-y-3 border-danger/30">
          <h2 className="font-semibold">Xóa hoặc lưu trữ khu</h2>
          {usage.archived ? (
            <>
              <p className="text-sm text-fg-muted">Khu đang được lưu trữ: ẩn khỏi danh sách, chợ và Hôm nay. Dữ liệu vẫn giữ nguyên.</p>
              <form action={restorePropertyAction}>
                <input type="hidden" name="propertyId" value={id} />
                <SubmitButton>Khôi phục khu</SubmitButton>
              </form>
            </>
          ) : isDraft(usage) ? (
            <form action={deletePropertyAction} className="space-y-3">
              <input type="hidden" name="propertyId" value={id} />
              <p className="text-sm text-fg-muted">
                Khu chưa có hợp đồng hay hóa đơn nào nên có thể xóa hẳn. Sẽ xóa luôn {usage.units} phòng, đồng hồ, chỉ số, biểu phí,
                nhân viên được giao và bảng tin của khu. Không hoàn tác được.
              </p>
              <div>
                <label className="label" htmlFor="confirmName">
                  Gõ lại tên khu <b className="text-fg">{property.name}</b> để xác nhận
                </label>
                <input className="input" id="confirmName" name="confirmName" autoComplete="off" required />
              </div>
              <SubmitButton className="btn-danger">Xóa hẳn khu</SubmitButton>
            </form>
          ) : (
            <form action={archivePropertyAction} className="space-y-3">
              <input type="hidden" name="propertyId" value={id} />
              <p className="text-sm text-fg-muted">
                Khu đã có {usage.leases} hợp đồng và {usage.periods} kỳ hóa đơn nên không xóa hẳn được (giữ chứng từ thu tiền). Lưu trữ
                sẽ ẩn khu khỏi danh sách, chợ và Hôm nay; khôi phục được bất cứ lúc nào.
                {usage.activeLeases > 0 ? ` Hiện còn ${usage.activeLeases} hợp đồng đang thuê, cần ghi nhận chuyển đi trước.` : ""}
              </p>
              <SubmitButton className="btn-danger" disabled={usage.activeLeases> 0}>
                Lưu trữ khu
              </SubmitButton>
            </form>
          )}
        </section>
      ) : null}
    </>
  );
}
