// Tái hiện lỗi hủy hóa đơn rồi lập lại (phát hiện khi thử live 30/10/2026):
// hủy hóa đơn đã phát hành xong bấm "Lập nháp cả kỳ" thì báo "Có lỗi hệ thống".
// Nguyên nhân: mã hóa đơn (invoices_code unique theo org) vẫn bị hóa đơn đã hủy giữ,
// generateDrafts chèn hóa đơn mới cùng mã nên vi phạm unique.
// Chạy với DB test (vitest.db.config.ts).

import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import { beforeAll, describe, expect, it } from "vitest";
import { withOrg } from "@/db/client";
import * as s from "@/db/schema";
import type { Actor } from "./audit";
import { actorFor, signUpOwner } from "./auth";
import { generateDrafts, issueInvoices, voidInvoice } from "./billing";
import { createLease, createProperty, importUnits, moveOut, openPeriod } from "./setup";
import { settlementContext } from "./deposit";

async function newOwner(name: string): Promise<Actor> {
  const { userId } = await signUpOwner({
    email: `${name}-${randomUUID().slice(0, 8)}@example.com`,
    password: "Test123456!",
    displayName: name,
    orgName: `Nhà trọ ${name}`,
  });
  return (await actorFor(userId))!;
}

describe("hủy hóa đơn rồi lập lại", () => {
  let a: Actor;
  let periodId: string;
  let lease101: string;
  let inv101: string;
  let code101: string;

  beforeAll(async () => {
    a = await newOwner("voidrebill");
    const propertyId = await createProperty(a, { name: "Dãy voidrebill" });
    await importUnits(a, propertyId, [{ code: "101" }], []);
    const units = await withOrg(a, (tx) => tx.select().from(s.units).where(eq(s.units.propertyId, propertyId)));
    lease101 = await createLease(a, {
      unitId: units[0]!.id, tenant: { fullName: "Bình", phone: null },
      startDate: "2026-01-01", deposit: 0, occupants: 1, rent: 3_000_000,
    });
    periodId = await openPeriod(a, propertyId, "2026-10-01", "2026-10-31");
    const drafts = await generateDrafts(a, periodId);
    inv101 = drafts.find((d) => d.unitCode === "101")!.invoiceId!;
    await issueInvoices(a, [inv101]);
    const [inv] = await withOrg(a, (tx) => tx.select().from(s.invoices).where(eq(s.invoices.id, inv101)));
    code101 = inv!.code;
  });

  it("hủy rồi lập lại: tạo được nháp mới, giữ nguyên mã cũ cho hóa đơn mới", async () => {
    await voidInvoice(a, inv101, "lập lại");
    // Giả lập hóa đơn hủy TỪ TRƯỚC bản sửa (vẫn giữ mã gốc): trả mã về như cũ
    // rồi mới lập lại — đường sửa trong generateDrafts phải tự đổi mã của nó.
    await withOrg(a, (tx) =>
      tx.update(s.invoices).set({ code: code101 }).where(eq(s.invoices.id, inv101)),
    );
    const res = await generateDrafts(a, periodId);
    const row = res.find((r) => r.unitCode === "101")!;
    expect(row.errors).toEqual([]);
    expect(row.invoiceId).not.toBeNull();
    expect(row.invoiceId).not.toBe(inv101);
    const [created] = await withOrg(a, (tx) => tx.select().from(s.invoices).where(eq(s.invoices.id, row.invoiceId!)));
    expect(created!.status).toBe("draft");
    expect(created!.code).toBe(code101);
    // Hóa đơn đã hủy vẫn còn (giữ chứng từ), nhưng đã nhường mã.
    const [old] = await withOrg(a, (tx) => tx.select().from(s.invoices).where(eq(s.invoices.id, inv101)));
    expect(old!.status).toBe("void");
    expect(old!.code).not.toBe(code101);
  });

  it("hủy rồi lập lại lần 2: vẫn tạo được nháp (không đụng mã đã hủy trước đó)", async () => {
    const [draft] = await withOrg(a, (tx) =>
      tx.select().from(s.invoices).where(eq(s.invoices.leaseId, lease101)),
    );
    // Phát hành nháp vừa lập lại rồi hủy tiếp, rồi lập lại lần nữa.
    const drafts = await generateDrafts(a, periodId);
    const again = drafts.find((d) => d.unitCode === "101")!;
    await issueInvoices(a, [again.invoiceId!]);
    await voidInvoice(a, again.invoiceId!, "lập lại lần 2");
    const res = await generateDrafts(a, periodId);
    const row = res.find((r) => r.unitCode === "101")!;
    expect(row.errors).toEqual([]);
    expect(row.invoiceId).not.toBeNull();
    expect(row.invoiceId).not.toBe(again.invoiceId);
    expect(draft).toBeDefined();

    // Hết kẹt quyết toán cọc: trả phòng rồi lập + phát hành hóa đơn cuối
    // thì settlementContext không còn blocker.
    await moveOut(a, lease101, "2026-10-31");
    const finalDrafts = await generateDrafts(a, periodId);
    const final = finalDrafts.find((d) => d.unitCode === "101")!;
    expect(final.errors).toEqual([]);
    await issueInvoices(a, [final.invoiceId!]);
    const ctx = await settlementContext(a, lease101);
    expect(ctx!.blocker).toBeNull();
  });
});
