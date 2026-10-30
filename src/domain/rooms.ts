// Suy tầng và trạng thái ô phòng cho sơ đồ tầng. Thuần, không chạm DB.

/**
 * Tầng của phòng: ưu tiên cột floor; trống thì suy từ mã phòng dạng
 * 101, 1203 (2 số cuối là số phòng, phần đầu là tầng). Mã không theo
 * quy ước này trả null (nhóm "Chưa xếp tầng").
 */
export function deriveFloor(code: string, floor: number | null): number | null {
  if (floor !== null && floor !== undefined) return floor;
  const digits = code.trim();
  if (/^\d{3,}$/.test(digits)) return Number(digits.slice(0, -2));
  return null;
}

/** Nhãn tầng: 0 là tầng trệt (cách gọi phổ biến ở nhà trọ). */
export function floorLabel(floor: number | null): string {
  if (floor === null) return "Chưa xếp tầng";
  return floor === 0 ? "Tầng trệt" : `Tầng ${floor}`;
}

export type RoomStatus = "trong" | "thue" | "sap-het-han" | "het-han" | "no";

/**
 * Trạng thái ô phòng, ưu tiên: nợ > hết hạn > sắp hết hạn > đang thuê > trống.
 * `t` là ngày hiện tại (YYYY-MM-DD), `expiringWithinDays` là ngưỡng "sắp hết hạn".
 */
export function roomStatus(
  o: { lease: { expiresOn: string | null } | null; overdue: boolean },
  t: string,
  expiringWithinDays: number,
): RoomStatus {
  if (!o.lease) return "trong";
  if (o.overdue) return "no";
  if (o.lease.expiresOn && o.lease.expiresOn < t) return "het-han";
  if (o.lease.expiresOn && o.lease.expiresOn <= addDaysIso(t, expiringWithinDays)) return "sap-het-han";
  return "thue";
}

/** Nhãn ngắn cho trạng thái ô phòng. */
export const ROOM_STATUS_LABEL: Record<RoomStatus, string> = {
  trong: "Trống",
  thue: "Đang thuê",
  "sap-het-han": "Sắp hết hạn",
  "het-han": "Đã hết hạn",
  no: "Nợ",
};

/** Cộng ngày vào ngày ISO (YYYY-MM-DD), không lệ thuộc múi giờ máy. */
export function addDaysIso(d: string, days: number): string {
  const [y = 1970, m = 1, day = 1] = d.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, day + days));
  return dt.toISOString().slice(0, 10);
}

/** Gom phòng theo tầng, tầng tăng dần, nhóm chưa xếp tầng ở cuối. */
export function groupRoomsByFloor<R extends { code: string; floor: number | null }>(
  rooms: R[],
): Array<{ floor: number | null; rooms: R[] }> {
  const map = new Map<number | null, R[]>();
  for (const r of rooms) {
    const f = deriveFloor(r.code, r.floor);
    const list = map.get(f) ?? [];
    list.push(r);
    map.set(f, list);
  }
  return [...map.entries()]
    .sort((a, b) => (a[0] === null ? 1 : b[0] === null ? -1 : a[0] - b[0]))
    .map(([floor, rooms]) => ({ floor, rooms }));
}
