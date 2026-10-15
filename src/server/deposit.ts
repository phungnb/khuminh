// Trả phòng và quyết toán cọc (KM-COC đặc tả v1.1). Số liệu tính ở src/domain/deposit.ts;
// file này đọc/ghi DB trong MỘT giao dịch: điều chỉnh hóa đơn cuối (bù tháng, khấu trừ), dùng tiền trả dư,
// cấn trừ cọc bằng thanh toán method=deposit, rồi lưu bản quyết toán. Chỉ chủ trọ được làm.

import { and, asc, desc, eq, isNull, lte, ne, sql } from "drizzle-orm";
import { withOrg, type Tx } from "@/db/client";
import {
  billingPeriods,
  depositSettlements,
  invoiceLines,
  invoices,
  leaseRents,
  leases,
  properties,
  tenants,
  units,
} from "@/db/schema";
import { assertIsoDate, type IsoDate } from "@/domain/dates";
import { computeSettlement, fullMonthTopUp, SettlementError, type Deduction, type LastMonthMode, type SettlementResult } from "@/domain/deposit";
import { assertDong, roundTo } from "@/domain/money";
import { audit, requireOwner, UserError, type Actor } from "./audit";
import { adjustInvoiceTx } from "./billing";
import { applyLeaseCredit, insertPaymentTx, openInvoicesForLease, paymentRemainders, voidPaymentTx } from "./payments";
import { assertPropertyAccess } from "./setup";

export type Settlement = typeof depositSettlements.$inferSelect;

export interface SettlementContext {
  leaseId: string;
  propertyId: string;
  propertyName: string;
  unitCode: string;
  tenantName: string;
  startDate: IsoDate;
  movedOutOn: IsoDate | null;
  deposit: number;
  /** Lý do chưa quyết toán được (null = sẵn sàng). */
  blocker: string | null;
  /** Kỳ chứa ngày chuyển đi (để dẫn tới màn Tính tiền). */
  finalPeriodId: string | null;
  finalInvoice: { id: string; code: string; rentOnInvoice: number } | null;
  monthlyRent: number;
  /** Tiền bù đủ tháng dở gợi ý: giá tháng − tiền phòng trên hóa đơn cuối, làm tròn theo mức của cơ sở. */
  suggestedTopUp: number;
  /** Hóa đơn đã phát hành còn nợ. */
  openInvoices: Array<{ id: string; code: string; total: number; paid: number }>;
  unallocatedCredit: number;
  settlement: Settlement | null;
}

const fmt = (d: IsoDate) => `${d.slice(8, 10)}/${d.slice(5, 7)}/${d.slice(0, 4)}`;

