// Kiểm thử trên Postgres thật: chu trình một kỳ tiền phòng và cô lập dữ liệu giữa hai chủ trọ.

import { randomUUID } from "node:crypto";
import { eq, sql } from "drizzle-orm";
import { beforeAll, describe, expect, it } from "vitest";
import { getDb, withOrg } from "@/db/client";
import * as s from "@/db/schema";
import type { Actor } from "./audit";
import { actorFor, signIn, signUpOwner, userFromSession } from "./auth";
import { adjustInvoice, generateDrafts, issueInvoices, voidInvoice } from "./billing";
import { recordPayment, voidPayment } from "./payments";
import { createLease, createProperty, importUnits, moveOut, openPeriod, recordReadings, setFeeRule } from "./setup";
import { createShareLink, resolveShareLink } from "./share";

async function newOwner(name: string): Promise<Actor> {
  const { userId } = await signUpOwner({
    email: `${name}-${randomUUID().slice(0, 8)}@example.com`,
    password: "matkhau123",
    displayName: name,
    orgName: `Nhà trọ ${name}`,
  });
  return (await actorFor(userId))!;
}

async function meterOf(actor: Actor, unitId: string) {
  return withOrg(actor, async (tx) => {
    const [m] = await tx.select().from(s.meters).where(eq(s.meters.unitId, unitId));
    return m!;
  });
}

async function unitByCode(actor: Actor, propertyId: string, code: string) {
  return withOrg(actor, async (tx) => {
    const rows = await tx.select().from(s.units).where(eq(s.units.propertyId, propertyId));
    return rows.find((u) => u.code === code)!;
  });
}

