// Vòng đời khu (cơ sở): xóa hẳn khi còn là bản nháp, lưu trữ/khôi phục khi đã phát sinh hợp đồng.
// Đã phát sinh hợp đồng, kỳ, hóa đơn hay thanh toán thì KHÔNG xóa hẳn: giữ chứng từ thu tiền.
// Chỉ chủ sở hữu được làm; mọi truy cập đi qua withOrg (RLS org_isolation), có ghi audit.

import { and, asc, count, eq, inArray, isNotNull } from "drizzle-orm";
import { withOrg, type Tx } from "@/db/client";
import {
  billingPeriods,
  feeRules,
  leases,
  meterReadings,
  meters,
  posts,
  properties,
  propertyStaff,
  staffInvites,
  units,
} from "@/db/schema";
import { audit, requireOwner, UserError, type Actor } from "./audit";

export interface PropertyUsage {
  /** Số hợp đồng từng có (mọi trạng thái). */
  leases: number;
  activeLeases: number;
  periods: number;
  units: number;
  archived: boolean;
}

async function usage(tx: Tx, propertyId: string): Promise<PropertyUsage | null> {
  const [p] = await tx.select({ archivedAt: properties.archivedAt }).from(properties).where(eq(properties.id, propertyId));
  if (!p) return null;
  const unitIds = tx.select({ id: units.id }).from(units).where(eq(units.propertyId, propertyId));
  const [[u], [l], [a], [k]] = await Promise.all([
    tx.select({ n: count() }).from(units).where(eq(units.propertyId, propertyId)),
    tx.select({ n: count() }).from(leases).where(inArray(leases.unitId, unitIds)),
    tx.select({ n: count() }).from(leases).where(and(inArray(leases.unitId, unitIds), eq(leases.status, "active"))),
    tx.select({ n: count() }).from(billingPeriods).where(eq(billingPeriods.propertyId, propertyId)),
  ]);
  return { units: u!.n, leases: l!.n, activeLeases: a!.n, periods: k!.n, archived: p.archivedAt !== null };
}

/** Khu còn là bản nháp: chưa từng có hợp đồng hay kỳ (nên cũng chưa có hóa đơn, thanh toán, sự cố). */
export function isDraft(u: PropertyUsage): boolean {
  return u.leases === 0 && u.periods === 0;
}

export async function propertyUsage(actor: Actor, propertyId: string): Promise<PropertyUsage | null> {
  requireOwner(actor);
  return withOrg(actor, (tx) => usage(tx, propertyId));
}

/** Xóa hẳn khu nháp. Phải gõ đúng tên khu để xác nhận. */
export async function deleteDraftProperty(actor: Actor, propertyId: string, confirmName: string): Promise<void> {
  requireOwner(actor);
  await withOrg(actor, async (tx) => {
    const [p] = await tx.select().from(properties).where(eq(properties.id, propertyId));
    if (!p) throw new UserError("Không tìm thấy cơ sở");
    if (confirmName.trim() !== p.name.trim()) throw new UserError("Tên xác nhận không khớp tên khu");
    const u = (await usage(tx, propertyId))!;
    if (!isDraft(u)) {
      throw new UserError("Khu đã có hợp đồng hoặc kỳ hóa đơn nên không xóa được. Dùng “Lưu trữ khu” để ẩn đi mà vẫn giữ lịch sử.");
    }
    const unitIds = tx.select({ id: units.id }).from(units).where(eq(units.propertyId, propertyId));
    const meterIds = tx.select({ id: meters.id }).from(meters).where(inArray(meters.unitId, unitIds));
    // Thứ tự theo khóa ngoại. Hợp đồng mới chen vào giữa chừng sẽ làm câu xóa phòng lỗi khóa ngoại → cả giao dịch hủy.
    await tx.delete(meterReadings).where(inArray(meterReadings.meterId, meterIds));
    await tx.delete(meters).where(inArray(meters.unitId, unitIds));
    await tx.delete(units).where(eq(units.propertyId, propertyId));
    await tx.delete(feeRules).where(eq(feeRules.propertyId, propertyId));
    await tx.delete(propertyStaff).where(eq(propertyStaff.propertyId, propertyId));
    await tx.delete(staffInvites).where(eq(staffInvites.propertyId, propertyId));
    await tx.delete(posts).where(eq(posts.propertyId, propertyId));
    await tx.delete(properties).where(eq(properties.id, propertyId));
    await audit(tx, actor, "property.delete", "property", propertyId, { ...p, usage: u }, null);
  });
}

/** Lưu trữ: ẩn khỏi danh sách, chợ, Hôm nay; giữ nguyên dữ liệu. Không được còn hợp đồng đang hiệu lực. */
export async function archiveProperty(actor: Actor, propertyId: string): Promise<void> {
  requireOwner(actor);
  await withOrg(actor, async (tx) => {
    const u = await usage(tx, propertyId);
    if (!u) throw new UserError("Không tìm thấy cơ sở");
    if (u.archived) return;
    if (u.activeLeases > 0) {
      throw new UserError(`Còn ${u.activeLeases} hợp đồng đang thuê. Ghi nhận chuyển đi cho các phòng trước khi lưu trữ khu.`);
    }
    await tx.update(properties).set({ archivedAt: new Date() }).where(eq(properties.id, propertyId));
    await audit(tx, actor, "property.archive", "property", propertyId, null, { usage: u });
  });
}

export async function restoreProperty(actor: Actor, propertyId: string): Promise<void> {
  requireOwner(actor);
  await withOrg(actor, async (tx) => {
    const [p] = await tx.update(properties).set({ archivedAt: null }).where(eq(properties.id, propertyId)).returning({ id: properties.id });
    if (!p) throw new UserError("Không tìm thấy cơ sở");
    await audit(tx, actor, "property.restore", "property", propertyId, null, null);
  });
}

export async function listArchivedProperties(actor: Actor) {
  if (actor.role !== "owner") return [];
  return withOrg(actor, (tx) =>
    tx
      .select({ id: properties.id, name: properties.name, address: properties.address, archivedAt: properties.archivedAt })
      .from(properties)
      .where(isNotNull(properties.archivedAt))
      .orderBy(asc(properties.name)),
  );
}
