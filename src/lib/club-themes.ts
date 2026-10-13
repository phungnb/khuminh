// "Tường" cơ sở — xem mỗi khu trọ như một CLB của RaceHub.
// Port bộ theme gradient từ RaceHub (features/club/model/theme.ts) để giữ đồng nhất tông màu.
// Không cần cột DB: theme chọn tất định theo id cơ sở (ổn định giữa các lần tải).

export type ClubTheme = "AURORA" | "SUNSET" | "OCEAN" | "FOREST" | "GOLD" | "NIGHT";

export const CLUB_THEMES: Record<ClubTheme, { label: string; bg: string }> = {
  AURORA: { label: "Cực quang", bg: "linear-gradient(135deg, #0f766e 0%, #6d28d9 55%, #0b1020 100%)" },
  SUNSET: { label: "Hoàng hôn", bg: "linear-gradient(135deg, #f97316 0%, #db2777 55%, #1e1b4b 100%)" },
  OCEAN: { label: "Đại dương", bg: "linear-gradient(135deg, #0ea5e9 0%, #1d4ed8 55%, #0b1020 100%)" },
  FOREST: { label: "Rừng xanh", bg: "linear-gradient(135deg, #65a30d 0%, #047857 55%, #0b1020 100%)" },
  GOLD: { label: "Hoàng kim", bg: "linear-gradient(135deg, #facc15 0%, #b45309 55%, #1c1308 100%)" },
  NIGHT: { label: "Đêm thành phố", bg: "linear-gradient(135deg, #334155 0%, #0f172a 60%, #020617 100%)" },
};

const ORDER: ClubTheme[] = ["AURORA", "OCEAN", "FOREST", "SUNSET", "GOLD", "NIGHT"];

/** Chọn theme tất định theo id cơ sở (hash đơn giản, ổn định). */
export function themeForId(id: string): ClubTheme {
  let h = 0;
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) >>> 0;
  return ORDER[h % ORDER.length]!;
}

export function wallBackground(id: string): string {
  return CLUB_THEMES[themeForId(id)].bg;
}
