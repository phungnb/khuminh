// Tài khoản người thuê: chủ trọ tạo link mời theo hồ sơ người thuê; người thuê mở link,
// đặt số điện thoại + mật khẩu, rồi xem hóa đơn của mình trong app.
//
// RLS chỉ cô lập theo tổ chức, nên trong một tổ chức mọi truy vấn ở đây PHẢI lọc theo
// tenant_id của chính người dùng. Kiểm thử ở tenant.db.test.ts.

import { randomBytes } from "node:crypto";
import { and, desc, eq, inArray, isNull, ne, sql } from "drizzle-orm";
import { getDb, withOrg, withUser, type Tx } from "@/db/client";
import {
  billingPeriods,
  invoices,
  leases,
  memberships,
  paymentAllocations,
  properties,
  sessions,
  tenantInvites,
  tenants,
  units,
  users,
} from "@/db/schema";
import { paymentState, type PaymentState } from "@/domain/payments";
import { audit, requireOwner, UserError, type Actor } from "./audit";
import { hashPassword, MIN_PASSWORD_LENGTH, normalizePhone, verifyPassword } from "./auth";
import { assertLoginAllowed, clientIp, noteLoginFailure, noteLoginSuccess } from "./rate-limit";
import { loadInvoiceView, hashToken, type PublicInvoice } from "./share";
import { today } from "./queries";

export const INVITE_TTL_DAYS = 14;

/**
 * Tạo link mời cho người thuê của hợp đồng; link cũ chưa dùng vẫn còn hiệu lực tới khi hết hạn.
 * Người thuê đã có tài khoản thì link này là link ĐẶT LẠI MẬT KHẨU (quên mật khẩu): chỉ chủ trọ
 * tạo được, và chỉ khi tài khoản không dùng ở khu của chủ trọ khác (xem assertResettable).
 */
export async function createTenantInvite(
  actor: Actor,
  leaseId: string,
): Promise<{ token: string; expiresAt: Date; reset: boolean }> {
  const token = randomBytes(32).toString("base64url");
  const expiresAt = new Date(Date.now() + INVITE_TTL_DAYS * 86_400_000);
  let reset = false;
  await withOrg(actor, async (tx) => {
    const [row] = await tx
      .select({ tenantId: leases.tenantId, status: leases.status, movedOutOn: leases.movedOutOn, userId: tenants.userId })
      .from(leases)
      .innerJoin(tenants, eq(tenants.id, leases.tenantId))
      .where(eq(leases.id, leaseId));
    if (!row) throw new UserError("Không tìm thấy hợp đồng");
    if (row.status !== "active" || row.movedOutOn) throw new UserError("Chỉ mời được người thuê đang ở");
    if (row.userId) {
      requireOwner(actor);
      await assertResettable(row.userId, actor.orgId);
      reset = true;
    }
    await tx.insert(tenantInvites).values({
      orgId: actor.orgId,
      tenantId: row.tenantId,
      tokenHash: hashToken(token),
      expiresAt,
      createdBy: actor.userId,
    });
    await audit(tx, actor, reset ? "tenant.reset_link" : "tenant.invite", "tenant", row.tenantId, null, { expiresAt });
  });
  return { token, expiresAt, reset };
}

/**
 * Chủ trọ chỉ được đặt lại mật khẩu cho tài khoản chỉ thuê ở khu của mình. Nếu tài khoản còn gắn
 * khu của chủ trọ khác, hoặc là chủ/nhân viên, đặt lại từ đây sẽ cho chủ trọ này chiếm quyền xem
 * dữ liệu ở nơi khác.
 */
