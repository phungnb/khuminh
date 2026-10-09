// Kiểm thử tài khoản người thuê: link mời, đăng nhập bằng SĐT, chỉ thấy hóa đơn của mình.

import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import { beforeAll, describe, expect, it } from "vitest";
import { withOrg, withUser } from "@/db/client";
import * as s from "@/db/schema";
import type { Actor } from "./audit";
import { actorFor, normalizePhone, signIn, signUpOwner } from "./auth";
import { generateDrafts, issueInvoices } from "./billing";
import { createLease, createProperty, importUnits, openPeriod } from "./setup";
import { acceptTenantInvite, createTenantInvite, resolveTenantInvite, tenantHome, tenantInvoice } from "./tenant";

async function newOwner(name: string): Promise<Actor> {
  const { userId } = await signUpOwner({
    email: `${name}-${randomUUID().slice(0, 8)}@example.com`,
    password: "matkhau123",
    displayName: name,
    orgName: `Nhà trọ ${name}`,
  });
  return (await actorFor(userId))!;
}

/** Một cơ sở có hai phòng, mỗi phòng một người thuê, đã phát hành hóa đơn tháng 10. */
async function setupOrg(name: string) {
  const a = await newOwner(name);
  const propertyId = await createProperty(a, { name: `Dãy ${name}` });
  await importUnits(a, propertyId, [{ code: "101" }, { code: "102" }], []);
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
  const inv = (code: string) => drafts.find((d) => d.unitCode === code)!.invoiceId!;
  return { a, lease101, lease102, inv101: inv("101"), inv102: inv("102") };
}

describe("tài khoản người thuê", () => {
  let o: Awaited<ReturnType<typeof setupOrg>>;
  const phone = `09${String(Date.now()).slice(-8)}`;

  beforeAll(async () => {
    o = await setupOrg("tt");
  });

  it("chuẩn hóa số điện thoại", () => {
    expect(normalizePhone("+84 912 345 678")).toBe("0912345678");
    expect(normalizePhone("0912.345.678")).toBe("0912345678");
    expect(normalizePhone("12345")).toBeNull();
  });

  it("nhận lời mời, đăng nhập bằng SĐT, chỉ thấy hóa đơn của mình", async () => {
    const { token } = await createTenantInvite(o.a, o.lease101);
    const info = await resolveTenantInvite(token);
    expect(info?.fullName).toBe("Bình");
    expect(info?.unitCode).toBe("101");

    await expect(acceptTenantInvite(token, { phone: "123", password: "abcdef" })).rejects.toThrow(/không hợp lệ/);
    const userId = await acceptTenantInvite(token, { phone, password: "abcdef" });
    // Link đã dùng thì hết hiệu lực.
    expect(await resolveTenantInvite(token)).toBeNull();
    await expect(acceptTenantInvite(token, { phone, password: "abcdef" })).rejects.toThrow(/hết hạn|đã được dùng/);

    expect(await signIn(phone, "abcdef")).not.toBeNull();
    expect(await signIn(phone, "sai")).toBeNull();

    const home = await tenantHome(userId);
    expect(home).toHaveLength(1);
    expect(home[0]!.unitCode).toBe("101");
    expect(home[0]!.invoices.map((i) => i.id)).toEqual([o.inv101]);
    expect(home[0]!.invoices[0]!.total).toBe(3_000_000);

    expect((await tenantInvoice(userId, o.inv101))?.total).toBe(3_000_000);
    // Hóa đơn phòng bên cạnh, cùng chủ trọ: không xem được.
    expect(await tenantInvoice(userId, o.inv102)).toBeNull();
    expect(await tenantInvoice(userId, "khong-phai-uuid")).toBeNull();
  });

  it("người thuê không phải thành viên quản lý của khu trọ", async () => {
    const { token } = await createTenantInvite(o.a, o.lease102);
    const p2 = `08${String(Date.now()).slice(-8)}`;
    const userId = await acceptTenantInvite(token, { phone: p2, password: "abcdef" });
    expect(await actorFor(userId)).toBeNull();
    // Chưa gắn tổ chức: chỉ thấy hồ sơ người thuê của chính mình, không thấy dữ liệu khác.
    const seen = await withUser(userId, async (tx) => ({
      tenants: await tx.select().from(s.tenants),
      invoices: await tx.select().from(s.invoices),
    }));
    expect(seen.tenants.map((t) => t.fullName)).toEqual(["Chi"]);
    expect(seen.invoices).toEqual([]);
  });

  it("một SĐT thuê ở hai khu dùng chung tài khoản, phải đúng mật khẩu", async () => {
    const o2 = await setupOrg("tt2");
    const { token } = await createTenantInvite(o2.a, o2.lease101);
    await expect(acceptTenantInvite(token, { phone, password: "sai-mat-khau" })).rejects.toThrow(/đã có tài khoản/);
    const userId = await acceptTenantInvite(token, { phone, password: "abcdef" });
    const home = await tenantHome(userId);
    expect(home.map((h) => h.propertyName).sort()).toEqual(["Dãy tt", "Dãy tt2"]);
    // Chủ trọ thứ hai không thấy gì của chủ trọ thứ nhất qua người thuê chung.
    const seen = await withOrg(o2.a, (tx) => tx.select().from(s.tenants));
    expect(seen.every((t) => t.orgId === o2.a.orgId)).toBe(true);
  });

  it("không mời lại người đã có tài khoản; không mời hợp đồng không tồn tại", async () => {
    await expect(createTenantInvite(o.a, o.lease101)).rejects.toThrow(/đã có tài khoản/);
    await expect(createTenantInvite(o.a, randomUUID())).rejects.toThrow(/Không tìm thấy/);
  });
});
