import Link from "next/link";
import { redirect } from "next/navigation";
import { Building2, Gift, ShieldCheck, ShoppingBag, Wrench } from "lucide-react";
import { Logo } from "@/components/ui";
import { currentUser } from "@/lib/session";

const FEATURES = [
  { icon: ShoppingBag, t: "Mua bán đồ cũ", d: "Quạt, tủ, xe đạp… người mua ngay khu bên cạnh, khỏi ship xa." },
  { icon: Gift, t: "Cho tặng", d: "Đồ còn dùng được, đồ ăn dư: tặng hàng xóm thay vì bỏ đi." },
  { icon: Wrench, t: "Dịch vụ quanh nhà", d: "Sửa điện nước, giặt ủi, nấu ăn, gia sư từ người trong khu." },
  { icon: ShieldCheck, t: "Liên hệ an toàn", d: "Số điện thoại chỉ hiện khi người đăng đồng ý. Tin chỉ hiện vị trí gần đúng." },
];

export default async function Home() {
  if (await currentUser()) redirect("/app");
  return (
    <main className="mx-auto min-h-dvh max-w-md px-4 pb-12">
      <header className="flex h-16 items-center justify-between">
        <Logo />
        <Link href="/dang-nhap" className="btn-secondary min-h-9 px-3 text-sm">Đăng nhập</Link>
      </header>
      <section className="club-wall animate-fade-in mt-2" style={{ background: "linear-gradient(135deg, #65a30d 0%, #047857 55%, #0b1020 100%)" }}>
        <div className="relative z-[1] py-4">
          <div className="text-[11px] font-semibold uppercase tracking-wide text-white/70">Tiện nghi khu xóm, kết nối một chạm</div>
          <h1 className="mt-1 text-3xl leading-tight font-extrabold">Chợ tiện ích quanh nhà</h1>
          <p className="mt-2 text-sm text-white/85">
            Mua bán, cho tặng, tìm dịch vụ với hàng xóm trong khu phố, phường, xã: từ 1 đến 20 km quanh bạn.
          </p>
          <Link href="/dang-nhap" className="btn mt-5 px-6">Vào chợ</Link>
        </div>
      </section>
      <div className="mt-4 grid grid-cols-2 gap-3">
        {FEATURES.map(({ icon: Icon, t, d }) => (
          <div key={t} className="card">
            <span className="grid size-10 place-items-center rounded-xl bg-surface-2 text-brand"><Icon className="size-5" aria-hidden /></span>
            <h2 className="mt-3 font-semibold">{t}</h2>
            <p className="mt-1 text-sm text-fg-muted">{d}</p>
          </div>
        ))}
      </div>
      <div className="card mt-4 flex gap-3">
        <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-brand text-brand-fg"><Building2 className="size-5" aria-hidden /></span>
        <div>
          <h2 className="font-semibold">Bạn là chủ trọ, chung cư mini?</h2>
          <p className="mt-1 text-sm text-fg-muted">
            Quản lý phòng, ghi điện nước, gửi hóa đơn kèm mã QR cho người thuê, miễn phí cho khu nhỏ. Người thuê của bạn được vào chợ quanh khu.
          </p>
          <Link href="/dang-ky" className="btn-secondary mt-3">Quản lý khu miễn phí</Link>
        </div>
      </div>
      <p className="mt-6 text-center text-sm text-fg-subtle">Đang thuê trọ? Xin chủ nhà gửi link mời để vào KhuMình.</p>
    </main>
  );
}
