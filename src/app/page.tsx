import Link from "next/link";
import { redirect } from "next/navigation";
import { currentUser } from "@/lib/session";

const FEATURES = [
  { t: "Mua bán đồ cũ", d: "Quạt, tủ, xe đạp… người mua ngay khu bên cạnh, khỏi ship xa." },
  { t: "Cho tặng", d: "Đồ còn dùng được, đồ ăn dư: tặng hàng xóm thay vì bỏ đi." },
  { t: "Dịch vụ quanh nhà", d: "Sửa điện nước, giặt ủi, nấu ăn, gia sư từ người trong khu." },
  { t: "Liên hệ an toàn", d: "Số điện thoại chỉ hiện khi người đăng đồng ý. Tin chỉ hiện vị trí gần đúng." },
];

export default async function Home() {
  if (await currentUser()) redirect("/app");
  return (
    <main className="mx-auto max-w-md px-4 py-10">
      <div className="club-wall" style={{ background: "linear-gradient(135deg, #65a30d 0%, #047857 55%, #0b1020 100%)" }}>
        <div className="relative z-[1]">
          <div className="text-[11px] font-semibold uppercase tracking-wide text-white/70">KhuMình</div>
          <h1 className="text-3xl font-bold leading-tight">Chợ tiện ích quanh nhà</h1>
          <p className="mt-2 text-sm text-white/85">
            Mua bán, cho tặng, tìm dịch vụ với hàng xóm trong khu phố, phường, xã: từ 1 đến 20 km quanh bạn.
          </p>
          <Link href="/dang-nhap" className="btn mt-4">Vào chợ</Link>
        </div>
      </div>
      <div className="mt-4 grid gap-3">
        {FEATURES.map((f) => (
          <div key={f.t} className="card">
            <h2 className="font-semibold">{f.t}</h2>
            <p className="mt-1 text-sm text-fg-muted">{f.d}</p>
          </div>
        ))}
      </div>
      <div className="card mt-6 border-brand-ink/30">
        <h2 className="font-semibold">Bạn là chủ trọ, chung cư mini?</h2>
        <p className="mt-1 text-sm text-fg-muted">
          Quản lý phòng, ghi điện nước, gửi hóa đơn kèm mã QR cho người thuê, miễn phí cho khu nhỏ. Người thuê của bạn được vào chợ quanh khu.
        </p>
        <Link href="/dang-ky" className="btn-secondary mt-3">Quản lý khu miễn phí</Link>
      </div>
      <p className="mt-6 text-center text-sm text-fg-subtle">
        Đang thuê trọ? Xin chủ nhà gửi link mời để vào KhuMình.
      </p>
    </main>
  );
}
