import Link from "next/link";
import { notFound } from "next/navigation";
import { Store } from "lucide-react";
import { ListingGrid } from "@/components/listing-card";
import { ShareButton } from "@/components/share-button";
import { EmptyState } from "@/components/ui";
import { cn } from "@/lib/cn";
import { RADII_KM } from "@/lib/geo";
import { requireUser } from "@/lib/session";
import { marketPlaces, sellerShop } from "@/server/market";

export const dynamic = "force-dynamic";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const MAX_KM = RADII_KM[RADII_KM.length - 1]!;

// Gian hàng của một người đăng: danh tính và số liệu tin cậy ở đầu trang, dưới là
// tin đang bán (lọc được theo danh mục) và tin đã bán gần đây. Mọi tin đều trong
// phạm vi người xem vốn đã thấy ở Quanh đây (bán kính lớn nhất quanh khu của người xem).
export default async function Page({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ cat?: string }>;
}) {
  const { id } = await params;
  if (!UUID.test(id)) notFound();
  const sp = await searchParams;
  const user = await requireUser();
  const place = (await marketPlaces(user.id)).find((p) => p.location);
  if (!place) {
    return (
      <EmptyState
        icon={Store}
        title="Chưa xem được gian hàng"
        description="Bạn cần thuộc một khu đã có vị trí trên bản đồ để xem chợ quanh đây."
      />
    );
  }
  const shop = await sellerShop(user.id, id, place.location!, MAX_KM);
  if (!shop) notFound();
  const query = `?o=${encodeURIComponent(place.key)}`;
  const cats = [...new Set(shop.open.map((l) => l.category))];
  const showChips = shop.open.length >= 8 || cats.length > 1;
  const activeCat = sp.cat && cats.includes(sp.cat) ? sp.cat : null;
  const shown = activeCat ? shop.open.filter((l) => l.category === activeCat) : shop.open;
  const since = `tháng ${shop.memberSince.getMonth() + 1}/${shop.memberSince.getFullYear()}`;

  return (
    <>
      <div className="card mb-5">
        <div className="flex items-center gap-3">
          <span className="grid size-14 shrink-0 place-items-center rounded-full bg-brand text-xl font-extrabold text-brand-fg">
            {shop.name.charAt(0).toUpperCase()}
          </span>
          <div className="min-w-0">
            <h1 className="truncate text-lg font-bold">{shop.name}</h1>
            <p className="text-sm text-fg-muted">
              Thành viên từ {since}
              {shop.areaLabel ? ` · Người bán quanh ${shop.areaLabel}` : ""}
            </p>
          </div>
          <div className="ml-auto shrink-0">
            <ShareButton title={`Gian hàng của ${shop.name}`} label="Chia sẻ gian hàng" />
          </div>
        </div>
        <div className="mt-4 grid grid-cols-2 border-t border-border pt-3 text-center">
          <div>
            <p className="text-lg font-extrabold">{shop.open.length}</p>
            <p className="text-xs text-fg-muted">Tin đang bán</p>
          </div>
          <div>
            <p className="text-lg font-extrabold">{shop.soldCount}</p>
            <p className="text-xs text-fg-muted">Đã bán xong</p>
          </div>
        </div>
        {id === user.id ? (
          <Link href="/app/cua-toi" className="btn-secondary mt-3 w-full">
            Quản lý tin của tôi
          </Link>
        ) : null}
      </div>

      {showChips ? (
        <div className="mb-4 flex gap-2 overflow-x-auto pb-1">
          <Link
            href={`/app/nguoi/${id}`}
            className={cn(
              "shrink-0 rounded-full border border-border px-3 py-1.5 text-sm font-medium whitespace-nowrap",
              activeCat === null ? "bg-brand text-brand-fg" : "bg-surface text-fg-muted",
            )}
          >
            Tất cả
          </Link>
          {cats.map((c) => (
            <Link
              key={c}
              href={`/app/nguoi/${id}?cat=${encodeURIComponent(c)}`}
              className={cn(
                "shrink-0 rounded-full border border-border px-3 py-1.5 text-sm font-medium whitespace-nowrap",
                activeCat === c ? "bg-brand text-brand-fg" : "bg-surface text-fg-muted",
              )}
            >
              {c}
            </Link>
          ))}
        </div>
      ) : null}

      {shown.length === 0 ? (
        <EmptyState
          icon={Store}
          title="Không có tin nào đang mở"
          description="Người này chưa có tin nào đang bán quanh khu của bạn."
        />
      ) : (
        <ListingGrid items={shown} query={query} />
      )}

      {shop.sold.length > 0 ? (
        <>
          <h2 className="mt-6 mb-3 font-bold">Đã bán gần đây</h2>
          <ListingGrid items={shop.sold} query={query} />
        </>
      ) : null}
    </>
  );
}
