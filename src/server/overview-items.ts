// Tổng quan gộp nhiều cơ sở: cộng số và chọn các dòng "Cần xử lý".
// Hàm thuần, không tính tiền mới: chỉ cộng các số đã đọc từ DB (tổng − đã trả của hóa đơn đã phát hành).

import { addDays, type IsoDate } from "@/domain/dates";

/** Hợp đồng hết hạn trong số ngày này thì nhắc "sắp hết hạn". */
export const EXPIRING_WITHIN_DAYS = 30;

export interface MoneySummary {
  /** Tổng hóa đơn đã phát hành. */
  receivable: number;
  collected: number;
  /** Phần còn nợ của hóa đơn đã quá hạn. */
  overdue: number;
  /** Số hóa đơn đã phát hành chưa thu đủ. */
  unpaidCount: number;
  overdueCount: number;
}

export interface UnitCounts {
  total: number;
  occupied: number;
  vacant: number;
  maintenance: number;
}

export interface PeriodGap {
  periodId: string;
  periodStart: IsoDate;
  periodEnd: IsoDate;
  /** Mã phòng có hợp đồng ở trong kỳ nhưng chưa có hóa đơn (nháp hoặc đã phát hành). */
  missingUnits: string[];
  /** Số hóa đơn nháp chưa phát hành. */
  drafts: number;
}

export interface LeaseDue {
  unitId: string;
  unitCode: string;
  tenantName: string;
  expiresOn: IsoDate;
}

export interface PropertySummary {
  id: string;
  name: string;
  money: MoneySummary;
  units: UnitCounts;
  /** Kỳ đang mở đã bắt đầu, còn phòng chưa có hóa đơn hoặc còn nháp. */
  periodGaps: PeriodGap[];
  /** Tháng trước có người ở nhưng chưa có kỳ nào phủ ngày cuối tháng. */
  missingPeriodFor: { start: IsoDate; end: IsoDate } | null;
  leasesDue: LeaseDue[];
  openIssues: number;
}

export interface Totals {
  money: MoneySummary & { outstanding: number };
  units: UnitCounts;
  occupancy: number | null;
}

export function emptyMoney(): MoneySummary {
  return { receivable: 0, collected: 0, overdue: 0, unpaidCount: 0, overdueCount: 0 };
}

export function sumTotals(props: PropertySummary[]): Totals {
  const money = emptyMoney();
  const units: UnitCounts = { total: 0, occupied: 0, vacant: 0, maintenance: 0 };
  for (const p of props) {
    money.receivable += p.money.receivable;
    money.collected += p.money.collected;
    money.overdue += p.money.overdue;
    money.unpaidCount += p.money.unpaidCount;
    money.overdueCount += p.money.overdueCount;
    units.total += p.units.total;
    units.occupied += p.units.occupied;
    units.vacant += p.units.vacant;
    units.maintenance += p.units.maintenance;
  }
  // Lấp đầy tính trên phòng có thể cho thuê (bỏ phòng bảo trì).
  const rentable = units.occupied + units.vacant;
  return {
    money: { ...money, outstanding: money.receivable - money.collected },
    units,
    occupancy: rentable > 0 ? Math.round((units.occupied / rentable) * 100) : null,
  };
}

/** Tháng trước của `t` (ngày đầu, ngày cuối). */
export function previousMonth(t: IsoDate): { start: IsoDate; end: IsoDate } {
  const firstOfThis = `${t.slice(0, 8)}01` as IsoDate;
  const end = addDays(firstOfThis, -1);
  return { start: `${end.slice(0, 8)}01` as IsoDate, end };
}

export type ActionKind = "missing_period" | "period_gap" | "unpaid" | "lease_expired" | "lease_expiring" | "issues";

export interface ActionItem {
  kind: ActionKind;
  propertyId: string;
  propertyName: string;
  title: string;
  detail: string;
  href: string;
  tone: "danger" | "warning" | "info";
}

const MAX_CODES = 8;

