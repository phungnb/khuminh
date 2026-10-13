import type { Metadata } from "next";
import Link from "next/link";
import { PwaInstall } from "@/components/pwa";
import { requireUser } from "@/lib/session";
import { logoutAction } from "../auth-actions";

export const metadata: Metadata = {
  title: "KhuMình",
  appleWebApp: { capable: true, title: "KhuMình", statusBarStyle: "default" },
};

export default async function Layout({ children }: { children: React.ReactNode }) {
  const user = await requireUser();
  return (
    <div className="mx-auto min-h-screen max-w-md">
      <header className="sticky top-0 z-10 flex items-center justify-between border-b border-border bg-surface px-4 py-3">
        <Link href="/app" className="font-bold text-fg">Khu<span className="text-brand-ink">Mình</span></Link>
        <div className="flex items-center gap-3 text-sm">
          <span className="text-fg-muted">{user.displayName}</span>
          <form action={logoutAction}>
            <button className="text-fg-subtle hover:text-fg">Đăng xuất</button>
          </form>
        </div>
      </header>
      <main className="px-4 pt-4 pb-24">
        <PwaInstall />
        {children}
      </main>
      <nav className="fixed inset-x-0 bottom-0 border-t border-border bg-surface pb-[env(safe-area-inset-bottom)]">
        <div className="mx-auto grid max-w-md grid-cols-2 text-center text-sm font-medium">
          <Link href="/app" className="py-3 text-fg-muted">Hóa đơn</Link>
          <Link href="/app/bang-tin" className="py-3 text-fg-muted">Bảng tin</Link>
        </div>
      </nav>
    </div>
  );
}
