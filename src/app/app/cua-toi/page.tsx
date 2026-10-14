import Link from "next/link";
import { Heart, Megaphone } from "lucide-react";
import { ListingCard, ListingGrid } from "@/components/listing-card";
import { EmptyState } from "@/components/ui";
import { cn } from "@/lib/cn";
import { requireUser } from "@/lib/session";
import { myInterests, myListings } from "@/server/market";

export const dynamic = "force-dynamic";

const STATUS = { pending: "Chờ người đăng", accepted: "Đã đồng ý", declined: "Đã từ chối" } as const;

export default async function Page({ searchParams }: { searchParams: Promise<{ tab?: string }> }) {
  const tab = (await searchParams).tab === "quan-tam" ? "quan-tam" : "tin";
  const user = await requireUser();
  const [mine, ints] = await Promise.all([myListings(user.id), myInterests(user.id)]);
  const waiting = mine.reduce((n, l) => n + (l.status === "open" ? l.interestCount : 0), 0);
  return (
    <>
      <Link href="/app/toi" className="mb-3 inline-block text-sm text-fg-subtle">← Tôi</Link>
      <h1 className="mb-4 text-xl font-bold">Chợ của tôi</h1>
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
          <ListingGrid items={mine} />
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
