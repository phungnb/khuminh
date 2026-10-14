"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { LayoutGrid, MapPin, Plus, Sun, User } from "lucide-react";
import { cn } from "@/lib/cn";
import { isActive, TABS } from "./nav";

const ICONS = { today: Sun, near: MapPin, post: Plus, tools: LayoutGrid, me: User };

// 4 tab chính + nút giữa nổi (Đăng tin) theo kiểu RaceHub.
export function BottomTabs() {
  const pathname = usePathname();
  return (
    <nav
      aria-label="Điều hướng chính"
      className="fixed inset-x-0 bottom-0 z-50 border-t border-border bg-bg/95 pb-[env(safe-area-inset-bottom)] backdrop-blur-lg"
    >
      <ul className="mx-auto grid max-w-md grid-cols-5 items-end px-2">
        {TABS.map((tab) => {
          const { href, label, icon, center } = tab;
          const Icon = ICONS[icon];
          const active = isActive(tab, pathname);
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
