import { notFound } from "next/navigation";
import { CopyBox } from "@/components/copy-box";
import { Flash, PageTitle } from "@/components/ui";
import { dmy, vnd } from "@/lib/format";
import { requireActor } from "@/lib/session";
import { baseUrl } from "@/lib/url";
import { listStaff } from "@/server/staff";
import { getProperty, listFeeRules, today } from "@/server/queries";
import { createStaffInviteAction, removeStaffAction, setFeeRuleAction, updatePropertyAction } from "../../actions";
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
  const staff = actor.role === "owner" ? await listStaff(actor, id) : [];

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
                  <b>{r.name}</b> <span className="text-xs text-stone-400">{r.key}</span>
                </td>
                <td>{METHOD_LABEL[r.method]}</td>
                <td className="text-right">
                  {vnd(r.unitPrice)}
                  {r.unitLabel ? `/${r.unitLabel}` : ""}
                </td>
                <td>{r.method === "metered" ? "—" : r.prorate ? "Có" : "Không"}</td>
                <td>{dmy(r.effectiveFrom)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      <form action={setFeeRuleAction} className="card mt-4 space-y-3">
        <input type="hidden" name="propertyId" value={id} />
        <h2 className="font-semibold">Thêm khoản phí hoặc đổi giá</h2>
        <p className="text-sm text-stone-600">
          Đổi giá: nhập đúng mã khoản đang có (ví dụ <code>electricity</code>) với giá mới và ngày áp dụng. Giá cũ được giữ cho các kỳ trước.
        </p>
        <div className="grid gap-3 md:grid-cols-3">
          <div>
            <label className="label">Mã khoản</label>
            <input className="input" name="key" placeholder="internet" pattern="[a-z0-9_]+" required />
          </div>
          <div>
            <label className="label">Tên hiển thị</label>
            <input className="input" name="name" placeholder="Internet" required />
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
        <button className="btn">Lưu khoản phí</button>
      </form>

      <form action={updatePropertyAction} className="card mt-6 space-y-3">
        <input type="hidden" name="propertyId" value={id} />
        <h2 className="font-semibold">Thông tin cơ sở</h2>
        <PropertyFields v={property} />
        <button className="btn">Lưu</button>
      </form>

      {actor.role === "owner" ? (
        <section id="nhan-vien" className="card mt-6 space-y-3">
          <h2 className="font-semibold">Nhân viên</h2>
          <p className="text-sm text-stone-600">
            Nhân viên được ghi chỉ số, thu tiền, đăng bảng tin của cơ sở này. Chỉ chủ trọ được phát hành, điều chỉnh, hủy hóa đơn.
          </p>
          {staff.length ? (
            <ul className="divide-y divide-stone-100 text-sm">
              {staff.map((m) => (
                <li key={m.userId} className="flex items-center justify-between gap-2 py-2">
                  <span>
                    {m.displayName} <span className="text-stone-500">{m.email}</span>
                  </span>
                  <form action={removeStaffAction}>
                    <input type="hidden" name="propertyId" value={id} />
                    <input type="hidden" name="userId" value={m.userId} />
                    <button className="btn-danger">Bỏ</button>
                  </form>
                </li>
              ))}
            </ul>
          ) : null}
          {sp.nv ? (
            <>
              <p className="text-sm text-stone-600">Gửi link này cho nhân viên. Link dùng một lần, hết hạn sau 7 ngày.</p>
              <CopyBox text={`Mời bạn quản lý ${property.name} trên KhuMình: ${await baseUrl()}/nhan-vien/${sp.nv}`} />
            </>
          ) : (
            <form action={createStaffInviteAction}>
              <input type="hidden" name="propertyId" value={id} />
              <button className="btn-secondary">Tạo link mời nhân viên</button>
            </form>
          )}
        </section>
      ) : null}
    </>
  );
}
