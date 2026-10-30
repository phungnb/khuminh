// Xóa phòng có bảo vệ + chủ trọ ghi sự cố thay người thuê (mục 7, đợt kiểm thử non-tech 30/10/2026).
// Chạy với DB test (vitest.db.config.ts).

import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import { beforeAll, describe, expect, it } from "vitest";
import { withOrg } from "@/db/client";
import * as s from "@/db/schema";
import type { Actor } from "./audit";
import { actorFor, signUpOwner } from "./auth";
import { createMaintenanceRequestByManager, propertyMaintenanceRequests } from "./maintenance";
import { createLease, createProperty, deleteUnit, importUnits, recordReadings } from "./setup";
import { addVehicle } from "./vehicles";

async function newOwner(name: string): Promise<Actor> {
  const { userId } = await signUpOwner({
    email: `${name}-${randomUUID().slice(0, 8)}@example.com`,
    password: "Test123456!",
    displayName: name,
    orgName: `Nhà trọ ${name}`,
  });
  return (await actorFor(userId))!;
}

describe("xóa phòng + ghi sự cố thay người thuê", () => {
  let a: Actor;
  let propertyId: string;
  let u101: string;
  let u102: string;
  let u103: string;
  let u104: string;

  beforeAll(async () => {
    a = await newOwner("xoa-phong");
    propertyId = await createProperty(a, { name: "Dãy xóa phòng" });
    await importUnits(a, propertyId, [{ code: "101" }, { code: "102" }, { code: "103" }, { code: "104" }], ["electricity"]);
    const us = await withOrg(a, (tx) => tx.select().from(s.units).where(eq(s.units.propertyId, propertyId)).orderBy(s.units.code));
    const ids = us.map((u) => u.id);
    u101 = ids[0]!;
    u102 = ids[1]!;
    u103 = ids[2]!;
    u104 = ids[3]!;
    await createLease(a, {
      unitId: u101!, tenant: { fullName: "An", phone: null },
      startDate: "2026-01-01", deposit: 0, occupants: 1, rent: 2_000_000,
    });
    // Phòng 103: có đồng hồ + đã ghi chỉ số (không có hợp đồng).
    const [meter] = await withOrg(a, (tx) => tx.select().from(s.meters).where(eq(s.meters.unitId, u103!)));
    await recordReadings(a, [{ meterId: meter!.id, date: "2026-10-01", value: 100 }]);
    // Phòng 104: có xe gửi (không có hợp đồng).
    await addVehicle(a, { unitId: u104!, plate: "59A-11111", kind: "Xe máy", monthlyFee: 0, note: null });
  });

  it("xóa được phòng trống chưa có gì; phòng có hợp đồng / xe / chỉ số thì bị chặn", async () => {
    await deleteUnit(a, u102!);
    const gone = await withOrg(a, (tx) => tx.select().from(s.units).where(eq(s.units.id, u102!)));
    expect(gone.length).toBe(0);
    await expect(deleteUnit(a, u101!)).rejects.toThrow(/đã có hợp đồng/);
    await expect(deleteUnit(a, u104!)).rejects.toThrow(/còn xe/);
    await expect(deleteUnit(a, u103!)).rejects.toThrow(/đã có chỉ số/);
  });

  it("chủ trọ ghi sự cố thay người thuê: phòng đang thuê thì ghi được; phòng chưa có hợp đồng nào thì bị chặn", async () => {
    const id = await createMaintenanceRequestByManager(a, propertyId, u101!, { title: "Vòi nước rỉ", body: "Người thuê gọi điện báo", urgent: false });
    expect(id).toBeTruthy();
    const rows = await propertyMaintenanceRequests(a, propertyId);
    expect(rows.some((r) => r.id === id && r.title === "Vòi nước rỉ")).toBe(true);
    await expect(createMaintenanceRequestByManager(a, propertyId, u103!, { title: "Bóng đèn hỏng" })).rejects.toThrow(
      /chưa có hợp đồng/,
    );
  });
});
