// Kiểm thử P0 (sơ đồ tầng) + P1 (xe, sổ chi) — chạy với DB test (vitest.db.config.ts).

import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import { beforeAll, describe, expect, it } from "vitest";
import { withOrg } from "@/db/client";
import * as s from "@/db/schema";
import type { Actor } from "./audit";
import { actorFor, signUpOwner } from "./auth";
import { generateDrafts, issueInvoices } from "./billing";
import { groupRoomsByFloor, roomStatus } from "@/domain/rooms";
import { recordPayment } from "./payments";
import { today, unitsOverview } from "./queries";
import { createLease, createProperty, importUnits, openPeriod } from "./setup";
import { addExpense, deleteExpense, listExpenses, monthlyCashflow } from "./expenses";
import { addVehicle, deleteVehicle, listVehicles } from "./vehicles";

async function newOwner(name: string): Promise<Actor> {
  const { userId } = await signUpOwner({
    email: `${name}-${randomUUID().slice(0, 8)}@example.com`,
    password: "Test123456!",
    displayName: name,
    orgName: `Nhà trọ ${name}`,
  });
  return (await actorFor(userId))!;
}

/** Một cơ sở 4 phòng (101, 102, 201 ghi tầng 2, P1), 101 + 102 đã thuê, hóa đơn tháng 10 đã phát hành. */
async function setupOrg(name: string) {
  const a = await newOwner(name);
  const propertyId = await createProperty(a, { name: `Dãy ${name}` });
  await importUnits(a, propertyId, [{ code: "101" }, { code: "102" }, { code: "201", floor: 2 }, { code: "P1" }], []);
  const units = await withOrg(a, (tx) => tx.select().from(s.units).where(eq(s.units.propertyId, propertyId)));
  const unit = (code: string) => units.find((u) => u.code === code)!.id;
  const lease101 = await createLease(a, {
    unitId: unit("101"), tenant: { fullName: "Bình", phone: null }, startDate: "2026-01-01", deposit: 0, occupants: 1, rent: 3_000_000,
  });
  const lease102 = await createLease(a, {
    unitId: unit("102"), tenant: { fullName: "Chi" }, startDate: "2026-01-01", deposit: 0, occupants: 1, rent: 2_000_000,
  });
  const periodId = await openPeriod(a, propertyId, "2026-10-01", "2026-10-31");
  const drafts = await generateDrafts(a, periodId);
  await issueInvoices(a, drafts.map((d) => d.invoiceId!));
  const inv101 = drafts.find((d) => d.unitCode === "101")!.invoiceId!;
  return { a, propertyId, unit101: unit("101"), unit102: unit("102"), lease101, lease102, inv101 };
}

