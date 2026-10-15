// Link hóa đơn gửi người thuê qua Zalo/SMS: không cần đăng nhập, token ngẫu nhiên 256 bit,
// chỉ lưu băm, hết hạn sau 60 ngày, chỉ hiện đúng một hóa đơn.

import { createHash, randomBytes } from "node:crypto";
import { and, asc, eq, sql } from "drizzle-orm";
import { getDb, withOrg, type Tx } from "@/db/client";
import {
  billingPeriods,
  invoiceAdjustments,
  invoiceLines,
  invoiceShareTokens,
  invoices,
  paymentAllocations,
  properties,
  units,
} from "@/db/schema";
import { buildVietQr } from "@/domain/vietqr";
import { audit, UserError, type Actor } from "./audit";

export const SHARE_TTL_DAYS = 60;

export function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

export async function createShareLink(actor: Actor, invoiceId: string): Promise<{ token: string; expiresAt: Date }> {
  const token = randomBytes(32).toString("base64url");
  const expiresAt = new Date(Date.now() + SHARE_TTL_DAYS * 86_400_000);
  await withOrg(actor, async (tx) => {
    const [inv] = await tx.select({ status: invoices.status }).from(invoices).where(eq(invoices.id, invoiceId));
    if (!inv) throw new UserError("Không tìm thấy hóa đơn");
    if (inv.status !== "issued") throw new UserError("Chỉ gửi được hóa đơn đã phát hành");
    await tx.insert(invoiceShareTokens).values({ orgId: actor.orgId, invoiceId, tokenHash: hashToken(token), expiresAt });
    await audit(tx, actor, "invoice.share", "invoice", invoiceId, null, { expiresAt });
  });
  return { token, expiresAt };
}

export interface PublicInvoice {
  code: string;
  status: "issued" | "void";
  propertyName: string;
  unitCode: string;
  periodStart: string;
  periodEnd: string;
  dueDate: string;
  total: number;
  paid: number;
  lines: Array<{ description: string; amount: number }>;
  adjustments: Array<{ reason: string; amount: number }>;
  bank: { accountNo: string; accountName: string | null; bankBin: string } | null;
  qrPayload: string | null;
}

/** Trả về hóa đơn cho người cầm link; null nếu token sai hoặc hết hạn. */
export async function resolveShareLink(token: string): Promise<PublicInvoice | null> {
  if (!/^[A-Za-z0-9_-]{43}$/.test(token)) return null;
  const tokenHash = hashToken(token);
  const found = (await getDb().execute(
    sql`select org_id, invoice_id from resolve_invoice_share(${tokenHash})`,
  )) as unknown as Array<{ org_id: string; invoice_id: string }>;
  const hit = found[0];
  if (!hit) return null;

  return withOrg({ orgId: hit.org_id, userId: null }, async (tx) => {
    await tx
      .update(invoiceShareTokens)
      .set({ openCount: sql`${invoiceShareTokens.openCount} + 1`, lastOpenedAt: new Date() })
      .where(eq(invoiceShareTokens.tokenHash, tokenHash));
    return loadInvoiceView(tx, hit.invoice_id);
  });
}

/** Hóa đơn đã phát hành/đã hủy ở dạng người thuê xem được; null nếu là nháp. Gọi trong withOrg. */
export async function loadInvoiceView(tx: Tx, invoiceId: string): Promise<PublicInvoice | null> {
  const [row] = await tx
    .select({
      inv: invoices,
      propertyName: properties.name,
      unitCode: units.code,
      property: properties,
      periodStart: billingPeriods.periodStart,
      periodEnd: billingPeriods.periodEnd,
    })
    .from(invoices)
    .innerJoin(properties, eq(properties.id, invoices.propertyId))
    .innerJoin(units, eq(units.id, invoices.unitId))
    .innerJoin(billingPeriods, eq(billingPeriods.id, invoices.billingPeriodId))
    .where(eq(invoices.id, invoiceId));
  if (!row || row.inv.status === "draft") return null;
  const [lines, adjustments, paidRows] = await Promise.all([
    tx
      .select({ description: invoiceLines.description, amount: invoiceLines.amount })
      .from(invoiceLines)
      .where(eq(invoiceLines.invoiceId, row.inv.id))
      .orderBy(asc(invoiceLines.position)),
    tx
      .select({ reason: invoiceAdjustments.reason, amount: invoiceAdjustments.amount })
      .from(invoiceAdjustments)
      .where(eq(invoiceAdjustments.invoiceId, row.inv.id))
      .orderBy(asc(invoiceAdjustments.createdAt)),
    tx
      .select({ sum: sql<string>`coalesce(sum(${paymentAllocations.amount}), 0)` })
      .from(paymentAllocations)
      .where(and(eq(paymentAllocations.invoiceId, row.inv.id))),
  ]);
  const paid = Number(paidRows[0]?.sum ?? 0);
  const p = row.property;
  const due = row.inv.total - paid;
  const bank = p.bankBin && p.bankAccountNo ? { accountNo: p.bankAccountNo, accountName: p.bankAccountName, bankBin: p.bankBin } : null;
  return {
    code: row.inv.code,
    status: row.inv.status as "issued" | "void",
    propertyName: row.propertyName,
    unitCode: row.unitCode,
    periodStart: row.periodStart,
    periodEnd: row.periodEnd,
    dueDate: row.inv.dueDate,
    total: row.inv.total,
    paid,
    lines,
    adjustments,
    bank,
    qrPayload:
      bank && due > 0 && row.inv.status === "issued"
        ? buildVietQr({ bankBin: bank.bankBin, accountNo: bank.accountNo, amount: due, message: row.inv.code })
        : null,
  };
}
