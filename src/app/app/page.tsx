import Link from "next/link";
import { ListingCard } from "@/components/listing-card";
import { Flash } from "@/components/ui";
import { wallBackground } from "@/lib/club-themes";
import { parseRadius, RADII_KM } from "@/lib/geo";
import { requireUser } from "@/lib/session";
import { LISTING_KIND_LABEL, marketPlaces, searchListings, type ListingKind } from "@/server/market";

export const dynamic = "force-dynamic";

type Sp = { loi?: string; ok?: string; o?: string; r?: string; k?: string };

export default async function Page({ searchParams }: { searchParams: Promise<Sp> }) {
  const sp = await searchParams;
  const user = await requireUser();
  const places = await marketPlaces(user.id);
  const usable = places.filter((p) => p.location);

  if (usable.length === 0) return <NoPlace places={places} />;

  const place = usable.find((p) => p.key === sp.o) ?? usable[0]!;
  const radius = parseRadius(sp.r);
  const kind = sp.k && sp.k in LISTING_KIND_LABEL ? (sp.k as ListingKind) : undefined;
  const items = await searchListings(user.id, place.location!, radius, kind);
  const href = (o: Partial<Sp>) => {
    const q = new URLSearchParams({ o: place.key, r: String(radius), ...(kind ? { k: kind } : {}), ...o } as Record<string, string>);
    if (o.k === "") q.delete("k");
    return `/app?${q.toString()}`;
  };
  const back = `?o=${encodeURIComponent(place.key)}`;

  return (
    <>
      <div className="club-wall" style={{ background: wallBackground(place.key.split(".")[1]!) }}>
        <div className="relative z-[1]">
          <div className="text-[11px] font-semibold uppercase tracking-wide text-white/70">Chợ quanh đây</div>
          <h1 className="text-2xl font-bold leading-tight">{place.name}</h1>
          <p className="mt-0.5 text-sm text-white/80">
            {items.length} tin trong bán kính {radius} km · mua bán, cho tặng, dịch vụ
          </p>
          <Link href="/app/dang-tin" className="btn mt-4">Đăng tin</Link>
        </div>
      </div>
      <Flash params={sp} />

      {usable.length > 1 ? (
        <div className="scrollbar-none mt-4 flex gap-2 overflow-x-auto">
          {usable.map((p) => (
            <Link key={p.key} href={href({ o: p.key })} className={`whitespace-nowrap ${p.key === place.key ? "btn" : "btn-secondary"}`}>
              {p.name}
            </Link>
          ))}
        </div>
      ) : null}

      <div className="scrollbar-none mt-4 flex gap-2 overflow-x-auto text-sm">
        {RADII_KM.map((r) => (
          <Chip key={r} on={r === radius} href={href({ r: String(r) })}>{r} km</Chip>
        ))}
        <span className="mx-1 border-l border-border" />
        <Chip on={!kind} href={href({ k: "" })}>Tất cả</Chip>
        {(Object.keys(LISTING_KIND_LABEL) as ListingKind[]).map((k) => (
          <Chip key={k} on={k === kind} href={href({ k })}>{LISTING_KIND_LABEL[k]}</Chip>
        ))}
      </div>

      {items.length === 0 ? (
        <div className="card mt-4 text-center text-sm text-fg-muted">
          <p>Chưa có tin nào trong {radius} km.</p>
          <p className="mt-1">Đồ cũ còn dùng được, món ăn tự nấu, nhận sửa đồ… đăng tin đầu tiên cho hàng xóm.</p>
          <Link href="/app/dang-tin" className="btn mt-3">Đăng tin</Link>
        </div>
      ) : (
        <div className="mt-4 grid gap-3">
          {items.map((l) => (
            <ListingCard key={l.id} l={l} query={back} />
          ))}
        </div>
      )}
    </>
  );
}

function Chip({ on, href, children }: { on: boolean; href: string; children: React.ReactNode }) {
  return (
    <Link
      href={href}
      className={`whitespace-nowrap rounded-full border px-3 py-1 font-medium ${on ? "border-brand-ink bg-brand text-brand-fg" : "border-border bg-surface text-fg-muted"}`}
    >
      {children}
    </Link>
  );
}

function NoPlace({ places }: { places: Awaited<ReturnType<typeof marketPlaces>> }) {
  const manager = places.find((p) => p.role === "manager");
  return (
    <div className="card text-center text-sm text-fg-muted">
      <h1 className="mb-2 text-lg font-bold text-fg">Chợ quanh đây</h1>
      {places.length === 0 ? (
        <p>
          Chợ đang mở cho cư dân các khu trọ, chung cư dùng KhuMình. Nhờ chủ nhà gửi link mời để vào khu của bạn.
        </p>
      ) : manager ? (
        <>
          <p>Đặt vị trí cho cơ sở để cư dân thấy tin quanh đây.</p>
          <Link className="btn mt-3" href={`/co-so/${manager.key.split(".")[1]}/bieu-phi#vi-tri`}>Đặt vị trí {manager.name}</Link>
        </>
      ) : (
        <p>Khu {places[0]!.name} chưa có vị trí trên bản đồ. Nhờ chủ nhà cập nhật vị trí để dùng chợ.</p>
      )}
    </div>
  );
}
