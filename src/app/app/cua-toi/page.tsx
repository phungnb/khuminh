import Link from "next/link";
import { ListingCard } from "@/components/listing-card";
import { requireUser } from "@/lib/session";
import { myInterests, myListings } from "@/server/market";

export const dynamic = "force-dynamic";

const STATUS = { pending: "Chờ người đăng", accepted: "Đã đồng ý", declined: "Đã từ chối" } as const;

export default async function Page() {
  const user = await requireUser();
  const [mine, ints] = await Promise.all([myListings(user.id), myInterests(user.id)]);
  return (
    <>
      <h1 className="mb-3 text-xl font-bold">Tin của tôi</h1>
      {mine.length === 0 ? (
        <div className="card text-center text-sm text-fg-muted">
          Bạn chưa đăng tin nào. <Link className="font-semibold text-brand-ink" href="/app/dang-tin">Đăng tin</Link>
        </div>
      ) : (
        <div className="grid gap-3">
          {mine.map((l) => (
            <ListingCard key={l.id} l={l} />
          ))}
        </div>
      )}
      <h2 className="mt-6 mb-3 text-lg font-bold">Đang quan tâm</h2>
      {ints.length === 0 ? (
        <p className="text-sm text-fg-subtle">Chưa quan tâm tin nào.</p>
      ) : (
        <div className="grid gap-3">
          {ints.map(({ listing, status }) => (
            <div key={listing.id}>
              <p className="mb-1 text-xs font-semibold text-fg-muted">{STATUS[status]}</p>
              <ListingCard l={listing} />
            </div>
          ))}
        </div>
      )}
    </>
  );
}