describe("sơ đồ tầng + xe + sổ chi", () => {
  let o: Awaited<ReturnType<typeof setupOrg>>;

  beforeAll(async () => {
    o = await setupOrg("tro");
    // Trả đủ hóa đơn tháng 10 của phòng 101 trong tháng 10; phòng 102 để nợ.
    const [inv] = await withOrg(o.a, (tx) => tx.select().from(s.invoices).where(eq(s.invoices.id, o.inv101)));
    await recordPayment(o.a, {
      leaseId: o.lease101, amount: inv!.total, method: "transfer", receivedOn: "2026-10-15", idempotencyKey: randomUUID(),
    });
  });

  it("tầng: mã 101 suy ra tầng 1, mã ghi tay giữ nguyên, mã lạ chưa xếp tầng", async () => {
    const units = await unitsOverview(o.a, o.propertyId, "2026-10-30");
    const groups = groupRoomsByFloor(units);
    expect(groups.map((g) => g.floor)).toEqual([1, 2, null]);
    expect(groups[0]!.rooms.map((r) => r.code)).toEqual(["101", "102"]);
    expect(groups[1]!.rooms.map((r) => r.code)).toEqual(["201"]);
    expect(groups[2]!.rooms.map((r) => r.code)).toEqual(["P1"]);
    expect(units.find((u) => u.code === "201")!.floor).toBe(2);
  });

  it("nợ: phòng trả đủ không nợ, phòng chưa trả quá hạn thì nợ", async () => {
    const units = await unitsOverview(o.a, o.propertyId, "2026-12-01");
    expect(units.find((u) => u.code === "101")!.overdue).toBe(false);
    const u102 = units.find((u) => u.code === "102")!;
    expect(u102.overdue).toBe(true);
    expect(roomStatus(u102, "2026-12-01", 30)).toBe("no");
  });

  it("nhập phòng: tầng ngoài 0–100 bị từ chối", async () => {
    const res = await importUnits(o.a, o.propertyId, [{ code: "999", floor: 101 }], []);
    expect(res.created).toBe(0);
    expect(res.errors.length).toBe(1);
  });

  it("xe: thêm/xem/xóa, xe gắn với người đang thuê", async () => {
    const id = await addVehicle(o.a, { unitId: o.unit101, plate: "59A1-12345", kind: "Xe máy", monthlyFee: 100_000, note: null });
    const rows = await listVehicles(o.a, o.unit101);
    expect(rows.length).toBe(1);
    expect(rows[0]!.plate).toBe("59A1-12345");
    expect(rows[0]!.monthlyFee).toBe(100_000);
    const [lease] = await withOrg(o.a, (tx) => tx.select().from(s.leases).where(eq(s.leases.id, o.lease101)));
    expect(rows[0]!.tenantId).toBe(lease!.tenantId);
    await expect(addVehicle(o.a, { unitId: o.unit101, plate: "X", kind: "Máy bay", monthlyFee: 0, note: null })).rejects.toThrow();
    await deleteVehicle(o.a, id);
    expect(await listVehicles(o.a, o.unit101)).toEqual([]);
  });

  it("xe: tổ chức khác không thấy xe của mình (RLS theo org)", async () => {
    await addVehicle(o.a, { unitId: o.unit101, plate: "59A1-99999", kind: "Ô tô", monthlyFee: 0, note: null });
    const other = await newOwner("trolac");
    expect(await listVehicles(other, o.unit101)).toEqual([]);
    const rows = await listVehicles(o.a, o.unit101);
    await deleteVehicle(o.a, rows[0]!.id);
  });

  it("sổ chi: ghi/xóa + thu-chi tháng theo dòng tiền thực", async () => {
    await addExpense(o.a, { propertyId: o.propertyId, spentOn: "2026-10-20", category: "Sửa chữa", amount: 500_000, note: "Sửa ống nước" });
    const nov = await addExpense(o.a, { propertyId: o.propertyId, spentOn: "2026-11-05", category: "Vận hành", amount: 200_000, note: null });
    const oct = await monthlyCashflow(o.a, o.propertyId, "2026-10");
    const [inv] = await withOrg(o.a, (tx) => tx.select().from(s.invoices).where(eq(s.invoices.id, o.inv101)));
    expect(oct.collected).toBe(inv!.total);
    expect(oct.expenses).toBe(500_000);
    expect(oct.balance).toBe(inv!.total - 500_000);
    // Phải thu tính theo tháng phát hành hóa đơn (issued_at = lúc chạy test).
    const issueMonth = await monthlyCashflow(o.a, o.propertyId, today().slice(0, 7));
    expect(issueMonth.receivable).toBeGreaterThan(0);
    const novCash = await monthlyCashflow(o.a, o.propertyId, "2026-11");
    expect(novCash.expenses).toBe(200_000);
    await deleteExpense(o.a, nov);
    expect((await monthlyCashflow(o.a, o.propertyId, "2026-11")).expenses).toBe(0);
    const rows = await listExpenses(o.a, o.propertyId, 10);
    expect(rows.some((r) => r.category === "Sửa chữa" && r.amount === 500_000)).toBe(true);
    await expect(addExpense(o.a, { propertyId: o.propertyId, spentOn: "2026-10-21", category: "Ăn uống", amount: 1_000, note: null })).rejects.toThrow();
  });
});
