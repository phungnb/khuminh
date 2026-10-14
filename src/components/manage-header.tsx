import { LogOut, Store } from "lucide-react";
import Link from "next/link";
import { logoutAction } from "@/app/auth-actions";
import { Logo } from "./ui";

/** Thanh trên của module quản lý khu: logo, đường dẫn (ẩn bớt trên điện thoại), về app, đăng xuất. */
export function ManageHeader({ crumbs, children }: { crumbs: { label: string; href?: string }[]; children?: React.ReactNode }) {
  return (
    <header className="sticky top-0 z-40 border-b border-border bg-bg/85 backdrop-blur-md">
      <div className="mx-auto flex max-w-5xl items-center justify-between gap-2 px-4 py-3">
        <div className="flex min-w-0 items-center gap-2">
          <Link href="/app" aria-label="KhuMình — Hôm nay" className="shrink-0">
            <Logo />
          </Link>
          {crumbs.map((c, i) => (
            <span key={c.label} className={`min-w-0 items-center gap-2 ${i < crumbs.length - 1 ? "hidden sm:flex" : "flex"}`}>
              <span className="text-fg-subtle">/</span>
              {c.href ? (
                <Link href={c.href} className="truncate text-sm text-fg-muted hover:text-brand-ink">
                  {c.label}
                </Link>
              ) : (
                <span className="truncate text-sm font-semibold">{c.label}</span>
              )}
            </span>
          ))}
        </div>
        <div className="flex shrink-0 items-center gap-1">
          <Link href="/app" className="inline-flex min-h-9 items-center gap-1.5 rounded-full px-3 text-sm font-medium text-brand-ink hover:bg-surface-2">
            <Store className="size-4" />
            <span className="hidden sm:inline">Về app</span>
          </Link>
          <form action={logoutAction}>
            <button aria-label="Đăng xuất" className="grid size-9 place-items-center rounded-full text-fg-subtle hover:bg-surface-2 hover:text-fg">
              <LogOut className="size-4" />
            </button>
          </form>
        </div>
      </div>
      {children}
    </header>
  );
}
