// Bộ tính hóa đơn cho một hợp đồng trong một kỳ.
// Hàm thuần: không đọc DB, không phụ thuộc giờ hệ thống. Mọi tiền là số nguyên đồng.
//
// Quy ước:
// - Kỳ và hợp đồng là khoảng ngày đóng. Phần hợp đồng nằm trong kỳ gọi là "đoạn".
// - Khoản tính theo kỳ (tiền phòng, phí cố định, theo người, theo số lượng) được chia
//   theo ngày: round(số tiền × số ngày ở / số ngày của kỳ), làm tròn nửa lên tới 1 đồng.
//   Ở trọn kỳ thì không chia, lấy nguyên số tiền.
// - Chỉ số đồng hồ: chỉ số tại một mốc là bản ghi gần mốc nhất trong ±READING_WINDOW_DAYS ngày.
//   Mốc đầu đoạn nằm giữa ngày (start-1) và start; mốc cuối nằm giữa end và (end+1).
//   Nhờ vậy chỉ số chốt ngày 31/10 hay sáng 01/11 đều dùng được cho cả kỳ 10 và kỳ 11.
// - Đơn giá theo chỉ số dùng phiên bản biểu phí có hiệu lực vào ngày cuối đoạn,
//   vì không thể tách lượng tiêu thụ giữa kỳ nếu không có chỉ số giữa kỳ.
// - Số đo đồng hồ lưu theo phần trăm đơn vị (centi): 123,45 kWh = 12345.

import { addDays, daysInclusive, intersect, toDayNumber, type DateRange, type IsoDate } from "./dates";
import { assertDong, divRound, roundTo, type Dong } from "./money";

export const READING_WINDOW_DAYS = 3;

export type MeterKind = "electricity" | "water";

export type FeeMethod = "fixed" | "per_person" | "per_quantity" | "metered";

export interface Tier {
  /** Ngưỡng trên của bậc (centi đơn vị, cộng dồn); null = không giới hạn. */
  upToCenti: number | null;
  unitPrice: Dong;
}

export interface FeeRule {
  id: string;
  /** Khóa nhóm các phiên bản của cùng một khoản phí, ví dụ "electricity", "internet". */
  key: string;
  name: string;
  method: FeeMethod;
  /** Đơn giá: theo kỳ (fixed), theo người/kỳ, theo đơn vị số lượng/kỳ, hoặc theo 1 đơn vị đo. */
  unitPrice: Dong;
  /** Chỉ dùng cho metered; nếu có thì thay cho unitPrice. */
  tiers?: Tier[] | null;
  meterKind?: MeterKind | null;
  /** Đơn vị hiển thị, ví dụ "kWh", "m³", "xe". */
  unitLabel?: string | null;
  /** Chia theo ngày khi ở không trọn kỳ. Bỏ qua với metered. */
  prorate: boolean;
  effectiveFrom: IsoDate;
  effectiveTo: IsoDate | null;
}

export interface RentVersion {
  effectiveFrom: IsoDate;
  amount: Dong;
}

export interface LeaseInput {
  id: string;
  start: IsoDate;
  /** Ngày ở cuối cùng (đã chuyển đi) hoặc null nếu đang ở. */
  end: IsoDate | null;
  occupants: number;
  rents: RentVersion[];
  /** Số lượng theo khóa phí, ví dụ { parking: 2 }. */
  quantities: Record<string, number>;
}

export interface MeterInput {
  id: string;
  kind: MeterKind;
  name: string;
}

export interface ReadingInput {
  meterId: string;
  date: IsoDate;
  valueCenti: number;
}

export interface BillingInput {
  period: DateRange;
  lease: LeaseInput;
  feeRules: FeeRule[];
  meters: MeterInput[];
  readings: ReadingInput[];
  /** Làm tròn tổng tới bội số này (1 = không làm tròn). */
  roundTotalTo: number;
}

export type LineKind = "rent" | "fee" | "rounding";

export interface InvoiceLineDraft {
  kind: LineKind;
  key: string;
  description: string;
  quantityCenti: number | null;
  unitPrice: Dong | null;
  amount: Dong;
  meta?: Record<string, unknown>;
}

export interface BillingIssue {
  code:
    | "missing_reading_start"
    | "missing_reading_end"
    | "reading_decreased"
    | "no_rent"
    | "invalid_input";
  message: string;
  meterId?: string;
}

export interface BillingResult {
  /** null nếu hợp đồng không có ngày nào trong kỳ. */
  segment: DateRange | null;
  lines: InvoiceLineDraft[];
  subtotal: Dong;
  total: Dong;
  /** Lỗi chặn chốt hóa đơn. */
  errors: BillingIssue[];
}

