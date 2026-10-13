import Link from "next/link";
import { formatKm } from "@/lib/geo";
import { vnd } from "@/lib/format";
import { LISTING_KIND_LABEL, type ListingRow } from "@/server/market";

const KIND_STYLE: Record<ListingRow["kind"], string> = {
  sell: "bg-brand text-brand-fg",
  want: "bg-sky-100 text-sky-800",
  give: "bg-pink-100 text-pink-800",
  service: "bg-violet-100 text-violet-800",
};

export function KindBadge({ kind }: { kind: ListingRow["kind"] }) {
  return <span className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${KIND_STYLE[kind]}`}>{LISTING_KIND_LABEL[kind]}</span>;
}

export function priceText(l: Pick<ListingRow, "kind" | "price">): string {
  if (l.kind === "give") return "Miễn phí";
  if (l.price === null) return l.kind === "want" ? "Thương lượng" : "Liên hệ";
  return vnd(l.price);
}

export function ago(d: Date): string {
  const m = Math.max(1, Math.round((Date.now() - d.getTime()) / 60_000));
  if (m < 60) return `${m} phút trước`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h} giờ trước`;
  return `${Math.round(h / 24)} ngày trước`;
}

export function ListingCard({ l, query = "" }: { l: ListingRow; query?: string }) {
  return (
    <Link href={`/app/tin/${l.id}${query}`} className="card block transition hover:border-brand-strong">
      <div className="flex items-center justify-between gap-2">
        <KindBadge kind={l.kind} />
        <span className="text-xs text-fg-subtle">{ago(l.createdAt)}</span>
      </div>
      <h3 className="mt-2 line-clamp-2 font-semibold">{l.title}</h3>
      <div className="mt-1 flex items-end justify-between gap-2">
        <span className="tabular font-bold text-brand-ink">{priceText(l)}</span>
        <span className="truncate text-xs text-fg-subtle">
          {l.distanceKm !== null ? `${formatKm(l.distanceKm)} · ` : ""}
          {l.areaLabel}
        </span>
      </div>
      <div className="mt-1 text-xs text-fg-subtle">
        {l.category} · {l.authorName}
        {l.interestCount > 0 ? ` · ${l.interestCount} quan tâm` : ""}
        {l.status === "closed" ? " · Đã đóng" : ""}
        {l.hidden ? " · Bị ẩn do báo cáo" : ""}
      </div>
    </Link>
  );
}
