import Link from "next/link";
import { Empty, Flash, PageTitle } from "@/components/ui";
import { dmy, vnd } from "@/lib/format";
import { requireActor } from "@/lib/session";
import { unitsOverview } from "@/server/queries";
import { importUnitsAction } from "../../actions";

export default async function Page({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ loi?: string; ok?: string }>;
}) {
  const { id } = await params;
  const actor = await requireActor();
  const units = await unitsOverview(actor, id);
  return (
    <>
      <PageTitle>Phòng</PageTitle>
      <Flash params={await searchParams} />
      {units.length === 0 ? (
        <Empty>Chưa có phòng. Thêm danh sách phòng ở ô bên dưới.</Empty>
      ) : (
        <div className="card overflow-x-auto p-0">
          <table className="table">
            <thead>
              <tr>
                <th>Phòng</th>
                <th>Người thuê</th>
                <th className="text-right">Giá thuê</th>
                <th>Hết hạn</th>
              </tr>
            </thead>
            <tbody>
              {units.map((u) => (
                <tr key={u.id}>
                  <td>
                    <Link className="font-semibold text-brand" href={`/co-so/${id}/phong/${u.id}`}>
                      {u.block ? `${u.block}-` : ""}
                      {u.code}
                    </Link>
                  </td>
                  <td>{u.lease ? `${u.lease.tenantName} (${u.lease.occupants} người)` : <span className="text-stone-400">Trống</span>}</td>
                  <td className="text-right">{u.lease ? vnd(u.lease.rent) : ""}</td>
                  <td>{dmy(u.lease?.expiresOn)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <form action={importUnitsAction} className="card mt-6 space-y-3">
        <input type="hidden" name="propertyId" value={id} />
        <h2 className="font-semibold">Thêm phòng</h2>
        <p className="text-sm text-stone-600">
          Mỗi dòng một phòng. Có dãy thì ghi <code>dãy,mã phòng</code>, ví dụ <code>A,101</code>. Dán trực tiếp hai cột từ Excel cũng được.
        </p>
        <textarea className="input font-mono" name="rows" rows={6} placeholder={"101\n102\n103"} />
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" name="waterMeter" /> Mỗi phòng có đồng hồ nước riêng
        </label>
        <button className="btn">Thêm phòng</button>
      </form>
    </>
  );
}
