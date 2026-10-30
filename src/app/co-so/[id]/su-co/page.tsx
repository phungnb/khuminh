import { Badge, Flash, PageTitle } from "@/components/ui";
import SubmitButton from "@/components/submit-button";
import { dateTimeVn } from "@/lib/format";
import { requireActor } from "@/lib/session";
import { MAINTENANCE_STATUS_LABEL, propertyMaintenanceRequests } from "@/server/maintenance";
import { updateMaintenanceAction } from "../../actions";

export default async function Page({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ loi?: string; ok?: string }>;
}) {
  const { id } = await params;
  const actor = await requireActor();
  const rows = await propertyMaintenanceRequests(actor, id);
  const open = rows.filter((r) => r.status === "open" || r.status === "in_progress");
  const closed = rows.filter((r) => r.status === "done" || r.status === "rejected");
  return (
    <>
      <PageTitle>Sự cố</PageTitle>
      <Flash params={await searchParams} />
      {open.length === 0 ? <p className="mb-6 text-sm text-fg-subtle">Không có sự cố nào đang chờ.</p> : null}
      <ul className="space-y-3">
        {open.map((r) => (
          <li key={r.id} className={`card ${r.urgent ? "border-danger/50" : ""}`}>
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <div className="font-semibold">{r.urgent ? <span className="text-danger">GẤP · </span> : null}Phòng {r.unitCode}: {r.title}</div>
                <div className="text-xs text-fg-subtle">{r.createdByName} · {dateTimeVn(r.createdAt)}</div>
              </div>
              <Badge state={r.status}>{MAINTENANCE_STATUS_LABEL[r.status]}</Badge>
            </div>
            {r.body ? <p className="mt-2 whitespace-pre-line text-sm text-fg-muted">{r.body}</p> : null}
            <form action={updateMaintenanceAction} className="mt-3 flex flex-wrap items-end gap-2">
              <input type="hidden" name="propertyId" value={id} />
              <input type="hidden" name="requestId" value={r.id} />
              <input className="input min-w-48 flex-1" name="note" maxLength={1000} placeholder="Ghi chú cho người thuê (bắt buộc khi từ chối)" />
              {r.status === "open" ? <SubmitButton className="btn-secondary" name="status" value="in_progress">Nhận xử lý</SubmitButton> : null}
              <SubmitButton name="status" value="done">Đã xong</SubmitButton>
              <SubmitButton className="btn-danger" name="status" value="rejected">Từ chối</SubmitButton>
            </form>
          </li>
        ))}
      </ul>
      {closed.length > 0 ? (
        <section className="card mt-6 p-0">
          <h2 className="px-4 pt-3 text-sm font-semibold text-fg-subtle">Đã xử lý</h2>
          <ul>
            {closed.map((r) => (
              <li key={r.id} className="flex items-start justify-between gap-2 border-t border-border/60 px-4 py-3 first:border-t-0">
                <div className="min-w-0 text-sm">
                  <div>Phòng {r.unitCode}: {r.title}</div>
                  {r.resolutionNote ? <div className="text-xs text-fg-subtle">{r.resolutionNote}</div> : null}
                </div>
                <Badge state={r.status}>{MAINTENANCE_STATUS_LABEL[r.status]}</Badge>
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </>
  );
}
