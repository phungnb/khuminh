// Xe của phòng: biển số, loại xe, phí vé tháng. Ghi bởi chủ trọ (owner).

import { and, asc, eq, isNull } from "drizzle-orm";
import { withOrg } from "@/db/client";
import * as s from "@/db/schema";
import { audit, requireOwner, UserError, type Actor } from "./audit";
import { today } from "./queries";

/** Loại xe chọn sẵn ở form (lưu dạng text để sau này thêm loại không cần migration). */
export const VEHICLE_KINDS = ["Xe máy", "Xe đạp điện", "Ô tô", "Khác"] as const;

export interface VehicleInput {
  unitId: string;
  plate: string;
  kind: string;
  monthlyFee: number;
  note: string | null;
}

export async function listVehicles(actor: Actor, unitId: string) {
  return withOrg(actor, (tx) =>
    tx.select().from(s.vehicles).where(eq(s.vehicles.unitId, unitId)).orderBy(asc(s.vehicles.plate)),
  );
}

/** Thêm xe cho phòng. Người đứng tên xe lấy từ hợp đồng đang thuê (nếu có). */
export async function addVehicle(actor: Actor, input: VehicleInput): Promise<string> {
  requireOwner(actor);
  const plate = input.plate.trim();
  if (!plate) throw new UserError("Thiếu biển số xe");
  if (plate.length > 20) throw new UserError("Biển số dài quá 20 ký tự");
  if (!VEHICLE_KINDS.includes(input.kind as (typeof VEHICLE_KINDS)[number])) throw new UserError("Loại xe không hợp lệ");
  if (!Number.isInteger(input.monthlyFee) || input.monthlyFee < 0) throw new UserError("Phí vé tháng phải là số nguyên đồng ≥ 0");
  return withOrg(actor, async (tx) => {
    const [unit] = await tx.select().from(s.units).where(eq(s.units.id, input.unitId));
    if (!unit) throw new UserError("Không thấy phòng");
    const [lease] = await tx
      .select()
      .from(s.leases)
      .where(and(eq(s.leases.unitId, input.unitId), eq(s.leases.status, "active"), isNull(s.leases.movedOutOn)))
      .orderBy(asc(s.leases.startDate));
    const t = today();
    const current = lease && lease.startDate <= t ? lease : null;
    const [v] = await tx
      .insert(s.vehicles)
      .values({
        orgId: actor.orgId,
        propertyId: unit.propertyId,
        unitId: unit.id,
        tenantId: current?.tenantId ?? null,
        plate,
        kind: input.kind,
        monthlyFee: input.monthlyFee,
        note: input.note?.trim() || null,
      })
      .returning({ id: s.vehicles.id });
    await audit(tx, actor, "vehicle.create", "vehicle", v!.id, null, { plate, kind: input.kind });
    return v!.id;
  });
}

export async function deleteVehicle(actor: Actor, vehicleId: string): Promise<void> {
  requireOwner(actor);
  return withOrg(actor, async (tx) => {
    const [v] = await tx.select().from(s.vehicles).where(eq(s.vehicles.id, vehicleId));
    if (!v) throw new UserError("Không thấy xe");
    await tx.delete(s.vehicles).where(eq(s.vehicles.id, vehicleId));
    await audit(tx, actor, "vehicle.delete", "vehicle", vehicleId, { plate: v.plate }, null);
  });
}
