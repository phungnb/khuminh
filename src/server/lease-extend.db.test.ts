// Gia hạn hợp đồng: chỉ chủ trọ, chỉ hợp đồng đang ở, có nhật ký; tính ngày gia hạn theo tháng.

import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import { beforeAll, describe, expect, it } from "vitest";
import { withOrg } from "@/db/client";
import * as s from "@/db/schema";
import type { Actor } from "./audit";
import { actorFor, signUpOwner } from "./auth";
import { createLease, createProperty, extendedDate, extendLease, importUnits, moveOut } from "./setup";
import { acceptStaffInvite, createStaffInvite } from "./staff";

describe("extendedDate", () => {
  it("cộng tháng, giữ ngày, kẹp cuối tháng", () => {
    expect(extendedDate("2026-12-31", 6, "2026-10-15")).toBe("2027-06-30");
    expect(extendedDate("2026-11-15", 12, "2026-10-15")).toBe("2027-11-15");
    expect(extendedDate("2027-08-31", 6, "2026-10-15")).toBe("2028-02-29");
  });
  it("hạn cũ đã qua hoặc chưa có thì tính từ hôm nay", () => {
    expect(extendedDate("2026-09-30", 6, "2026-10-15")).toBe("2027-04-15");
    expect(extendedDate(null, 12, "2026-10-15")).toBe("2027-10-15");
  });
});

describe("extendLease", () => {
  let a: Actor;
  let p: string;
  let lease: string;

  beforeAll(async () => {
    const { userId } = await signUpOwner({
      email: `gh-${randomUUID().slice(0, 8)}@example.com`, password: "matkhau123", displayName: "GH", orgName: "Trọ GH",
    });
    a = (await actorFor(userId))!;
    p = await createProperty(a, { name: "Dãy GH" });
    await importUnits(a, p, [{ code: "1" }, { code: "2" }]);
    const units = await withOrg(a, (tx) => tx.select().from(s.units).where(eq(s.units.propertyId, p)));
    lease = await createLease(a, {
      unitId: units.find((u) => u.code === "1")!.id, tenant: { fullName: "An" }, startDate: "2026-01-01",
      expiresOn: "2026-09-30", deposit: 0, occupants: 1, rent: 1_000_000,
    });
  });

  it("gia hạn, ghi nhật ký; ngày trước ngày vào ở bị chặn", async () => {
    await extendLease(a, lease, "2027-03-31");
    const [l] = await withOrg(a, (tx) => tx.select().from(s.leases).where(eq(s.leases.id, lease)));
    expect(l!.expiresOn).toBe("2027-03-31");
    const logs = await withOrg(a, (tx) => tx.select().from(s.auditLogs).where(eq(s.auditLogs.entityId, lease)));
    expect(logs.map((x) => x.action)).toContain("lease.extend");
    await expect(extendLease(a, lease, "2025-12-31")).rejects.toThrow(/sau ngày vào ở/);
    await expect(extendLease(a, lease, "31/12/2027")).rejects.toThrow();
  });

  it("nhân viên không gia hạn được; chủ trọ khác không thấy hợp đồng", async () => {
    const { token } = await createStaffInvite(a, p);
    const staffId = await acceptStaffInvite(token, {
      email: `nv-${randomUUID().slice(0, 8)}@example.com`, password: "matkhau123", displayName: "NV",
    });
    await expect(extendLease((await actorFor(staffId))!, lease, "2027-12-31")).rejects.toThrow(/không có quyền/);
    const { userId } = await signUpOwner({
      email: `gh-b-${randomUUID().slice(0, 8)}@example.com`, password: "matkhau123", displayName: "B", orgName: "Trọ B",
    });
    await expect(extendLease((await actorFor(userId))!, lease, "2027-12-31")).rejects.toThrow(/Không tìm thấy/);
  });

  it("hợp đồng đã chuyển đi không gia hạn được", async () => {
    await moveOut(a, lease, "2026-10-10");
    await expect(extendLease(a, lease, "2027-12-31")).rejects.toThrow(/đang ở/);
  });
});
