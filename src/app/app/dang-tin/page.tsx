import Link from "next/link";
import { Flash, PageTitle } from "@/components/ui";
import { requireUser } from "@/lib/session";
import { CATEGORIES, LISTING_KIND_LABEL, marketPlaces, type ListingKind } from "@/server/market";
import { createListingAction } from "../market-actions";

export const dynamic = "force-dynamic";

const KIND_HINT: Record<ListingKind, string> = {
  sell: "Đồ cũ, đồ tự làm",
  want: "Tìm mua, tìm người làm",
  give: "Tặng miễn phí",
  service: "Nhận sửa, dọn, nấu, dạy…",
};

export default async function Page({ searchParams }: { searchParams: Promise<{ loi?: string; ok?: string }> }) {
  const user = await requireUser();
  const usable = (await marketPlaces(user.id)).filter((p) => p.location);
  if (usable.length === 0) {
    return (
      <div className="card text-center text-sm text-fg-muted">
        Bạn cần thuộc một khu đã có vị trí trên bản đồ để đăng tin. <Link className="font-semibold text-brand-ink" href="/app">Xem chợ</Link>
      </div>
    );
  }
  return (
    <>
      <PageTitle>Đăng tin</PageTitle>
      <Flash params={await searchParams} />
      <form action={createListingAction} className="card space-y-4">
        <fieldset>
          <legend className="label">Loại tin</legend>
          <div className="grid grid-cols-2 gap-2">
            {(Object.keys(LISTING_KIND_LABEL) as ListingKind[]).map((k, i) => (
              <label key={k} className="flex cursor-pointer items-start gap-2 rounded-lg border border-border p-2 has-[:checked]:border-brand-ink has-[:checked]:bg-brand/20">
                <input type="radio" name="kind" value={k} defaultChecked={i === 0} className="mt-1" />
                <span>
                  <span className="block text-sm font-semibold">{LISTING_KIND_LABEL[k]}</span>
                  <span className="block text-xs text-fg-subtle">{KIND_HINT[k]}</span>
                </span>
              </label>
            ))}
          </div>
        </fieldset>
        <div>
          <label className="label" htmlFor="title">Tiêu đề</label>
          <input className="input" id="title" name="title" maxLength={120} required placeholder="Quạt đứng Senko còn tốt" />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="label" htmlFor="category">Danh mục</label>
            <select className="input" id="category" name="category" defaultValue="Khác">
              {CATEGORIES.map((c) => (
                <option key={c} value={c}>{c}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="label" htmlFor="price">Giá (đ)</label>
            <input className="input" id="price" name="price" inputMode="numeric" placeholder="Trống = thương lượng" />
          </div>
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
        <p className="text-xs text-fg-subtle">
          Liên hệ chỉ hiện cho người bạn đồng ý. Tin hiện vị trí gần đúng theo khu, không hiện số phòng.
        </p>
        <button className="btn w-full">Đăng tin</button>
      </form>
    </>
  );
}
