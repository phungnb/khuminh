// Thiết lập cơ sở, phòng, hợp đồng, đồng hồ, biểu phí và kỳ tính tiền.

import { and, desc, eq, inArray, isNull, lte, sql } from "drizzle-orm";
import { withOrg, type Tx } from "@/db/client";
import {
  billingPeriods,
  feeRules,
  leaseQuantities,
  leaseRents,
  leases,
  meterReadings,
  meters,
  properties,
  propertyStaff,
  tenants,
  units,
  vehicles,
} from "@/db/schema";
import { addDays, assertIsoDate, type IsoDate } from "@/domain/dates";
import { assertDong } from "@/domain/money";
import type { FeeMethod, MeterKind, Tier } from "@/domain/billing";
import { audit, ForbiddenError, requireOwner, UserError, type Actor } from "./audit";

/** Mã lỗi Postgres; drizzle bọc lỗi gốc trong `cause`. */
export function pgErrorCode(e: unknown): string | undefined {
  const err = e as { code?: string; cause?: { code?: string } };
  return err.cause?.code ?? err.code;
}

export async function assertPropertyAccess(tx: Tx, actor: Actor, propertyId: string): Promise<void> {
  const [p] = await tx.select({ id: properties.id }).from(properties).where(eq(properties.id, propertyId));
  if (!p) throw new UserError("Không tìm thấy cơ sở");
  if (actor.role === "owner") return;
  const [s] = await tx
    .select({ id: propertyStaff.id })
    .from(propertyStaff)
    .where(and(eq(propertyStaff.propertyId, propertyId), eq(propertyStaff.userId, actor.userId)));
  if (!s) throw new ForbiddenError();
}

export interface PropertyInput {
  name: string;
  address?: string | null;
  roundTotalTo?: number;
  dueDays?: number;
  bankBin?: string | null;
  bankAccountNo?: string | null;
  bankAccountName?: string | null;
}

function validateProperty(input: PropertyInput) {
  if (!input.name.trim()) throw new UserError("Cần nhập tên cơ sở");
  if (input.roundTotalTo !== undefined && ![1, 100, 500, 1000].includes(input.roundTotalTo)) {
    throw new UserError("Làm tròn chỉ nhận 1, 100, 500 hoặc 1000");
  }
  if (input.dueDays !== undefined && (!Number.isInteger(input.dueDays) || input.dueDays < 0 || input.dueDays > 60)) {
    throw new UserError("Số ngày đến hạn từ 0 đến 60");
  }
  if (input.bankBin && !/^\d{6}$/.test(input.bankBin)) throw new UserError("Mã ngân hàng không hợp lệ");
  if (input.bankAccountNo && !/^[0-9A-Za-z]{1,19}$/.test(input.bankAccountNo)) throw new UserError("Số tài khoản không hợp lệ");
}

export async function createProperty(actor: Actor, input: PropertyInput): Promise<string> {
  requireOwner(actor);
  validateProperty(input);
  return withOrg(actor, async (tx) => {
    const [p] = await tx
      .insert(properties)
      .values({
        orgId: actor.orgId,
        name: input.name.trim(),
        address: input.address?.trim() || null,
        roundTotalTo: input.roundTotalTo ?? 1,
        dueDays: input.dueDays ?? 10,
        bankBin: input.bankBin || null,
        bankAccountNo: input.bankAccountNo || null,
        bankAccountName: input.bankAccountName?.trim() || null,
      })
      .returning();
    await audit(tx, actor, "property.create", "property", p!.id, null, p);
    return p!.id;
  });
}

