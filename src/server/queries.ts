// Truy vấn đọc cho giao diện. Mọi truy vấn chạy trong withOrg nên chỉ thấy dữ liệu của tổ chức.

import { and, asc, desc, eq, inArray, isNull, lte, ne, sql } from "drizzle-orm";
import { withOrg, type Tx } from "@/db/client";
import * as s from "@/db/schema";
import { addDays, type IsoDate } from "@/domain/dates";
import { paymentState, type PaymentState } from "@/domain/payments";
import type { Actor } from "./audit";
import { emptyMoney, type MoneySummary } from "./overview-items";

export function today(): IsoDate {
  // Ngày theo giờ Việt Nam (UTC+7).
  return new Date(Date.now() + 7 * 3_600_000).toISOString().slice(0, 10);
}

/** Nhân viên chỉ thấy các cơ sở được giao; chủ sở hữu thấy tất cả. */
function staffScope(actor: Actor) {
  return actor.role === "owner"
    ? undefined
    : inArray(
        s.properties.id,
        sql`(select ${s.propertyStaff.propertyId} from ${s.propertyStaff} where ${s.propertyStaff.userId} = ${actor.userId})`,
      );
}

export async function listProperties(actor: Actor) {
  return withOrg(actor, (tx) =>
    tx
      .select()
      .from(s.properties)
      .where(and(isNull(s.properties.archivedAt), staffScope(actor)))
      .orderBy(asc(s.properties.createdAt)),
  );
}

export async function getProperty(actor: Actor, propertyId: string) {
  return withOrg(actor, async (tx) => {
    const [p] = await tx.select().from(s.properties).where(and(eq(s.properties.id, propertyId), staffScope(actor)));
    return p ?? null;
  });
}

export interface UnitOverview {
  id: string;
  code: string;
  block: string | null;
  floor: number | null;
  status: string;
  /** Có hóa đơn đã phát hành quá hạn chưa thu đủ (tính tới ngày `on`). */
  overdue: boolean;
  lease: { id: string; tenantName: string; phone: string | null; startDate: string; expiresOn: string | null; rent: number; occupants: number } | null;
}

export async function unitsOverview(actor: Actor, propertyId: string, on: IsoDate = today()): Promise<UnitOverview[]> {
  return withOrg(actor, async (tx) => {
    const unitRows = await tx.select().from(s.units).where(eq(s.units.propertyId, propertyId)).orderBy(asc(s.units.block), asc(s.units.code));
    if (unitRows.length === 0) return [];
    const leaseRows = await tx
      .select({ lease: s.leases, tenantName: s.tenants.fullName, phone: s.tenants.phone })
      .from(s.leases)
      .innerJoin(s.tenants, eq(s.tenants.id, s.leases.tenantId))
      .where(
        and(
          inArray(s.leases.unitId, unitRows.map((u) => u.id)),
          ne(s.leases.status, "draft"),
          lte(s.leases.startDate, on),
          sql`(${s.leases.movedOutOn} is null or ${s.leases.movedOutOn} >= ${on})`,
        ),
      );
    // Giá thuê + phòng nợ chỉ phụ thuộc danh sách hợp đồng nên chạy song song
    // (postgres.js xếp hàng các câu truy vấn trên cùng kết nối, tiết kiệm 1
    // vòng đi-về mạng cho mỗi cặp).
    const [rents, overdueRows] = leaseRows.length
      ? await Promise.all([
          tx
            .select()
            .from(s.leaseRents)
            .where(and(inArray(s.leaseRents.leaseId, leaseRows.map((l) => l.lease.id)), lte(s.leaseRents.effectiveFrom, on)))
            .orderBy(desc(s.leaseRents.effectiveFrom)),
          // Phòng nợ: hợp đồng của phòng có hóa đơn đã phát hành quá hạn chưa thu đủ.
          tx.execute(sql`
            select distinct i.unit_id as unit_id from invoices i
            where i.lease_id in (${sql.join(leaseRows.map((l) => sql`${l.lease.id}::uuid`), sql`, `)})
              and i.status = 'issued' and i.due_date < ${on}
              and i.total > coalesce((select sum(a.amount) from payment_allocations a where a.invoice_id = i.id), 0)
          `) as unknown as Promise<Array<{ unit_id: string }>>,
        ])
      : [[], []];
    const overdueUnitIds = new Set(overdueRows.map((r) => r.unit_id));
    return unitRows.map((u) => {
      const l = leaseRows.find((r) => r.lease.unitId === u.id);
      return {
        id: u.id,
        code: u.code,
        block: u.block,
        floor: u.floor,
        status: u.status,
        overdue: overdueUnitIds.has(u.id),
        lease: l
          ? {
              id: l.lease.id,
              tenantName: l.tenantName,
              phone: l.phone,
              startDate: l.lease.startDate,
              expiresOn: l.lease.expiresOn,
              rent: rents.find((r) => r.leaseId === l.lease.id)?.amount ?? 0,
              occupants: l.lease.occupants,
            }
          : null,
      };
    });
  });
}

