import Link from "next/link";
import { ChevronRight, type LucideIcon } from "lucide-react";

/** Một dòng menu dạng thẻ: biểu tượng, tên, mô tả ngắn. Dùng ở Tiện ích và Tôi. */
export function MenuLink({ href, icon: Icon, title, hint }: { href: string; icon: LucideIcon; title: string; hint?: string }) {
  return (
    <Link href={href} className="card flex items-center gap-3 hover:border-fg-subtle">
      <span className="grid size-10 shrink-0 place-items-center rounded-full bg-surface-2 text-brand-ink">
        <Icon className="size-5" aria-hidden />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block font-semibold">{title}</span>
        {hint ? <span className="block text-sm text-fg-subtle">{hint}</span> : null}
      </span>
      <ChevronRight className="size-5 shrink-0 text-fg-subtle" aria-hidden />
    </Link>
  );
}
