// Báo sự cố (yêu cầu sửa chữa): người thuê đang ở báo sự cố phòng mình; chủ trọ và nhân viên
// được giao cơ sở nhận, xử lý, đánh dấu xong hoặc từ chối.
//
// RLS chỉ cô lập theo tổ chức. Trong một tổ chức, người thuê chỉ được chạm yêu cầu thuộc hợp đồng
// của chính mình (lọc theo tenant_id), nhân viên chỉ cơ sở được giao (assertPropertyAccess).
// Kiểm thử ở maintenance.db.test.ts.

import { and, desc, eq, gte, inArray, isNull, or, sql } from "drizzle-orm";
import { withOrg, type Tx } from "@/db/client";
import { leases, maintenanceRequests, memberships, properties, propertyStaff, tenants, units, users } from "@/db/schema";
import { audit, UserError, type Actor } from "./audit";
import { sendToUsers } from "./push";
import { today } from "./queries";
import { assertPropertyAccess } from "./setup";
import { groupLinks, tenantLinks } from "./tenant";

export type MaintenanceStatus = "open" | "in_progress" | "done" | "rejected";

export const MAINTENANCE_STATUS_LABEL: Record<MaintenanceStatus, string> = {
  open: "Mới",
  in_progress: "Đang xử lý",
  done: "Đã xong",
  rejected: "Từ chối",
};

/** Trạng thái có thể chuyển tới. Xong/từ chối là trạng thái cuối. */
const NEXT: Record<MaintenanceStatus, MaintenanceStatus[]> = {
  open: ["in_progress", "done", "rejected"],
  in_progress: ["done", "rejected"],
  done: [],
  rejected: [],
};

export interface MaintenanceRow {
  id: string;
  propertyId: string;
  propertyName: string;
  unitCode: string;
  title: string;
  body: string | null;
  urgent: boolean;
  status: MaintenanceStatus;
  resolutionNote: string | null;
  createdByName: string;
  createdAt: Date;
  resolvedAt: Date | null;
}

const rowSelect = {
  req: maintenanceRequests,
  propertyName: properties.name,
  unit: units,
  createdByName: users.displayName,
};

function toRow(r: { req: typeof maintenanceRequests.$inferSelect; propertyName: string; unit: typeof units.$inferSelect; createdByName: string }): MaintenanceRow {
  return {
    id: r.req.id,
    propertyId: r.req.propertyId,
    propertyName: r.propertyName,
    unitCode: r.unit.block ? `${r.unit.block}-${r.unit.code}` : r.unit.code,
    title: r.req.title,
    body: r.req.body,
    urgent: r.req.urgent,
    status: r.req.status,
    resolutionNote: r.req.resolutionNote,
    createdByName: r.createdByName,
    createdAt: r.req.createdAt,
    resolvedAt: r.req.resolvedAt,
  };
}

function baseQuery(tx: Tx) {
  return tx
    .select(rowSelect)
    .from(maintenanceRequests)
    .innerJoin(properties, eq(properties.id, maintenanceRequests.propertyId))
    .innerJoin(units, eq(units.id, maintenanceRequests.unitId))
    .innerJoin(users, eq(users.id, maintenanceRequests.createdBy));
}

/** Phòng người thuê đang ở, có thể báo sự cố. */
export interface ReportablePlace {
  orgId: string;
  leaseId: string;
  propertyName: string;
  unitCode: string;
}

export async function reportablePlaces(userId: string): Promise<ReportablePlace[]> {
  const out: ReportablePlace[] = [];
  for (const [orgId, tenantIds] of groupLinks(await tenantLinks(userId))) {
    const rows = await withOrg({ orgId, userId }, (tx) =>
      tx
        .select({ leaseId: leases.id, unit: units, propertyName: properties.name })
        .from(leases)
        .innerJoin(units, eq(units.id, leases.unitId))
        .innerJoin(properties, eq(properties.id, units.propertyId))
        .where(
          and(
            inArray(leases.tenantId, tenantIds),
            eq(leases.status, "active"),
            or(isNull(leases.movedOutOn), gte(leases.movedOutOn, today())),
          ),
        ),
    );
    for (const r of rows) {
      out.push({ orgId, leaseId: r.leaseId, propertyName: r.propertyName, unitCode: r.unit.block ? `${r.unit.block}-${r.unit.code}` : r.unit.code });
    }
  }
  return out;
}