function codes(list: string[]): string {
  return list.length > MAX_CODES ? `${list.slice(0, MAX_CODES).join(", ")} và ${list.length - MAX_CODES} phòng khác` : list.join(", ");
}

function monthLabel(d: IsoDate): string {
  return `${d.slice(5, 7)}/${d.slice(0, 4)}`;
}

function dm(d: IsoDate): string {
  return `${d.slice(8, 10)}/${d.slice(5, 7)}/${d.slice(0, 4)}`;
}

const ORDER: Record<ActionKind, number> = {
  unpaid: 0,
  missing_period: 1,
  period_gap: 2,
  lease_expired: 3,
  issues: 4,
  lease_expiring: 5,
};

/** Các việc chủ trọ cần làm, việc dính tiền lên trước. `vnd` truyền vào để giữ hàm thuần. */
export function actionItems(props: PropertySummary[], t: IsoDate, vnd: (n: number) => string): ActionItem[] {
  const out: ActionItem[] = [];
  for (const p of props) {
    const base = { propertyId: p.id, propertyName: p.name };
    if (p.money.unpaidCount > 0) {
      const owed = p.money.receivable - p.money.collected;
      out.push({
        ...base,
        kind: "unpaid",
        title: `${p.money.unpaidCount} hóa đơn chưa thu đủ · ${vnd(owed)}`,
        detail: p.money.overdueCount > 0 ? `${p.money.overdueCount} hóa đơn quá hạn · ${vnd(p.money.overdue)}` : "Chưa có hóa đơn quá hạn",
        href: `/co-so/${p.id}/ky`,
        tone: p.money.overdueCount > 0 ? "danger" : "warning",
      });
    }
    if (p.missingPeriodFor) {
      out.push({
        ...base,
        kind: "missing_period",
        title: `Chưa mở kỳ tháng ${monthLabel(p.missingPeriodFor.start)}`,
        detail: "Mở kỳ để ghi chỉ số và lập hóa đơn",
        href: `/co-so/${p.id}/ky`,
        tone: "warning",
      });
    }
    for (const g of p.periodGaps) {
      const parts: string[] = [];
      if (g.missingUnits.length) parts.push(`${g.missingUnits.length} phòng chưa lập hóa đơn`);
      if (g.drafts) parts.push(`${g.drafts} hóa đơn nháp chưa phát hành`);
      out.push({
        ...base,
        kind: "period_gap",
        title: `Kỳ ${dm(g.periodStart)} – ${dm(g.periodEnd)}: ${parts.join(", ")}`,
        detail: g.missingUnits.length ? codes(g.missingUnits) : "Kiểm tra rồi phát hành",
        href: `/co-so/${p.id}/ky/${g.periodId}`,
        tone: "warning",
      });
    }
    const expired = p.leasesDue.filter((l) => l.expiresOn < t);
    const soon = p.leasesDue.filter((l) => l.expiresOn >= t && l.expiresOn <= addDays(t, EXPIRING_WITHIN_DAYS));
    for (const l of expired) {
      out.push({
        ...base,
        kind: "lease_expired",
        title: `Hợp đồng phòng ${l.unitCode} đã hết hạn`,
        detail: `${l.tenantName} · hết hạn ${dm(l.expiresOn)}`,
        href: `/co-so/${p.id}/phong/${l.unitId}`,
        tone: "danger",
      });
    }
    for (const l of soon) {
      out.push({
        ...base,
        kind: "lease_expiring",
        title: `Hợp đồng phòng ${l.unitCode} sắp hết hạn`,
        detail: `${l.tenantName} · hết hạn ${dm(l.expiresOn)}`,
        href: `/co-so/${p.id}/phong/${l.unitId}`,
        tone: "info",
      });
    }
    if (p.openIssues > 0) {
      out.push({
        ...base,
        kind: "issues",
        title: `${p.openIssues} sự cố đang chờ xử lý`,
        detail: "Người thuê đã báo",
        href: `/co-so/${p.id}/su-co`,
        tone: "warning",
      });
    }
  }
  return out.sort((a, b) => ORDER[a.kind] - ORDER[b.kind]);
}