export async function listFeeRules(actor: Actor, propertyId: string) {
  return withOrg(actor, (tx) =>
    tx
      .select()
      .from(s.feeRules)
      .where(and(eq(s.feeRules.propertyId, propertyId), isNull(s.feeRules.effectiveTo)))
      .orderBy(asc(s.feeRules.createdAt)),
  );
}

export interface MeterRow {
  meterId: string;
  unitCode: string;
  kind: "electricity" | "water";
  name: string;
  last: { date: string; value: number } | null;
  onDate: number | null;
}

/** Danh sách đồng hồ của cơ sở kèm chỉ số gần nhất trước `date` và chỉ số đã ghi đúng ngày `date`. */
export async function metersForReading(actor: Actor, propertyId: string, date: IsoDate): Promise<MeterRow[]> {
  return withOrg(actor, async (tx) => {
    const rows = await tx
      .select({ meter: s.meters, unitCode: s.units.code, block: s.units.block })
      .from(s.meters)
      .innerJoin(s.units, eq(s.units.id, s.meters.unitId))
      .where(and(eq(s.units.propertyId, propertyId), isNull(s.meters.archivedAt), ne(s.units.status, "inactive")))
      .orderBy(asc(s.units.block), asc(s.units.code), asc(s.meters.kind));
    if (rows.length === 0) return [];
    const ids = rows.map((r) => r.meter.id);
    const readings = await tx
      .select()
      .from(s.meterReadings)
      .where(and(inArray(s.meterReadings.meterId, ids), lte(s.meterReadings.readingDate, date)))
      .orderBy(desc(s.meterReadings.readingDate));
    return rows.map((r) => {
      const mine = readings.filter((x) => x.meterId === r.meter.id);
      const on = mine.find((x) => x.readingDate === date);
      const prev = mine.find((x) => x.readingDate < date);
      return {
        meterId: r.meter.id,
        unitCode: r.block ? `${r.block}-${r.unitCode}` : r.unitCode,
        kind: r.meter.kind,
        name: r.meter.name,
        last: prev ? { date: prev.readingDate, value: prev.valueCenti / 100 } : null,
        onDate: on ? on.valueCenti / 100 : null,
      };
    });
  });
}

export async function listPeriods(actor: Actor, propertyId: string) {
  return withOrg(actor, (tx) =>
    tx.select().from(s.billingPeriods).where(eq(s.billingPeriods.propertyId, propertyId)).orderBy(desc(s.billingPeriods.periodStart)),
  );
}

export interface InvoiceRow {
  id: string;
  code: string;
  unitCode: string;
  tenantName: string;
  phone: string | null;
  leaseId: string;
  status: "draft" | "issued" | "void";
  total: number;
  paid: number;
  dueDate: string;
  state: PaymentState;
}

