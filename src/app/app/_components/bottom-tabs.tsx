"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Building2, Home, Megaphone, Plus, Store, User, type LucideIcon } from "lucide-react";
import { cn } from "@/lib/cn";

interface Tab {
  href: string;
  label: string;
  icon: LucideIcon;
  center?: boolean;
}

// Thanh điều hướng dưới theo kiểu RaceHub: nút giữa nổi (Đăng tin) thay cho nút Chạy.
export function BottomTabs({ manager }: { manager: boolean }) {
  const pathname = usePathname();
  const tabs: Tab[] = [
    { href: "/app", label: "Chợ", icon: Store },
    { href: "/app/nha", label: "Nhà tôi", icon: Home },
    { href: "/app/dang-tin", label: "Đăng tin", icon: Plus, center: true },
    { href: "/app/cua-toi", label: "Của tôi", icon: User },
    manager ? { href: "/quan-ly", label: "Quản lý", icon: Building2 } : { href: "/app/bang-tin", label: "Bảng tin", icon: Megaphone },
  ];
  return (
    <nav
      aria-label="Điều hướng chính"
      className="fixed inset-x-0 bottom-0 z-50 border-t border-border bg-bg/95 pb-[env(safe-area-inset-bottom)] backdrop-blur-lg"
    >
      <ul className="mx-auto grid max-w-md grid-cols-5 items-end px-2">
        {tabs.map(({ href, label, icon: Icon, center }) => {
          const active =
            href === "/app" ? pathname === "/app" || pathname.startsWith("/app/tin") : pathname === href || pathname.startsWith(`${href}/`);
          return (
            <li key={href} className="flex justify-center">
              <Link
                href={href}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "flex min-h-14 min-w-14 flex-col items-center justify-center gap-0.5 text-[11px] font-medium transition-colors",
                  active ? "text-brand" : "text-fg-subtle hover:text-fg",
                )}
              >
                {center ? (
                  <span
                    className={cn(
                      "-mt-6 grid size-14 place-items-center rounded-full bg-brand text-brand-fg shadow-lg shadow-brand/20",
                      !active && "animate-breath",
                    )}
                  >
                    <Icon className="size-7" aria-hidden />
                  </span>
                ) : (
                  <Icon className="size-6" aria-hidden />
                )}
                <span className={cn(center && "sr-only")}>{label}</span>
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