describe("chu trình một kỳ", () => {
  let a: Actor;
  let propertyId: string;
  let p101: string;
  let p102: string;
  let lease101: string;
  let lease102: string;
  let periodId: string;

  beforeAll(async () => {
    a = await newOwner("an");
    propertyId = await createProperty(a, {
      name: "Dãy trọ An",
      roundTotalTo: 1000,
      bankBin: "970436",
      bankAccountNo: "0011001234567",
      bankAccountName: "NGUYEN VAN AN",
    });
    const imp = await importUnits(a, propertyId, [{ code: "101" }, { code: "102" }]);
    expect(imp).toEqual({ created: 2, errors: [] });
    p101 = (await unitByCode(a, propertyId, "101")).id;
    p102 = (await unitByCode(a, propertyId, "102")).id;

    await setFeeRule(a, {
      propertyId, key: "electricity", name: "Điện", method: "metered", meterKind: "electricity",
      unitPrice: 3_500, unitLabel: "kWh", prorate: false, effectiveFrom: "2026-01-01",
    });
    await setFeeRule(a, {
      propertyId, key: "water", name: "Nước", method: "per_person", unitPrice: 100_000, prorate: true, effectiveFrom: "2026-01-01",
    });

    lease101 = await createLease(a, {
      unitId: p101, tenant: { fullName: "Trần Bình", phone: "0900000001" },
      startDate: "2026-01-01", deposit: 3_000_000, occupants: 2, rent: 3_000_000,
    });
    lease102 = await createLease(a, {
      unitId: p102, tenant: { fullName: "Lê Chi" },
      startDate: "2026-10-15", deposit: 2_500_000, occupants: 1, rent: 2_500_000,
    });

    const m101 = await meterOf(a, p101);
    const m102 = await meterOf(a, p102);
    await recordReadings(a, [
      { meterId: m101.id, date: "2026-09-30", value: 1000 },
      { meterId: m101.id, date: "2026-10-31", value: 1120 },
      { meterId: m102.id, date: "2026-10-15", value: 500 },
      { meterId: m102.id, date: "2026-11-01", value: 530.5 },
    ]);
    periodId = await openPeriod(a, propertyId, "2026-10-01", "2026-10-31");
  });

  it("lập nháp đúng số tiền", async () => {
    const res = await generateDrafts(a, periodId);
    expect(res.every((r) => r.errors.length === 0)).toBe(true);
    const by = Object.fromEntries(res.map((r) => [r.unitCode, r.total]));
    // 101: 3.000.000 + 120 kWh × 3.500 + 2 × 100.000 = 3.620.000
    expect(by["101"]).toBe(3_620_000);
    // 102 (17/31 ngày): 1.370.968 + 30,5 kWh × 3.500 = 106.750 + 54.839 = 1.532.557 → làm tròn 1.533.000
    expect(by["102"]).toBe(1_533_000);
  });

  it("lập lại nháp không tạo trùng", async () => {
    await generateDrafts(a, periodId);
    const n = await withOrg(a, (tx) =>
      tx.select({ c: sql<number>`count(*)::int` }).from(s.invoices).where(eq(s.invoices.billingPeriodId, periodId)),
    );
    expect(n[0]!.c).toBe(2);
  });

  it("phát hành, gửi link, thu tiền, công nợ", async () => {
    const drafts = await generateDrafts(a, periodId);
    const ids = drafts.map((d) => d.invoiceId!);
    expect(await issueInvoices(a, ids)).toBe(2);

    const inv101 = drafts.find((d) => d.unitCode === "101")!.invoiceId!;
    const { token } = await createShareLink(a, inv101);
    const pub = await resolveShareLink(token);
    expect(pub?.total).toBe(3_620_000);
    expect(pub?.unitCode).toBe("101");
    expect(pub?.qrPayload).toContain("54073620000");
    expect(await resolveShareLink(token.slice(0, -1) + (token.endsWith("A") ? "B" : "A"))).toBeNull();

    const key = randomUUID();
    const pay = await recordPayment(a, {
      leaseId: lease101, amount: 2_000_000, method: "transfer", receivedOn: "2026-11-05", idempotencyKey: key,
    });
    expect(pay.allocations).toEqual([{ invoiceId: inv101, amount: 2_000_000 }]);
    // Bấm hai lần: không ghi trùng.
    const again = await recordPayment(a, {
      leaseId: lease101, amount: 2_000_000, method: "transfer", receivedOn: "2026-11-05", idempotencyKey: key,
    });
    expect(again.duplicate).toBe(true);

    const after = await resolveShareLink(token);
    expect(after?.paid).toBe(2_000_000);
    expect(after?.qrPayload).toContain("54071620000");

    // Trả thừa: phần dư thành tiền trả trước.
    const over = await recordPayment(a, {
      leaseId: lease101, amount: 2_000_000, method: "cash", receivedOn: "2026-11-06", idempotencyKey: randomUUID(),
    });
    expect(over.unallocated).toBe(380_000);
    expect((await resolveShareLink(token))?.qrPayload).toBeNull();
  });

  it("không hủy được hóa đơn đã có thanh toán; hủy thanh toán trước", async () => {
    const [inv] = await withOrg(a, (tx) => tx.select().from(s.invoices).where(eq(s.invoices.leaseId, lease101)));
    await expect(voidInvoice(a, inv!.id, "nhầm")).rejects.toThrow(/hủy thanh toán trước/);
    const pays = await withOrg(a, (tx) => tx.select().from(s.payments).where(eq(s.payments.leaseId, lease101)));
    for (const p of pays) await voidPayment(a, p.id, "ghi nhầm");
    await voidInvoice(a, inv!.id, "lập lại");
    const [v] = await withOrg(a, (tx) => tx.select().from(s.invoices).where(eq(s.invoices.id, inv!.id)));
    expect(v!.status).toBe("void");
    const logs = await withOrg(a, (tx) => tx.select().from(s.auditLogs).where(eq(s.auditLogs.entityId, inv!.id)));
    expect(logs.map((l) => l.action)).toContain("invoice.void");
  });

  it("chuyển đi: điều chỉnh trừ cọc trên hóa đơn cuối", async () => {
    await moveOut(a, lease102, "2026-11-20");
    const [inv] = await withOrg(a, (tx) => tx.select().from(s.invoices).where(eq(s.invoices.leaseId, lease102)));
    await adjustInvoice(a, inv!.id, -1_000_000, "Trừ một phần tiền cọc");
    const [after] = await withOrg(a, (tx) => tx.select().from(s.invoices).where(eq(s.invoices.id, inv!.id)));
    expect(after!.total).toBe(533_000);
    await expect(adjustInvoice(a, inv!.id, -10, "")).rejects.toThrow(/lý do/);
  });

  it("hợp đồng chồng thời gian trên cùng phòng bị chặn", async () => {
    await expect(
      createLease(a, { unitId: p101, tenant: { fullName: "X" }, startDate: "2026-06-01", deposit: 0, occupants: 1, rent: 1 }),
    ).rejects.toThrow(/đã có hợp đồng/);
  });

  it("thiếu chỉ số thì báo lỗi, không tạo nháp", async () => {
    const nov = await openPeriod(a, propertyId, "2026-11-01", "2026-11-30");
    const res = await generateDrafts(a, nov);
    const r101 = res.find((r) => r.unitCode === "101")!;
    expect(r101.invoiceId).toBeNull();
    expect(r101.errors.map((e) => e.code)).toEqual(["missing_reading_end"]);
  });

  it("đăng nhập và phiên", async () => {
    const email = `dn-${randomUUID().slice(0, 8)}@example.com`;
    await signUpOwner({ email, password: "matkhau123", displayName: "Dũng", orgName: "Trọ Dũng" });
    expect(await signIn(email, "sai-mat-khau")).toBeNull();
    const ok = await signIn(email.toUpperCase(), "matkhau123");
    expect(ok).not.toBeNull();
    expect((await userFromSession(ok!.token))?.displayName).toBe("Dũng");
  });
});

