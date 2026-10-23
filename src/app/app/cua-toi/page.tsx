import Link from "next/link";
import { Heart, Megaphone } from "lucide-react";
import { ago, ListingCard, ListingGrid } from "@/components/listing-card";
import { EmptyState, Flash } from "@/components/ui";
import { cn } from "@/lib/cn";
import { requireUser } from "@/lib/session";
import { myInterests, myListings, type ListingRow } from "@/server/market";
import { closeListingAction, deleteListingAction, renewListingAction, reopenListingAction } from "../market-actions";

export const dynamic = "force-dynamic";

const STATUS = { pending: "Chờ người đăng", accepted: "Đã đồng ý", declined: "Đã từ chối" } as const;

// Nhóm vòng đời của tin phía người đăng. Thứ tự ưu tiên: bị ẩn > đã đóng > hết hạn > đang hiển thị.
type Group = "hien" | "het-han" | "da-dong" | "bi-an";
const GROUPS: Array<{ key: Group; label: string }> = [
  { key: "hien", label: "Đang hiển thị" },
  { key: "het-han", label: "Hết hạn" },
  { key: "da-dong", label: "Đã đóng" },
  { key: "bi-an", label: "Bị ẩn" },
];
const DAY_MS = 24 * 3600 * 1000;

function groupOf(l: ListingRow): Group {
  if (l.hidden) return "bi-an";
  if (l.status === "closed") return "da-dong";
  if (l.expired) return "het-han";
  return "hien";
}

function metaLine(l: ListingRow, g: Group): string {
  if (g === "bi-an") return "Bị ẩn do đủ 3 báo cáo vi phạm. Nếu cho rằng bị nhầm, hãy liên hệ bộ phận hỗ trợ.";
  if (g === "da-dong") return `Đã đóng · đăng ${ago(l.createdAt)}`;
  if (g === "het-han") return `Đã hết hạn ${ago(l.expiresAt)} · gia hạn để hiện lại ở chợ`;
  const days = Math.max(0, Math.ceil((l.expiresAt.getTime() - Date.now()) / DAY_MS));
  return `Còn ${days} ngày · đăng ${ago(l.createdAt)}`;
}

function DeleteForm({ l, backTo }: { l: ListingRow; backTo: string }) {
  return (
    <details>
      <summary className="btn-secondary cursor-pointer">Xoá hẳn</summary>
      <form action={deleteListingAction} className="mt-2 rounded-lg border border-border p-2">
        <input type="hidden" name="listingId" value={l.id} />
        <input type="hidden" name="back" value={backTo} />
        <p className="mb-2 text-xs text-fg-muted">Xoá vĩnh viễn tin này cùng lượt quan tâm và báo cáo kèm theo. Không khôi phục được.</p>
        <button className="btn-danger w-full">Xoá vĩnh viễn</button>
      </form>
    </details>
  );
}

function ManageCard({ l, backTo }: { l: ListingRow; backTo: string }) {
  const g = groupOf(l);
  const hidden = (
    <>
      <input type="hidden" name="listingId" value={l.id} />
      <input type="hidden" name="back" value={backTo} />
    </>
  );
  const nearExpiry = l.expiresAt.getTime() <= Date.now() + 3 * DAY_MS;
  return (
    <div>
      <ListingCard l={l} />
      <p className={cn("mt-1.5 text-xs", g === "bi-an" ? "font-semibold text-danger" : "text-fg-muted")}>{metaLine(l, g)}</p>
      <div className="mt-1.5 flex flex-wrap items-start gap-1.5">
        {g === "hien" ? (
          <>
            <form action={closeListingAction}>
              {hidden}
              <button className="btn-secondary">Đóng tin</button>
            </form>
            {nearExpiry ? (
              <form action={renewListingAction}>
                {hidden}
                <button className="btn">Gia hạn</button>
              </form>
            ) : null}
          </>
        ) : null}
        {g === "het-han" ? (
          <form action={renewListingAction}>
            {hidden}
            <button className="btn">Gia hạn 30 ngày</button>
          </form>
        ) : null}
        {g === "da-dong" ? (
          <form action={reopenListingAction}>
            {hidden}
            <button className="btn">Mở lại tin</button>
          </form>
        ) : null}
        <DeleteForm l={l} backTo={backTo} />
      </div>
    </div>
  );
}

