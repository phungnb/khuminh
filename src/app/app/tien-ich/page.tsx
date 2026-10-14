import Link from "next/link";
import { Building2, Gift, Hammer, Megaphone, ReceiptText, Sparkles, Store, Wrench, type LucideIcon } from "lucide-react";
import { requireUser } from "@/lib/session";
import { actorFor } from "@/server/auth";
import { reportablePlaces } from "@/server/maintenance";
import { MenuLink } from "../_components/menu-link";
import { postHref, purposeParams, PURPOSES } from "../_components/purposes";

export const dynamic = "force-dynamic";

// Bốn nhóm theo góp ý 1.docx; mỗi nhóm xem tin hoặc đăng tin điền sẵn loại và danh mục.
const GROUPS: Array<{ key: string; icon: LucideIcon }> = [
  { key: "sua-chua", icon: Hammer },
  { key: "don-dep", icon: Sparkles },
  { key: "mua-ban", icon: Store },
  { key: "cho-tang", icon: Gift },
];

// Tiện ích: chỉ liệt kê việc làm được ngay hôm nay. Gian hàng, nhà cung cấp xác minh, đặt lịch
// là giai đoạn sau (cần bảng mới, chờ duyệt), nên chưa hiện ở đây.
export default async function Page() {
  const user = await requireUser();
  const [places, actor] = await Promise.all([reportablePlaces(user.id), actorFor(user.id)]);
  const tenant = places.length > 0;
  return (
    <>
      <h1 className="mb-1 text-xl font-bold">Tiện ích</h1>
      <p className="mb-4 text-sm text-fg-muted">Việc nhà và dịch vụ quanh khu, xử lý trong vài thao tác.</p>

      {tenant ? (
        <section className="mb-6 space-y-2">
          <h2 className="text-sm font-semibold text-fg-subtle">Nơi bạn đang ở</h2>
          <MenuLink href="/app/su-co" icon={Wrench} title="Báo sự cố" hint="Hỏng điện nước, đồ đạc: gửi chủ nhà, theo dõi xử lý" />
          <MenuLink href="/app/nha" icon={ReceiptText} title="Hóa đơn và thanh toán" hint="Xem hóa đơn, mã QR chuyển khoản" />
          <MenuLink href="/app/bang-tin" icon={Megaphone} title="Bảng tin khu trọ" hint="Thông báo của chủ nhà, tin trong khu" />
        </section>
      ) : null}

      <section className="mb-6 space-y-2">
        <h2 className="text-sm font-semibold text-fg-subtle">Quanh đây</h2>
        {GROUPS.map(({ key, icon: Icon }) => {
          const p = PURPOSES.find((x) => x.key === key)!;
          return (
            <div key={key} className="card">
              <div className="flex items-center gap-3">
                <span className="grid size-10 shrink-0 place-items-center rounded-full bg-surface-2 text-brand-ink">
                  <Icon className="size-5" aria-hidden />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block font-semibold">{p.label}</span>
                  <span className="block text-sm text-fg-subtle">{p.hint}</span>
                </span>
              </div>
              <div className="mt-3 grid grid-cols-2 gap-2">
                <Link href={`/app/quanh-day?${new URLSearchParams(purposeParams(p)).toString()}`} className="btn-secondary text-sm">
                  Xem tin
                </Link>
                <Link href={postHref(p)} className="btn text-sm">
                  Đăng tin
                </Link>
              </div>
            </div>
          );
        })}
        <p className="px-1 text-xs text-fg-subtle">
          Đây là tin cư dân tự đăng, KhuMình chưa xác minh người nhận việc. Hỏi rõ giá và thời gian trước khi nhận.
        </p>
      </section>

      {actor ? (
        <section className="space-y-2">
          <h2 className="text-sm font-semibold text-fg-subtle">Chủ nhà, ban quản lý</h2>
          <MenuLink href="/quan-ly" icon={Building2} title="Quản lý khu" hint="Phòng, chỉ số điện nước, hóa đơn, sự cố, nhân viên" />
        </section>
      ) : null}
    </>
  );
}