function fmt(d: IsoDate): string {
  return `${d.slice(8, 10)}/${d.slice(5, 7)}`;
}

function prorated(amount: Dong, days: number, periodDays: number): Dong {
  return days === periodDays ? amount : divRound(amount * days, periodDays);
}

/** Chia `range` thành các đoạn con theo phiên bản có hiệu lực (effectiveFrom tăng dần). */
function splitByVersions<T extends { effectiveFrom: IsoDate }>(
  range: DateRange,
  versions: T[],
  endOf: (v: T, next: T | undefined) => IsoDate | null,
): Array<{ range: DateRange; version: T }> {
  const sorted = [...versions].sort((a, b) => (a.effectiveFrom < b.effectiveFrom ? -1 : 1));
  const out: Array<{ range: DateRange; version: T }> = [];
  sorted.forEach((v, i) => {
    const vEnd = endOf(v, sorted[i + 1]);
    const r = intersect(range, { start: v.effectiveFrom, end: vEnd });
    if (r) out.push({ range: r, version: v });
  });
  return out;
}

function findReading(
  readings: ReadingInput[],
  meterId: string,
  boundaryBefore: IsoDate,
  boundaryAfter: IsoDate,
  prefer: "earlier" | "later",
): ReadingInput | null {
  const lo = toDayNumber(boundaryBefore);
  const hi = toDayNumber(boundaryAfter);
  let best: ReadingInput | null = null;
  let bestDist = Infinity;
  for (const r of readings) {
    if (r.meterId !== meterId) continue;
    const d = toDayNumber(r.date);
    const dist = d < lo ? lo - d : d > hi ? d - hi : 0;
    if (dist > READING_WINDOW_DAYS) continue;
    const better =
      dist < bestDist ||
      (dist === bestDist && best !== null && (prefer === "later" ? r.date > best.date : r.date < best.date));
    if (better) {
      best = r;
      bestDist = dist;
    }
  }
  return best;
}

function meteredAmount(consumptionCenti: number, rule: FeeRule): Dong {
  if (!rule.tiers || rule.tiers.length === 0) {
    return divRound(consumptionCenti * rule.unitPrice, 100);
  }
  let remaining = consumptionCenti;
  let floor = 0;
  let total = 0;
  for (const t of rule.tiers) {
    if (remaining <= 0) break;
    const cap = t.upToCenti === null ? remaining : Math.max(0, t.upToCenti - floor);
    const qty = Math.min(remaining, cap);
    total += divRound(qty * t.unitPrice, 100);
    remaining -= qty;
    if (t.upToCenti !== null) floor = t.upToCenti;
  }
  // Bậc cuối không có upTo null: phần vượt tính theo giá bậc cuối.
  const last = rule.tiers[rule.tiers.length - 1];
  if (remaining > 0 && last) total += divRound(remaining * last.unitPrice, 100);
  return total;
}

function validate(input: BillingInput): BillingIssue[] {
  const issues: BillingIssue[] = [];
  const bad = (message: string) => issues.push({ code: "invalid_input", message });
  if (input.period.start > input.period.end) bad("Kỳ có ngày bắt đầu sau ngày kết thúc");
  if (input.lease.end !== null && input.lease.end < input.lease.start) bad("Ngày chuyển đi trước ngày vào ở");
  if (!Number.isInteger(input.lease.occupants) || input.lease.occupants < 0) bad("Số người ở không hợp lệ");
  for (const r of input.lease.rents) assertDong(r.amount, "tiền phòng");
  for (const f of input.feeRules) {
    assertDong(f.unitPrice, `đơn giá ${f.name}`);
    if (f.method === "metered" && !f.meterKind) bad(`Khoản ${f.name} tính theo chỉ số nhưng chưa chọn loại đồng hồ`);
  }
  for (const q of Object.values(input.lease.quantities)) {
    if (!Number.isInteger(q) || q < 0) bad("Số lượng dịch vụ không hợp lệ");
  }
  return issues;
}

