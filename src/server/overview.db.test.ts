// Tổng quan gộp: số tiền khớp trang từng cơ sở, việc cần xử lý đúng, nhân viên chỉ thấy cơ sở được giao.

import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import { beforeAll, describe, expect, it } from "vitest";
import { withOrg } from "@/db/client";
import * as s from "@/db/schema";
import type { Actor } from "./audit";
import { actorFor, signUpOwner } from "./auth";
import { generateDrafts, issueInvoices } from "./billing";
import { orgOverview } from "./overview";
import { actionItems, sumTotals } from "./overview-items";
import { recordPayment } from "./payments";
import { dashboard, today } from "./queries";
import { createLease, createProperty, importUnits, openPeriod, recordReadings, setFeeRule } from "./setup";
import { acceptStaffInvite, createStaffInvite } from "./staff";

async function newOwner(name: string): Promise<Actor> {
  const { userId } = await signUpOwner({
    email: `${name}-${randomUUID().slice(0, 8)}@example.com`,
    password: "matkhau123",
    displayName: name,
    orgName: `Nhà trọ ${name}`,
  });
  return (await actorFor(userId))!;
}

async function unitIds(actor: Actor, propertyId: string): Promise<Record<string, string>> {
  const rows = await withOrg(actor, (tx) => tx.select().from(s.units).where(eq(s.units.propertyId, propertyId)));
  return Object.fromEntries(rows.map((u) => [u.code, u.id]));
}

async function meterId(actor: Actor, unitId: string): Promise<string> {
  const [m] = await withOrg(actor, (tx) => tx.select().from(s.meters).where(eq(s.meters.unitId, unitId)));
  return m!.id;
}

const vnd = (n: number) => `${n}đ`;

describe("tổng quan gộp nhiều cơ sở", () => {
  let a: Actor;
  let p1: string;
  let p2: string;
  let sept: string;
  let lease1: string;

  beforeAll(async () => {
    a = await newOwner("tq");
    p1 = await createProperty(a, { name: "Dãy 1" });
    p2 = await createProperty(a, { name: "Dãy 2" });
    await importUnits(a, p1, [{ code: "101" }, { code: "102" }, { code: "103" }]);
    await importUnits(a, p2, [{ code: "201" }]);
    const u1 = await unitIds(a, p1);
    const u2 = await unitIds(a, p2);
    await setFeeRule(a, {
      propertyId: p1, key: "electricity", name: "Điện", method: "metered", meterKind: "electricity",
      unitPrice: 3_500, unitLabel: "kWh", prorate: false, effectiveFrom: "2026-01-01",
    });
    lease1 = await createLease(a, {
      unitId: u1["101"]!, tenant: { fullName: "Bình" }, startDate: "2026-01-01", expiresOn: "2026-09-30",
      deposit: 0, occupants: 1, rent: 3_000_000,
    });
    await createLease(a, {
      unitId: u1["102"]!, tenant: { fullName: "Chi" }, startDate: "2026-01-01", deposit: 0, occupants: 1, rent: 2_000_000,
    });
    await createLease(a, {
      unitId: u2["201"]!, tenant: { fullName: "Dũng" }, startDate: "2026-01-01", expiresOn: "2026-10-30",
      deposit: 0, occupants: 1, rent: 1_500_000,
    });
    // Chỉ phòng 101 có chỉ số đủ; 102 thiếu nên không lập được hóa đơn.
    const m101 = await meterId(a, u1["101"]!);
    await recordReadings(a, [
      { meterId: m101, date: "2026-08-31", value: 100 },
      { meterId: m101, date: "2026-09-30", value: 200 },
    ]);
    sept = await openPeriod(a, p1, "2026-09-01", "2026-09-30");
    const drafts = await generateDrafts(a, sept);
    await issueInvoices(a, drafts.filter((d) => d.invoiceId).map((d) => d.invoiceId!));
    await recordPayment(a, {
      leaseId: lease1, amount: 1_000_000, method: "cash", receivedOn: "2026-10-02", idempotencyKey: randomUUID(),
    });
  });

  it("số tiền và số phòng khớp trang từng cơ sở", async () => {
    const props = await orgOverview(a);
    expect(props.map((p) => p.name)).toEqual(["Dãy 1", "Dãy 2"]);
    for (const p of props) {
      const d = await dashboard(a, p.id);
      expect(p.money.receivable).toBe(d.receivable);
      expect(p.money.collected).toBe(d.collected);
      expect(p.money.overdue).toBe(d.overdue);
      expect(p.units).toEqual(d.units);
    }
    const totals = sumTotals(props);
    // 101: 3.000.000 + 100 kWh × 3.500 = 3.350.000, đã thu 1.000.000.
    expect(totals.money.receivable).toBe(3_350_000);
    expect(totals.money.outstanding).toBe(2_350_000);
    expect(totals.units).toEqual({ total: 4, occupied: 3, vacant: 1, maintenance: 0 });
    expect(totals.occupancy).toBe(75);
  });

  it("việc cần xử lý: nợ, phòng chưa lập hóa đơn, chưa mở kỳ, hợp đồng hết hạn", async () => {
    const t = "2026-10-15";
    const props = await orgOverview(a, t);
    const d1 = props.find((p) => p.id === p1)!;
    expect(d1.money.unpaidCount).toBe(1);
    expect(d1.periodGaps).toEqual([
      { periodId: sept, periodStart: "2026-09-01", periodEnd: "2026-09-30", missingUnits: ["102"], drafts: 0 },
    ]);
    // Dãy 1 đã có kỳ phủ 30/09; Dãy 2 có người ở tháng 9 mà chưa mở kỳ nào.
    expect(d1.missingPeriodFor).toBeNull();
    expect(props.find((p) => p.id === p2)!.missingPeriodFor).toEqual({ start: "2026-09-01", end: "2026-09-30" });

    const items = actionItems(props, t, vnd);
    expect(items.map((i) => i.kind)).toEqual(["unpaid", "missing_period", "period_gap", "lease_expired", "lease_expiring"]);
    expect(items[0]!.title).toBe("1 hóa đơn chưa thu đủ · 2350000đ");
    expect(items.find((i) => i.kind === "lease_expired")!.title).toContain("101");
    expect(items.find((i) => i.kind === "lease_expiring")!.title).toContain("201");
  });

  it("nhân viên chỉ thấy cơ sở được giao", async () => {
    const { token } = await createStaffInvite(a, p2);
    const userId = await acceptStaffInvite(token, {
      email: `nv-${randomUUID().slice(0, 8)}@example.com`, password: "matkhau123", displayName: "NV",
    });
    const staff = (await actorFor(userId))!;
    expect((await orgOverview(staff)).map((p) => p.id)).toEqual([p2]);
  });

  it("chủ trọ khác không thấy gì", async () => {
    const b = await newOwner("tq-b");
    expect(await orgOverview(b)).toEqual([]);
    expect(today()).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });
});
