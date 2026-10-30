import Link from "next/link";
import { MapPinOff, PackageSearch, Search, Store } from "lucide-react";
import { CategoryIcon } from "@/components/category";
import { ListingGrid } from "@/components/listing-card";
import { EmptyState, Flash } from "@/components/ui";
import { wallBackground } from "@/lib/club-themes";
import { cookies } from "next/headers";
import { parseRadius, RADII_KM, RADIUS_COOKIE } from "@/lib/geo";
import { cn } from "@/lib/cn";
import { requireUser } from "@/lib/session";
import { CATEGORIES, LISTING_KIND_LABEL, marketPlaces, searchListings, type ListingKind, type Place } from "@/server/market";
import { purposeOf, purposeParams, PURPOSES } from "../_components/purposes";

export const dynamic = "force-dynamic";

type Sp = { loi?: string; ok?: string; o?: string; r?: string; k?: string; c?: string; q?: string };

export default async function Page({ searchParams }: { searchParams: Promise<Sp> }) {
  const sp = await searchParams;
  const user = await requireUser();
  const places = await marketPlaces(user.id);
  const usable = places.filter((p) => p.location);
  // Bán kính nhớ từ lần chọn trước (cookie) để Hôm nay và lần mở sau dùng chung;
  // tính trước cả khi chưa có vị trí để NoPlace vẫn hiện nút chọn phạm vi.
  const radius = parseRadius(sp.r ?? (await cookies()).get(RADIUS_COOKIE)?.value);

  if (usable.length === 0) return <NoPlace places={places} radius={radius} />;

  const place = usable.find((p) => p.key === sp.o) ?? usable[0]!;
  const kind = sp.k && sp.k in LISTING_KIND_LABEL ? (sp.k as ListingKind) : undefined;
  const category = sp.c && (CATEGORIES as readonly string[]).includes(sp.c) ? sp.c : undefined;
  const q = sp.q?.trim() || undefined;
  const items = await searchListings(user.id, place.location!, radius, { kind, category, q });

  const state: Record<string, string | undefined> = { o: place.key, r: String(radius), k: kind, c: category, q };
  const href = (o: Record<string, string | undefined>) => {
    const p = new URLSearchParams();
    for (const [k, v] of Object.entries({ ...state, ...o })) if (v) p.set(k, v);
    return `/app/quanh-day?${p.toString()}`;
  };
  // Giữ cả bán kính trong link sang trang tin để bấm quay lại vẫn đúng phạm vi
  // đang xem (trước đây link chỉ giữ khu, về chợ là rơi về bán kính nhớ trong cookie).
  const back = `?o=${encodeURIComponent(place.key)}&r=${radius}`;

  return (
    <>
      <section className="club-wall animate-fade-in" style={{ background: wallBackground(place.key.split(".")[1]!) }}>
        <div className="relative z-[1]">
          <div className="text-[11px] font-semibold uppercase tracking-wide text-white/70">Chợ quanh đây</div>
          <h1 className="truncate text-2xl leading-tight font-bold">{place.name}</h1>
          <p className="mt-0.5 text-sm text-white/80">
            {items.length} tin trong {radius} km · mua bán, cho tặng, dịch vụ
          </p>
          <div className="mt-3 flex gap-1.5">
            {RADII_KM.map((r) => (
              <Link
                key={r}
                href={href({ r: String(r) })}
                className={cn(
                  "rounded-full px-3 py-1 text-xs font-semibold backdrop-blur",
                  r === radius ? "bg-brand text-brand-fg" : "bg-white/15 text-white",
                )}
              >
                {r} km
              </Link>
            ))}
          </div>
          {usable.length > 1 ? (
            <div className="scrollbar-none mt-3 flex gap-2 overflow-x-auto">
              {usable.map((p) => (
                <Link
                  key={p.key}
                  href={href({ o: p.key })}
                  className={cn(
                    "rounded-full px-3 py-1 text-xs font-semibold whitespace-nowrap backdrop-blur",
                    p.key === place.key ? "bg-white text-black" : "bg-white/15 text-white",
                  )}
                >
                  {p.name}
                </Link>
              ))}
            </div>
          ) : null}
        </div>
      </section>

      <form action="/app/quanh-day" className="relative mt-4">
        {Object.entries({ o: place.key, r: String(radius), k: kind, c: category }).map(([k, v]) =>
          v ? <input key={k} type="hidden" name={k} value={v} /> : null,
        )}
        <Search className="pointer-events-none absolute top-1/2 left-3 size-5 -translate-y-1/2 text-fg-subtle" aria-hidden />
        <input className="input pl-10" name="q" defaultValue={q} placeholder="Tìm quạt, xe đạp, sửa điện…" aria-label="Tìm tin" />
      </form>

      <Flash params={sp} />

      {!q && !kind && !category ? (
        <p className="mt-3 text-sm text-fg-muted">
          Chợ của hàng xóm trong {radius} km: mua bán đồ cũ, cho tặng, tìm người sửa chữa, dọn dẹp. Bấm “Quan tâm” trên tin, người
          đăng đồng ý thì hai bên mới thấy số điện thoại của nhau.
        </p>
      ) : null}

      <div className="scrollbar-none mt-3 -mx-4 flex gap-2 overflow-x-auto px-4">
        <Link href={href({ k: undefined, c: undefined })} className={cn("chip", !kind && "chip-on")}>Tất cả</Link>
        {PURPOSES.map((p) => (
          <Link
            key={p.key}
            href={href({ c: undefined, ...purposeParams(p) })}
            className={cn("chip whitespace-nowrap", purposeOf(kind, category)?.key === p.key && "chip-on")}
          >
            {p.label}
          </Link>
        ))}
      </div>

      <div className="scrollbar-none mt-3 -mx-4 flex gap-3 overflow-x-auto px-4">
        {CATEGORIES.map((c) => (
          <Link
            key={c}
            href={href({ c: c === category ? undefined : c })}
            className="flex w-16 shrink-0 flex-col items-center gap-1 text-center text-[11px] leading-tight text-fg-muted"
          >
            <span
              className={cn(
                "grid size-12 place-items-center rounded-2xl border",
                c === category ? "border-brand bg-brand text-brand-fg" : "border-border bg-surface text-fg",
              )}
            >
              <CategoryIcon category={c} className="size-5" />
            </span>
            <span className={cn("line-clamp-2", c === category && "font-semibold text-brand")}>{c}</span>
          </Link>
        ))}
      </div>

      <h2 className="mt-5 mb-3 text-lg font-semibold">{q ? `Kết quả cho “${q}”` : category ?? "Tin mới quanh bạn"}</h2>

      {items.length === 0 ? (
        <EmptyState
          icon={q || category || kind ? PackageSearch : Store}
          title={q || category || kind ? "Không có tin phù hợp" : `Chưa có tin nào trong ${radius} km`}
          description={
            q || category || kind
              ? "Thử bỏ bộ lọc hoặc mở rộng bán kính."
              : "Đồ cũ còn dùng được, món ăn tự nấu, nhận sửa đồ… đăng tin đầu tiên cho hàng xóm."
          }
          action={
            <Link href="/app/dang-tin" className="btn">
              Đăng tin
            </Link>
          }
        />
      ) : (
        <ListingGrid items={items} query={back} />
      )}
    </>
  );
}