describe("cô lập dữ liệu giữa hai chủ trọ", () => {
  it("chủ trọ B không đọc, không sửa được dữ liệu của A", async () => {
    const a = await newOwner("a2");
    const b = await newOwner("b2");
    const pa = await createProperty(a, { name: "Trọ A" });
    await importUnits(a, pa, [{ code: "A1" }]);

    const seenByB = await withOrg(b, async (tx) => ({
      properties: await tx.select().from(s.properties),
      units: await tx.select().from(s.units),
      meters: await tx.select().from(s.meters),
      audit: await tx.select().from(s.auditLogs),
    }));
    expect(seenByB.properties).toEqual([]);
    expect(seenByB.units).toEqual([]);
    expect(seenByB.meters).toEqual([]);
    expect(seenByB.audit.every((l) => l.orgId === b.orgId)).toBe(true);

    // B cố sửa phòng của A theo id: không dòng nào bị ảnh hưởng.
    const unitA = await unitByCode(a, pa, "A1");
    const updated = await withOrg(b, (tx) => tx.update(s.units).set({ code: "HACK" }).where(eq(s.units.id, unitA.id)).returning());
    expect(updated).toEqual([]);
    // B cố chèn dòng mang org_id của A: bị RLS chặn.
    await expect(
      withOrg(b, (tx) => tx.insert(s.units).values({ orgId: a.orgId, propertyId: pa, code: "X" })),
    ).rejects.toThrow();
    // B gọi nghiệp vụ với id của A: không tìm thấy.
    await expect(importUnits(b, pa, [{ code: "B1" }])).rejects.toThrow(/Không tìm thấy cơ sở/);
  });

  it("không đặt tổ chức thì không thấy dữ liệu nào", async () => {
    const rows = await getDb().select().from(s.units);
    expect(rows).toEqual([]);
  });

  it("nhân viên không chốt được hóa đơn", async () => {
    const a = await newOwner("a3");
    const staff: Actor = { ...a, role: "staff" };
    await expect(issueInvoices(staff, [randomUUID()])).rejects.toThrow(/không có quyền/);
    await expect(createProperty(staff, { name: "x" })).rejects.toThrow(/không có quyền/);
  });
});