/** Chủ trọ/nhân viên ghi nhận sự cố thay người thuê (người thuê gọi điện, nhắn Zalo...).
 * Không gửi push (chính người ghi đã biết); người thuê thấy yêu cầu trong mục Báo sự cố của mình. */
export async function createMaintenanceRequestByManager(
  actor: Actor,
  propertyId: string,
  unitId: string,
  input: { title: string; body?: string | null; urgent?: boolean },
): Promise<string> {
  const title = input.title.trim();
  const body = input.body?.trim() || null;
  if (!title) throw new UserError("Cần nhập sự cố");
  if (title.length > 120) throw new UserError("Tiêu đề tối đa 120 ký tự");
  if (body && body.length > 1000) throw new UserError("Mô tả tối đa 1000 ký tự");
  return withOrg(actor, async (tx) => {
    await assertPropertyAccess(tx, actor, propertyId);
    const [unit] = await tx.select({ id: units.id }).from(units).where(and(eq(units.id, unitId), eq(units.propertyId, propertyId)));
    if (!unit) throw new UserError("Không tìm thấy phòng trong cơ sở này");
    // Gắn hợp đồng mới nhất của phòng (đang thuê, hoặc vừa trả để ghi hư hỏng lúc bàn giao).
    const [lease] = await tx
      .select({ id: leases.id })
      .from(leases)
      .where(eq(leases.unitId, unitId))
      .orderBy(desc(leases.startDate))
      .limit(1);
    if (!lease) throw new UserError("Phòng chưa có hợp đồng nào — ghi sự cố khi có người thuê");
    const [row] = await tx
      .insert(maintenanceRequests)
      .values({
        orgId: actor.orgId,
        propertyId,
        unitId,
        leaseId: lease.id,
        createdBy: actor.userId,
        title,
        body,
        urgent: Boolean(input.urgent),
      })
      .returning({ id: maintenanceRequests.id });
    await audit(tx, actor, "maintenance.create", "maintenance_request", row!.id, null, { title, urgent: Boolean(input.urgent), byManager: true });
    return row!.id;
  });
}

/** Người thuê báo sự cố cho phòng đang ở. Báo cho chủ trọ và nhân viên của cơ sở. */
export async function createMaintenanceRequest(
  userId: string,
  leaseId: string,
  input: { title: string; body?: string | null; urgent?: boolean },
): Promise<string> {
  const title = input.title.trim();
  const body = input.body?.trim() || null;
  if (!title) throw new UserError("Cần nhập sự cố");
  if (title.length > 120) throw new UserError("Tiêu đề tối đa 120 ký tự");
  if (body && body.length > 1000) throw new UserError("Mô tả tối đa 1000 ký tự");

  const place = (await reportablePlaces(userId)).find((p) => p.leaseId === leaseId);
  if (!place) throw new UserError("Bạn không còn ở phòng này");

  const { id, propertyId, managers, propertyName, unitCode } = await withOrg({ orgId: place.orgId, userId }, async (tx) => {
    const [lease] = await tx
      .select({ unitId: units.id, propertyId: units.propertyId })
      .from(leases)
      .innerJoin(units, eq(units.id, leases.unitId))
      .where(eq(leases.id, leaseId));
    if (!lease) throw new UserError("Không tìm thấy hợp đồng");
    const [row] = await tx
      .insert(maintenanceRequests)
      .values({
        orgId: place.orgId,
        propertyId: lease.propertyId,
        unitId: lease.unitId,
        leaseId,
        createdBy: userId,
        title,
        body,
        urgent: Boolean(input.urgent),
      })
      .returning({ id: maintenanceRequests.id });
    await audit(tx, { orgId: place.orgId, userId, role: "staff" }, "maintenance.create", "maintenance_request", row!.id, null, { title, urgent: Boolean(input.urgent) });
    return { id: row!.id, propertyId: lease.propertyId, managers: await managersOfProperty(tx, lease.propertyId), propertyName: place.propertyName, unitCode: place.unitCode };
  });
  await sendToUsers(managers, {
    title: `${input.urgent ? "Sự cố GẤP" : "Báo sự cố"}: phòng ${unitCode}`,
    body: `${propertyName}: ${title}`,
    url: `/co-so/${propertyId}/su-co`,
  }).catch((e) => (console.error("push sự cố", e), 0));
  return id;
}

/** Chủ trọ và nhân viên được giao cơ sở (gọi trong withOrg). */
async function managersOfProperty(tx: Tx, propertyId: string): Promise<string[]> {
  const owners = await tx.select({ userId: memberships.userId }).from(memberships).where(eq(memberships.role, "owner"));
  const staff = await tx.select({ userId: propertyStaff.userId }).from(propertyStaff).where(eq(propertyStaff.propertyId, propertyId));
  return [...new Set([...owners, ...staff].map((r) => r.userId))];
}

