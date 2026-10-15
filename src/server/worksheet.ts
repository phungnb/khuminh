// Màn "Tính tiền" của một kỳ: mỗi hợp đồng có ngày ở trong kỳ là một dòng, kèm chỉ số đầu/cuối và hóa đơn.
// Chỉ đọc để hiển thị. Hóa đơn vẫn do generateDrafts lập; lỗi thiếu chỉ số thật sự do billing báo.

import { and, asc, eq, gte, inArray, isNull, lte, ne, sql } from "drizzle-orm";
import { withOrg } from "@/db/client";
import * as s from "@/db/schema";
import { READING_WINDOW_DAYS } from "@/domain/billing";
import { addDays, maxDate, minDate, toDayNumber, type IsoDate } from "@/domain/dates";
import { paymentState, type PaymentState } from "@/domain/payments";
import type { Actor } from "./audit";
import { assertPropertyAccess } from "./setup";
import { today } from "./queries";

export interface WorksheetMeter {
  meterId: string;
  name: string;
  kind: "electricity" | "water";
  /** Chỉ số dùng làm đầu đoạn (quanh ngày bắt đầu ở trong kỳ). */
  start: { date: IsoDate; value: number } | null;
  /** Chỉ số cuối đoạn (quanh ngày cuối ở trong kỳ). */
  end: { date: IsoDate; value: number } | null;
}

export type RowStatus = "missing_reading" | "ready" | "draft" | PaymentState;

export interface WorksheetRow {
  leaseId: string;
  unitCode: string;
  tenantName: string;
  /** Đoạn ngày ở trong kỳ. */
  segStart: IsoDate;
  segEnd: IsoDate;
  meters: WorksheetMeter[];
  invoice: { id: string; status: "draft" | "issued"; total: number; paid: number; state: PaymentState } | null;
  status: RowStatus;
}

/**
 * Chọn chỉ số gần mốc [lo, hi] nhất, cách tối đa READING_WINDOW_DAYS ngày, giống findReading trong
 * domain/billing. Chỉ để hiển thị trạng thái; số tiền vẫn do billing tính và báo lỗi.
 */
function pick(readings: Array<{ date: IsoDate; value: number }>, lo: IsoDate, hi: IsoDate, prefer: "earlier" | "later") {
  const dist = (d: IsoDate) => (d < lo ? toDayNumber(lo) - toDayNumber(d) : d > hi ? toDayNumber(d) - toDayNumber(hi) : 0);
  let best: { date: IsoDate; value: number } | null = null;
  for (const r of readings) {
    const d = dist(r.date);
    if (d > READING_WINDOW_DAYS) continue;
    if (!best || d < dist(best.date) || (d === dist(best.date) && (prefer === "later" ? r.date > best.date : r.date < best.date))) best = r;
  }
  return best;
}

export async function periodWorksheet(actor: Actor, periodId: string): Promise<{ period: typeof s.billingPeriods.$inferSelect; rows: WorksheetRow[] } | null> {
  return withOrg(actor, async (tx) => {
    const [period] = await tx.select().from(s.billingPeriods).where(eq(s.billingPeriods.id, periodId));
    if (!period) return null;
    await assertPropertyAccess(tx, actor, period.propertyId);
    const leaseRows = await tx
      .select({ lease: s.leases, unitCode: s.units.code, block: s.units.block, tenantName: s.tenants.fullName })
      .from(s.leases)
      .innerJoin(s.units, eq(s.units.id, s.leases.unitId))
      .innerJoin(s.tenants, eq(s.tenants.id, s.leases.tenantId))
      .where(
        and(
          eq(s.units.propertyId, period.propertyId),
          ne(s.leases.status, "draft"),
          lte(s.leases.startDate, period.periodEnd),
          sql`(${s.leases.movedOutOn} is null or ${s.leases.movedOutOn} >= ${period.periodStart})`,
        ),
      )
      .orderBy(asc(s.units.block), asc(s.units.code));
    if (leaseRows.length === 0) return { period, rows: [] };

    const unitIds = leaseRows.map((l) => l.lease.unitId);
    const meters = await tx
      .select()
      .from(s.meters)
      .where(and(inArray(s.meters.unitId, unitIds), isNull(s.meters.archivedAt)))
      .orderBy(asc(s.meters.kind));
    const meterIds = meters.map((m) => m.id);
    const W = READING_WINDOW_DAYS;
    const readings = meterIds.length
      ? await tx
          .select()
          .from(s.meterReadings)
          .where(
            and(
              inArray(s.meterReadings.meterId, meterIds),
              gte(s.meterReadings.readingDate, addDays(period.periodStart, -W - 1)),
              lte(s.meterReadings.readingDate, addDays(period.periodEnd, W + 1)),
            ),
          )
          .orderBy(asc(s.meterReadings.readingDate))
      : [];
    const invoices = await tx
      .select({
        id: s.invoices.id,
        leaseId: s.invoices.leaseId,
        status: s.invoices.status,
        total: s.invoices.total,
        dueDate: s.invoices.dueDate,
        // Ghi rõ "invoices"."id": truy vấn một bảng thì drizzle bỏ tên bảng, cột "id" sẽ bị hiểu là a.id.
        paid: sql<string>`coalesce((select sum(a.amount) from payment_allocations a where a.invoice_id = "invoices"."id"), 0)`,
      })
      .from(s.invoices)
      .where(and(eq(s.invoices.billingPeriodId, period.id), ne(s.invoices.status, "void")));

    const t = today();
    const rows = leaseRows.map((l): WorksheetRow => {
      const segStart = maxDate(period.periodStart, l.lease.startDate);
      const segEnd = l.lease.movedOutOn ? minDate(period.periodEnd, l.lease.movedOutOn) : period.periodEnd;
      const ms = meters
        .filter((m) => m.unitId === l.lease.unitId)
        .map((m) => {
          const mine = readings.filter((r) => r.meterId === m.id).map((r) => ({ date: r.readingDate, value: r.valueCenti / 100 }));
          return {
            meterId: m.id,
            name: m.name,
            kind: m.kind,
            start: pick(mine, addDays(segStart, -1), segStart, "later"),
            end: pick(mine, segEnd, addDays(segEnd, 1), "earlier"),
          };
        });
      const inv = invoices.find((i) => i.leaseId === l.lease.id);
      const invoice = inv
        ? {
            id: inv.id,
            status: inv.status as "draft" | "issued",
            total: inv.total,
            paid: Number(inv.paid),
            state: paymentState(inv.status, inv.total, Number(inv.paid), inv.dueDate, t),
          }
        : null;
      const complete = ms.every((m) => m.start && m.end);
      const status: RowStatus = invoice ? (invoice.status === "draft" ? "draft" : invoice.state) : complete ? "ready" : "missing_reading";
      return {
        leaseId: l.lease.id,
        unitCode: l.block ? `${l.block}-${l.unitCode}` : l.unitCode,
        tenantName: l.tenantName,
        segStart,
        segEnd,
        meters: ms,
        invoice,
        status,
      };
    });
    return { period, rows };
  });
}
