// Kiểm thử admin nền tảng trên Postgres thật: người thường bị chặn ở mọi hàm, app không chạm bảng admin,
// admin chỉ thấy số tổng và tin bị báo cáo (không có liên hệ).

import { randomUUID } from "node:crypto";
import { sql } from "drizzle-orm";
import postgres from "postgres";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { withUser } from "@/db/client";
import * as s from "@/db/schema";
import { adminStats, isPlatformAdmin, recentAdminActions, reportedListings, setListingHidden, setUserLocked } from "./admin";
import { actorFor, signIn, signUpOwner, userFromSession } from "./auth";
import { createListing, reportListing, searchListings, setPropertyLocation } from "./market";
import { createLease, createProperty, importUnits } from "./setup";
import { acceptStaffInvite, createStaffInvite } from "./staff";
import { acceptTenantInvite, createTenantInvite } from "./tenant";

// Xa các test chợ khác (quận 1) để tin của file này không lọt vào kết quả tìm theo bán kính của chúng.
const CENTER = { lat: 21.03, lng: 105.85 };
const owner = postgres(process.env.TEST_OWNER_DATABASE_URL!, { max: 1, onnotice: () => {} });

async function newUser(name: string) {
  const { userId } = await signUpOwner({
    email: `${name}-${randomUUID().slice(0, 8)}@example.com`,
    password: "matkhau123",
    displayName: name,
    orgName: `Nhà trọ ${name}`,
  });
  return userId;
}