async function assertResettable(userId: string, orgId: string): Promise<void> {
  const links = await tenantLinks(userId);
  if (links.some((l) => l.orgId !== orgId)) {
    throw new UserError("Tài khoản này đang dùng ở khu trọ khác nên không đặt lại mật khẩu từ đây được. Liên hệ hỗ trợ KhuMình.");
  }
  const managed = await withUser(userId, (tx) =>
    tx.select({ id: memberships.id }).from(memberships).where(eq(memberships.userId, userId)).limit(1),
  );
  if (managed.length) throw new UserError("Tài khoản này là chủ trọ hoặc nhân viên, không đặt lại mật khẩu từ đây được.");
}

export interface InviteInfo {
  orgId: string;
  inviteId: string;
  tenantId: string;
  fullName: string;
  phone: string | null;
  propertyName: string;
  unitCode: string;
  /** Có giá trị khi người thuê đã có tài khoản: link là link đặt lại mật khẩu. */
  resetUserId: string | null;
}

async function findInvite(token: string): Promise<InviteInfo | null> {
  if (!/^[A-Za-z0-9_-]{43}$/.test(token)) return null;
  const found = (await getDb().execute(
    sql`select org_id, invite_id, tenant_id from resolve_tenant_invite(${hashToken(token)})`,
  )) as unknown as Array<{ org_id: string; invite_id: string; tenant_id: string }>;
  const hit = found[0];
  if (!hit) return null;
  return withOrg({ orgId: hit.org_id, userId: null }, async (tx) => {
    const [row] = await tx
      .select({ fullName: tenants.fullName, phone: tenants.phone, userId: tenants.userId, propertyName: properties.name, unit: units })
      .from(tenants)
      .innerJoin(leases, eq(leases.tenantId, tenants.id))
      .innerJoin(units, eq(units.id, leases.unitId))
      .innerJoin(properties, eq(properties.id, units.propertyId))
      .where(eq(tenants.id, hit.tenant_id))
      .orderBy(desc(leases.startDate))
      .limit(1);
    if (!row) return null;
    return {
      orgId: hit.org_id,
      inviteId: hit.invite_id,
      tenantId: hit.tenant_id,
      fullName: row.fullName,
      phone: row.phone,
      propertyName: row.propertyName,
      unitCode: row.unit.block ? `${row.unit.block}-${row.unit.code}` : row.unit.code,
      resetUserId: row.userId,
    };
  });
}

export { findInvite as resolveTenantInvite };

/**
 * Nhận lời mời. Số điện thoại chưa có tài khoản thì tạo mới; đã có thì phải đúng mật khẩu
 * (một người thuê nhiều nơi dùng chung một tài khoản). Nếu chủ trọ đã ghi SĐT người thuê thì
 * SĐT nhập phải trùng, để link bị chuyển tiếp không gắn nhầm người. Link của người đã có tài
 * khoản là link đặt lại mật khẩu (resetTenantPassword). Trả về userId để tạo phiên.
 */
