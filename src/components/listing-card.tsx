import Link from "next/link";
import { MapPin } from "lucide-react";
import { CategoryTile } from "@/components/category";
import { formatKm } from "@/lib/geo";
import { vnd } from "@/lib/format";
import { LISTING_KIND_LABEL, type ListingRow } from "@/server/market";

const KIND_STYLE: Record<ListingRow["kind"], string> = {
  sell: "bg-brand text-brand-fg",
  want: "bg-xp text-brand-fg",
  give: "bg-live text-white",
  service: "bg-epic text-white",
};

export function KindBadge({ kind, className = "" }: { kind: ListingRow["kind"]; className?: string }) {
  return (
    <span className={`rounded-full px-2 py-0.5 text-[11px] font-bold ${KIND_STYLE[kind]} ${className}`}>{LISTING_KIND_LABEL[kind]}</span>
  );
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

/** Thẻ tin dạng lưới (kiểu chợ): ô ảnh theo danh mục, giá nổi bật, khoảng cách. */
export function ListingCard({ l, query = "" }: { l: ListingRow; query?: string }) {
  const dim = l.status === "closed" || l.hidden;
  return (
    <Link
      href={`/app/tin/${l.id}${query}`}
      className={`group block overflow-hidden rounded-[var(--radius-card)] border border-border bg-surface transition hover:border-fg-subtle ${dim ? "opacity-60" : ""}`}
    >
      <div className="relative">
        <CategoryTile category={l.category} className="aspect-[4/3] w-full" />
        <KindBadge kind={l.kind} className="absolute top-2 left-2" />
        {l.status === "closed" ? (
          <span className="absolute top-2 right-2 rounded-full bg-black/60 px-2 py-0.5 text-[11px] font-semibold text-white">Đã đóng</span>
        ) : null}
      </div>
      <div className="p-3">
        <h3 className="line-clamp-2 min-h-10 text-sm leading-5 font-semibold">{l.title}</h3>
        <p className="tabular mt-1 font-bold text-brand">{priceText(l)}</p>
        <p className="mt-1 flex items-center gap-1 truncate text-[11px] text-fg-subtle">
          <MapPin className="size-3 shrink-0" aria-hidden />
          {l.distanceKm !== null ? `${formatKm(l.distanceKm)} · ` : ""}
          {ago(l.createdAt)}
        </p>
        {l.interestCount > 0 && l.mine ? <p className="mt-1 text-[11px] font-semibold text-coin">{l.interestCount} người quan tâm</p> : null}
        {l.hidden ? <p className="mt-1 text-[11px] font-semibold text-danger">Bị ẩn do báo cáo</p> : null}
      </div>
    </Link>
  );
}

export function ListingGrid({ items, query }: { items: ListingRow[]; query?: string }) {
  return (
    <div className="grid grid-cols-2 gap-3">
      {items.map((l) => (
        <ListingCard key={l.id} l={l} query={query} />
      ))}
    </div>
  );
}
