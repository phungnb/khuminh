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
      <header className="sticky top-0 z-10 flex items-center justify-between border-b border-stone-200 bg-white px-4 py-3">
        <Link href="/app" className="font-bold text-brand">KhuMình</Link>
        <div className="flex items-center gap-3 text-sm">
          <span className="text-stone-600">{user.displayName}</span>
          <form action={logoutAction}>
            <button className="text-stone-500">Đăng xuất</button>
          </form>
        </div>
      </header>
      <main className="px-4 py-4">
        <PwaInstall />
        {children}
      </main>
    </div>
  );
}
