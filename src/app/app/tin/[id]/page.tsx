import Link from "next/link";
import { notFound } from "next/navigation";
import { ago, KindBadge, priceText } from "@/components/listing-card";
import { Flash } from "@/components/ui";
import { formatKm } from "@/lib/geo";
import { requireUser } from "@/lib/session";
import { getListing, marketPlaces } from "@/server/market";
import { closeListingAction, decideInterestAction, interestAction, reportListingAction } from "../../market-actions";

export const dynamic = "force-dynamic";

const INTEREST_LABEL = { pending: "Chờ người đăng", accepted: "Đã đồng ý", declined: "Đã từ chối" } as const;

export default async function Page({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ loi?: string; ok?: string; o?: string }>;
}) {
  const { id } = await params;
  const sp = await searchParams;
  const user = await requireUser();
  const usable = (await marketPlaces(user.id)).filter((p) => p.location);
  const center = (usable.find((p) => p.key === sp.o) ?? usable[0])?.location ?? null;
  const l = await getListing(user.id, id, center);
  if (!l) notFound();
  const hidden = <input type="hidden" name="listingId" value={l.id} />;

  return (
    <>
      <Link href={sp.o ? `/app?o=${encodeURIComponent(sp.o)}` : "/app"} className="mb-3 inline-block text-sm text-fg-subtle">← Chợ quanh đây</Link>
      <Flash params={sp} />
      <article className="card">
        <div className="flex items-center justify-between gap-2">
          <KindBadge kind={l.kind} />
          <span className="text-xs text-fg-subtle">{ago(l.createdAt)}</span>
        </div>
        <h1 className="mt-2 text-xl font-bold">{l.title}</h1>
        <p className="tabular mt-1 text-2xl font-bold text-brand-ink">{priceText(l)}</p>
        <p className="mt-1 text-sm text-fg-subtle">
          {l.category} · {l.distanceKm !== null ? `${formatKm(l.distanceKm)} · ` : ""}gần {l.areaLabel} · {l.authorName}
        </p>
        {l.body ? <p className="mt-3 whitespace-pre-line text-sm">{l.body}</p> : null}
        {l.status === "closed" ? <p className="mt-3 text-sm font-semibold text-fg-muted">Tin đã đóng.</p> : null}
        {l.hidden ? <p className="mt-3 text-sm font-semibold text-danger">Tin bị ẩn do nhiều người báo cáo.</p> : null}
      </article>

      {l.mine ? (
        <section className="card mt-4 space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="font-semibold">Người quan tâm ({l.interests.length})</h2>
            {l.status === "open" ? (
              <form action={closeListingAction}>
                {hidden}
                <button className="btn-secondary">Đóng tin</button>
              </form>
            ) : null}
          </div>
          {l.interests.length === 0 ? <p className="text-sm text-fg-muted">Chưa có ai.</p> : null}
          {l.interests.map((i) => (
            <div key={i.id} className="rounded-lg border border-border p-3 text-sm">
              <div className="flex items-center justify-between gap-2">
                <span className="font-semibold">{i.name}</span>
                <span className="text-xs text-fg-subtle">{INTEREST_LABEL[i.status]}</span>
              </div>
              {i.note ? <p className="mt-1 text-fg-muted">“{i.note}”</p> : null}
              <p className="mt-1">Liên hệ: <span className="font-semibold">{i.contact}</span></p>
              {i.status === "pending" ? (
                <div className="mt-2 flex gap-2">
                  <form action={decideInterestAction}>
                    {hidden}
                    <input type="hidden" name="interestId" value={i.id} />
                    <input type="hidden" name="decision" value="accept" />
                    <button className="btn">Đồng ý chia sẻ SĐT</button>
                  </form>
                  <form action={decideInterestAction}>
                    {hidden}
                    <input type="hidden" name="interestId" value={i.id} />
                    <input type="hidden" name="decision" value="decline" />
                    <button className="btn-secondary">Từ chối</button>
                  </form>
                </div>
              ) : null}
            </div>
          ))}
        </section>
      ) : (
        <>
          <section className="card mt-4 space-y-3">
            {l.contact ? (
              <p className="text-sm">
                Liên hệ người đăng: <span className="text-lg font-bold text-brand-ink">{l.contact}</span>
              </p>
            ) : l.myInterest ? (
              <p className="text-sm text-fg-muted">Bạn đã quan tâm · {INTEREST_LABEL[l.myInterest.status]}.</p>
            ) : l.status === "open" ? (
              <form action={interestAction} className="space-y-3">
                {hidden}
                <h2 className="font-semibold">Tôi quan tâm</h2>
                <div>
                  <label className="label" htmlFor="contact">SĐT / Zalo của bạn</label>
                  <input className="input" id="contact" name="contact" required placeholder="0901 234 567" />
                </div>
                <div>
                  <label className="label" htmlFor="note">Lời nhắn</label>
                  <input className="input" id="note" name="note" maxLength={500} placeholder="Còn không bạn? Tối nay mình qua xem." />
                </div>
                <button className="btn w-full">Gửi quan tâm</button>
                <p className="text-xs text-fg-subtle">Người đăng đồng ý thì hai bên thấy liên hệ của nhau.</p>
              </form>
            ) : null}
          </section>
          {l.reportedByMe ? (
            <p className="mt-4 text-center text-xs text-fg-subtle">Bạn đã báo cáo tin này.</p>
          ) : (
            <details className="mt-4 text-sm">
              <summary className="cursor-pointer text-fg-subtle">Báo cáo tin vi phạm</summary>
              <form action={reportListingAction} className="card mt-2 space-y-2">
                {hidden}
                <input className="input" name="reason" required minLength={3} maxLength={300} placeholder="Lừa đảo, hàng cấm, spam…" />
                <button className="btn-danger">Gửi báo cáo</button>
              </form>
            </details>
          )}
        </>
      )}
    </>
  );
}
