// Kiểm thử admin nền tảng trên Postgres thật: người thường bị chặn ở mọi hàm, app không chạm bảng admin,
// admin chỉ thấy số tổng và tin bị báo cáo (không có liên hệ).

import { randomUUID } from "node:crypto";
import { sql } from "drizzle-orm";
import postgres from "postgres";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { withUser } from "@/db/client";
import * as s from "@/db/schema";
import { adminStats, isPlatformAdmin, reportedListings } from "./admin";
import { actorFor, signUpOwner } from "./auth";
import { createListing, reportListing, setPropertyLocation } from "./market";
import { createProperty } from "./setup";

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
    await setPropertyLocation(a, p, { lat: 10.77, lng: 106.7 });
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
});