export function computeInvoice(input: BillingInput): BillingResult {
  const errors = validate(input);
  const empty = (segment: DateRange | null): BillingResult => ({ segment, lines: [], subtotal: 0, total: 0, errors });
  if (errors.length) return empty(null);

  const { period, lease } = input;
  const segment = intersect(period, { start: lease.start, end: lease.end });
  if (!segment) return empty(null);

  const periodDays = daysInclusive(period.start, period.end);
  const lines: InvoiceLineDraft[] = [];

  // Tiền phòng theo các phiên bản giá.
  const rentParts = splitByVersions(segment, lease.rents, (_v, next) =>
    next ? addDays(next.effectiveFrom, -1) : null,
  );
  if (rentParts.length === 0) {
    errors.push({ code: "no_rent", message: "Hợp đồng chưa có giá thuê áp dụng cho kỳ này" });
  }
  for (const { range, version } of rentParts) {
    const days = daysInclusive(range.start, range.end);
    const full = days === periodDays;
    lines.push({
      kind: "rent",
      key: "rent",
      description: full
        ? "Tiền phòng"
        : `Tiền phòng ${fmt(range.start)}–${fmt(range.end)} (${days}/${periodDays} ngày)`,
      quantityCenti: null,
      unitPrice: version.amount,
      amount: prorated(version.amount, days, periodDays),
      meta: { from: range.start, to: range.end, days, periodDays },
    });
  }

  // Các khoản phí, nhóm theo khóa.
  const byKey = new Map<string, FeeRule[]>();
  for (const r of input.feeRules) byKey.set(r.key, [...(byKey.get(r.key) ?? []), r]);

  for (const [key, versions] of byKey) {
    const first = versions[0]!;
    if (first.method === "metered") {
      const rule = versions.find(
        (v) => v.effectiveFrom <= segment.end && (v.effectiveTo === null || v.effectiveTo >= segment.end),
      );
      if (!rule) continue;
      const meters = input.meters.filter((m) => m.kind === rule.meterKind);
      for (const m of meters) {
        const startR = findReading(input.readings, m.id, addDays(segment.start, -1), segment.start, "later");
        const endR = findReading(input.readings, m.id, segment.end, addDays(segment.end, 1), "earlier");
        if (!startR) {
          errors.push({
            code: "missing_reading_start",
            meterId: m.id,
            message: `Thiếu chỉ số ${m.name} đầu kỳ (quanh ngày ${fmt(segment.start)})`,
          });
          continue;
        }
        if (!endR) {
          errors.push({
            code: "missing_reading_end",
            meterId: m.id,
            message: `Thiếu chỉ số ${m.name} cuối kỳ (quanh ngày ${fmt(segment.end)})`,
          });
          continue;
        }
        const consumption = endR.valueCenti - startR.valueCenti;
        if (consumption < 0) {
          errors.push({
            code: "reading_decreased",
            meterId: m.id,
            message: `Chỉ số ${m.name} giảm (${startR.valueCenti / 100} → ${endR.valueCenti / 100}). Kiểm tra lại hoặc ghi nhận thay đồng hồ.`,
          });
          continue;
        }
        const unit = rule.unitLabel ?? "";
        lines.push({
          kind: "fee",
          key,
          description: `${rule.name}: ${startR.valueCenti / 100} → ${endR.valueCenti / 100} = ${consumption / 100} ${unit}`.trim(),
          quantityCenti: consumption,
          unitPrice: rule.tiers && rule.tiers.length ? null : rule.unitPrice,
          amount: meteredAmount(consumption, rule),
          meta: {
            meterId: m.id,
            startReading: startR,
            endReading: endR,
            tiers: rule.tiers ?? null,
            feeRuleId: rule.id,
          },
        });
      }
      continue;
    }

    const parts = splitByVersions(segment, versions, (v) => v.effectiveTo);
    for (const { range, version } of parts) {
      const days = daysInclusive(range.start, range.end);
      let multiplier: number;
      if (version.method === "per_person") multiplier = lease.occupants;
      else if (version.method === "per_quantity") multiplier = lease.quantities[key] ?? 0;
      else multiplier = 1;
      if (multiplier === 0) continue;

      const perPeriod = version.unitPrice * multiplier;
      const amount = version.prorate ? prorated(perPeriod, days, periodDays) : perPeriod;
      const partial = version.prorate && days !== periodDays;
      const qtyText =
        version.method === "fixed" ? "" : ` × ${multiplier} ${version.unitLabel ?? (version.method === "per_person" ? "người" : "")}`.trimEnd();
      lines.push({
        kind: "fee",
        key,
        description: `${version.name}${qtyText}${partial ? ` (${days}/${periodDays} ngày)` : ""}`,
        quantityCenti: multiplier * 100,
        unitPrice: version.unitPrice,
        amount,
        meta: { feeRuleId: version.id, from: range.start, to: range.end, days, periodDays },
      });
    }
  }

  const subtotal = lines.reduce((s, l) => s + l.amount, 0);
  const total = roundTo(subtotal, input.roundTotalTo);
  if (total !== subtotal) {
    lines.push({
      kind: "rounding",
      key: "rounding",
      description: `Làm tròn tới ${input.roundTotalTo.toLocaleString("vi-VN")}đ`,
      quantityCenti: null,
      unitPrice: null,
      amount: total - subtotal,
    });
  }
  return { segment, lines, subtotal, total, errors };
}
