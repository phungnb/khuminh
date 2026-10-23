import { Gift, HandCoins, MapPinOff, Search, ShieldCheck, Wrench, type LucideIcon } from "lucide-react";
import Link from "next/link";
import { CategoryTile } from "@/components/category";
import { ListingPhotoPicker } from "@/components/listing-photo-picker";
import { BackLink, EmptyState, Flash, PageTitle } from "@/components/ui";
import { requireUser } from "@/lib/session";
import { CATEGORIES, LISTING_KIND_LABEL, marketPlaces, type ListingKind } from "@/server/market";
import { createListingAction } from "../market-actions";

export const dynamic = "force-dynamic";

const KIND_META: Record<ListingKind, { hint: string; icon: LucideIcon }> = {
  sell: { hint: "Đồ cũ, đồ tự làm", icon: HandCoins },
  want: { hint: "Tìm mua, tìm người làm", icon: Search },
  give: { hint: "Tặng miễn phí", icon: Gift },
  service: { hint: "Nhận sửa, dọn, nấu, dạy…", icon: Wrench },
};

export default async function Page({ searchParams }: { searchParams: Promise<{ loi?: string; ok?: string; k?: string; c?: string }> }) {
  const sp = await searchParams;
  const user = await requireUser();
  // Mở từ Tiện ích thì điền sẵn loại tin và danh mục.
  const kind: ListingKind = sp.k && sp.k in LISTING_KIND_LABEL ? (sp.k as ListingKind) : "sell";
  const category = sp.c && (CATEGORIES as readonly string[]).includes(sp.c) ? sp.c : "Khác";
  const usable = (await marketPlaces(user.id)).filter((p) => p.location);
  if (usable.length === 0) {
    return (
      <EmptyState
        icon={MapPinOff}
        title="Chưa đăng tin được"
        description="Bạn cần thuộc một khu đã có vị trí trên bản đồ để đăng tin. Nhờ chủ trọ đặt vị trí cho khu."
        action={<Link className="btn-secondary" href="/app/quanh-day">Xem chợ</Link>}
      />
    );
  }
  return (
    <>
      <BackLink href="/app">Chợ</BackLink>
      <PageTitle>Đăng tin</PageTitle>
      <Flash params={sp} />
      <form action={createListingAction} className="card space-y-4">
        <fieldset>
          <legend className="label">Loại tin</legend>
          <div className="grid grid-cols-2 gap-2">
            {(Object.keys(LISTING_KIND_LABEL) as ListingKind[]).map((k) => {
              const { hint, icon: Icon } = KIND_META[k];
              return (
                <label
                  key={k}
                  className="flex cursor-pointer items-start gap-2.5 rounded-xl border border-border bg-surface-2 p-3 transition has-[:checked]:border-brand has-[:checked]:bg-brand/10 has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-brand/40"
                >
                  <input type="radio" name="kind" value={k} defaultChecked={k === kind} className="peer sr-only" />
                  <Icon className="mt-0.5 size-5 shrink-0 text-fg-muted peer-checked:text-brand" />
                  <span>
                    <span className="block text-sm font-semibold">{LISTING_KIND_LABEL[k]}</span>
                    <span className="block text-xs text-fg-subtle">{hint}</span>
                  </span>
                </label>
              );
            })}
          </div>
        </fieldset>
        <div>
          <span className="label">Ảnh sản phẩm (không bắt buộc)</span>
          <ListingPhotoPicker />
        </div>
        <div>
          <label className="label" htmlFor="title">Tiêu đề</label>
          <input className="input" id="title" name="title" maxLength={120} required placeholder="Quạt đứng Senko còn tốt" />
        </div>
        <fieldset>
          <legend className="label">Danh mục</legend>
          <div className="grid grid-cols-5 gap-2">
            {CATEGORIES.map((c) => (
              <label key={c} className="group flex cursor-pointer flex-col items-center gap-1 text-center">
                <input type="radio" name="category" value={c} defaultChecked={c === category} className="peer sr-only" />
                <CategoryTile
                  category={c}
                  className="size-12 rounded-2xl opacity-60 ring-brand ring-offset-2 ring-offset-surface transition peer-checked:opacity-100 peer-checked:ring-2 peer-focus-visible:ring-2"
                  iconClass="size-5"
                />
                <span className="line-clamp-2 text-[11px] leading-tight text-fg-muted peer-checked:font-semibold peer-checked:text-fg">{c}</span>
              </label>
            ))}
          </div>
        </fieldset>
        <div>
          <label className="label" htmlFor="price">Giá (đ)</label>
          <input className="input" id="price" name="price" inputMode="numeric" placeholder="Bỏ trống nếu thương lượng hoặc cho tặng" />
        </div>
        <div>
          <label className="label" htmlFor="body">Mô tả</label>
          <textarea className="input min-h-24" id="body" name="body" maxLength={2000} placeholder="Tình trạng, thời gian có thể gặp…" />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="label" htmlFor="place">Khu vực</label>
            <select className="input" id="place" name="place">
              {usable.map((p) => (
                <option key={p.key} value={p.key}>{p.name}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="label" htmlFor="contact">SĐT / Zalo</label>
            <input className="input" id="contact" name="contact" required placeholder="0901 234 567" />
          </div>
        </div>
        <p className="flex items-start gap-2 rounded-xl bg-surface-2 p-3 text-xs text-fg-muted">
          <ShieldCheck className="size-4 shrink-0 text-brand" />
          Liên hệ chỉ hiện cho người bạn đồng ý. Tin hiện vị trí gần đúng theo khu (khoảng 500 m), không hiện số phòng. Tin hiển thị 30 ngày; sắp hết hạn thì vào “Chợ của tôi” bấm Gia hạn, bán xong thì bấm Đóng tin.
        </p>
        <button className="btn w-full">Đăng tin</button>
      </form>
    </>
  );
}
