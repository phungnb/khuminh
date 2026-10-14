import { Building2, FileText, Heart, House, LogOut, Megaphone, Shield } from "lucide-react";
import { PushToggle } from "@/components/push-toggle";
import { vnd } from "@/lib/format";
import { requireUser } from "@/lib/session";
import { actorFor } from "@/server/auth";
import { myInterests, myListings } from "@/server/market";
import { pushPublicKey } from "@/server/push";
import { tenantHome } from "@/server/tenant";
import { dueInvoices } from "@/server/today";
import { logoutAction } from "../../auth-actions";
import { MenuLink } from "../_components/menu-link";

export const dynamic = "force-dynamic";

// Tôi: hồ sơ, nhà và nơi ở, quản lý khu (nếu là chủ trọ/nhân viên), tin đã đăng, cài đặt. Việc cần xử lý (hóa đơn, sự cố) vẫn hiện ở Hôm nay.
export default async function Page() {
  const user = await requireUser();
  const [homes, mine, ints, actor] = await Promise.all([tenantHome(user.id), myListings(user.id), myInterests(user.id), actorFor(user.id)]);
  const active = homes.filter((h) => h.active);
  const owed = dueInvoices(homes).reduce((s, d) => s + d.owed, 0);
  const waiting = mine.reduce((n, l) => n + (l.status === "open" ? l.interestCount : 0), 0);
  const publicKey = pushPublicKey();

  return (
    <>
      <div className="card mb-6 flex items-center gap-3">
        <span className="grid size-14 place-items-center rounded-full bg-brand text-xl font-extrabold text-brand-fg">
          {user.displayName.charAt(0).toUpperCase()}
        </span>
        <div className="min-w-0 flex-1">
          <p className="truncate text-lg font-bold">{user.displayName}</p>
          <p className="text-sm text-fg-muted">
            {active.length > 0 ? `${active.map((h) => `Phòng ${h.unitCode}`).join(", ")} · ` : ""}
            {mine.length} tin đã đăng
          </p>
        </div>
      </div>

      <section className="mb-6 space-y-2">
        <h2 className="text-sm font-semibold text-fg-subtle">Nhà và nơi ở</h2>
        {homes.length === 0 ? (
          <p className="card text-sm text-fg-muted">
            Chưa gắn với phòng nào. Nếu bạn đang thuê trọ, xin chủ nhà gửi link mời để xem hóa đơn, mã QR và bảng tin khu.
          </p>
        ) : (
          <MenuLink
            href="/app/nha"
            icon={House}
            title={active.length > 0 ? `${active[0]!.propertyName}${active.length > 1 ? ` và ${active.length - 1} nơi khác` : ""}` : "Nơi đã ở"}
            hint={owed > 0 ? `Còn phải trả ${vnd(owed)} · lịch sử hóa đơn` : "Hợp đồng, lịch sử hóa đơn, thanh toán"}
          />
        )}
      </section>

      {actor ? (
        <section className="mb-6 space-y-2">
          <h2 className="text-sm font-semibold text-fg-subtle">Quản lý khu</h2>
          <MenuLink
            href="/quan-ly"
            icon={Building2}
            title={actor.role === "owner" ? "Khu của tôi" : "Khu được giao"}
            hint="Phòng, chỉ số điện nước, hóa đơn, sự cố, nhân viên"
          />
        </section>
      ) : null}

      <section className="mb-6 space-y-2">
        <h2 className="text-sm font-semibold text-fg-subtle">Chợ của tôi</h2>
        <MenuLink href="/app/cua-toi" icon={Megaphone} title="Tin đã đăng" hint={waiting > 0 ? `${waiting} người đang chờ bạn trả lời` : `${mine.length} tin`} />
        <MenuLink href="/app/cua-toi?tab=quan-tam" icon={Heart} title="Đang quan tâm" hint={`${ints.length} tin`} />
      </section>

      <section className="mb-6 space-y-2">
        <h2 className="text-sm font-semibold text-fg-subtle">Cài đặt</h2>
        {publicKey ? <PushToggle publicKey={publicKey} /> : null}
        <MenuLink href="/rieng-tu" icon={Shield} title="Quyền riêng tư" />
        <MenuLink href="/dieu-khoan" icon={FileText} title="Điều khoản sử dụng" />
      </section>

      <form action={logoutAction}>
        <button className="btn-secondary flex w-full items-center justify-center gap-2">
          <LogOut className="size-4" aria-hidden /> Đăng xuất
        </button>
      </form>
    </>
  );
}