function NoPlace({ places, radius }: { places: Place[]; radius: number }) {
  const manager = places.find((p) => p.role === "manager");
  if (places.length === 0) {
    return (
      <EmptyState
        icon={Store}
        title="Chợ quanh đây"
        description="Chợ đang mở cho cư dân các khu trọ, chung cư dùng KhuMình. Nhờ chủ nhà gửi link mời để vào khu của bạn."
      />
    );
  }
  return (
    <>
      <EmptyState
        icon={MapPinOff}
        title="Khu chưa có vị trí trên bản đồ"
        description={
          manager ? "Đặt vị trí cho cơ sở để cư dân thấy tin quanh đây." : `Nhờ chủ nhà cập nhật vị trí ${places[0]!.name} để dùng chợ.`
        }
        action={
          manager ? (
            <Link className="btn" href={`/co-so/${manager.key.split(".")[1]}/bieu-phi#vi-tri`}>
              Đặt vị trí {manager.name}
            </Link>
          ) : undefined
        }
      />
      <div className="mt-4">
        <p className="text-sm font-semibold">Tìm trong phạm vi</p>
        <div className="mt-2 flex gap-1.5">
          {RADII_KM.map((r) => (
            <Link
              key={r}
              href={`/app/quanh-day?r=${r}`}
              className={cn(
                "rounded-full px-3 py-1 text-xs font-semibold",
                r === radius ? "bg-brand text-brand-fg" : "bg-surface-2 text-fg",
              )}
            >
              {r} km
            </Link>
          ))}
        </div>
        <p className="mt-2 text-sm text-fg-muted">Chọn trước phạm vi — sẽ áp dụng ngay khi cơ sở có vị trí.</p>
      </div>
    </>
  );
}