async function loadContext(tx: Tx, actor: Actor, leaseId: string, lock: boolean): Promise<SettlementContext | null> {
  const q = tx
    .select({ lease: leases, unitCode: units.code, block: units.block, propertyId: units.propertyId, propertyName: properties.name, roundTotalTo: properties.roundTotalTo, tenantName: tenants.fullName })
    .from(leases)
    .innerJoin(units, eq(units.id, leases.unitId))
    .innerJoin(properties, eq(properties.id, units.propertyId))
    .innerJoin(tenants, eq(tenants.id, leases.tenantId))
    .where(eq(leases.id, leaseId));
  const [row] = lock ? await q.for("update", { of: leases }) : await q;
  if (!row) return null;
  await assertPropertyAccess(tx, actor, row.propertyId);
  const lease = row.lease;

  const [settlement] = await tx
    .select()
    .from(depositSettlements)
    .where(and(eq(depositSettlements.leaseId, leaseId), isNull(depositSettlements.voidedAt)));

  const movedOutOn = lease.movedOutOn;
  let blocker: string | null = null;
  let finalPeriodId: string | null = null;
  let finalInvoice: SettlementContext["finalInvoice"] = null;
  let monthlyRent = 0;

  if (!movedOutOn) {
    blocker = "Chưa ghi nhận ngày chuyển đi";
  } else {
    const [period] = await tx
      .select({ id: billingPeriods.id })
      .from(billingPeriods)
      .where(
        and(
          eq(billingPeriods.propertyId, row.propertyId),
          lte(billingPeriods.periodStart, movedOutOn),
          sql`${billingPeriods.periodEnd} >= ${movedOutOn}`,
        ),
      );
    finalPeriodId = period?.id ?? null;
    const [inv] = period
      ? await tx
          .select({ id: invoices.id, code: invoices.code, status: invoices.status })
          .from(invoices)
          .where(and(eq(invoices.leaseId, leaseId), eq(invoices.billingPeriodId, period.id), ne(invoices.status, "void")))
      : [];
    const [draft] = await tx
      .select({ id: invoices.id })
      .from(invoices)
      .where(and(eq(invoices.leaseId, leaseId), eq(invoices.status, "draft")))
      .limit(1);
    if (!period) blocker = `Chưa mở kỳ chứa ngày chuyển đi ${fmt(movedOutOn)}`;
    else if (!inv) blocker = "Chưa lập hóa đơn cuối (chốt chỉ số ngày chuyển đi rồi lập ở màn Tính tiền)";
    else if (inv.status !== "issued" || draft) blocker = "Còn hóa đơn nháp: phát hành hoặc hủy trước khi quyết toán";
    if (inv && inv.status === "issued") {
      const [rent] = await tx
        .select({ sum: sql<string>`coalesce(sum(${invoiceLines.amount}), 0)` })
        .from(invoiceLines)
        .where(and(eq(invoiceLines.invoiceId, inv.id), eq(invoiceLines.kind, "rent")));
      finalInvoice = { id: inv.id, code: inv.code, rentOnInvoice: Number(rent?.sum ?? 0) };
    }
    const [r] = await tx
      .select({ amount: leaseRents.amount })
      .from(leaseRents)
      .where(and(eq(leaseRents.leaseId, leaseId), lte(leaseRents.effectiveFrom, movedOutOn)))
      .orderBy(desc(leaseRents.effectiveFrom))
      .limit(1);
    monthlyRent = r?.amount ?? 0;
  }
  if (settlement) blocker = "Hợp đồng đã quyết toán";

  const open = await openInvoicesForLease(tx, leaseId);
  const codes = open.length
    ? await tx.select({ id: invoices.id, code: invoices.code }).from(invoices).where(eq(invoices.leaseId, leaseId)).orderBy(asc(invoices.dueDate))
    : [];
  const credits = await paymentRemainders(tx, leaseId);

  return {
    leaseId,
    propertyId: row.propertyId,
    propertyName: row.propertyName,
    unitCode: row.block ? `${row.block}-${row.unitCode}` : row.unitCode,
    tenantName: row.tenantName,
    startDate: lease.startDate,
    movedOutOn,
    deposit: lease.deposit,
    blocker,
    finalPeriodId,
    finalInvoice,
    monthlyRent,
    suggestedTopUp: finalInvoice ? roundTo(fullMonthTopUp(monthlyRent, finalInvoice.rentOnInvoice), row.roundTotalTo) : 0,
    openInvoices: open
      .filter((o) => o.total > o.paid)
      .map((o) => ({ id: o.id, code: codes.find((c) => c.id === o.id)?.code ?? "", total: o.total, paid: o.paid })),
    unallocatedCredit: credits.reduce((s, c) => s + c.remaining, 0),
    settlement: settlement ?? null,
  };
}

/** Trạng thái quyết toán của hợp đồng (để hiện ở trang phòng). Nhân viên của cơ sở xem được. */
export async function settlementContext(actor: Actor, leaseId: string): Promise<SettlementContext | null> {
  return withOrg(actor, (tx) => loadContext(tx, actor, leaseId, false));
}

export interface SettleInput {
  leaseId: string;
  settledOn: IsoDate;
  lastMonthMode: LastMonthMode;
  /** Tiền bù đủ tháng chủ trọ sửa tay (chỉ khi full_month); bỏ trống = số gợi ý đã làm tròn. */
  topUp?: number | null;
  depositHeld: number;
  /** Bắt buộc khi cọc giữ khác số ghi trên hợp đồng. */
  depositHeldNote?: string | null;
  deductions: Deduction[];
  note?: string | null;
}