export async function updateProperty(actor: Actor, propertyId: string, input: PropertyInput): Promise<void> {
  requireOwner(actor);
  validateProperty(input);
  await withOrg(actor, async (tx) => {
    const [before] = await tx.select().from(properties).where(eq(properties.id, propertyId));
    if (!before) throw new UserError("Không tìm thấy cơ sở");
    const [after] = await tx
      .update(properties)
      .set({
        name: input.name.trim(),
        address: input.address?.trim() || null,
        roundTotalTo: input.roundTotalTo ?? before.roundTotalTo,
        dueDays: input.dueDays ?? before.dueDays,
        bankBin: input.bankBin || null,
        bankAccountNo: input.bankAccountNo || null,
        bankAccountName: input.bankAccountName?.trim() || null,
      })
      .where(eq(properties.id, propertyId))
      .returning();
    await audit(tx, actor, "property.update", "property", propertyId, before, after);
  });
}

export interface UnitRow {
  block?: string | null;
  code: string;
  /** Tầng (0 = tầng trệt); trống thì sơ đồ suy từ mã phòng. */
  floor?: number | null;
}

export interface ImportError {
  row: number;
  message: string;
}

/**
 * Thêm phòng hàng loạt (từ form hoặc file). Kiểm tra toàn bộ trước; có lỗi thì không thêm dòng nào.
 * `row` đánh số từ 1 theo thứ tự đầu vào.
 */
export async function importUnits(
  actor: Actor,
  propertyId: string,
  rows: UnitRow[],
  meterKinds: MeterKind[] = ["electricity"],
): Promise<{ created: number; errors: ImportError[] }> {
  requireOwner(actor);
  if (rows.length > 500) return { created: 0, errors: [{ row: 0, message: "Tối đa 500 phòng mỗi lần" }] };
  return withOrg(actor, async (tx) => {
    await assertPropertyAccess(tx, actor, propertyId);
    const existing = new Set(
      (await tx.select({ code: units.code }).from(units).where(eq(units.propertyId, propertyId))).map((u) => u.code.toUpperCase()),
    );
    const seen = new Set<string>();
    const errors: ImportError[] = [];
    rows.forEach((r, i) => {
      const code = (r.code ?? "").trim();
      if (!code) errors.push({ row: i + 1, message: "Thiếu mã phòng" });
      else if (code.length > 20) errors.push({ row: i + 1, message: "Mã phòng dài quá 20 ký tự" });
      else if (r.floor !== undefined && r.floor !== null && (!Number.isInteger(r.floor) || r.floor < 0 || r.floor > 100))
        errors.push({ row: i + 1, message: "Tầng phải là số nguyên 0–100" });
      else if (existing.has(code.toUpperCase())) errors.push({ row: i + 1, message: `Mã phòng ${code} đã có` });
      else if (seen.has(code.toUpperCase())) errors.push({ row: i + 1, message: `Mã phòng ${code} bị trùng trong danh sách` });
      seen.add(code.toUpperCase());
    });
    if (errors.length || rows.length === 0) return { created: 0, errors };

    const created = await tx
      .insert(units)
      .values(rows.map((r) => ({ orgId: actor.orgId, propertyId, block: r.block?.trim() || null, code: r.code.trim(), floor: r.floor ?? null })))
      .returning({ id: units.id });
    const meterNames: Record<MeterKind, string> = { electricity: "Điện", water: "Nước" };
    if (meterKinds.length) {
      await tx.insert(meters).values(
        created.flatMap((u) => meterKinds.map((k) => ({ orgId: actor.orgId, unitId: u.id, kind: k, name: meterNames[k] }))),
      );
    }
    await audit(tx, actor, "unit.import", "property", propertyId, null, { count: created.length });
    return { created: created.length, errors: [] };
  });
}

/** Xóa phòng (chủ trọ). Chỉ xóa được phòng chưa có hợp đồng nào (đang thuê hoặc đã trả),
 * chưa có xe và chưa có chỉ số — các dữ liệu đó là chứng từ, xóa phòng sẽ làm mất dấu.
 * Đồng hồ chưa có chỉ số thì xóa theo phòng. */
