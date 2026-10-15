// Ghi nhận thanh toán, phân bổ vào hóa đơn, hủy thanh toán, tiền trả trước.

import { and, eq, inArray, isNull, sql } from "drizzle-orm";
import { withOrg, type Tx } from "@/db/client";
import { invoices, leases, paymentAllocations, payments, units } from "@/db/schema";
import type { IsoDate } from "@/domain/dates";
import { assertIsoDate } from "@/domain/dates";
import { assertDong } from "@/domain/money";
import { allocatePayment, type OpenInvoice } from "@/domain/payments";
import { audit, requireOwner, UserError, type Actor } from "./audit";

/** Hóa đơn đã phát hành của hợp đồng kèm số đã trả. Khóa dòng để tránh ghi đồng thời. */
export async function openInvoicesForLease(tx: Tx, leaseId: string): Promise<OpenInvoice[]> {
  const rows = await tx
    .select({
      id: invoices.id,
      dueDate: invoices.dueDate,
      issuedAt: invoices.issuedAt,
      total: invoices.total,
    })
    .from(invoices)
    .where(and(eq(invoices.leaseId, leaseId), eq(invoices.status, "issued")))
    .for("update");
  if (rows.length === 0) return [];
  const paid = await tx
    .select({ invoiceId: paymentAllocations.invoiceId, sum: sql<string>`sum(${paymentAllocations.amount})` })
    .from(paymentAllocations)
    .where(inArray(paymentAllocations.invoiceId, rows.map((r) => r.id)))
    .groupBy(paymentAllocations.invoiceId);
  return rows.map((r) => ({
    id: r.id,
    dueDate: r.dueDate,
    issuedAt: r.issuedAt?.toISOString() ?? "",
    total: r.total,
    paid: Number(paid.find((p) => p.invoiceId === r.id)?.sum ?? 0),
  }));
}

/** Phần thanh toán chưa phân bổ của từng khoản thanh toán còn hiệu lực. */
export async function paymentRemainders(tx: Tx, leaseId: string) {
  const rows = await tx
    .select({
      id: payments.id,
      amount: payments.amount,
      receivedOn: payments.receivedOn,
      allocated: sql<string>`coalesce((select sum(a.amount) from payment_allocations a where a.payment_id = ${payments.id}), 0)`,
    })
    .from(payments)
    .where(and(eq(payments.leaseId, leaseId), isNull(payments.voidedAt)))
    .orderBy(payments.receivedOn, payments.createdAt)
    .for("update");
  return rows
    .map((r) => ({ id: r.id, remaining: r.amount - Number(r.allocated) }))
    .filter((r) => r.remaining > 0);
}

/** Dùng tiền trả trước (thanh toán còn dư) để trừ vào các hóa đơn còn nợ. */
export async function applyLeaseCredit(tx: Tx, actor: Actor, leaseId: string): Promise<void> {
  const credits = await paymentRemainders(tx, leaseId);
  if (credits.length === 0) return;
  let open = await openInvoicesForLease(tx, leaseId);
  for (const c of credits) {
    if (!open.some((i) => i.total > i.paid)) break;
    const { allocations } = allocatePayment(c.remaining, open);
    if (allocations.length === 0) continue;
    await tx.insert(paymentAllocations).values(
      allocations.map((a) => ({ orgId: actor.orgId, paymentId: c.id, invoiceId: a.invoiceId, amount: a.amount })),
    );
    open = open.map((i) => ({ ...i, paid: i.paid + (allocations.find((a) => a.invoiceId === i.id)?.amount ?? 0) }));
    await audit(tx, actor, "payment.apply_credit", "payment", c.id, null, { allocations });
  }
}

export interface RecordPaymentInput {
  leaseId: string;
  amount: number;
  method: "cash" | "transfer" | "other";
  receivedOn: IsoDate;
  reference?: string;
  note?: string;
  /** Chỉ trả cho các hóa đơn này (theo thứ tự); bỏ trống = trả hóa đơn cũ nhất trước. */
  invoiceIds?: string[];
  /** Gửi lại cùng khóa sẽ không tạo thanh toán thứ hai. */
  idempotencyKey: string;
}

export interface RecordPaymentResult {
  paymentId: string;
  allocations: Array<{ invoiceId: string; amount: number }>;
  unallocated: number;
  duplicate: boolean;
}

/**
 * Ghi một khoản thanh toán và phân bổ vào hóa đơn còn nợ của hợp đồng, trong giao dịch có sẵn.
 * Dùng chung cho thu tiền thường và cấn trừ cọc khi quyết toán (method = "deposit"). Không ghi audit.
 */