export async function acceptTenantInvite(
  token: string,
  input: { phone: string; password: string; displayName?: string },
): Promise<string> {
  const invite = await findInvite(token);
  if (!invite) throw new UserError("Link mời đã hết hạn hoặc đã được dùng. Hãy xin chủ nhà link mới.");
  const phone = normalizePhone(input.phone);
  if (!phone) throw new UserError("Số điện thoại không hợp lệ");
  if (invite.resetUserId) return resetTenantPassword(invite, invite.resetUserId, phone, input.password);

  const expectedPhone = invite.phone ? normalizePhone(invite.phone) : null;
  if (expectedPhone && expectedPhone !== phone) {
    throw new UserError("Số điện thoại không khớp với số chủ nhà đã ghi. Hãy hỏi lại chủ nhà.");
  }

  const db = getDb();
  const [existing] = await db.select().from(users).where(eq(users.phone, phone));
  let userId: string;
  if (existing) {
    // Người thuê đã có tài khoản: kiểm tra mật khẩu như một lần đăng nhập → chịu rate-limit.
    const ip = await clientIp();
    assertLoginAllowed(ip, phone);
    if (!existing.passwordHash || !(await verifyPassword(input.password, existing.passwordHash))) {
      noteLoginFailure(ip, phone);
      throw new UserError("Số điện thoại này đã có tài khoản. Nhập đúng mật khẩu để thêm phòng vào tài khoản đó.");
    }
    noteLoginSuccess(ip, phone);
    userId = existing.id;
  } else {
    if (input.password.length < MIN_PASSWORD_LENGTH) throw new UserError(`Mật khẩu cần ít nhất ${MIN_PASSWORD_LENGTH} ký tự`);
    const [u] = await db
      .insert(users)
      .values({ phone, displayName: input.displayName?.trim() || invite.fullName, passwordHash: await hashPassword(input.password) })
      .returning({ id: users.id });
    userId = u!.id;
  }

  await withOrg({ orgId: invite.orgId, userId }, async (tx) => {
    await useInvite(tx, invite);
    const linked = await tx
      .update(tenants)
      .set({ userId, phone: sql`coalesce(${tenants.phone}, ${phone})` })
      .where(and(eq(tenants.id, invite.tenantId), isNull(tenants.userId)))
      .returning({ id: tenants.id });
    if (linked.length === 0) throw new UserError("Hồ sơ người thuê này đã gắn với tài khoản khác");
    await audit(tx, { orgId: invite.orgId, userId, role: "staff" }, "tenant.link", "tenant", invite.tenantId, null, { userId });
  });
  return userId;
}

/**
 * Khóa lời mời để hai lần bấm cùng lúc không dùng được hai lần, và vô hiệu mọi link khác còn
 * mở của cùng người thuê: link mời cũ chưa dùng sẽ thành link đặt lại mật khẩu sau khi đã có
 * tài khoản, nên không được để sót.
 */
async function useInvite(tx: Tx, invite: InviteInfo): Promise<void> {
  const now = new Date();
  const used = await tx
    .update(tenantInvites)
    .set({ usedAt: now })
    .where(and(eq(tenantInvites.id, invite.inviteId), isNull(tenantInvites.usedAt)))
    .returning({ id: tenantInvites.id });
  if (used.length === 0) throw new UserError("Link mời đã được dùng");
  await tx
    .update(tenantInvites)
    .set({ usedAt: now })
    .where(and(eq(tenantInvites.tenantId, invite.tenantId), isNull(tenantInvites.usedAt)));
}

/** Đặt lại mật khẩu qua link chủ trọ cấp. SĐT phải trùng tài khoản; mọi phiên cũ bị thu hồi. */
async function resetTenantPassword(invite: InviteInfo, userId: string, phone: string, password: string): Promise<string> {
  const [user] = await getDb().select({ id: users.id, phone: users.phone }).from(users).where(eq(users.id, userId));
  if (!user?.phone || user.phone !== phone) throw new UserError("Số điện thoại không khớp với tài khoản của bạn");
  if (password.length < MIN_PASSWORD_LENGTH) throw new UserError(`Mật khẩu cần ít nhất ${MIN_PASSWORD_LENGTH} ký tự`);
  await assertResettable(userId, invite.orgId);
  const passwordHash = await hashPassword(password);
  await withOrg({ orgId: invite.orgId, userId }, async (tx) => {
    await useInvite(tx, invite);
    await tx.update(users).set({ passwordHash }).where(eq(users.id, userId));
    await tx.delete(sessions).where(eq(sessions.userId, userId));
    await audit(tx, { orgId: invite.orgId, userId, role: "staff" }, "tenant.password_reset", "tenant", invite.tenantId, null, null);
  });
  return userId;
}

/** Các hồ sơ người thuê (theo tổ chức) gắn với tài khoản này. */
export async function tenantLinks(userId: string): Promise<Array<{ orgId: string; tenantId: string }>> {
  return withUser(userId, (tx) =>
    tx.select({ orgId: tenants.orgId, tenantId: tenants.id }).from(tenants).where(eq(tenants.userId, userId)),
  );
}

