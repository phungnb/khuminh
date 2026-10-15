// Nghiệp vụ hóa đơn trên DB: lập nháp, phát hành, điều chỉnh, hủy.
// Tính toán nằm ở src/domain/billing.ts; file này chỉ đọc/ghi và kiểm tra quyền.

import { and, eq, gte, inArray, lte, ne, sql } from "drizzle-orm";
import { withOrg, type Tx } from "@/db/client";
import {
  billingPeriods,
  feeRules,
  invoiceAdjustments,
  invoiceLines,
  invoices,
  leaseQuantities,
  leaseRents,
  leases,
  meterReadings,
  meters,
  paymentAllocations,
  properties,
  units,
} from "@/db/schema";
import { addDays, type IsoDate } from "@/domain/dates";
import { computeInvoice, type BillingIssue, type FeeRule, READING_WINDOW_DAYS } from "@/domain/billing";
import { assertDong } from "@/domain/money";
import { audit, requireOwner, UserError, type Actor } from "./audit";
import { applyLeaseCredit } from "./payments";

export interface DraftResult {
  leaseId: string;
  unitCode: string;
  invoiceId: string | null;
  total: number | null;
  errors: BillingIssue[];
  skipped?: "already_issued";
}

/** Hạn trả theo ngày thu thỏa thuận của hợp đồng: ngày `day` (1–28) của tháng ngay sau tháng cuối kỳ. */
export function dueDateForDay(periodEnd: IsoDate, day: number): IsoDate {
  const y = Number(periodEnd.slice(0, 4));
  const m = Number(periodEnd.slice(5, 7));
  const ny = m === 12 ? y + 1 : y;
  const nm = m === 12 ? 1 : m + 1;
  return `${ny}-${String(nm).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

function invoiceCode(periodStart: IsoDate, unitCode: string, leaseId: string): string {
  const yymm = periodStart.slice(2, 4) + periodStart.slice(5, 7);
  return `${yymm}-${unitCode}-${leaseId.slice(0, 4)}`.toUpperCase();
}

/**
 * Lập (hoặc lập lại) hóa đơn nháp cho mọi hợp đồng có ngày ở trong kỳ.
 * Hóa đơn đã phát hành không bị đụng tới. Hợp đồng còn lỗi (thiếu chỉ số...) không tạo nháp.
 */
export async function generateDrafts(actor: Actor, periodId: string): Promise<DraftResult[]> {
  return withOrg(actor, async (tx) => {
    const [period] = await tx.select().from(billingPeriods).where(eq(billingPeriods.id, periodId));
    if (!period) throw new UserError("Không tìm thấy kỳ");
    if (period.status === "closed") throw new UserError("Kỳ đã khóa");
    const [property] = await tx.select().from(properties).where(eq(properties.id, period.propertyId));
    if (!property) throw new UserError("Không tìm thấy cơ sở");

    const unitRows = await tx.select().from(units).where(eq(units.propertyId, property.id));
    const unitIds = unitRows.map((u) => u.id);
    if (unitIds.length === 0) return [];

    const leaseRows = await tx
      .select()
      .from(leases)
      .where(
        and(
          inArray(leases.unitId, unitIds),
          ne(leases.status, "draft"),
          lte(leases.startDate, period.periodEnd),
          sql`(${leases.movedOutOn} is null or ${leases.movedOutOn} >= ${period.periodStart})`,
        ),
      );
    const leaseIds = leaseRows.map((l) => l.id);
    if (leaseIds.length === 0) return [];

    const [rents, quantities, rules, meterRows, existing] = await Promise.all([
      tx.select().from(leaseRents).where(inArray(leaseRents.leaseId, leaseIds)),
      tx.select().from(leaseQuantities).where(inArray(leaseQuantities.leaseId, leaseIds)),
      tx
        .select()
        .from(feeRules)
        .where(
          and(
            eq(feeRules.propertyId, property.id),
            lte(feeRules.effectiveFrom, period.periodEnd),
            sql`(${feeRules.effectiveTo} is null or ${feeRules.effectiveTo} >= ${period.periodStart})`,
          ),
        ),
      tx.select().from(meters).where(and(inArray(meters.unitId, unitIds), sql`${meters.archivedAt} is null`)),
      tx
        .select({ id: invoices.id, leaseId: invoices.leaseId, status: invoices.status })
        .from(invoices)
        .where(and(eq(invoices.billingPeriodId, period.id), ne(invoices.status, "void"))),
    ]);
    const meterIds = meterRows.map((m) => m.id);
    const readings = meterIds.length
      ? await tx
          .select()
          .from(meterReadings)
          .where(
            and(
              inArray(meterReadings.meterId, meterIds),
              gte(meterReadings.readingDate, addDays(period.periodStart, -READING_WINDOW_DAYS - 1)),
              lte(meterReadings.readingDate, addDays(period.periodEnd, READING_WINDOW_DAYS + 1)),
            ),
          )
      : [];

    const domainRules: FeeRule[] = rules.map((r) => ({
      id: r.id,
      key: r.key,
      name: r.name,
      method: r.method,
      unitPrice: r.unitPrice,
      tiers: r.tiers,
      meterKind: r.meterKind,
      unitLabel: r.unitLabel,
      prorate: r.prorate,
      effectiveFrom: r.effectiveFrom,
      effectiveTo: r.effectiveTo,
    }));

    const results: DraftResult[] = [];
    for (const lease of leaseRows) {
      const unit = unitRows.find((u) => u.id === lease.unitId)!;
      const prior = existing.find((e) => e.leaseId === lease.id);
      if (prior?.status === "issued") {
        results.push({ leaseId: lease.id, unitCode: unit.code, invoiceId: prior.id, total: null, errors: [], skipped: "already_issued" });
        continue;
      }
      const unitMeters = meterRows.filter((m) => m.unitId === unit.id);
      const result = computeInvoice({
        period: { start: period.periodStart, end: period.periodEnd },
        lease: {
          id: lease.id,
          start: lease.startDate,
          end: lease.movedOutOn,
          occupants: lease.occupants,
          rents: rents.filter((r) => r.leaseId === lease.id).map((r) => ({ effectiveFrom: r.effectiveFrom, amount: r.amount })),
          quantities: Object.fromEntries(
            quantities.filter((q) => q.leaseId === lease.id).map((q) => [q.feeKey, q.quantity]),
          ),
        },
        feeRules: domainRules,
        meters: unitMeters.map((m) => ({ id: m.id, kind: m.kind, name: m.name })),
        readings: readings
          .filter((r) => unitMeters.some((m) => m.id === r.meterId))
          .map((r) => ({ meterId: r.meterId, date: r.readingDate, valueCenti: r.valueCenti })),
        roundTotalTo: property.roundTotalTo,
      });

      if (prior) await tx.delete(invoices).where(eq(invoices.id, prior.id));
      if (result.errors.length || !result.segment) {
        results.push({ leaseId: lease.id, unitCode: unit.code, invoiceId: null, total: null, errors: result.errors });
        continue;
      }

      const [inv] = await tx
        .insert(invoices)
        .values({
          orgId: actor.orgId,
          propertyId: property.id,
          unitId: unit.id,
          leaseId: lease.id,
          billingPeriodId: period.id,
          code: invoiceCode(period.periodStart, unit.code, lease.id),
          status: "draft",
          subtotal: result.total,
          total: result.total,
          dueDate: lease.dueDay ? dueDateForDay(period.periodEnd, lease.dueDay) : period.dueDate,
        })
        .returning({ id: invoices.id });
      await tx.insert(invoiceLines).values(
        result.lines.map((l, i) => ({
          orgId: actor.orgId,
          invoiceId: inv!.id,
          position: i,
          kind: l.kind,
          key: l.key,
          description: l.description,
          quantityCenti: l.quantityCenti,
          unitPrice: l.unitPrice,
          amount: l.amount,
          meta: l.meta ?? null,
        })),
      );
      results.push({ leaseId: lease.id, unitCode: unit.code, invoiceId: inv!.id, total: result.total, errors: [] });
    }
    await audit(tx, actor, "invoice.generate_drafts", "billing_period", period.id, null, {
      created: results.filter((r) => r.invoiceId && !r.skipped).length,
      failed: results.filter((r) => r.errors.length).length,
    });
    return results;
  });
}

/** Chốt và phát hành hóa đơn nháp. Sau khi phát hành không sửa dòng được, chỉ điều chỉnh. */
export async function issueInvoices(actor: Actor, invoiceIds: string[]): Promise<number> {
  requireOwner(actor);
  if (invoiceIds.length === 0) return 0;
  return withOrg(actor, async (tx) => {
    const rows = await tx
      .update(invoices)
      .set({ status: "issued", issuedAt: new Date() })
      .where(and(inArray(invoices.id, invoiceIds), eq(invoices.status, "draft")))
      .returning({ id: invoices.id, leaseId: invoices.leaseId, code: invoices.code, total: invoices.total });
    for (const r of rows) {
      await audit(tx, actor, "invoice.issue", "invoice", r.id, null, { code: r.code, total: r.total });
    }
    for (const leaseId of new Set(rows.map((r) => r.leaseId))) {
      await applyLeaseCredit(tx, actor, leaseId);
    }
    return rows.length;
  });
}

async function lockInvoice(tx: Tx, invoiceId: string) {
  const [inv] = await tx.select().from(invoices).where(eq(invoices.id, invoiceId)).for("update");
  if (!inv) throw new UserError("Không tìm thấy hóa đơn");
  return inv;
}

/** Điều chỉnh hóa đơn đã phát hành, ví dụ trừ tiền cọc khi chuyển đi. Bắt buộc có lý do. */
export async function adjustInvoice(actor: Actor, invoiceId: string, amount: number, reason: string): Promise<void> {
  requireOwner(actor);
  await withOrg(actor, (tx) => adjustInvoiceTx(tx, actor, invoiceId, amount, reason));
}

/** Như adjustInvoice nhưng chạy trong giao dịch có sẵn (quyết toán cọc ghi nhiều bước trong một giao dịch). */
export async function adjustInvoiceTx(tx: Tx, actor: Actor, invoiceId: string, amount: number, reason: string): Promise<void> {
  requireOwner(actor);
  assertDong(amount, "số tiền điều chỉnh");
  if (amount === 0) throw new UserError("Số tiền điều chỉnh phải khác 0");
  if (!reason.trim()) throw new UserError("Cần ghi lý do điều chỉnh");
  const inv = await lockInvoice(tx, invoiceId);
  if (inv.status !== "issued") throw new UserError("Chỉ điều chỉnh hóa đơn đã phát hành");
  const [{ paid }] = (await tx
    .select({ paid: sql<number>`coalesce(sum(${paymentAllocations.amount}), 0)::bigint` })
    .from(paymentAllocations)
    .where(eq(paymentAllocations.invoiceId, invoiceId))) as [{ paid: number }];
  const newTotal = inv.total + amount;
  if (newTotal < Number(paid)) {
    throw new UserError("Tổng sau điều chỉnh nhỏ hơn số đã thu; hãy hủy bớt thanh toán trước");
  }
  await tx.insert(invoiceAdjustments).values({
    orgId: actor.orgId,
    invoiceId,
    amount,
    reason: reason.trim(),
    createdBy: actor.userId,
  });
  await tx.update(invoices).set({ total: newTotal }).where(eq(invoices.id, invoiceId));
  await audit(tx, actor, "invoice.adjust", "invoice", invoiceId, { total: inv.total }, { total: newTotal, amount, reason });
}

/** Hủy hóa đơn. Hóa đơn đã có thanh toán phân bổ thì phải hủy thanh toán trước. */
export async function voidInvoice(actor: Actor, invoiceId: string, reason: string): Promise<void> {
  requireOwner(actor);
  if (!reason.trim()) throw new UserError("Cần ghi lý do hủy");
  await withOrg(actor, async (tx) => {
    const inv = await lockInvoice(tx, invoiceId);
    if (inv.status === "void") return;
    const alloc = await tx.select({ id: paymentAllocations.id }).from(paymentAllocations).where(eq(paymentAllocations.invoiceId, invoiceId)).limit(1);
    if (alloc.length) throw new UserError("Hóa đơn đã có thanh toán; hủy thanh toán trước");
    await tx.update(invoices).set({ status: "void", voidReason: reason.trim() }).where(eq(invoices.id, invoiceId));
    await audit(tx, actor, "invoice.void", "invoice", invoiceId, { status: inv.status }, { status: "void", reason });
  });
}