function validate(input: SettleInput, ctx: SettlementContext) {
  assertIsoDate(input.settledOn);
  assertDong(input.depositHeld, "tiền cọc");
  if (input.lastMonthMode !== "daily" && input.lastMonthMode !== "full_month") throw new UserError("Chọn cách tính tháng cuối");
  if (input.depositHeld !== ctx.deposit && !input.depositHeldNote?.trim()) {
    throw new UserError("Cọc thực giữ khác số trên hợp đồng: cần ghi lý do");
  }
  if (input.topUp != null) {
    if (input.lastMonthMode !== "full_month") throw new UserError("Tiền bù chỉ dùng khi thu đủ tháng dở");
    assertDong(input.topUp, "tiền bù tháng");
    if (input.topUp < 0 || input.topUp > ctx.monthlyRent) throw new UserError("Tiền bù đủ tháng phải từ 0 tới giá thuê một tháng");
  }
  if (ctx.blocker) throw new UserError(ctx.blocker);
  if (ctx.movedOutOn && input.settledOn < ctx.movedOutOn) throw new UserError("Ngày quyết toán trước ngày chuyển đi");
}

function compute(input: SettleInput, ctx: SettlementContext): SettlementResult & { topUp: number } {
  const topUp = input.lastMonthMode === "full_month" && ctx.finalInvoice ? (input.topUp ?? ctx.suggestedTopUp) : 0;
  try {
    const r = computeSettlement({
      depositHeld: input.depositHeld,
      invoices: ctx.openInvoices,
      unallocatedCredit: ctx.unallocatedCredit,
      fullMonthTopUp: topUp,
      deductions: input.deductions,
    });
    return { ...r, topUp };
  } catch (e) {
    if (e instanceof SettlementError) throw new UserError(e.message);
    throw e;
  }
}

/** Xem trước kết quả, không ghi gì. */
export async function previewSettlement(actor: Actor, input: SettleInput): Promise<SettlementResult & { topUp: number }> {
  requireOwner(actor);
  return withOrg(actor, async (tx) => {
    const ctx = await loadContext(tx, actor, input.leaseId, false);
    if (!ctx) throw new UserError("Không tìm thấy hợp đồng");
    validate(input, ctx);
    return compute(input, ctx);
  });
}

/** Quyết toán cọc. Mọi bước trong một giao dịch; lỗi ở bất kỳ bước nào thì không ghi gì. */
export async function settleDeposit(actor: Actor, input: SettleInput): Promise<string> {
  requireOwner(actor);
  return withOrg(actor, async (tx) => {
    const ctx = await loadContext(tx, actor, input.leaseId, true);
    if (!ctx) throw new UserError("Không tìm thấy hợp đồng");
    validate(input, ctx);
    const r = compute(input, ctx);
    const final = ctx.finalInvoice!;

    if (r.topUp > 0) {
      await adjustInvoiceTx(tx, actor, final.id, r.topUp, `Tiền phòng đủ tháng dở (trả phòng ${fmt(ctx.movedOutOn!)})`);
    }
    for (const d of input.deductions) {
      await adjustInvoiceTx(tx, actor, final.id, d.amount, `Khấu trừ khi trả phòng: ${d.reason.trim()}`);
    }
    // Tiền khách trả dư dùng trước (phân bổ cũ nhất trước), rồi mới cấn trừ cọc.
    if (r.creditApplied > 0) await applyLeaseCredit(tx, actor, input.leaseId);
    let depositPaymentId: string | null = null;
    if (r.depositApplied > 0) {
      const pay = await insertPaymentTx(tx, actor, {
        leaseId: input.leaseId,
        propertyId: ctx.propertyId,
        amount: r.depositApplied,
        method: "deposit",
        receivedOn: input.settledOn,
        note: "Cấn trừ tiền cọc khi trả phòng",
        idempotencyKey: null,
      });
      // Cấn trừ không vượt nợ, nên phải phân bổ hết; lệch là có lỗi tính, dừng cả giao dịch.
      if (pay.unallocated !== 0) throw new Error(`Quyết toán lệch: cấn trừ cọc còn dư ${pay.unallocated}`);
      depositPaymentId = pay.paymentId;
    }
    // Kiểm lại sau khi ghi: nợ còn lại trên DB phải đúng bằng số khách phải trả thêm.
    const after = await openInvoicesForLease(tx, input.leaseId);
    const owed = after.reduce((s, i) => s + (i.total - i.paid), 0);
    if (owed !== r.tenantOwes) throw new Error(`Quyết toán lệch: nợ còn ${owed}, tính ra ${r.tenantOwes}`);

    const [row] = await tx
      .insert(depositSettlements)
      .values({
        orgId: actor.orgId,
        leaseId: input.leaseId,
        finalInvoiceId: final.id,
        settledOn: input.settledOn,
        lastMonthMode: input.lastMonthMode,
        depositHeld: input.depositHeld,
        depositHeldNote: input.depositHeldNote?.trim() || null,
        debtBefore: r.debtBefore,
        fullMonthTopUp: r.topUp,
        deductions: input.deductions.map((d) => ({ reason: d.reason.trim(), amount: d.amount })),
        creditApplied: r.creditApplied,
        depositApplied: r.depositApplied,
        refundDue: r.refundDue,
        tenantOwes: r.tenantOwes,
        depositPaymentId,
        note: input.note?.trim() || null,
        createdBy: actor.userId,
      })
      .returning({ id: depositSettlements.id });
    await audit(tx, actor, "deposit.settle", "lease", input.leaseId, null, { ...input, result: r, settlementId: row!.id });
    return row!.id;
  });
}

