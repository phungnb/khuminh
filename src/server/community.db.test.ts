// Kiểm thử nhân viên, bảng tin, thông báo đẩy và xuất Excel trên Postgres thật.

import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import ExcelJS from "exceljs";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { getDb, withOrg } from "@/db/client";
import * as s from "@/db/schema";
import type { Actor } from "./audit";
import { actorFor, signUpOwner } from "./auth";
import { generateDrafts, issueInvoices } from "./billing";
import { closePost, createPost, listPosts, managerBoardViewer, tenantBoardViewer } from "./board";
import { exportPeriodXlsx } from "./export";
import { notifyInvoicesIssued, saveSubscription, setPushSenderForTests, type PushMessage } from "./push";
import { getProperty, listProperties } from "./queries";
import { createLease, createProperty, importUnits, moveOut, openPeriod } from "./setup";
import { acceptStaffInvite, createStaffInvite, listStaff, removeStaff, resolveStaffInvite } from "./staff";
import { acceptTenantInvite, createTenantInvite } from "./tenant";

const sent: Array<{ endpoint: string; msg: PushMessage }> = [];

async function newOwner(name: string): Promise<Actor> {
  const { userId } = await signUpOwner({
    email: `${name}-${randomUUID().slice(0, 8)}@example.com`,
    password: "matkhau123",
    displayName: name,
    orgName: `Nhà trọ ${name}`,
  });
  return (await actorFor(userId))!;
}

const phone = () => `09${String(Math.floor(Math.random() * 1e8)).padStart(8, "0")}`;

