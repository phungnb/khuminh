import { ClearDraft, ReadingInputs } from "@/components/reading-form";
import SubmitButton from "@/components/submit-button";
import { Empty, Flash, PageTitle } from "@/components/ui";
import { requireActor } from "@/lib/session";
import { metersForReading, today } from "@/server/queries";
import { recordReadingsAction } from "../../actions";

export default async function Page({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ ngay?: string; loi?: string; ok?: string }>;
}) {
  const { id } = await params;
  const sp = await searchParams;
  const actor = await requireActor();
  const date = /^\d{4}-\d{2}-\d{2}$/.test(sp.ngay ?? "") ? sp.ngay! : today();
  const rows = await metersForReading(actor, id, date);
  const storageKey = `km-readings-${id}-${date}`;

  return (
    <>
      <PageTitle>Ghi chỉ số điện nước</PageTitle>
      <Flash params={sp} />
      {sp.ok ? <ClearDraft storageKey={storageKey} /> : null}
      <form method="get" className="mb-4 flex items-end gap-2">
        <div>
          <label className="label" htmlFor="ngay">Ngày ghi</label>
          <input className="input" type="date" id="ngay" name="ngay" defaultValue={date} />
        </div>
        <SubmitButton className="btn-secondary">Đổi ngày</SubmitButton>
      </form>
      {rows.length === 0 ? (
        <Empty>Chưa có phòng nào có đồng hồ.</Empty>
      ) : (
        <form action={recordReadingsAction} className="card">
          <input type="hidden" name="propertyId" value={id} />
          <input type="hidden" name="date" value={date} />
          <ReadingInputs rows={rows} storageKey={storageKey} />
          <p className="mt-3 text-xs text-fg-subtle">
            Chỉ số chốt ngày cuối tháng hoặc sáng ngày đầu tháng sau đều dùng được cho kỳ đó. Ô để trống sẽ không lưu.
          </p>
          <SubmitButton className="btn mt-3 w-full md:w-auto">Lưu chỉ số</SubmitButton>
        </form>
      )}
    </>
  );
}