export default async function Page({ searchParams }: { searchParams: Promise<{ tab?: string; s?: string; loi?: string; ok?: string }> }) {
  const sp = await searchParams;
  const tab = sp.tab === "quan-tam" ? "quan-tam" : "tin";
  const group: Group = GROUPS.some((g) => g.key === sp.s) ? (sp.s as Group) : "hien";
  const user = await requireUser();
  const [mine, ints] = await Promise.all([myListings(user.id), myInterests(user.id)]);
  const waiting = mine.reduce((n, l) => n + (l.status === "open" ? l.interestCount : 0), 0);
  const counts = new Map<Group, number>(GROUPS.map((g) => [g.key, 0]));
  for (const l of mine) counts.set(groupOf(l), (counts.get(groupOf(l)) ?? 0) + 1);
  const inGroup = mine.filter((l) => groupOf(l) === group);
  const backTo = `/app/cua-toi?s=${group}`;
  return (
    <>
      <Link href="/app/toi" className="mb-3 inline-block text-sm text-fg-subtle">← Tôi</Link>
      <h1 className="mb-4 text-xl font-bold">Chợ của tôi</h1>
      <Flash params={sp} />
      <div className="mb-4 grid grid-cols-2 rounded-xl border border-border bg-surface p-1 text-sm font-semibold">
        <Link href="/app/cua-toi" className={cn("rounded-lg py-2 text-center", tab === "tin" ? "bg-surface-2 text-fg" : "text-fg-subtle")}>
          Tin của tôi {waiting > 0 ? <span className="ml-1 rounded-full bg-coin px-1.5 text-[11px] text-brand-fg">{waiting}</span> : null}
        </Link>
        <Link href="/app/cua-toi?tab=quan-tam" className={cn("rounded-lg py-2 text-center", tab === "quan-tam" ? "bg-surface-2 text-fg" : "text-fg-subtle")}>
          Đang quan tâm
        </Link>
      </div>
      {tab === "tin" ? (
        mine.length === 0 ? (
          <EmptyState
            icon={Megaphone}
            title="Bạn chưa đăng tin nào"
            description="Đồ không dùng nữa, món tự làm, việc nhận làm thêm: đăng cho hàng xóm quanh khu."
            action={<Link className="btn" href="/app/dang-tin">Đăng tin</Link>}
          />
        ) : (
          <>
            <div className="mb-4 flex gap-2 overflow-x-auto pb-1">
              {GROUPS.map((g) => (
                <Link
                  key={g.key}
                  href={`/app/cua-toi?s=${g.key}`}
                  className={cn(
                    "shrink-0 rounded-full border border-border px-3 py-1.5 text-sm font-medium whitespace-nowrap",
                    group === g.key ? "bg-brand text-brand-fg" : "bg-surface text-fg-muted",
                  )}
                >
                  {g.label} ({counts.get(g.key) ?? 0})
                </Link>
              ))}
            </div>
            {inGroup.length === 0 ? (
              <p className="py-8 text-center text-sm text-fg-muted">Không có tin nào ở nhóm này.</p>
            ) : (
              <div className="grid grid-cols-2 gap-3">
                {inGroup.map((l) => (
                  <ManageCard key={l.id} l={l} backTo={backTo} />
                ))}
              </div>
            )}
          </>
        )
      ) : ints.length === 0 ? (
        <EmptyState icon={Heart} title="Chưa quan tâm tin nào" description="Bấm “Tôi quan tâm” ở tin bạn muốn, người đăng đồng ý thì hai bên thấy số điện thoại." />
      ) : (
        <div className="grid grid-cols-2 gap-3">
          {ints.map(({ listing, status }) => (
            <div key={listing.id}>
              <p className={cn("mb-1 text-xs font-semibold", status === "accepted" ? "text-success" : "text-fg-muted")}>{STATUS[status]}</p>
              <ListingCard l={listing} />
            </div>
          ))}
        </div>
      )}
    </>
  );
}