describe("cộng đồng khu trọ", () => {
  let a: Actor;
  let p1: string;
  let p2: string;
  let lease101: string;
  let lease102: string;
  let tenant101: string;
  let tenant102: string;
  let periodId: string;

  beforeAll(async () => {
    setPushSenderForTests(async (sub, msg) => {
      sent.push({ endpoint: sub.endpoint, msg });
      return sub.endpoint.endsWith("/gone") ? "gone" : "ok";
    });
    a = await newOwner("cd");
    p1 = await createProperty(a, { name: "Dãy 1" });
    p2 = await createProperty(a, { name: "Dãy 2" });
    await importUnits(a, p1, [{ code: "101" }, { code: "102" }], []);
    const us = await withOrg(a, (tx) => tx.select().from(s.units).where(eq(s.units.propertyId, p1)));
    const unit = (c: string) => us.find((u) => u.code === c)!.id;
    lease101 = await createLease(a, { unitId: unit("101"), tenant: { fullName: "Bình" }, startDate: "2026-01-01", deposit: 0, occupants: 1, rent: 3_000_000 });
    lease102 = await createLease(a, { unitId: unit("102"), tenant: { fullName: "Chi" }, startDate: "2026-01-01", deposit: 0, occupants: 1, rent: 2_000_000 });
    tenant101 = await acceptTenantInvite((await createTenantInvite(a, lease101)).token, { phone: phone(), password: "abcdef12" });
    tenant102 = await acceptTenantInvite((await createTenantInvite(a, lease102)).token, { phone: phone(), password: "abcdef12" });
    periodId = await openPeriod(a, p1, "2026-10-01", "2026-10-31");
  });

  afterAll(() => setPushSenderForTests(null));

  it("nhân viên chỉ thấy cơ sở được giao, không phát hành được", async () => {
    const { token } = await createStaffInvite(a, p1);
    expect((await resolveStaffInvite(token))?.propertyName).toBe("Dãy 1");
    const email = `nv-${randomUUID().slice(0, 8)}@example.com`;
    const userId = await acceptStaffInvite(token, { email, password: "matkhau123", displayName: "Nhân viên" });
    expect(await resolveStaffInvite(token)).toBeNull();
    const staff = (await actorFor(userId))!;
    expect(staff.role).toBe("staff");
    expect((await listProperties(staff)).map((p) => p.name)).toEqual(["Dãy 1"]);
    expect(await getProperty(staff, p2)).toBeNull();
    await expect(issueInvoices(staff, [randomUUID()])).rejects.toThrow(/không có quyền/);
    await expect(createStaffInvite(staff, p1)).rejects.toThrow(/không có quyền/);
    expect((await listStaff(a, p1)).map((x) => x.email)).toEqual([email]);

    await removeStaff(a, p1, userId);
    expect(await actorFor(userId)).toBeNull();
  });

  it("bảng tin: người thuê đăng rao, chủ trọ đăng thông báo và gửi thông báo đẩy", async () => {
    await saveSubscription(tenant101, { endpoint: "https://push.example/101", p256dh: "k", auth: "a" });
    await saveSubscription(tenant102, { endpoint: "https://push.example/gone", p256dh: "k", auth: "a" });

    const t1 = await tenantBoardViewer(tenant101, a.orgId, p1);
    await expect(createPost(t1, { kind: "announcement", title: "x" })).rejects.toThrow(/Chỉ chủ trọ/);
    const sellId = await createPost(t1, { kind: "sell", title: "Bán quạt đứng", body: "Còn mới", price: 150_000 });

    const m = await managerBoardViewer(a, p1);
    sent.length = 0;
    await createPost(m, { kind: "announcement", title: "Cúp nước sáng thứ Bảy" });
    expect(sent.map((x) => x.endpoint).sort()).toEqual(["https://push.example/101", "https://push.example/gone"]);
    expect(sent[0]!.msg.title).toBe("Thông báo từ chủ trọ");
    // Đăng ký đã bị trình duyệt hủy thì bị xóa.
    const subs = await getDb().select().from(s.pushSubscriptions).where(eq(s.pushSubscriptions.userId, tenant102));
    expect(subs).toEqual([]);

    const t2 = await tenantBoardViewer(tenant102, a.orgId, p1);
    const seen = await listPosts(t2);
    expect(seen.map((p) => p.title)).toEqual(["Cúp nước sáng thứ Bảy", "Bán quạt đứng"]);
    expect(seen[0]!.fromManager).toBe(true);
    expect(seen[1]!.price).toBe(150_000);

    // Người khác không gỡ được bài; chủ trọ ẩn được, người thuê không còn thấy.
    await expect(closePost(t2, sellId, "close")).rejects.toThrow(/không có quyền/);
    await closePost(t1, sellId, "close");
    expect((await listPosts(t2)).find((p) => p.id === sellId)?.closed).toBe(true);
    await closePost(m, sellId, "remove");
    expect((await listPosts(t2)).some((p) => p.id === sellId)).toBe(false);
    expect((await listPosts(m)).find((p) => p.id === sellId)?.hidden).toBe(true);
  });

  it("người thuê không vào bảng tin cơ sở khác hoặc sau khi chuyển đi", async () => {
    await expect(tenantBoardViewer(tenant101, a.orgId, p2)).rejects.toThrow(/không còn ở/);
    const b = await newOwner("cd-b");
    await expect(tenantBoardViewer(tenant101, b.orgId, p1)).rejects.toThrow(/không còn ở/);
    await moveOut(a, lease102, "2026-01-31");
    await expect(tenantBoardViewer(tenant102, a.orgId, p1)).rejects.toThrow(/không còn ở/);
  });

  it("phát hành hóa đơn gửi thông báo đẩy cho người thuê; xuất Excel đúng số", async () => {
    const drafts = await generateDrafts(a, periodId);
    const ids = drafts.filter((d) => d.invoiceId).map((d) => d.invoiceId!);
    await issueInvoices(a, ids);
    sent.length = 0;
    expect(await notifyInvoicesIssued(a, ids)).toBe(1);
    expect(sent[0]!.msg.title).toBe("Hóa đơn phòng 101");
    expect(sent[0]!.msg.body).toContain("3.000.000đ");

    const file = (await exportPeriodXlsx(a, p1, periodId))!;
    expect(file.filename).toBe("hoa-don-2026-10.xlsx");
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(file.data as unknown as ArrayBuffer);
    const ws = wb.getWorksheet("Hóa đơn")!;
    expect(ws.getRow(4).getCell(1).value).toBe("101");
    expect(ws.getRow(4).getCell(6).value).toBe(3_000_000);
    expect(wb.getWorksheet("Chi tiết")!.rowCount).toBeGreaterThan(1);
    // Kỳ của cơ sở khác: không xuất.
    expect(await exportPeriodXlsx(a, p2, periodId)).toBeNull();
  });
});
