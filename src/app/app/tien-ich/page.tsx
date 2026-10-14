import { Building2, Gift, Hammer, Megaphone, ReceiptText, Sparkles, Wrench } from "lucide-react";
import { requireUser } from "@/lib/session";
import { actorFor } from "@/server/auth";
import { reportablePlaces } from "@/server/maintenance";
import { MenuLink } from "../_components/menu-link";

export const dynamic = "force-dynamic";

// Tiện ích: chỉ liệt kê việc làm được ngay hôm nay. Dịch vụ có nhà cung cấp xác minh, đặt lịch,
// theo dõi là giai đoạn sau (cần bảng mới, chờ duyệt), nên chưa hiện ở đây.
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
        <MenuLink href="/app/quanh-day?k=service&c=S%E1%BB%ADa%20ch%E1%BB%AFa" icon={Hammer} title="Sửa chữa" hint="Tin nhận sửa điện nước, đồ gia dụng quanh bạn" />
        <MenuLink
          href="/app/quanh-day?k=service&c=D%E1%BB%8Dn%20d%E1%BA%B9p%2C%20gi%E1%BA%B7t%20%E1%BB%A7i"
          icon={Sparkles}
          title="Dọn dẹp, giặt ủi"
          hint="Tin nhận dọn nhà, giặt sấy quanh bạn"
        />
        <MenuLink href="/app/quanh-day?k=give" icon={Gift} title="Cho tặng" hint="Đồ còn dùng được hàng xóm cho lại" />
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