export async function insertPaymentTx(
  tx: Tx,
  actor: Actor,
  input: Omit<RecordPaymentInput, "method" | "idempotencyKey"> & {
    propertyId: string;
    method: "cash" | "transfer" | "other" | "deposit";
    idempotencyKey: string | null;
  },
): Promise<{ paymentId: string; allocations: Array<{ invoiceId: string; amount: number }>; unallocated: number }> {
  const open = await openInvoicesForLease(tx, input.leaseId);
  for (const id of input.invoiceIds ?? []) {
    if (!open.some((o) => o.id === id)) throw new UserError("Hóa đơn được chọn không thuộc hợp đồng hoặc chưa phát hành");
  }
  const { allocations, unallocated } = allocatePayment(input.amount, open, input.invoiceIds);
  const [p] = await tx
    .insert(payments)
    .values({
      orgId: actor.orgId,
      propertyId: input.propertyId,
      leaseId: input.leaseId,
      amount: input.amount,
      method: input.method,
      receivedOn: input.receivedOn,
      reference: input.reference?.trim() || null,
      note: input.note?.trim() || null,
      recordedBy: actor.userId,
      idempotencyKey: input.idempotencyKey,
    })
    .returning({ id: payments.id });
  if (allocations.length) {
    await tx.insert(paymentAllocations).values(
      allocations.map((a) => ({ orgId: actor.orgId, paymentId: p!.id, invoiceId: a.invoiceId, amount: a.amount })),
    );
  }
  return { paymentId: p!.id, allocations, unallocated };
}

export async function recordPayment(actor: Actor, input: RecordPaymentInput): Promise<RecordPaymentResult> {
  requireOwner(actor);
  assertDong(input.amount, "số tiền");
  if (input.amount <= 0) throw new UserError("Số tiền phải lớn hơn 0");
  assertIsoDate(input.receivedOn);
  if (!input.idempotencyKey) throw new UserError("Thiếu khóa chống trùng");
  // "deposit" chỉ do quyết toán cọc ghi (src/server/deposit.ts), không nhận từ form thu tiền.
  if (!["cash", "transfer", "other"].includes(input.method)) throw new UserError("Hình thức thanh toán không hợp lệ");

  return withOrg(actor, async (tx) => {
    const [dup] = await tx
      .select({ id: payments.id })
      .from(payments)
      .where(and(eq(payments.orgId, actor.orgId), eq(payments.idempotencyKey, input.idempotencyKey)));
    if (dup) {
      const allocs = await tx
        .select({ invoiceId: paymentAllocations.invoiceId, amount: paymentAllocations.amount })
        .from(paymentAllocations)
        .where(eq(paymentAllocations.paymentId, dup.id));
      return { paymentId: dup.id, allocations: allocs, unallocated: 0, duplicate: true };
    }

    const [lease] = await tx
      .select({ id: leases.id, propertyId: units.propertyId })
      .from(leases)
      .innerJoin(units, eq(units.id, leases.unitId))
      .where(eq(leases.id, input.leaseId));
    if (!lease) throw new UserError("Không tìm thấy hợp đồng");

    const { paymentId, allocations, unallocated } = await insertPaymentTx(tx, actor, {
      ...input,
      leaseId: lease.id,
      propertyId: lease.propertyId,
    });
    await audit(tx, actor, "payment.record", "payment", paymentId, null, { ...input, allocations, unallocated });
    return { paymentId, allocations, unallocated, duplicate: false };
  });
}

/** Hủy thanh toán ghi nhầm. Gỡ mọi phân bổ; giữ bản ghi để truy vết. */
export async function voidPayment(actor: Actor, paymentId: string, reason: string): Promise<void> {
  requireOwner(actor);
  if (!reason.trim()) throw new UserError("Cần ghi lý do hủy");
  await withOrg(actor, (tx) => voidPaymentTx(tx, actor, paymentId, reason));
}

/** Như voidPayment nhưng chạy trong giao dịch có sẵn. */
export async function voidPaymentTx(tx: Tx, actor: Actor, paymentId: string, reason: string): Promise<void> {
  requireOwner(actor);
  if (!reason.trim()) throw new UserError("Cần ghi lý do hủy");
  const [p] = await tx.select().from(payments).where(eq(payments.id, paymentId)).for("update");
  if (!p) throw new UserError("Không tìm thấy thanh toán");
  if (p.voidedAt) return;
  const removed = await tx.delete(paymentAllocations).where(eq(paymentAllocations.paymentId, paymentId)).returning();
  await tx.update(payments).set({ voidedAt: new Date(), voidReason: reason.trim() }).where(eq(payments.id, paymentId));
  await audit(tx, actor, "payment.void", "payment", paymentId, { allocations: removed }, { reason });
}
