import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, Clock, Flag, MapPin, Phone, Tag } from "lucide-react";
import { CategoryTile } from "@/components/category";
import { ago, KindBadge, priceText } from "@/components/listing-card";
import { ShareButton } from "@/components/share-button";
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
      <div className="relative -mx-4 -mt-4">
        <CategoryTile category={l.category} className="aspect-[16/10] w-full" iconClass="size-16" />
        <Link
          href={sp.o ? `/app?o=${encodeURIComponent(sp.o)}` : "/app"}
          aria-label="Về chợ"
          className="absolute top-3 left-3 grid size-11 place-items-center rounded-full bg-black/40 text-white backdrop-blur"
        >
          <ArrowLeft className="size-5" aria-hidden />
        </Link>
        <div className="absolute top-3 right-3">
          <ShareButton title={l.title} />
        </div>
        <KindBadge kind={l.kind} className="absolute bottom-3 left-4" />
      </div>
      <div className="mt-4">
        <Flash params={sp} />
      </div>
      <article className="animate-fade-in">
        <h1 className="text-xl leading-snug font-bold">{l.title}</h1>
        <p className="tabular mt-1 text-2xl font-extrabold text-brand">{priceText(l)}</p>
        <ul className="mt-3 grid gap-1.5 text-sm text-fg-muted">
          <li className="flex items-center gap-2"><Tag className="size-4" aria-hidden />{l.category}</li>
          <li className="flex items-center gap-2">
            <MapPin className="size-4" aria-hidden />
            {l.distanceKm !== null ? `${formatKm(l.distanceKm)} · ` : ""}gần {l.areaLabel}
          </li>
          <li className="flex items-center gap-2"><Clock className="size-4" aria-hidden />{ago(l.createdAt)}</li>
        </ul>
        {l.body ? <p className="card mt-4 text-sm leading-relaxed whitespace-pre-line">{l.body}</p> : null}
        <div className="card mt-3 flex items-center gap-3">
          <span className="grid size-11 place-items-center rounded-full bg-surface-2 text-lg font-bold">{l.authorName.charAt(0).toUpperCase()}</span>
          <div className="min-w-0">
            <p className="truncate font-semibold">{l.authorName}</p>
            <p className="text-xs text-fg-subtle">Người đăng · cư dân gần {l.areaLabel}</p>
          </div>
        </div>
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
              <p className="mt-1">
                Liên hệ:{" "}
                <a className="font-semibold text-brand" href={`tel:${i.contact.replace(/[^0-9+]/g, "")}`}>{i.contact}</a>
              </p>
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
              <a href={`tel:${l.contact.replace(/[^0-9+]/g, "")}`} className="btn w-full">
                <Phone className="size-5" aria-hidden /> Gọi {l.contact}
              </a>
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
              <summary className="flex cursor-pointer items-center gap-1 text-fg-subtle"><Flag className="size-4" aria-hidden />Báo cáo tin vi phạm</summary>
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