export async function deleteUnit(actor: Actor, unitId: string): Promise<void> {
  requireOwner(actor);
  await withOrg(actor, async (tx) => {
    const [unit] = await tx.select().from(units).where(eq(units.id, unitId));
    if (!unit) throw new UserError("Không tìm thấy phòng");
    await assertPropertyAccess(tx, actor, unit.propertyId);
    const leaseRows = await tx.select({ id: leases.id }).from(leases).where(eq(leases.unitId, unitId)).limit(1);
    if (leaseRows.length) throw new UserError("Phòng đã có hợp đồng (đang thuê hoặc đã trả), không xóa được để giữ chứng từ");
    const vehicleRows = await tx.select({ id: vehicles.id }).from(vehicles).where(eq(vehicles.unitId, unitId)).limit(1);
    if (vehicleRows.length) throw new UserError("Phòng còn xe đang gửi, xóa xe trước");
    const meterRows = await tx.select({ id: meters.id }).from(meters).where(eq(meters.unitId, unitId));
    if (meterRows.length) {
      const readingRows = await tx
        .select({ id: meterReadings.id })
        .from(meterReadings)
        .where(inArray(meterReadings.meterId, meterRows.map((m) => m.id)))
        .limit(1);
      if (readingRows.length) throw new UserError("Phòng đã có chỉ số điện nước, không xóa được để giữ chứng từ");
      await tx.delete(meters).where(eq(meters.unitId, unitId));
    }
    await tx.delete(units).where(eq(units.id, unitId));
    await audit(tx, actor, "unit.delete", "unit", unitId, { code: unit.code, propertyId: unit.propertyId }, null);
  });
}

/** Đặt/sửa tầng của một phòng (0 = tầng trệt, null = chưa xếp, suy từ mã). */
export async function setUnitFloor(actor: Actor, unitId: string, floor: number | null): Promise<void> {
  requireOwner(actor);
  if (floor !== null && (!Number.isInteger(floor) || floor < 0 || floor > 100)) throw new UserError("Tầng phải là số nguyên 0–100");
  return withOrg(actor, async (tx) => {
    const [unit] = await tx.select().from(units).where(eq(units.id, unitId));
    if (!unit) throw new UserError("Không thấy phòng");
    await assertPropertyAccess(tx, actor, unit.propertyId);
    await tx.update(units).set({ floor }).where(eq(units.id, unitId));
    await audit(tx, actor, "unit.set_floor", "unit", unitId, { floor: unit.floor }, { floor });
  });
}

export interface LeaseInput {
  unitId: string;
  tenant: { fullName: string; phone?: string | null };
  startDate: IsoDate;
  expiresOn?: IsoDate | null;
  deposit: number;
  occupants: number;
  rent: number;
  quantities?: Record<string, number>;
  /** Ngày thu tiền hằng tháng theo thỏa thuận (1–28); trống thì dùng hạn chung của cơ sở. */
  dueDay?: number | null;
}

function assertDueDay(day: number | null | undefined): void {
  if (day === null || day === undefined) return;
  if (!Number.isInteger(day) || day < 1 || day > 28) throw new UserError("Ngày thu tiền phải từ 1 đến 28");
}

