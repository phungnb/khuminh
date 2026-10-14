"use client";

import { FileText, Gauge, House, LayoutDashboard, Megaphone, Settings, Wrench } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/cn";

const TABS = [
  { href: "", label: "Tổng quan", icon: LayoutDashboard },
  { href: "/phong", label: "Phòng", icon: House },
  { href: "/chi-so", label: "Chỉ số", icon: Gauge },
  { href: "/ky", label: "Hóa đơn", icon: FileText },
  { href: "/su-co", label: "Sự cố", icon: Wrench },
  { href: "/bang-tin", label: "Bảng tin", icon: Megaphone },
  { href: "/bieu-phi", label: "Cài đặt", icon: Settings },
];

export function CoSoTabs({ id }: { id: string }) {
  const path = usePathname();
  const base = `/co-so/${id}`;
  return (
    <nav className="scrollbar-none mx-auto flex max-w-5xl gap-1 overflow-x-auto px-2">
      {TABS.map(({ href, label, icon: Icon }) => {
        const to = base + href;
        // Tổng quan chỉ sáng khi đúng trang gốc; tab khác sáng cả trang con (vd /ky/<id>, /hoa-don thuộc Hóa đơn).
        const on = href === "" ? path === base : path.startsWith(to) || (href === "/ky" && path.startsWith(`${base}/hoa-don`));
        return (
          <Link
            key={href}
            href={to}
            aria-current={on ? "page" : undefined}
            className={cn(
              "flex items-center gap-1.5 whitespace-nowrap border-b-2 px-3 py-2.5 text-sm font-medium transition",
              on ? "border-brand text-fg" : "border-transparent text-fg-muted hover:text-fg",
            )}
          >
            <Icon className="size-4" />
            {label}
          </Link>
        );
      })}
    </nav>
  );
}
