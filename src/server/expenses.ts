// Sổ chi của cơ sở + báo cáo thu-chi theo tháng. Tiền cọc KHÔNG vào đây
// (quyết toán cọc đi đường riêng ở deposit.ts, không gộp vào doanh thu).

import { desc, eq, sql } from "drizzle-orm";
import { withOrg } from "@/db/client";
import * as s from "@/db/schema";
import { audit, requireOwner, UserError, type Actor } from "./audit";
import { assertIsoDate, type IsoDate } from "@/domain/dates";

/** Khoản chi chọn sẵn ở form (lưu dạng text để sau này thêm khoản không cần migration). */
export const EXPENSE_CATEGORIES = ["Sửa chữa", "Vận hành", "Mua sắm", "Khác"] as const;

export interface ExpenseInput {
  propertyId: string;
  spentOn: IsoDate;
  category: string;
  amount: number;
  note: string | null;
}

export async function listExpenses(actor: Actor, propertyId: string, limit = 20) {
  return withOrg(actor, (tx) =>
    tx
      .select()
      .from(s.expenses)
      .where(eq(s.expenses.propertyId, propertyId))
      .orderBy(desc(s.expenses.spentOn), desc(s.expenses.createdAt))
      .limit(limit),
  );
}

export async function addExpense(actor: Actor, input: ExpenseInput): Promise<string> {
  requireOwner(actor);
  assertIsoDate(input.spentOn);
  if (!EXPENSE_CATEGORIES.includes(input.category as (typeof EXPENSE_CATEGORIES)[number]))
    throw new UserError("Khoản chi không hợp lệ");
  if (!Number.isInteger(input.amount) || input.amount <= 0) throw new UserError("Số tiền chi phải lớn hơn 0");
  return withOrg(actor, async (tx) => {
    const [property] = await tx.select().from(s.properties).where(eq(s.properties.id, input.propertyId));
    if (!property) throw new UserError("Không thấy cơ sở");
    const [e] = await tx
      .insert(s.expenses)
      .values({
        orgId: actor.orgId,
        propertyId: input.propertyId,
        spentOn: input.spentOn,
        category: input.category,
        amount: input.amount,
        note: input.note?.trim() || null,
      })
      .returning({ id: s.expenses.id });
    await audit(tx, actor, "expense.create", "expense", e!.id, null, {
      spentOn: input.spentOn,
      category: input.category,
      amount: input.amount,
    });
    return e!.id;
  });
}

export async function deleteExpense(actor: Actor, expenseId: string): Promise<void> {
  requireOwner(actor);
  return withOrg(actor, async (tx) => {
    const [e] = await tx.select().from(s.expenses).where(eq(s.expenses.id, expenseId));
    if (!e) throw new UserError("Không thấy khoản chi");
    await tx.delete(s.expenses).where(eq(s.expenses.id, expenseId));
    await audit(tx, actor, "expense.delete", "expense", expenseId, { amount: e.amount }, null);
  });
}

export interface MonthlyCashflow {
  /** Tổng hóa đơn đã phát hành trong tháng. */
  receivable: number;
  /** Tiền nhận trong tháng (theo ngày nhận, chưa trừ void). */
  collected: number;
  /** Tổng chi trong tháng. */
  expenses: number;
  /** Tiền còn trong tháng = đã thu − chi. */
  balance: number;
}

/** Thu-chi tháng `month` ("YYYY-MM") của một cơ sở, tính theo dòng tiền thực. */
export async function monthlyCashflow(actor: Actor, propertyId: string, month: string): Promise<MonthlyCashflow> {
  if (!/^\d{4}-\d{2}$/.test(month)) throw new UserError("Tháng phải dạng YYYY-MM");
  const [y = 1970, m = 1] = month.split("-").map(Number);
  const start = `${month}-01`;
  const end = m === 12 ? `${y + 1}-01-01` : `${y}-${String(m + 1).padStart(2, "0")}-01`;
  return withOrg(actor, async (tx) => {
    const [inv] = await tx.execute(sql`
      select coalesce(sum(total), 0)::bigint as v from invoices
      where property_id = ${propertyId}::uuid and status = 'issued'
        and (issued_at at time zone 'Asia/Ho_Chi_Minh')::date >= ${start}
        and (issued_at at time zone 'Asia/Ho_Chi_Minh')::date < ${end}`);
    const [pay] = await tx.execute(sql`
      select coalesce(sum(amount), 0)::bigint as v from payments
      where property_id = ${propertyId}::uuid and voided_at is null
        and received_on >= ${start} and received_on < ${end}`);
    const [exp] = await tx.execute(sql`
      select coalesce(sum(amount), 0)::bigint as v from expenses
      where property_id = ${propertyId}::uuid
        and spent_on >= ${start} and spent_on < ${end}`);
    const receivable = Number((inv as unknown as { v: string }).v);
    const collected = Number((pay as unknown as { v: string }).v);
    const expenses = Number((exp as unknown as { v: string }).v);
    return { receivable, collected, expenses, balance: collected - expenses };
  });
}
