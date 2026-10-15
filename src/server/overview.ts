// Đọc số cho tổng quan gộp nhiều cơ sở (/quan-ly). Chỉ đọc; số tiền dùng chung propertyMoney với trang cơ sở.

import { and, asc, eq, inArray, isNull, lte, ne, sql } from "drizzle-orm";
import { withOrg } from "@/db/client";
import * as s from "@/db/schema";
import { addDays, type IsoDate } from "@/domain/dates";
import type { Actor } from "./audit";
import { emptyMoney, EXPIRING_WITHIN_DAYS, previousMonth, type PropertySummary } from "./overview-items";
import { listProperties, propertyMoney, today, unitsOverview } from "./queries";

/** Tổng quan mọi cơ sở người dùng được thấy (nhân viên: chỉ cơ sở được giao). */
export async function orgOverview(actor: Actor, t: IsoDate = today()): Promise<PropertySummary[]> {
  const props = await listProperties(actor);
  if (props.length === 0) return [];
  const ids = props.map((p) => p.id);
  const unitLists = await Promise.all(ids.map((id) => unitsOverview(actor, id, t)));
  const prev = previousMonth(t);

  return withOrg(actor, async (tx) => {
    const money = await propertyMoney(tx, ids, t);

    // Kỳ đang mở đã bắt đầu: phòng có hợp đồng trong kỳ (cùng điều kiện với generateDrafts) mà chưa có hóa đơn.
    const periods = await tx
      .select()
      .from(s.billingPeriods)
      .where(and(inArray(s.billingPeriods.propertyId, ids), eq(s.billingPeriods.status, "open"), lte(s.billingPeriods.periodStart, t)))
      .orderBy(asc(s.billingPeriods.periodStart));
    const gapRows = periods.length
      ? ((await tx.execute(sql`
          select p.id as period_id, u.code as unit_code, u.block as block,
            (select i.status from invoices i where i.lease_id = l.id and i.billing_period_id = p.id and i.status <> 'void' limit 1) as inv_status
          from billing_periods p
          join units u on u.property_id = p.property_id
          join leases l on l.unit_id = u.id
          where p.id in (${sql.join(periods.map((p) => sql`${p.id}::uuid`), sql`, `)})
            and l.status <> 'draft'
            and l.start_date <= p.period_end
            and (l.moved_out_on is null or l.moved_out_on >= p.period_start)
          order by u.block nulls first, u.code
        `)) as unknown as Array<{ period_id: string; unit_code: string; block: string | null; inv_status: string | null }>)
      : [];

    // Tháng trước có người ở mà chưa có kỳ nào phủ ngày cuối tháng.
    const covered = await tx
      .select({ propertyId: s.billingPeriods.propertyId })
      .from(s.billingPeriods)
      .where(
        and(
          inArray(s.billingPeriods.propertyId, ids),
          lte(s.billingPeriods.periodStart, prev.end),
          sql`${s.billingPeriods.periodEnd} >= ${prev.end}`,
        ),
      );
    const occupiedPrev = await tx
      .select({ propertyId: s.units.propertyId })
      .from(s.leases)
      .innerJoin(s.units, eq(s.units.id, s.leases.unitId))
      .where(
        and(
          inArray(s.units.propertyId, ids),
          ne(s.leases.status, "draft"),
          lte(s.leases.startDate, prev.end),
          sql`(${s.leases.movedOutOn} is null or ${s.leases.movedOutOn} >= ${prev.start})`,
        ),
      );

    const due = await tx
      .select({
        propertyId: s.units.propertyId,
        unitId: s.units.id,
        unitCode: s.units.code,
        tenantName: s.tenants.fullName,
        expiresOn: s.leases.expiresOn,
      })
      .from(s.leases)
      .innerJoin(s.units, eq(s.units.id, s.leases.unitId))
      .innerJoin(s.tenants, eq(s.tenants.id, s.leases.tenantId))
      .where(
        and(
          inArray(s.units.propertyId, ids),
          eq(s.leases.status, "active"),
          isNull(s.leases.movedOutOn),
          sql`${s.leases.expiresOn} is not null`,
          lte(s.leases.expiresOn, addDays(t, EXPIRING_WITHIN_DAYS)),
        ),
      )
      .orderBy(asc(s.leases.expiresOn));

    const issues = await tx
      .select({ propertyId: s.maintenanceRequests.propertyId, n: sql<number>`count(*)::int` })
      .from(s.maintenanceRequests)
      .where(and(inArray(s.maintenanceRequests.propertyId, ids), inArray(s.maintenanceRequests.status, ["open", "in_progress"])))
      .groupBy(s.maintenanceRequests.propertyId);

    return props.map((p, idx) => {
      const units = unitLists[idx]!;
      const gaps = periods
        .filter((per) => per.propertyId === p.id)
        .map((per) => {
          const rows = gapRows.filter((r) => r.period_id === per.id);
          return {
            periodId: per.id,
            periodStart: per.periodStart,
            periodEnd: per.periodEnd,
            missingUnits: rows.filter((r) => r.inv_status === null).map((r) => (r.block ? `${r.block}-${r.unit_code}` : r.unit_code)),
            drafts: rows.filter((r) => r.inv_status === "draft").length,
          };
        })
        // Kỳ chưa kết thúc mà chưa có hóa đơn nào là bình thường (thu sau); chỉ nhắc khi kỳ đã hết hoặc đã có nháp.
        .filter((g) => (g.periodEnd < t && g.missingUnits.length > 0) || g.drafts > 0);
      return {
        id: p.id,
        name: p.name,
        money: money.get(p.id) ?? emptyMoney(),
        units: {
          total: units.length,
          occupied: units.filter((u) => u.lease).length,
          vacant: units.filter((u) => !u.lease && u.status === "active").length,
          maintenance: units.filter((u) => u.status === "maintenance").length,
        },
        periodGaps: gaps,
        missingPeriodFor:
          occupiedPrev.some((o) => o.propertyId === p.id) && !covered.some((c) => c.propertyId === p.id) ? prev : null,
        leasesDue: due
          .filter((d) => d.propertyId === p.id)
          .map((d) => ({ unitId: d.unitId, unitCode: d.unitCode, tenantName: d.tenantName, expiresOn: d.expiresOn! })),
        openIssues: issues.find((i) => i.propertyId === p.id)?.n ?? 0,
      };
    });
  });
}