/** Yêu cầu do người thuê này tạo hoặc thuộc hợp đồng của họ, mới nhất trước. */
export async function tenantMaintenanceRequests(userId: string): Promise<MaintenanceRow[]> {
  const out: MaintenanceRow[] = [];
  for (const [orgId, tenantIds] of groupLinks(await tenantLinks(userId))) {
    const rows = await withOrg({ orgId, userId }, (tx) =>
      baseQuery(tx)
        .innerJoin(leases, eq(leases.id, maintenanceRequests.leaseId))
        .where(inArray(leases.tenantId, tenantIds))
        .orderBy(desc(maintenanceRequests.createdAt))
        .limit(50),
    );
    out.push(...rows.map(toRow));
  }
  return out.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
}

/** Danh sách theo cơ sở cho chủ trọ/nhân viên được giao. Yêu cầu còn mở lên trước. */
export async function propertyMaintenanceRequests(actor: Actor, propertyId: string): Promise<MaintenanceRow[]> {
  return withOrg(actor, async (tx) => {
    await assertPropertyAccess(tx, actor, propertyId);
    const rows = await baseQuery(tx)
      .where(eq(maintenanceRequests.propertyId, propertyId))
      .orderBy(
        sql`case ${maintenanceRequests.status} when 'open' then 0 when 'in_progress' then 1 else 2 end`,
        desc(maintenanceRequests.urgent),
        desc(maintenanceRequests.createdAt),
      )
      .limit(200);
    return rows.map(toRow);
  });
}

/** Số yêu cầu chưa xong của cơ sở (cho trang tổng quan). */
export async function openMaintenanceCount(actor: Actor, propertyId: string): Promise<number> {
  return withOrg(actor, async (tx) => {
    await assertPropertyAccess(tx, actor, propertyId);
    const [r] = await tx
      .select({ n: sql<number>`count(*)::int` })
      .from(maintenanceRequests)
      .where(and(eq(maintenanceRequests.propertyId, propertyId), inArray(maintenanceRequests.status, ["open", "in_progress"])));
    return r?.n ?? 0;
  });
}

/** Chủ trọ/nhân viên đổi trạng thái. Từ chối bắt buộc ghi lý do. Báo cho người thuê đã báo. */
export async function updateMaintenanceStatus(
  actor: Actor,
  requestId: string,
  status: MaintenanceStatus,
  note?: string | null,
): Promise<void> {
  if (!Object.hasOwn(MAINTENANCE_STATUS_LABEL, status)) throw new UserError("Trạng thái không hợp lệ");
  const resolutionNote = note?.trim() || null;
  if (resolutionNote && resolutionNote.length > 1000) throw new UserError("Ghi chú tối đa 1000 ký tự");
  if (status === "rejected" && !resolutionNote) throw new UserError("Cần ghi lý do từ chối");

  const notify = await withOrg(actor, async (tx) => {
    const [req] = await tx.select().from(maintenanceRequests).where(eq(maintenanceRequests.id, requestId)).for("update");
    if (!req) throw new UserError("Không tìm thấy yêu cầu");
    await assertPropertyAccess(tx, actor, req.propertyId);
    if (!NEXT[req.status].includes(status)) {
      throw new UserError(`Không chuyển được từ "${MAINTENANCE_STATUS_LABEL[req.status]}" sang "${MAINTENANCE_STATUS_LABEL[status]}"`);
    }
    const final = status === "done" || status === "rejected";
    await tx
      .update(maintenanceRequests)
      .set({
        status,
        resolutionNote: resolutionNote ?? req.resolutionNote,
        resolvedBy: final ? actor.userId : null,
        resolvedAt: final ? new Date() : null,
      })
      .where(eq(maintenanceRequests.id, requestId));
    await audit(tx, actor, "maintenance.status", "maintenance_request", requestId, { status: req.status }, { status, note: resolutionNote });
    return { userId: req.createdBy, title: req.title };
  });
  await sendToUsers([notify.userId], {
    title: `Sự cố: ${MAINTENANCE_STATUS_LABEL[status]}`,
    body: resolutionNote ? `${notify.title}. ${resolutionNote}` : notify.title,
    url: "/app/su-co",
  }).catch((e) => (console.error("push sự cố", e), 0));
}