export async function createLease(actor: Actor, input: LeaseInput): Promise<string> {
  requireOwner(actor);
  assertIsoDate(input.startDate);
  if (input.expiresOn) assertIsoDate(input.expiresOn);
  assertDong(input.deposit, "tiền cọc");
  assertDong(input.rent, "giá thuê");
  if (input.rent <= 0) throw new UserError("Giá thuê phải lớn hơn 0");
  if (!Number.isInteger(input.occupants) || input.occupants < 1) throw new UserError("Số người ở ít nhất là 1");
  if (!input.tenant.fullName.trim()) throw new UserError("Cần nhập tên người thuê");
  assertDueDay(input.dueDay);

  return withOrg(actor, async (tx) => {
    const [unit] = await tx.select().from(units).where(eq(units.id, input.unitId));
    if (!unit) throw new UserError("Không tìm thấy phòng");
    const [t] = await tx
      .insert(tenants)
      .values({ orgId: actor.orgId, fullName: input.tenant.fullName.trim(), phone: input.tenant.phone?.trim() || null })
      .returning({ id: tenants.id });
    let leaseId: string;
    try {
      const [l] = await tx
        .insert(leases)
        .values({
          orgId: actor.orgId,
          unitId: unit.id,
          tenantId: t!.id,
          status: "active",
          startDate: input.startDate,
          expiresOn: input.expiresOn ?? null,
          deposit: input.deposit,
          occupants: input.occupants,
          dueDay: input.dueDay ?? null,
        })
        .returning({ id: leases.id });
      leaseId = l!.id;
    } catch (e) {
      if (pgErrorCode(e) === "23P01") {
        throw new UserError(`Phòng ${unit.code} đã có hợp đồng trong khoảng thời gian này`);
      }
      throw e;
    }
    await tx.insert(leaseRents).values({ orgId: actor.orgId, leaseId, effectiveFrom: input.startDate, amount: input.rent });
    const qty = Object.entries(input.quantities ?? {}).filter(([, q]) => q > 0);
    if (qty.length) {
      await tx.insert(leaseQuantities).values(qty.map(([feeKey, quantity]) => ({ orgId: actor.orgId, leaseId, feeKey, quantity })));
    }
    await audit(tx, actor, "lease.create", "lease", leaseId, null, input);
    return leaseId;
  });
}

export async function changeRent(actor: Actor, leaseId: string, effectiveFrom: IsoDate, amount: number): Promise<void> {
  requireOwner(actor);
  assertIsoDate(effectiveFrom);
  assertDong(amount, "giá thuê");
  if (amount <= 0) throw new UserError("Giá thuê phải lớn hơn 0");
  await withOrg(actor, async (tx) => {
    const [lease] = await tx.select().from(leases).where(eq(leases.id, leaseId));
    if (!lease) throw new UserError("Không tìm thấy hợp đồng");
    if (effectiveFrom < lease.startDate) throw new UserError("Ngày áp dụng trước ngày vào ở");
    await tx
      .insert(leaseRents)
      .values({ orgId: actor.orgId, leaseId, effectiveFrom, amount })
      .onConflictDoUpdate({ target: [leaseRents.leaseId, leaseRents.effectiveFrom], set: { amount } });
    await audit(tx, actor, "lease.change_rent", "lease", leaseId, null, { effectiveFrom, amount });
  });
}

/** Đổi ngày thu tiền theo thỏa thuận. Áp dụng cho hóa đơn lập từ nay (nháp lập lại cũng theo ngày mới). */
export async function setLeaseDueDay(actor: Actor, leaseId: string, dueDay: number | null): Promise<void> {
  requireOwner(actor);
  assertDueDay(dueDay);
  await withOrg(actor, async (tx) => {
    const [lease] = await tx.select().from(leases).where(eq(leases.id, leaseId)).for("update");
    if (!lease) throw new UserError("Không tìm thấy hợp đồng");
    await tx.update(leases).set({ dueDay }).where(eq(leases.id, leaseId));
    await audit(tx, actor, "lease.set_due_day", "lease", leaseId, { dueDay: lease.dueDay }, { dueDay });
  });
}

/** Gia hạn hợp đồng đang ở: đổi ngày hết hạn ghi trên hợp đồng. Không đổi tiền, chỉ để nhắc. */
export async function extendLease(actor: Actor, leaseId: string, expiresOn: IsoDate): Promise<void> {
  requireOwner(actor);
  assertIsoDate(expiresOn);
  await withOrg(actor, async (tx) => {
    const [lease] = await tx.select().from(leases).where(eq(leases.id, leaseId)).for("update");
    if (!lease) throw new UserError("Không tìm thấy hợp đồng");
    if (lease.status !== "active" || lease.movedOutOn) throw new UserError("Chỉ gia hạn được hợp đồng đang ở");
    if (expiresOn <= lease.startDate) throw new UserError("Ngày hết hạn phải sau ngày vào ở");
    await tx.update(leases).set({ expiresOn }).where(eq(leases.id, leaseId));
    await audit(tx, actor, "lease.extend", "lease", leaseId, { expiresOn: lease.expiresOn }, { expiresOn });
  });
}

