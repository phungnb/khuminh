// Màn Tính tiền: trạng thái từng phòng theo chỉ số và hóa đơn; quyền nhân viên.

import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import { beforeAll, describe, expect, it } from "vitest";
import { withOrg } from "@/db/client";
import * as s from "@/db/schema";
import type { Actor } from "./audit";
import { actorFor, signUpOwner } from "./auth";
import { generateDrafts, issueInvoices } from "./billing";
import { recordPayment } from "./payments";
import { createLease, createProperty, importUnits, moveOut, openPeriod, recordReadings, setFeeRule } from "./setup";
import { acceptStaffInvite, createStaffInvite } from "./staff";
import { periodWorksheet } from "./worksheet";

async function newOwner(name: string): Promise<Actor> {
  const { userId } = await signUpOwner({
    email: `${name}-${randomUUID().slice(0, 8)}@example.com`,
    password: "matkhau123",
    displayName: name,
    orgName: `Nhà trọ ${name}`,
  });
  return (await actorFor(userId))!;
}

describe("màn Tính tiền", () => {
  let a: Actor;
  let p: string;
  let period: string;
  let lease101: string;
  let lease102: string;
  const meter: Record<string, string> = {};

  beforeAll(async () => {
    a = await newOwner("tt");
    p = await createProperty(a, { name: "Dãy TT" });
    await importUnits(a, p, [{ code: "101" }, { code: "102" }, { code: "103" }]);
    await setFeeRule(a, {
      propertyId: p, key: "electricity", name: "Điện", method: "metered", meterKind: "electricity",
      unitPrice: 3_500, unitLabel: "kWh", prorate: false, effectiveFrom: "2026-01-01",
    });
    const units = await withOrg(a, (tx) => tx.select().from(s.units).where(eq(s.units.propertyId, p)));
    const id = (c: string) => units.find((u) => u.code === c)!.id;
    lease101 = await createLease(a, { unitId: id("101"), tenant: { fullName: "Bình" }, startDate: "2026-01-01", deposit: 0, occupants: 1, rent: 3_000_000 });
    lease102 = await createLease(a, { unitId: id("102"), tenant: { fullName: "Chi" }, startDate: "2026-09-10", deposit: 0, occupants: 1, rent: 2_000_000 });
    for (const c of ["101", "102"]) {
      const [m] = await withOrg(a, (tx) => tx.select().from(s.meters).where(eq(s.meters.unitId, id(c))));
      meter[c] = m!.id;
    }
    await recordReadings(a, [{ meterId: meter["101"]!, date: "2026-08-31", value: 100 }]);
    period = await openPeriod(a, p, "2026-09-01", "2026-09-30");
  });

  it("thiếu chỉ số → sẵn sàng → nháp → đã phát hành", async () => {
    let ws = (await periodWorksheet(a, period))!;
    // Phòng 103 không có hợp đồng nên không có dòng.
    expect(ws.rows.map((r) => r.unitCode)).toEqual(["101", "102"]);
    const r101 = ws.rows.find((r) => r.leaseId === lease101)!;
    expect(r101.status).toBe("missing_reading");
    expect(r101.meters[0]!.start).toEqual({ date: "2026-08-31", value: 100 });
    expect(r101.meters[0]!.end).toBeNull();
    // Phòng 102 vào ở giữa kỳ: đoạn bắt đầu từ ngày vào.
    expect(ws.rows.find((r) => r.leaseId === lease102)!.segStart).toBe("2026-09-10");

    await recordReadings(a, [{ meterId: meter["101"]!, date: "2026-09-30", value: 180.5 }]);
    ws = (await periodWorksheet(a, period))!;
    expect(ws.rows.find((r) => r.leaseId === lease101)!.status).toBe("ready");

    const res = await generateDrafts(a, period);
    const d101 = res.find((r) => r.leaseId === lease101)!;
    // 3.000.000 + 80,5 kWh × 3.500 = 3.281.750
    expect(d101.total).toBe(3_281_750);
    expect(res.find((r) => r.leaseId === lease102)!.errors.map((e) => e.code)).toEqual(["missing_reading_start"]);
    ws = (await periodWorksheet(a, period))!;
    const row = ws.rows.find((r) => r.leaseId === lease101)!;
    expect(row.status).toBe("draft");
    expect(row.invoice?.total).toBe(3_281_750);

    await issueInvoices(a, [d101.invoiceId!]);
    ws = (await periodWorksheet(a, period))!;
    expect(["unpaid", "overdue"]).toContain(ws.rows.find((r) => r.leaseId === lease101)!.status);

    await recordPayment(a, { leaseId: lease101, amount: 1_000_000, method: "cash", receivedOn: "2026-10-02", idempotencyKey: randomUUID() });
    ws = (await periodWorksheet(a, period))!;
    const paidRow = ws.rows.find((r) => r.leaseId === lease101)!;
    expect(paidRow.invoice?.paid).toBe(1_000_000);
    expect(["partial", "overdue"]).toContain(paidRow.status);
  });

  it("chuyển đi giữa kỳ: đoạn kết thúc ở ngày chuyển đi", async () => {
    await moveOut(a, lease102, "2026-09-20");
    const ws = (await periodWorksheet(a, period))!;
    const r = ws.rows.find((x) => x.leaseId === lease102)!;
    expect([r.segStart, r.segEnd]).toEqual(["2026-09-10", "2026-09-20"]);
  });

  it("nhân viên cơ sở khác bị chặn; chủ trọ khác không thấy kỳ", async () => {
    const other = await createProperty(a, { name: "Dãy khác" });
    const { token } = await createStaffInvite(a, other);
    const userId = await acceptStaffInvite(token, {
      email: `nv-${randomUUID().slice(0, 8)}@example.com`, password: "matkhau123", displayName: "NV",
    });
    const staff = (await actorFor(userId))!;
    await expect(periodWorksheet(staff, period)).rejects.toThrow();
    const b = await newOwner("tt-b");
    expect(await periodWorksheet(b, period)).toBeNull();
  });
});
