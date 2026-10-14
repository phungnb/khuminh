import type { Metadata } from "next";
import Link from "next/link";
import { LogOut } from "lucide-react";
import { PwaInstall } from "@/components/pwa";
import { Logo } from "@/components/ui";
import { requireUser } from "@/lib/session";
import { actorFor } from "@/server/auth";
import { logoutAction } from "../auth-actions";
import { BottomTabs } from "./_components/bottom-tabs";

export const metadata: Metadata = {
  title: "KhuMình",
  appleWebApp: { capable: true, title: "KhuMình", statusBarStyle: "black-translucent" },
};

export default async function Layout({ children }: { children: React.ReactNode }) {
  const user = await requireUser();
  const manager = Boolean(await actorFor(user.id));
  const initial = user.displayName.trim().charAt(0).toUpperCase() || "?";
  return (
    <div className="mx-auto flex min-h-dvh max-w-md flex-col border-x border-border/60">
      <header className="sticky top-0 z-40 border-b border-border bg-bg/85 pt-[env(safe-area-inset-top)] backdrop-blur-md">
        <div className="flex h-16 items-center justify-between gap-2 px-4">
          <Link href="/app" aria-label="KhuMình — Chợ quanh đây">
            <Logo />
          </Link>
          <div className="flex items-center gap-1">
            <Link
              href="/app/cua-toi"
              aria-label="Tài khoản của tôi"
              className="flex min-h-11 items-center gap-2 rounded-full border border-border bg-surface py-1 pl-1 pr-3 text-sm"
            >
              <span className="grid size-8 place-items-center rounded-full bg-brand text-sm font-bold text-brand-fg">{initial}</span>
              <span className="max-w-24 truncate">{user.displayName}</span>
            </Link>
            <form action={logoutAction}>
              <button aria-label="Đăng xuất" className="grid size-11 place-items-center rounded-full text-fg-subtle hover:bg-surface-2 hover:text-fg">
                <LogOut className="size-5" aria-hidden />
              </button>
            </form>
          </div>
        </div>
      </header>
      <main className="flex-1 px-4 pt-4 pb-32">
        <PwaInstall />
        {children}
      </main>
      <BottomTabs manager={manager} />
    </div>
  );
}