/** Ngày hết hạn mới khi gia hạn thêm `months` tháng, tính từ hạn cũ (hoặc từ hôm nay nếu chưa có/đã quá). */
export function extendedDate(current: IsoDate | null, months: number, on: IsoDate): IsoDate {
  const from = current && current >= on ? current : on;
  const [y, m, d] = from.split("-").map(Number) as [number, number, number];
  const total = y * 12 + (m - 1) + months;
  const ny = Math.floor(total / 12);
  const nm = (total % 12) + 1;
  const last = new Date(Date.UTC(ny, nm, 0)).getUTCDate();
  return `${ny}-${String(nm).padStart(2, "0")}-${String(Math.min(d, last)).padStart(2, "0")}`;
}

export async function moveOut(actor: Actor, leaseId: string, lastDay: IsoDate): Promise<void> {
  requireOwner(actor);
  assertIsoDate(lastDay);
  await withOrg(actor, async (tx) => {
    const [lease] = await tx.select().from(leases).where(eq(leases.id, leaseId));
    if (!lease) throw new UserError("Không tìm thấy hợp đồng");
    if (lastDay < lease.startDate) throw new UserError("Ngày chuyển đi trước ngày vào ở");
    await tx.update(leases).set({ movedOutOn: lastDay, status: "ended" }).where(eq(leases.id, leaseId));
    await audit(tx, actor, "lease.move_out", "lease", leaseId, { movedOutOn: lease.movedOutOn }, { movedOutOn: lastDay });
  });
}

export interface ReadingInput {
  meterId: string;
  date: IsoDate;
  /** Số trên đồng hồ, tối đa 2 chữ số thập phân. */
  value: number;
}

/** Ghi/sửa chỉ số. Nhân viên được giao cơ sở cũng ghi được. */
export async function recordReadings(actor: Actor, readings: ReadingInput[]): Promise<number> {
  if (readings.length === 0) return 0;
  for (const r of readings) {
    assertIsoDate(r.date);
    if (!Number.isFinite(r.value) || r.value < 0) throw new UserError("Chỉ số không hợp lệ");
  }
  return withOrg(actor, async (tx) => {
    const meterRows = await tx
      .select({ id: meters.id, propertyId: units.propertyId })
      .from(meters)
      .innerJoin(units, eq(units.id, meters.unitId))
      .where(inArray(meters.id, readings.map((r) => r.meterId)));
    for (const pid of new Set(meterRows.map((m) => m.propertyId))) await assertPropertyAccess(tx, actor, pid);
    if (meterRows.length !== new Set(readings.map((r) => r.meterId)).size) throw new UserError("Có đồng hồ không tồn tại");
    for (const r of readings) {
      const valueCenti = Math.round(r.value * 100);
      await tx
        .insert(meterReadings)
        .values({ orgId: actor.orgId, meterId: r.meterId, readingDate: r.date, valueCenti, recordedBy: actor.userId })
        .onConflictDoUpdate({
          target: [meterReadings.meterId, meterReadings.readingDate],
          set: { valueCenti, recordedBy: actor.userId },
        });
    }
    await audit(tx, actor, "meter.record", "meter_reading", null, null, { count: readings.length, readings });
    return readings.length;
  });
}

export interface FeeRuleInput {
  propertyId: string;
  key: string;
  name: string;
  method: FeeMethod;
  unitPrice: number;
  tiers?: Tier[] | null;
  meterKind?: MeterKind | null;
  unitLabel?: string | null;
  prorate: boolean;
  effectiveFrom: IsoDate;
}