export async function invoicesForPeriod(actor: Actor, periodId: string): Promise<InvoiceRow[]> {
  return withOrg(actor, async (tx) => {
    const rows = await tx
      .select({
        inv: s.invoices,
        unitCode: s.units.code,
        tenantName: s.tenants.fullName,
        phone: s.tenants.phone,
        paid: sql<string>`coalesce((select sum(a.amount) from payment_allocations a where a.invoice_id = ${s.invoices.id}), 0)`,
      })
      .from(s.invoices)
      .innerJoin(s.units, eq(s.units.id, s.invoices.unitId))
      .innerJoin(s.leases, eq(s.leases.id, s.invoices.leaseId))
      .innerJoin(s.tenants, eq(s.tenants.id, s.leases.tenantId))
      .where(eq(s.invoices.billingPeriodId, periodId))
      .orderBy(asc(s.units.code));
    const t = today();
    return rows.map((r) => ({
      id: r.inv.id,
      code: r.inv.code,
      unitCode: r.unitCode,
      tenantName: r.tenantName,
      phone: r.phone,
      leaseId: r.inv.leaseId,
      status: r.inv.status,
      total: r.inv.total,
      paid: Number(r.paid),
      dueDate: r.inv.dueDate,
      state: paymentState(r.inv.status, r.inv.total, Number(r.paid), r.inv.dueDate, t),
    }));
  });
}

export async function invoiceDetail(actor: Actor, invoiceId: string) {
  return withOrg(actor, async (tx) => {
    const [inv] = await tx.select().from(s.invoices).where(eq(s.invoices.id, invoiceId));
    if (!inv) return null;
    const [lines, adjustments] = await Promise.all([
      tx.select().from(s.invoiceLines).where(eq(s.invoiceLines.invoiceId, invoiceId)).orderBy(asc(s.invoiceLines.position)),
      tx.select().from(s.invoiceAdjustments).where(eq(s.invoiceAdjustments.invoiceId, invoiceId)).orderBy(asc(s.invoiceAdjustments.createdAt)),
    ]);
    const pays = await tx
      .select({ payment: s.payments, allocated: s.paymentAllocations.amount })
      .from(s.paymentAllocations)
      .innerJoin(s.payments, eq(s.payments.id, s.paymentAllocations.paymentId))
      .where(eq(s.paymentAllocations.invoiceId, invoiceId))
      .orderBy(asc(s.payments.receivedOn));
    const [ctx] = await tx
      .select({ unitCode: s.units.code, tenantName: s.tenants.fullName, phone: s.tenants.phone, periodStart: s.billingPeriods.periodStart })
      .from(s.units)
      .innerJoin(s.leases, eq(s.leases.id, inv.leaseId))
      .innerJoin(s.tenants, eq(s.tenants.id, s.leases.tenantId))
      .innerJoin(s.billingPeriods, eq(s.billingPeriods.id, inv.billingPeriodId))
      .where(eq(s.units.id, inv.unitId));
    const paid = pays.reduce((sum, p) => sum + p.allocated, 0);
    return { inv, lines, adjustments, payments: pays, paid, ctx: ctx! };
  });
}

/**
 * Số tiền của hóa đơn đã phát hành theo cơ sở. Nguồn duy nhất cho mọi trang tổng quan,
 * để số ở trang gộp và trang từng cơ sở không lệch nhau.
 */