export interface TenantInvoiceRow {
  id: string;
  code: string;
  dueDate: string;
  total: number;
  paid: number;
  state: PaymentState;
  periodLabel: string;
}

export interface TenantHome {
  orgId: string;
  propertyId: string;
  propertyName: string;
  unitCode: string;
  active: boolean;
  invoices: TenantInvoiceRow[];
}

/** Màn hình chính của người thuê: mỗi phòng đang/đã thuê kèm hóa đơn đã phát hành. */
export async function tenantHome(userId: string): Promise<TenantHome[]> {
  const t = today();
  const out: TenantHome[] = [];
  for (const [orgId, tenantIds] of groupLinks(await tenantLinks(userId))) {
    const homes = await withOrg({ orgId, userId }, async (tx) => {
      const ls = await tx
        .select({ lease: leases, unit: units, propertyName: properties.name })
        .from(leases)
        .innerJoin(units, eq(units.id, leases.unitId))
        .innerJoin(properties, eq(properties.id, units.propertyId))
        .where(and(inArray(leases.tenantId, tenantIds), ne(leases.status, "draft")))
        .orderBy(desc(leases.startDate));
      if (ls.length === 0) return [];
      const invs = await tx
        .select({
          inv: invoices,
          periodStart: billingPeriods.periodStart,
          paid: sql<string>`coalesce((select sum(a.amount) from ${paymentAllocations} a where a.invoice_id = ${invoices.id}), 0)`,
        })
        .from(invoices)
        .innerJoin(billingPeriods, eq(billingPeriods.id, invoices.billingPeriodId))
        .where(and(inArray(invoices.leaseId, ls.map((l) => l.lease.id)), ne(invoices.status, "draft")))
        .orderBy(desc(invoices.dueDate));
      return ls.map((l) => ({
        orgId,
        propertyId: l.unit.propertyId,
        propertyName: l.propertyName,
        unitCode: l.unit.block ? `${l.unit.block}-${l.unit.code}` : l.unit.code,
        active: l.lease.status === "active" && (!l.lease.movedOutOn || l.lease.movedOutOn >= t),
        invoices: invs
          .filter((r) => r.inv.leaseId === l.lease.id)
          .map((r) => ({
            id: r.inv.id,
            code: r.inv.code,
            dueDate: r.inv.dueDate,
            total: r.inv.total,
            paid: Number(r.paid),
            state: paymentState(r.inv.status, r.inv.total, Number(r.paid), r.inv.dueDate, t),
            periodLabel: `${r.periodStart.slice(5, 7)}/${r.periodStart.slice(0, 4)}`,
          })),
      }));
    });
    out.push(...homes);
  }
  return out.sort((a, b) => Number(b.active) - Number(a.active));
}

/** Một hóa đơn của chính người thuê; null nếu không phải của họ. */
export async function tenantInvoice(userId: string, invoiceId: string): Promise<PublicInvoice | null> {
  if (!/^[0-9a-f-]{36}$/i.test(invoiceId)) return null;
  for (const [orgId, tenantIds] of groupLinks(await tenantLinks(userId))) {
    const hit = await withOrg({ orgId, userId }, async (tx) => {
      const [own] = await tx
        .select({ id: invoices.id })
        .from(invoices)
        .innerJoin(leases, eq(leases.id, invoices.leaseId))
        .where(and(eq(invoices.id, invoiceId), inArray(leases.tenantId, tenantIds)));
      return own ? loadInvoiceView(tx, invoiceId) : null;
    });
    if (hit) return hit;
  }
  return null;
}

export function groupLinks(links: Array<{ orgId: string; tenantId: string }>): Map<string, string[]> {
  const m = new Map<string, string[]>();
  for (const l of links) m.set(l.orgId, [...(m.get(l.orgId) ?? []), l.tenantId]);
  return m;
}