/**
 * Thêm khoản phí hoặc đổi giá: phiên bản đang hiệu lực của cùng khóa được đóng lại
 * vào ngày trước `effectiveFrom`, giữ nguyên lịch sử.
 */
export async function setFeeRule(actor: Actor, input: FeeRuleInput): Promise<string> {
  requireOwner(actor);
  assertIsoDate(input.effectiveFrom);
  assertDong(input.unitPrice, "đơn giá");
  if (input.unitPrice < 0) throw new UserError("Đơn giá không được âm");
  if (!/^[a-z0-9_]{1,30}$/.test(input.key)) throw new UserError("Mã khoản phí chỉ gồm chữ thường, số, gạch dưới");
  if (input.method === "metered" && !input.meterKind) throw new UserError("Khoản theo chỉ số cần chọn điện hoặc nước");
  return withOrg(actor, async (tx) => {
    await assertPropertyAccess(tx, actor, input.propertyId);
    const [current] = await tx
      .select()
      .from(feeRules)
      .where(
        and(
          eq(feeRules.propertyId, input.propertyId),
          eq(feeRules.key, input.key),
          isNull(feeRules.effectiveTo),
          lte(feeRules.effectiveFrom, input.effectiveFrom),
        ),
      )
      .orderBy(desc(feeRules.effectiveFrom))
      .limit(1);
    if (current) {
      if (current.effectiveFrom === input.effectiveFrom) {
        await tx.delete(feeRules).where(eq(feeRules.id, current.id));
      } else {
        await tx.update(feeRules).set({ effectiveTo: addDays(input.effectiveFrom, -1) }).where(eq(feeRules.id, current.id));
      }
    }
    const [r] = await tx
      .insert(feeRules)
      .values({
        orgId: actor.orgId,
        propertyId: input.propertyId,
        key: input.key,
        name: input.name.trim(),
        method: input.method,
        unitPrice: input.unitPrice,
        tiers: input.tiers ?? null,
        meterKind: input.method === "metered" ? input.meterKind! : null,
        unitLabel: input.unitLabel?.trim() || null,
        prorate: input.method === "metered" ? false : input.prorate,
        effectiveFrom: input.effectiveFrom,
      })
      .returning({ id: feeRules.id });
    await audit(tx, actor, "fee_rule.set", "fee_rule", r!.id, current ?? null, input);
    return r!.id;
  });
}

/** Mở kỳ tính tiền. Hạn trả = ngày cuối kỳ + số ngày đến hạn của cơ sở. */
export async function openPeriod(actor: Actor, propertyId: string, start: IsoDate, end: IsoDate): Promise<string> {
  requireOwner(actor);
  assertIsoDate(start);
  assertIsoDate(end);
  if (end < start) throw new UserError("Ngày cuối kỳ trước ngày đầu kỳ");
  return withOrg(actor, async (tx) => {
    const [p] = await tx.select().from(properties).where(eq(properties.id, propertyId));
    if (!p) throw new UserError("Không tìm thấy cơ sở");
    const [overlap] = await tx
      .select({ id: billingPeriods.id })
      .from(billingPeriods)
      .where(
        and(
          eq(billingPeriods.propertyId, propertyId),
          lte(billingPeriods.periodStart, end),
          sql`${billingPeriods.periodEnd} >= ${start}`,
        ),
      );
    if (overlap) throw new UserError("Kỳ bị chồng với một kỳ đã có");
    const [row] = await tx
      .insert(billingPeriods)
      .values({ orgId: actor.orgId, propertyId, periodStart: start, periodEnd: end, dueDate: addDays(end, p.dueDays) })
      .returning({ id: billingPeriods.id });
    await audit(tx, actor, "period.open", "billing_period", row!.id, null, { start, end });
    return row!.id;
  });
}
