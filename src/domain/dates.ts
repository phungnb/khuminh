// Ngày nghiệp vụ luôn là chuỗi "YYYY-MM-DD" (lịch, không múi giờ).
// Khoảng ngày trong module này là khoảng đóng [start, end].

export type IsoDate = string;

const ISO_RE = /^\d{4}-\d{2}-\d{2}$/;

export function assertIsoDate(d: string): asserts d is IsoDate {
  if (!ISO_RE.test(d) || Number.isNaN(toDayNumber(d))) {
    throw new Error(`Ngày không hợp lệ: ${d}`);
  }
}

/** Số ngày kể từ 1970-01-01 (UTC), dùng để so sánh và đếm ngày. */
export function toDayNumber(d: IsoDate): number {
  const [y, m, day] = d.split("-").map(Number) as [number, number, number];
  const ms = Date.UTC(y, m - 1, day);
  const back = new Date(ms);
  if (back.getUTCFullYear() !== y || back.getUTCMonth() !== m - 1 || back.getUTCDate() !== day) {
    return Number.NaN;
  }
  return ms / 86_400_000;
}

export function fromDayNumber(n: number): IsoDate {
  return new Date(n * 86_400_000).toISOString().slice(0, 10);
}

export function addDays(d: IsoDate, days: number): IsoDate {
  return fromDayNumber(toDayNumber(d) + days);
}

/** Số ngày trong khoảng đóng [start, end]; 0 nếu end < start. */
export function daysInclusive(start: IsoDate, end: IsoDate): number {
  return Math.max(0, toDayNumber(end) - toDayNumber(start) + 1);
}

export function maxDate(a: IsoDate, b: IsoDate): IsoDate {
  return a >= b ? a : b;
}

export function minDate(a: IsoDate, b: IsoDate): IsoDate {
  return a <= b ? a : b;
}

export interface DateRange {
  start: IsoDate;
  end: IsoDate;
}

/** Giao của hai khoảng đóng; null nếu không giao. `end` null nghĩa là chưa kết thúc. */
export function intersect(a: DateRange, b: { start: IsoDate; end: IsoDate | null }): DateRange | null {
  const start = maxDate(a.start, b.start);
  const end = b.end === null ? a.end : minDate(a.end, b.end);
  return start <= end ? { start, end } : null;
}
