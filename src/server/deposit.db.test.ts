// Quyết toán cọc trên Postgres thật: số tiền khớp từng đồng, một giao dịch, không quyết toán hai lần, hủy đưa về như cũ.

import { randomUUID } from "node:crypto";
import { and, eq, isNull } from "drizzle-orm";
import { beforeAll, describe, expect, it } from "vitest";
import { withOrg } from "@/db/client";
import * as s from "@/db/schema";
import type { Actor } from "./audit";
import { actorFor, signUpOwner } from "./auth";
import { dueDateForDay, generateDrafts, issueInvoices } from "./billing";
import { markRefunded, previewSettlement, settleDeposit, settlementContext, voidSettlement } from "./deposit";
import { orgOverview } from "./overview";
import { recordPayment, voidPayment } from "./payments";
import { createLease, createProperty, importUnits, moveOut, openPeriod, recordReadings, setFeeRule, setLeaseDueDay } from "./setup";
import { acceptStaffInvite, createStaffInvite } from "./staff";

async function newOwner(name: string): Promise<Actor> {
  const { userId } = await signUpOwner({
    email: `${name}-${randomUUID().slice(0, 8)}@example.com`, password: "matkhau123", displayName: name, orgName: `Trọ ${name}`,
  });
  return (await actorFor(userId))!;
}

async function owed(a: Actor, leaseId: string): Promise<number> {
  const rows = await withOrg(a, (tx) =>
    tx.execute(`select coalesce(sum(i.total - coalesce((select sum(x.amount) from payment_allocations x where x.invoice_id = i.id), 0)), 0)::bigint as owed
                from invoices i where i.lease_id = '${leaseId}' and i.status = 'issued'`),
  ) as unknown as Array<{ owed: string }>;
  return Number(rows[0]!.owed);
}

