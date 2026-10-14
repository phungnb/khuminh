import Link from "next/link";
import { Logo } from "@/components/ui";
import { notFound } from "next/navigation";
import { requireActor } from "@/lib/session";
import { getProperty, listProperties } from "@/server/queries";
import { logoutAction } from "../../auth-actions";

const TABS = [
  { href: "", label: "Tổng quan" },
  { href: "/phong", label: "Phòng" },
  { href: "/chi-so", label: "Chỉ số" },
  { href: "/ky", label: "Hóa đơn" },
  { href: "/su-co", label: "Sự cố" },
  { href: "/bang-tin", label: "Bảng tin" },
  { href: "/bieu-phi", label: "Cài đặt" },
];

export default async function Layout({ children, params }: { children: React.ReactNode; params: Promise<{ id: string }> }) {
  const { id } = await params;
  const actor = await requireActor();
  const [property, all] = await Promise.all([getProperty(actor, id), listProperties(actor)]);
  if (!property) notFound();
  return (
    <div>
      <header className="sticky top-0 z-40 border-b border-border bg-bg/85 backdrop-blur-md">
        <div className="mx-auto flex max-w-5xl items-center justify-between gap-2 px-4 py-3">
          <div className="flex items-center gap-2">
            <Link href="/app" aria-label="KhuMình — Hôm nay"><Logo /></Link>
            <span className="text-fg-subtle">/</span>
            <Link href="/quan-ly" className="text-sm text-fg-muted hover:text-brand-ink">Quản lý khu</Link>
            <span className="text-fg-subtle">/</span>
            <span className="font-semibold">{property.name}</span>
            {all.length > 1 ? <span className="text-xs text-fg-subtle">({all.length} cơ sở)</span> : null}
          </div>
          <div className="flex items-center gap-3">
            <Link href="/app" className="text-sm font-medium text-brand-ink">Về app</Link>
            <form action={logoutAction}>
              <button className="text-sm text-fg-subtle hover:text-fg">Đăng xuất</button>
            </form>
          </div>
        </div>
        <nav className="mx-auto flex max-w-5xl gap-1 overflow-x-auto px-2">
          {TABS.map((t) => (
            <Link key={t.href} href={`/co-so/${id}${t.href}`} className="whitespace-nowrap px-3 py-2 text-sm font-medium text-fg-muted hover:text-brand-ink">
              {t.label}
            </Link>
          ))}
        </nav>
      </header>
      <main className="mx-auto max-w-5xl px-4 py-6">
        {property.archivedAt ? (
          <p className="card mb-4 border-warning/40 text-sm">
            Khu này đang được lưu trữ, cư dân không còn thấy trong chợ và Hôm nay.{" "}
            <Link href={`/co-so/${id}/bieu-phi#khu`} className="font-semibold text-brand-ink">Khôi phục</Link>
          </p>
        ) : null}
        {children}
      </main>
    </div>
  );
}