export async function propertyMoney(tx: Tx, propertyIds: string[], t: IsoDate): Promise<Map<string, MoneySummary>> {
  const out = new Map<string, MoneySummary>();
  if (propertyIds.length === 0) return out;
  const rows = (await tx.execute(sql`
    with inv as (
      select i.property_id, i.total, i.due_date,
        coalesce((select sum(a.amount) from payment_allocations a where a.invoice_id = i.id), 0) as paid
      from invoices i
      where i.property_id in (${sql.join(propertyIds.map((id) => sql`${id}::uuid`), sql`, `)}) and i.status = 'issued'
    )
    select property_id,
           coalesce(sum(total), 0)::bigint as receivable,
           coalesce(sum(paid), 0)::bigint as collected,
           coalesce(sum(case when due_date < ${t} then total - paid else 0 end), 0)::bigint as overdue,
           count(*) filter (where total > paid)::int as unpaid_count,
           count(*) filter (where total > paid and due_date < ${t})::int as overdue_count
    from inv group by property_id
  `)) as unknown as Array<{
    property_id: string;
    receivable: string;
    collected: string;
    overdue: string;
    unpaid_count: number;
    overdue_count: number;
  }>;
  for (const id of propertyIds) out.set(id, emptyMoney());
  for (const r of rows) {
    out.set(r.property_id, {
      receivable: Number(r.receivable),
      collected: Number(r.collected),
      overdue: Number(r.overdue),
      unpaidCount: Number(r.unpaid_count),
      overdueCount: Number(r.overdue_count),
    });
  }
  return out;
}

export interface Dashboard {
  units: { total: number; occupied: number; vacant: number; maintenance: number };
  receivable: number;
  collected: number;
  outstanding: number;
  overdue: number;
  expiring: Array<{ unitCode: string; tenantName: string; expiresOn: string }>;
}

export async function dashboard(actor: Actor, propertyId: string): Promise<Dashboard> {
  const t = today();
  // Tổng quan phòng và tiền/sắp hết hạn không phụ thuộc nhau nên chạy song
  // song (2 giao dịch riêng, 2 kết nối riêng); trước đây chạy nối tiếp.
  const [overview, rest] = await Promise.all([
    unitsOverview(actor, propertyId, t),
    withOrg(actor, async (tx) => {
      const money = (await propertyMoney(tx, [propertyId], t)).get(propertyId) ?? emptyMoney();
      const expiring = await tx
        .select({ unitCode: s.units.code, tenantName: s.tenants.fullName, expiresOn: s.leases.expiresOn })
        .from(s.leases)
        .innerJoin(s.units, eq(s.units.id, s.leases.unitId))
        .innerJoin(s.tenants, eq(s.tenants.id, s.leases.tenantId))
        .where(
          and(
            eq(s.units.propertyId, propertyId),
            eq(s.leases.status, "active"),
            isNull(s.leases.movedOutOn),
            sql`${s.leases.expiresOn} is not null`,
            lte(s.leases.expiresOn, addDays(t, 30)),
          ),
        )
        .orderBy(asc(s.leases.expiresOn));
      const { receivable, collected } = money;
      return { money, expiring };
    }),
  ]);
  const { money, expiring } = rest;
  const { receivable, collected } = money;
  return {
    units: {
      total: overview.length,
      occupied: overview.filter((u) => u.lease).length,
      vacant: overview.filter((u) => !u.lease && u.status === "active").length,
      maintenance: overview.filter((u) => u.status === "maintenance").length,
    },
    receivable,
    collected,
    outstanding: receivable - collected,
    overdue: money.overdue,
    expiring: expiring.map((e) => ({ ...e, expiresOn: e.expiresOn! })),
  };
}

export async function unitDetail(actor: Actor, unitId: string) {
  return withOrg(actor, async (tx) => {
    const [unit] = await tx.select().from(s.units).where(eq(s.units.id, unitId));
    if (!unit) return null;
    const leaseRows = await tx
      .select({ lease: s.leases, tenant: s.tenants })
      .from(s.leases)
      .innerJoin(s.tenants, eq(s.tenants.id, s.leases.tenantId))
      .where(eq(s.leases.unitId, unitId))
      .orderBy(desc(s.leases.startDate));
    const rents = leaseRows.length
      ? await tx
          .select()
          .from(s.leaseRents)
          .where(inArray(s.leaseRents.leaseId, leaseRows.map((l) => l.lease.id)))
          .orderBy(asc(s.leaseRents.effectiveFrom))
      : [];
    return {
      unit,
      leases: leaseRows.map((l) => ({ ...l, rents: rents.filter((r) => r.leaseId === l.lease.id) })),
    };
  });
}