describe("admin nền tảng", () => {
  let admin: string;
  let normal: string;
  let listingId: string;

  beforeAll(async () => {
    admin = await newUser("admin");
    normal = await newUser("thuong");
    await owner`insert into platform_admins (user_id) values (${admin})`;
    const a = (await actorFor(normal))!;
    const p = await createProperty(a, { name: "Khu báo cáo" });
    await setPropertyLocation(a, p, CENTER);
    listingId = await createListing(normal, {
      kind: "sell",
      category: "Khác",
      title: "Tin bị báo cáo",
      contact: "0909123456",
      placeKey: `${a.orgId}.${p}`,
    });
    await reportListing(admin, listingId, "Lừa đảo");
  });

  afterAll(() => owner.end());

  it("người thường bị chặn ở mọi hàm admin", async () => {
    expect(await isPlatformAdmin(normal)).toBe(false);
    await expect(adminStats(normal)).rejects.toThrow(/quyền/);
    await expect(reportedListings(normal)).rejects.toThrow(/quyền/);
    // Gọi thẳng hàm nội bộ cũng không được (không cấp EXECUTE cho app).
    await expect(withUser(normal, (tx) => tx.execute(sql`select assert_platform_admin()`))).rejects.toThrow();
  });

  it("app không đọc, không ghi được bảng platform_admins, kể cả admin", async () => {
    await expect(withUser(normal, (tx) => tx.select().from(s.platformAdmins))).rejects.toThrow();
    await expect(withUser(normal, (tx) => tx.insert(s.platformAdmins).values({ userId: normal }))).rejects.toThrow();
    await expect(withUser(admin, (tx) => tx.select().from(s.platformAdmins))).rejects.toThrow();
    expect(await isPlatformAdmin(normal)).toBe(false);
  });

  it("admin thấy số tổng và tin bị báo cáo, không có liên hệ người đăng", async () => {
    expect(await isPlatformAdmin(admin)).toBe(true);
    const st = await adminStats(admin);
    expect(st.orgs).toBeGreaterThanOrEqual(2);
    expect(st.properties).toBeGreaterThanOrEqual(1);
    expect(st.openListings).toBeGreaterThanOrEqual(1);
    const rows = await reportedListings(admin);
    const r = rows.find((x) => x.listingId === listingId)!;
    expect(r).toMatchObject({ title: "Tin bị báo cáo", reports: 1, reasons: ["Lừa đảo"], authorName: "thuong", hiddenAt: null });
    expect(JSON.stringify(rows)).not.toContain("0909123456");
  });

  it("T7: người thường không gọi được hàm thao tác; app không đọc nhật ký admin", async () => {
    await expect(setListingHidden(normal, listingId, true, "x")).rejects.toThrow(/quyền/);
    await expect(setUserLocked(normal, admin, true, "x")).rejects.toThrow(/quyền/);
    await expect(recentAdminActions(normal)).rejects.toThrow(/quyền/);
    await expect(withUser(normal, (tx) => tx.select().from(s.adminActions))).rejects.toThrow();
    await expect(withUser(admin, (tx) => tx.insert(s.adminActions).values({ adminUserId: admin, action: "x", targetId: admin }))).rejects.toThrow();
  });

  it("T7: admin ẩn tin (bắt buộc lý do) rồi hiện lại", async () => {
    await expect(setListingHidden(admin, listingId, true, "  ")).rejects.toThrow(/lý do/);
    await setListingHidden(admin, listingId, true, "Lừa đảo");
    expect((await searchListings(admin, CENTER, 3)).map((l) => l.id)).not.toContain(listingId);
    await setListingHidden(admin, listingId, false, "");
    expect((await searchListings(admin, CENTER, 3)).map((l) => l.id)).toContain(listingId);
    const log = await recentAdminActions(admin);
    expect(log.slice(0, 2).map((a) => [a.action, a.reason])).toEqual([["listing.unhide", null], ["listing.hide", "Lừa đảo"]]);
  });

  it("T7: khóa tài khoản: mất phiên, không đăng nhập lại, tin bị ẩn; mở khóa thì đăng nhập lại được", async () => {
    const email = `spam-${randomUUID().slice(0, 8)}@example.com`;
    const { userId: spam } = await signUpOwner({ email, password: "matkhau123", displayName: "Spam", orgName: "Spam" });
    const a = (await actorFor(spam))!;
    const p = await createProperty(a, { name: "Khu spam" });
    await setPropertyLocation(a, p, CENTER);
    const l = await createListing(spam, { kind: "sell", category: "Khác", title: "Hàng giả", contact: "0909000000", placeKey: `${a.orgId}.${p}` });
    const { token } = (await signIn(email, "matkhau123"))!;
    expect((await userFromSession(token))?.id).toBe(spam);

    await expect(setUserLocked(admin, admin, true, "x")).rejects.toThrow(/admin/);
    await expect(setUserLocked(admin, spam, true, "")).rejects.toThrow(/lý do/);
    await setUserLocked(admin, spam, true, "Spam tin giả");

    expect(await userFromSession(token)).toBeNull();
    await expect(signIn(email, "matkhau123")).rejects.toThrow(/bị khóa/);
    // Sai mật khẩu vẫn chỉ báo sai, không lộ là tài khoản bị khóa.
    expect(await signIn(email, "saimatkhau")).toBeNull();
    expect((await searchListings(admin, CENTER, 3)).map((x) => x.id)).not.toContain(l);
    expect((await reportedListings(admin)).find((x) => x.authorUserId === spam)).toBeUndefined();
    expect((await recentAdminActions(admin))[0]).toMatchObject({ action: "user.lock", targetId: spam, reason: "Spam tin giả" });

    await setUserLocked(admin, spam, false, "");
    expect(await signIn(email, "matkhau123")).not.toBeNull();
    // Mở khóa không tự hiện lại tin.
    expect((await searchListings(admin, CENTER, 3)).map((x) => x.id)).not.toContain(l);
  });

  it("T7: chủ trọ, nhân viên, người thuê chưa bị khóa vẫn đăng nhập và giữ phiên bình thường", async () => {
    const email = `chu-${randomUUID().slice(0, 8)}@example.com`;
    const { userId: chu } = await signUpOwner({ email, password: "matkhau123", displayName: "Chủ", orgName: "Trọ" });
    const a = (await actorFor(chu))!;
    const p = await createProperty(a, { name: "Khu thường" });
    const { token: inv } = await createStaffInvite(a, p);
    const nvEmail = `nv-${randomUUID().slice(0, 8)}@example.com`;
    await acceptStaffInvite(inv, { email: nvEmail, password: "matkhau123", displayName: "NV" });
    await importUnits(a, p, [{ code: "P1" }]);
    const [u] = await owner<{ id: string }[]>`select id from units where property_id = ${p}`;
    const lease = await createLease(a, { unitId: u!.id, tenant: { fullName: "Thuê" }, startDate: "2026-01-01", deposit: 0, occupants: 1, rent: 1_000_000 });
    const phone = `09${String(Math.floor(Math.random() * 1e8)).padStart(8, "0")}`;
    await acceptTenantInvite((await createTenantInvite(a, lease)).token, { phone, password: "matkhau123" });
    for (const login of [email, nvEmail, phone]) {
      const res = await signIn(login, "matkhau123");
      expect(res).not.toBeNull();
      expect(await userFromSession(res!.token)).not.toBeNull();
    }
  });
});