describe("quyết toán cọc", () => {
  let a: Actor;
  let p: string;
  let unitId: string;
  let meterId: string;
  let lease: string;
  let oct: string;

  beforeAll(async () => {
    a = await newOwner("coc");
    p = await createProperty(a, { name: "Dãy Cọc", roundTotalTo: 1000 });
    await importUnits(a, p, [{ code: "101" }]);
    const [u] = await withOrg(a, (tx) => tx.select().from(s.units).where(eq(s.units.propertyId, p)));
    unitId = u!.id;
    const [m] = await withOrg(a, (tx) => tx.select().from(s.meters).where(eq(s.meters.unitId, unitId)));
    meterId = m!.id;
    await setFeeRule(a, {
      propertyId: p, key: "electricity", name: "Điện", method: "metered", meterKind: "electricity",
      unitPrice: 4_000, unitLabel: "kWh", prorate: false, effectiveFrom: "2026-01-01",
    });
    lease = await createLease(a, {
      unitId, tenant: { fullName: "Khách" }, startDate: "2026-09-01", deposit: 3_200_000, occupants: 1, rent: 3_100_000, dueDay: 5,
    });
    // Tháng 9 đã thu đủ.
    await recordReadings(a, [
      { meterId, date: "2026-08-31", value: 100 },
      { meterId, date: "2026-09-30", value: 200 },
    ]);
    const sep = await openPeriod(a, p, "2026-09-01", "2026-09-30");
    const d9 = await generateDrafts(a, sep);
    await issueInvoices(a, [d9[0]!.invoiceId!]);
    const [inv9] = await withOrg(a, (tx) => tx.select().from(s.invoices).where(eq(s.invoices.id, d9[0]!.invoiceId!)));
    // Hạn trả theo ngày thu 5 của tháng sau cuối kỳ.
    expect(inv9!.dueDate).toBe("2026-10-05");
    await recordPayment(a, { leaseId: lease, amount: inv9!.total, method: "transfer", receivedOn: "2026-10-03", idempotencyKey: randomUUID() });
    oct = await openPeriod(a, p, "2026-10-01", "2026-10-31");
  });

  it("chưa chuyển đi / chưa có hóa đơn cuối thì không quyết toán được", async () => {
    let ctx = (await settlementContext(a, lease))!;
    expect(ctx.blocker).toMatch(/chuyển đi/);
    await moveOut(a, lease, "2026-10-15");
    expect((await orgOverview(a, "2026-10-16")).find((x) => x.id === p)!.deposits).toMatchObject([{ kind: "unsettled", amount: 3_200_000 }]);
    ctx = (await settlementContext(a, lease))!;
    expect(ctx.blocker).toMatch(/hóa đơn cuối/);
    await expect(
      settleDeposit(a, { leaseId: lease, settledOn: "2026-10-15", lastMonthMode: "daily", depositHeld: 3_200_000, deductions: [] }),
    ).rejects.toThrow(/hóa đơn cuối/);
  });

  it("hóa đơn cuối theo ngày; đủ tháng dở + khấu trừ; cọc trừ nợ, chủ hoàn phần dư", async () => {
    await recordReadings(a, [{ meterId, date: "2026-10-15", value: 250 }]);
    const d = await generateDrafts(a, oct);
    // 3.100.000 × 15/31 = 1.500.000 + 50 kWh × 4.000 = 200.000 → 1.700.000
    expect(d[0]!.total).toBe(1_700_000);
    await issueInvoices(a, [d[0]!.invoiceId!]);
    const ctx = (await settlementContext(a, lease))!;
    expect(ctx.blocker).toBeNull();
    expect(ctx.finalInvoice?.rentOnInvoice).toBe(1_500_000);

    const input = {
      leaseId: lease, settledOn: "2026-10-15", lastMonthMode: "full_month" as const, depositHeld: 3_200_000,
      deductions: [{ reason: "Vệ sinh phòng", amount: 150_000 }],
    };
    const pv = await previewSettlement(a, input);
    // Nợ 1.700.000 + bù 1.600.000 + khấu trừ 150.000 = 3.450.000 > cọc 3.200.000 → khách trả thêm 250.000.
    expect(pv).toMatchObject({ debtBefore: 1_700_000, topUp: 1_600_000, debtAfter: 3_450_000, depositApplied: 3_200_000, refundDue: 0, tenantOwes: 250_000 });

    const daily = await previewSettlement(a, { ...input, lastMonthMode: "daily" });
    expect(daily).toMatchObject({ topUp: 0, debtAfter: 1_850_000, depositApplied: 1_850_000, refundDue: 1_350_000, tenantOwes: 0 });

    const id = await settleDeposit(a, input);
    expect(await owed(a, lease)).toBe(250_000);
    const [inv] = await withOrg(a, (tx) => tx.select().from(s.invoices).where(eq(s.invoices.id, d[0]!.invoiceId!)));
    expect(inv!.total).toBe(1_700_000 + 1_600_000 + 150_000);
    const pays = await withOrg(a, (tx) => tx.select().from(s.payments).where(and(eq(s.payments.leaseId, lease), eq(s.payments.method, "deposit"))));
    expect(pays.map((x) => x.amount)).toEqual([3_200_000]);
    const [row] = await withOrg(a, (tx) => tx.select().from(s.depositSettlements).where(eq(s.depositSettlements.id, id)));
    expect(row).toMatchObject({ tenantOwes: 250_000, refundDue: 0, fullMonthTopUp: 1_600_000, lastMonthMode: "full_month" });

    // Khoản cấn trừ cọc không hủy lẻ được.
    await expect(voidPayment(a, pays[0]!.id, "x")).rejects.toThrow(/Hủy quyết toán/);
    // Không quyết toán hai lần; không hoàn khi không có tiền hoàn.
    await expect(settleDeposit(a, input)).rejects.toThrow(/đã quyết toán/);
    await expect(markRefunded(a, id, "2026-10-16", "cash")).rejects.toThrow(/không có tiền phải hoàn/);
  });

  it("hủy quyết toán đưa nợ và hóa đơn về như trước", async () => {
    const [live] = await withOrg(a, (tx) =>
      tx.select().from(s.depositSettlements).where(and(eq(s.depositSettlements.leaseId, lease), isNull(s.depositSettlements.voidedAt))),
    );
    await voidSettlement(a, live!.id, "chọn nhầm cách tính");
    expect(await owed(a, lease)).toBe(1_700_000);
    expect((await settlementContext(a, lease))!.blocker).toBeNull();

    // Làm lại theo ngày: chủ hoàn 1.350.000, rồi ghi nhận đã hoàn; đã hoàn thì không hủy được.
    const id = await settleDeposit(a, {
      leaseId: lease, settledOn: "2026-10-16", lastMonthMode: "daily", depositHeld: 3_200_000,
      deductions: [{ reason: "Vệ sinh phòng", amount: 150_000 }],
    });
    expect(await owed(a, lease)).toBe(0);
    const kinds = async () => (await orgOverview(a, "2026-10-17")).find((x) => x.id === p)!.deposits;
    expect(await kinds()).toMatchObject([{ kind: "refund", amount: 1_350_000 }]);
    await markRefunded(a, id, "2026-10-17", "transfer");
    expect(await kinds()).toEqual([]);
    await expect(voidSettlement(a, id, "x")).rejects.toThrow(/không hủy được/);
    const logs = await withOrg(a, (tx) => tx.select().from(s.auditLogs).where(eq(s.auditLogs.entityId, id)));
    expect(logs.map((l) => l.action)).toContain("deposit.refund");
  });

  it("cọc giữ khác hợp đồng cần lý do; nhân viên và chủ trọ khác bị chặn", async () => {
    const b = await newOwner("coc-b");
    await expect(settlementContext(b, lease)).resolves.toBeNull();
    const { token } = await createStaffInvite(a, p);
    const staffId = await acceptStaffInvite(token, { email: `nv-${randomUUID().slice(0, 8)}@example.com`, password: "matkhau123", displayName: "NV" });
    const staff = (await actorFor(staffId))!;
    await expect(
      settleDeposit(staff, { leaseId: lease, settledOn: "2026-10-16", lastMonthMode: "daily", depositHeld: 0, deductions: [] }),
    ).rejects.toThrow(/không có quyền/);
    // Form thu tiền không được ghi method=deposit.
    await expect(
      recordPayment(a, { leaseId: lease, amount: 1, method: "deposit" as "cash", receivedOn: "2026-10-16", idempotencyKey: randomUUID() }),
    ).rejects.toThrow(/không hợp lệ/);
  });

  it("đổi ngày thu; ngoài 1–28 bị chặn", async () => {
    expect(dueDateForDay("2026-12-31", 10)).toBe("2027-01-10");
    await setLeaseDueDay(a, lease, 10);
    await expect(setLeaseDueDay(a, lease, 31)).rejects.toThrow(/1 đến 28/);
    await setLeaseDueDay(a, lease, null);
  });
});