/** Ghi nhận chủ trọ đã trả lại tiền cọc cho khách. */
export async function markRefunded(actor: Actor, settlementId: string, refundedOn: IsoDate, method: "cash" | "transfer" | "other"): Promise<void> {
  requireOwner(actor);
  assertIsoDate(refundedOn);
  if (!["cash", "transfer", "other"].includes(method)) throw new UserError("Hình thức hoàn không hợp lệ");
  await withOrg(actor, async (tx) => {
    const [s] = await tx.select().from(depositSettlements).where(eq(depositSettlements.id, settlementId)).for("update");
    if (!s || s.voidedAt) throw new UserError("Không tìm thấy bản quyết toán");
    if (s.refundDue <= 0) throw new UserError("Bản quyết toán không có tiền phải hoàn");
    if (refundedOn < s.settledOn) throw new UserError("Ngày hoàn trước ngày quyết toán");
    await tx.update(depositSettlements).set({ refundedOn, refundMethod: method }).where(eq(depositSettlements.id, settlementId));
    await audit(tx, actor, "deposit.refund", "deposit_settlement", settlementId, { refundedOn: s.refundedOn }, { refundedOn, method, amount: s.refundDue });
  });
}

/**
 * Hủy quyết toán làm nhầm: hủy thanh toán cấn trừ cọc, ghi điều chỉnh âm bù lại phần bù tháng và khấu trừ.
 * Đã đánh dấu hoàn tiền thì không hủy được. Tiền trả dư đã dùng vẫn nằm ở hóa đơn (như tự động khi phát hành).
 */
export async function voidSettlement(actor: Actor, settlementId: string, reason: string): Promise<void> {
  requireOwner(actor);
  if (!reason.trim()) throw new UserError("Cần ghi lý do hủy");
  await withOrg(actor, async (tx) => {
    const [s] = await tx.select().from(depositSettlements).where(eq(depositSettlements.id, settlementId)).for("update");
    if (!s || s.voidedAt) throw new UserError("Không tìm thấy bản quyết toán");
    if (s.refundedOn) throw new UserError("Đã ghi nhận hoàn cọc, không hủy được quyết toán");
    if (s.depositPaymentId) await voidPaymentTx(tx, actor, s.depositPaymentId, `Hủy quyết toán: ${reason.trim()}`);
    if (s.fullMonthTopUp > 0) {
      await adjustInvoiceTx(tx, actor, s.finalInvoiceId, -s.fullMonthTopUp, `Hủy quyết toán: bỏ bù tháng dở`);
    }
    for (const d of s.deductions) {
      await adjustInvoiceTx(tx, actor, s.finalInvoiceId, -d.amount, `Hủy quyết toán: bỏ khấu trừ ${d.reason}`);
    }
    await tx.update(depositSettlements).set({ voidedAt: new Date(), voidReason: reason.trim() }).where(eq(depositSettlements.id, settlementId));
    await audit(tx, actor, "deposit.void", "deposit_settlement", settlementId, null, { reason });
  });
}
