// Hủy nháp + tự tính lại sau trả phòng (mục 4, đợt kiểm thử non-tech 30/10/2026).
// Chạy với DB test (vitest.db.config.ts).

import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import { beforeAll, describe, expect, it } from "vitest";
import { withOrg } from "@/db/client";
import * as s from "@/db/schema";
import type { Actor } from "./audit";
import { actorFor, signUpOwner } from "./auth";
import { deleteDraftInvoice, generateDrafts, issueInvoices, refreshDraftsAfterMoveOut } from "./billing";
import { createLease, createProperty, importUnits, moveOut, openPeriod, setFeeRule } from "./setup";

async function newOwner(name: string): Promise<Actor> {
  const { userId } = await signUpOwner({
    email: `${name}-${randomUUID().slice(0, 8)}@example.com`,
    password: "Test123456!",
    displayName: name,
    orgName: `Nhà trọ ${name}`,
  });
  return (await actorFor(userId))!;
}

describe("hủy nháp + tính lại sau trả phòng", () => {
  let a: Actor;
  let propertyId: string;
  let periodId: string;
  let lease101: string;

  beforeAll(async () => {
    a = await newOwner("draft");
    propertyId = await createProperty(a, { name: "Dãy draft" });
    await importUnits(a, propertyId, [{ code: "101" }], ["electricity"]);
    const units = await withOrg(a, (tx) => tx.select().from(s.units).where(eq(s.units.propertyId, propertyId)));
    lease101 = await createLease(a, {
      unitId: units[0]!.id, tenant: { fullName: "Bình", phone: null },
      startDate: "2026-01-01", deposit: 0, occupants: 1, rent: 3_000_000,
    });
    periodId = await openPeriod(a, propertyId, "2026-10-01", "2026-10-31");
  });

  it("hủy nháp: xóa hẳn, lập lại được nháp mới; hóa đơn đã phát hành thì không hủy nháp được", async () => {
    const drafts = await generateDrafts(a, periodId);
    const invId = drafts.find((d) => d.unitCode === "101")!.invoiceId!;
    await deleteDraftInvoice(a, invId);
    const gone = await withOrg(a, (tx) => tx.select().from(s.invoices).where(eq(s.invoices.id, invId)));
    expect(gone.length).toBe(0);
    const again = await generateDrafts(a, periodId);
    const row = again.find((d) => d.unitCode === "101")!;
    expect(row.errors).toEqual([]);
    expect(row.invoiceId).not.toBeNull();
    expect(row.invoiceId).not.toBe(invId);
    await issueInvoices(a, [row.invoiceId!]);
    await expect(deleteDraftInvoice(a, row.invoiceId!)).rejects.toThrow(/Chỉ hủy được hóa đơn nháp/);
  });

  it("trả phòng giữa tháng: nháp tự tính lại theo ngày ở, tổng giảm", async () => {
    // Nháp hiện tại đã phát hành ở test trên; hủy hóa đơn đó rồi lập nháp mới để test.
    const [issued] = await withOrg(a, (tx) => tx.select().from(s.invoices).where(eq(s.invoices.leaseId, lease101)));
    await withOrg(a, (tx) => tx.update(s.invoices).set({ status: "draft" }).where(eq(s.invoices.id, issued!.id)));
    await moveOut(a, lease101, "2026-10-15");
    const res = await refreshDraftsAfterMoveOut(a, propertyId, lease101, "2026-10-15");
    expect(res).not.toBeNull();
    expect(res!.errors).toEqual([]);
    expect(res!.invoiceId).not.toBeNull();
    const [inv] = await withOrg(a, (tx) => tx.select().from(s.invoices).where(eq(s.invoices.id, res!.invoiceId!)));
    expect(inv!.status).toBe("draft");
    // Ở 15/31 ngày: tiền phòng theo ngày, nhỏ hơn hẳn 3.000.000đ đủ tháng.
    expect(inv!.total).toBeLessThan(3_000_000);
    expect(inv!.total).toBeGreaterThan(1_000_000);
  });

  it("tính lại lỗi (thiếu chỉ số) thì giữ nháp cũ, không xóa trắng", async () => {
    const [before] = await withOrg(a, (tx) => tx.select().from(s.invoices).where(eq(s.invoices.leaseId, lease101)));
    expect(before!.status).toBe("draft");
    await setFeeRule(a, {
      propertyId, key: "electricity", name: "Điện", method: "metered", meterKind: "electricity",
      unitPrice: 3_500, unitLabel: "kWh", prorate: false, effectiveFrom: "2026-01-01",
    });
    // Không ghi chỉ số nào: tính lại lỗi thiếu chỉ số.
    const res = await generateDrafts(a, periodId);
    const row = res.find((r) => r.unitCode === "101")!;
    expect(row.errors.length).toBeGreaterThan(0);
    const [kept] = await withOrg(a, (tx) => tx.select().from(s.invoices).where(eq(s.invoices.id, before!.id)));
    expect(kept).toBeDefined();
    expect(kept!.status).toBe("draft");
  });
});
