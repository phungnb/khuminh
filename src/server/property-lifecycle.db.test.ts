// Kiểm thử vòng đời khu trên Postgres thật: xóa khu nháp, chặn xóa khu đã có tiền, lưu trữ/khôi phục, phân quyền.

import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { withOrg } from "@/db/client";
import * as s from "@/db/schema";
import type { Actor } from "./audit";
import { actorFor, signUpOwner } from "./auth";
import { marketPlaces, setPropertyLocation } from "./market";
import { archiveProperty, deleteDraftProperty, listArchivedProperties, propertyUsage, restoreProperty } from "./property-lifecycle";
import { listProperties } from "./queries";
import { createLease, createProperty, importUnits, moveOut, openPeriod } from "./setup";
import { acceptStaffInvite, createStaffInvite } from "./staff";
import { acceptTenantInvite, createTenantInvite } from "./tenant";

async function newOwner(name: string): Promise<Actor> {
  const { userId } = await signUpOwner({
    email: `${name}-${randomUUID().slice(0, 8)}@example.com`,
    password: "matkhau123",
    displayName: name,
    orgName: `Nhà trọ ${name}`,
  });
  return (await actorFor(userId))!;
}

async function staffOf(owner: Actor, propertyId: string): Promise<Actor> {
  const { token } = await createStaffInvite(owner, propertyId);
  const userId = await acceptStaffInvite(token, { email: `nv-${randomUUID().slice(0, 8)}@example.com`, password: "matkhau123", displayName: "NV" });
  return (await actorFor(userId, owner.orgId))!;
}

describe("vòng đời khu", () => {
  it("xóa hẳn khu nháp (kèm phòng, đồng hồ, biểu phí, nhân viên); phải gõ đúng tên", async () => {
    const a = await newOwner("xoa");
    const p = await createProperty(a, { name: "Khu tạo nhầm" });
    await importUnits(a, p, [{ code: "101" }, { code: "102" }]);
    const nv = await staffOf(a, p);
    expect((await propertyUsage(a, p))!.units).toBe(2);

    await expect(deleteDraftProperty(nv, p, "Khu tạo nhầm")).rejects.toThrow(/quyền/);
    await expect(deleteDraftProperty(a, p, "Khu khác")).rejects.toThrow(/không khớp/);
    await deleteDraftProperty(a, p, "  Khu tạo nhầm ");

    expect(await listProperties(a)).toEqual([]);
    const left = await withOrg(a, async (tx) => ({
      units: await tx.select().from(s.units).where(eq(s.units.propertyId, p)),
      fees: await tx.select().from(s.feeRules).where(eq(s.feeRules.propertyId, p)),
      staff: await tx.select().from(s.propertyStaff).where(eq(s.propertyStaff.propertyId, p)),
      audit: await tx.select().from(s.auditLogs).where(eq(s.auditLogs.action, "property.delete")),
    }));
    expect([left.units, left.fees, left.staff]).toEqual([[], [], []]);
    expect(left.audit.map((x) => x.entityId)).toEqual([p]);
  });

  it("chủ khác không xóa hay lưu trữ được khu của người khác", async () => {
    const a = await newOwner("chu-a");
    const b = await newOwner("chu-b");
    const p = await createProperty(a, { name: "Khu A" });
    await expect(deleteDraftProperty(b, p, "Khu A")).rejects.toThrow(/Không tìm thấy/);
    await expect(archiveProperty(b, p)).rejects.toThrow(/Không tìm thấy/);
    await expect(restoreProperty(b, p)).rejects.toThrow(/Không tìm thấy/);
    expect((await listProperties(a)).map((x) => x.id)).toEqual([p]);
  });

  it("khu đã có hợp đồng: không xóa; lưu trữ khi hết hợp đồng; ẩn khỏi chợ; khôi phục được", async () => {
    const a = await newOwner("luu");
    const p = await createProperty(a, { name: "Khu đang thuê" });
    await setPropertyLocation(a, p, { lat: 10.77, lng: 106.7 });
    await importUnits(a, p, [{ code: "A1" }]);
    const [u] = await withOrg(a, (tx) => tx.select().from(s.units).where(eq(s.units.propertyId, p)));
    const lease = await createLease(a, { unitId: u!.id, tenant: { fullName: "Lan" }, startDate: "2026-01-01", deposit: 0, occupants: 1, rent: 1_000_000 });
    const t = await acceptTenantInvite((await createTenantInvite(a, lease)).token, { phone: "0911222333", password: "abcdef12" });
    await openPeriod(a, p, "2026-01-01", "2026-01-31");

    await expect(deleteDraftProperty(a, p, "Khu đang thuê")).rejects.toThrow(/không xóa được/);
    await expect(archiveProperty(a, p)).rejects.toThrow(/đang thuê/);
    const nv = await staffOf(a, p);
    await expect(archiveProperty(nv, p)).rejects.toThrow(/quyền/);

    await moveOut(a, lease, "2026-02-15");
    await archiveProperty(a, p);
    expect(await listProperties(a)).toEqual([]);
    expect((await listArchivedProperties(a)).map((x) => x.id)).toEqual([p]);
    expect(await listArchivedProperties(nv)).toEqual([]);
    expect((await marketPlaces(t)).map((x) => x.key)).not.toContain(`${a.orgId}.${p}`);
    // Dữ liệu hóa đơn/hợp đồng vẫn còn.
    expect((await propertyUsage(a, p))!).toMatchObject({ leases: 1, periods: 1, archived: true });

    await restoreProperty(a, p);
    expect((await listProperties(a)).map((x) => x.id)).toEqual([p]);
  });
});
