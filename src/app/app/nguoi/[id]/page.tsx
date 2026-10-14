import { notFound } from "next/navigation";
import { Store } from "lucide-react";
import { ListingGrid } from "@/components/listing-card";
import { EmptyState } from "@/components/ui";
import { RADII_KM } from "@/lib/geo";
import { requireUser } from "@/lib/session";
import { marketPlaces, searchListings } from "@/server/market";

export const dynamic = "force-dynamic";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const MAX_KM = RADII_KM[RADII_KM.length - 1]!;

// "Tin của người này": các tin đang mở của một người đăng, chỉ trong phạm vi người xem
// vốn đã thấy ở Quanh đây (bán kính lớn nhất quanh khu của người xem). Thay cho gian hàng ở giai đoạn này.
export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!UUID.test(id)) notFound();
  const user = await requireUser();
  const place = (await marketPlaces(user.id)).find((p) => p.location);
  const items = place ? await searchListings(user.id, place.location!, MAX_KM, { authorId: id }, 50) : [];
  const name = items[0]?.authorName;
  const query = place ? `?o=${encodeURIComponent(place.key)}` : "";

  return (
    <>
      <div className="card mb-5 flex items-center gap-3">
        <span className="grid size-14 place-items-center rounded-full bg-brand text-xl font-extrabold text-brand-fg">
          {(name ?? "?").charAt(0).toUpperCase()}
        </span>
        <div className="min-w-0">
          <h1 className="truncate text-lg font-bold">{name ?? "Người đăng"}</h1>
          <p className="text-sm text-fg-muted">
            {items.length} tin đang mở trong {MAX_KM} km quanh bạn
          </p>
        </div>
      </div>
      {items.length === 0 ? (
        <EmptyState icon={Store} title="Không có tin nào đang mở" description="Người này chưa có tin nào quanh khu của bạn, hoặc các tin đã đóng." />
      ) : (
        <ListingGrid items={items} query={query} />
      )}
    </>
  );
}
