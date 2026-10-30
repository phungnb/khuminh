import Link from "next/link";
import SubmitButton from "@/components/submit-button";
import { Empty, Flash, PageTitle } from "@/components/ui";
import { dmy, vnd } from "@/lib/format";
import { requireActor } from "@/lib/session";
import { addDays } from "@/domain/dates";
import { floorLabel, groupRoomsByFloor, ROOM_STATUS_LABEL, roomStatus, type RoomStatus } from "@/domain/rooms";
import { today, unitsOverview } from "@/server/queries";
import { EXPIRING_WITHIN_DAYS } from "@/server/overview-items";
import { importUnitsAction } from "../../actions";

/** Màu ô phòng theo trạng thái (theo mẫu thẻ đã hết hạn/sắp hết hạn sẵn có). */
const CELL: Record<RoomStatus, string> = {
  trong: "border-success/40 bg-success/10",
  thue: "border-fg/20 bg-surface-2",
  "sap-het-han": "border-warning/40 bg-warning/10",
  "het-han": "border-danger/40 bg-danger/10",
  no: "border-danger/60 bg-danger/20",
};

export default async function Page({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ loi?: string; ok?: string; dang?: string }>;
}) {
  const { id } = await params;
  const actor = await requireActor();
  const t = today();
  const units = await unitsOverview(actor, id, t);
  const dang = (await searchParams).dang;
  return (
    <>
      <PageTitle>Phòng</PageTitle>
      <Flash params={await searchParams} />
      <div className="mb-4 flex gap-2">
        <Link href={`/co-so/${id}/phong`} className={`chip ${dang === "so-do" ? "" : "chip-on"}`}>
          Danh sách
        </Link>
        <Link href={`/co-so/${id}/phong?dang=so-do`} className={`chip ${dang === "so-do" ? "chip-on" : ""}`}>
          Sơ đồ tầng
        </Link>
      </div>
      {dang === "so-do" ? (
        units.length === 0 ? (
          <Empty>Chưa có phòng. Thêm danh sách phòng ở ô bên dưới.</Empty>
        ) : (
          <div className="space-y-6">
            <p className="text-sm text-fg-muted">
              Bấm vào ô phòng để mở chi tiết. Tầng lấy từ cột tầng của phòng, chưa đặt thì suy từ mã phòng (vd 101 → tầng 1).
            </p>
            {groupRoomsByFloor(units).map((g) => (
              <section key={String(g.floor)}>
                <h2 className="mb-2 font-semibold">{floorLabel(g.floor)}</h2>
                <div className="grid grid-cols-3 gap-2 sm:grid-cols-4 md:grid-cols-6">
                  {g.rooms.map((u) => {
                    const st = roomStatus(u, t, EXPIRING_WITHIN_DAYS);
                    return (
                      <Link key={u.id} href={`/co-so/${id}/phong/${u.id}`} className={`rounded-xl border px-2 py-3 text-center ${CELL[st]}`}>
                        <div className="font-semibold">
                          {u.block ? `${u.block}-` : ""}
                          {u.code}
                        </div>
                        <div className="text-xs">{ROOM_STATUS_LABEL[st]}</div>
                        {u.lease ? <div className="truncate text-xs text-fg-muted">{u.lease.tenantName}</div> : null}
                      </Link>
                    );
                  })}
                </div>
              </section>
            ))}
          </div>
        )
      ) : units.length === 0 ? (
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
                    <Link className="font-semibold text-brand-ink" href={`/co-so/${id}/phong/${u.id}`}>
                      {u.block ? `${u.block}-` : ""}
                      {u.code}
                    </Link>
                  </td>
                  <td>{u.lease ? `${u.lease.tenantName} (${u.lease.occupants} người)` : <span className="text-fg-subtle">Trống</span>}</td>
                  <td className="text-right">{u.lease ? vnd(u.lease.rent) : ""}</td>
                  <td>
                    <span className="whitespace-nowrap">{dmy(u.lease?.expiresOn)}</span>
                    {u.lease?.expiresOn ? <ExpiryTag expiresOn={u.lease.expiresOn} t={t} /> : null}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <form action={importUnitsAction} className="card mt-6 space-y-3">
        <input type="hidden" name="propertyId" value={id} />
        <h2 className="font-semibold">Thêm phòng</h2>
        <p className="text-sm text-fg-muted">
          Mỗi dòng một phòng. Có dãy thì ghi <code>dãy,mã phòng</code>, ví dụ <code>A,101</code>. Thêm tầng ở cột thứ ba, ví dụ{" "}
          <code>A,101,1</code> (0 = tầng trệt; bỏ trống thì sơ đồ suy từ mã phòng). Dán trực tiếp các cột từ Excel cũng được.
        </p>
        <textarea className="input font-mono" name="rows" rows={6} placeholder={"101\n102\n103"} />
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" name="waterMeter" /> Mỗi phòng có đồng hồ nước riêng
        </label>
        <SubmitButton>Thêm phòng</SubmitButton>
      </form>
    </>
  );
}

function ExpiryTag({ expiresOn, t }: { expiresOn: string; t: string }) {
  if (expiresOn < t) return <span className="mt-1 block w-fit whitespace-nowrap rounded-full bg-danger/15 px-2 py-0.5 text-xs font-semibold text-danger">đã hết hạn</span>;
  if (expiresOn <= addDays(t, EXPIRING_WITHIN_DAYS))
    return <span className="mt-1 block w-fit whitespace-nowrap rounded-full bg-warning/15 px-2 py-0.5 text-xs font-semibold text-warning">sắp hết hạn</span>;
  return null;
}
