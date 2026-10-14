import { Wrench } from "lucide-react";
import { Badge, EmptyState, Flash } from "@/components/ui";
import { dateTimeVn } from "@/lib/format";
import { requireUser } from "@/lib/session";
import { MAINTENANCE_STATUS_LABEL, reportablePlaces, tenantMaintenanceRequests } from "@/server/maintenance";
import { tenantReportIssueAction } from "../actions";

export const dynamic = "force-dynamic";

export default async function Page({ searchParams }: { searchParams: Promise<{ loi?: string; ok?: string }> }) {
  const user = await requireUser();
  const [places, requests] = await Promise.all([reportablePlaces(user.id), tenantMaintenanceRequests(user.id)]);
  if (places.length === 0 && requests.length === 0) {
    return (
      <EmptyState
        icon={Wrench}
        title="Chưa gắn với phòng nào"
        description="Báo sự cố dành cho người đang thuê. Xin chủ nhà gửi link mời để vào app."
      />
    );
  }
  return (
    <>
      <h1 className="mb-1 text-xl font-bold">Báo sự cố</h1>
      <p className="mb-4 text-sm text-fg-muted">Hỏng điện nước, đồ đạc trong phòng: gửi chủ nhà và theo dõi tới khi xử lý xong.</p>
      <Flash params={await searchParams} />
      {places.length > 0 ? (
        <form action={tenantReportIssueAction} className="card mb-6 space-y-3">
          {places.length > 1 ? (
            <div>
              <label className="label" htmlFor="leaseId">Phòng</label>
              <select className="input" id="leaseId" name="leaseId">
                {places.map((p) => (
                  <option key={p.leaseId} value={p.leaseId}>{p.propertyName} · phòng {p.unitCode}</option>
                ))}
              </select>
            </div>
          ) : (
            <>
              <input type="hidden" name="leaseId" value={places[0]!.leaseId} />
              <p className="text-sm text-fg-subtle">{places[0]!.propertyName} · phòng {places[0]!.unitCode}</p>
            </>
          )}
          <div>
            <label className="label" htmlFor="title">Sự cố</label>
            <input className="input" id="title" name="title" maxLength={120} placeholder="Vòi nước nhà tắm bị rỉ" required />
          </div>
          <div>
            <label className="label" htmlFor="body">Mô tả thêm (không bắt buộc)</label>
            <textarea className="input" id="body" name="body" rows={3} maxLength={1000} />
          </div>
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" name="urgent" value="1" /> Gấp (mất điện, mất nước, rò rỉ lớn)
          </label>
          <button className="btn w-full">Gửi chủ nhà</button>
        </form>
      ) : null}
      <h2 className="mb-2 text-sm font-semibold text-fg-subtle">Đã báo</h2>
      {requests.length === 0 ? (
        <p className="text-sm text-fg-subtle">Chưa có yêu cầu nào.</p>
      ) : (
        <ul className="space-y-2">
          {requests.map((r) => (
            <li key={r.id} className="card">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <div className="font-medium">{r.urgent ? <span className="text-danger">Gấp · </span> : null}{r.title}</div>
                  <div className="text-xs text-fg-subtle">Phòng {r.unitCode} · {dateTimeVn(r.createdAt)}</div>
                </div>
                <Badge state={r.status}>{MAINTENANCE_STATUS_LABEL[r.status]}</Badge>
              </div>
              {r.resolutionNote ? <p className="mt-2 text-sm text-fg-muted">Chủ nhà: {r.resolutionNote}</p> : null}
            </li>
          ))}
        </ul>
      )}
    </>
  );
}
