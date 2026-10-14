// Điều hướng chính của app cư dân. "Nhà và nơi ở" nằm trong Tôi; việc cần xử lý
// (hóa đơn, sự cố, thông báo) hiện ở Hôm nay để không phải nhớ nó nằm ở tab nào.

export interface Tab {
  href: string;
  label: string;
  icon: "today" | "near" | "post" | "tools" | "me";
  /** Trang con thuộc tab này (tô sáng tab khi đang ở đó). */
  match: string[];
  center?: boolean;
}

export const TABS: Tab[] = [
  { href: "/app", label: "Hôm nay", icon: "today", match: [] },
  { href: "/app/quanh-day", label: "Quanh đây", icon: "near", match: ["/app/tin", "/app/nguoi"] },
  { href: "/app/dang-tin", label: "Đăng tin", icon: "post", match: [], center: true },
  { href: "/app/tien-ich", label: "Tiện ích", icon: "tools", match: ["/app/su-co", "/app/bang-tin"] },
  { href: "/app/toi", label: "Tôi", icon: "me", match: ["/app/nha", "/app/cua-toi", "/app/hoa-don"] },
];

export function isActive(tab: Pick<Tab, "href" | "match">, pathname: string): boolean {
  if (tab.href === "/app") return pathname === "/app";
  const under = (p: string) => pathname === p || pathname.startsWith(`${p}/`);
  return under(tab.href) || tab.match.some(under);
}
