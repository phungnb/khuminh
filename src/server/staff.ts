// Nhân viên: chủ trọ tạo link mời theo cơ sở; người nhận đăng ký (hoặc đăng nhập bằng email
// đã có) và được giao cơ sở đó. Nhân viên ghi chỉ số, thu tiền; không phát hành/hủy hóa đơn.

import { randomBytes } from "node:crypto";
import { and, eq, isNull, sql } from "drizzle-orm";
import { getDb, withOrg } from "@/db/client";
import { memberships, organizations, properties, propertyStaff, staffInvites, users } from "@/db/schema";
import { audit, requireOwner, UserError, type Actor } from "./audit";
import { hashPassword, verifyPassword } from "./auth";
import { hashToken } from "./share";

export const STAFF_INVITE_TTL_DAYS = 7;

export async function createStaffInvite(actor: Actor, propertyId: string): Promise<{ token: string }> {
  requireOwner(actor);
  const token = randomBytes(32).toString("base64url");
  await withOrg(actor, async (tx) => {
    const [p] = await tx.select({ id: properties.id }).from(properties).where(eq(properties.id, propertyId));
    if (!p) throw new UserError("Không tìm thấy cơ sở");
    await tx.insert(staffInvites).values({
      orgId: actor.orgId,
      propertyId,
      tokenHash: hashToken(token),
      expiresAt: new Date(Date.now() + STAFF_INVITE_TTL_DAYS * 86_400_000),
      createdBy: actor.userId,
    });
    await audit(tx, actor, "staff.invite", "property", propertyId, null, null);
  });
  return { token };
}

export interface StaffInviteInfo {
  orgId: string;
  inviteId: string;
  propertyId: string;
  orgName: string;
  propertyName: string;
}

export async function resolveStaffInvite(token: string): Promise<StaffInviteInfo | null> {
  if (!/^[A-Za-z0-9_-]{43}$/.test(token)) return null;
  const found = (await getDb().execute(
    sql`select org_id, invite_id, property_id from resolve_staff_invite(${hashToken(token)})`,
  )) as unknown as Array<{ org_id: string; invite_id: string; property_id: string }>;
  const hit = found[0];
  if (!hit) return null;
  return withOrg({ orgId: hit.org_id, userId: null }, async (tx) => {
    const [row] = await tx
      .select({ propertyName: properties.name, orgName: organizations.name })
      .from(properties)
      .innerJoin(organizations, eq(organizations.id, properties.orgId))
      .where(eq(properties.id, hit.property_id));
    if (!row) return null;
    return { orgId: hit.org_id, inviteId: hit.invite_id, propertyId: hit.property_id, ...row };
  });
}

/**
 * Nhận lời mời nhân viên. Email chưa có tài khoản thì tạo mới; đã có thì phải đúng mật khẩu.
 * Người đã là chủ sở hữu của tổ chức này thì không cần lời mời.
 */
export async function acceptStaffInvite(
  token: string,
  input: { email: string; password: string; displayName: string },
): Promise<string> {
  const invite = await resolveStaffInvite(token);
  if (!invite) throw new UserError("Link mời đã hết hạn hoặc đã được dùng. Hãy xin chủ trọ link mới.");
  const email = input.email.trim().toLowerCase();
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) throw new UserError("Email không hợp lệ");
  if (input.password.length < 8) throw new UserError("Mật khẩu cần ít nhất 8 ký tự");

  const db = getDb();
  const [existing] = await db.select().from(users).where(eq(users.email, email));
  let userId: string;
  if (existing) {
    if (!existing.passwordHash || !(await verifyPassword(input.password, existing.passwordHash))) {
      throw new UserError("Email này đã có tài khoản. Nhập đúng mật khẩu để nhận lời mời.");
    }
    userId = existing.id;
  } else {
    if (!input.displayName.trim()) throw new UserError("Cần nhập tên");
    const [u] = await db
      .insert(users)
      .values({ email, displayName: input.displayName.trim(), passwordHash: await hashPassword(input.password) })
      .returning({ id: users.id });
    userId = u!.id;
  }

  await withOrg({ orgId: invite.orgId, userId }, async (tx) => {
    const used = await tx
      .update(staffInvites)
      .set({ usedAt: new Date(), usedBy: userId })
      .where(and(eq(staffInvites.id, invite.inviteId), isNull(staffInvites.usedAt)))
      .returning({ id: staffInvites.id });
    if (used.length === 0) throw new UserError("Link mời đã được dùng");
    const [m] = await tx
      .select({ role: memberships.role })
      .from(memberships)
      .where(and(eq(memberships.orgId, invite.orgId), eq(memberships.userId, userId)));
    if (m?.role === "owner") throw new UserError("Bạn đã là chủ của khu trọ này");
    if (!m) await tx.insert(memberships).values({ orgId: invite.orgId, userId, role: "staff" });
    await tx
      .insert(propertyStaff)
      .values({ orgId: invite.orgId, propertyId: invite.propertyId, userId })
      .onConflictDoNothing();
    await audit(tx, { orgId: invite.orgId, userId, role: "staff" }, "staff.join", "property", invite.propertyId, null, null);
  });
  return userId;
}

export async function listStaff(actor: Actor, propertyId: string) {
  return withOrg(actor, (tx) =>
    tx
      .select({ userId: users.id, displayName: users.displayName, email: users.email })
      .from(propertyStaff)
      .innerJoin(users, eq(users.id, propertyStaff.userId))
      .where(eq(propertyStaff.propertyId, propertyId)),
  );
}

/** Bỏ giao cơ sở; nếu nhân viên không còn cơ sở nào thì xóa luôn tư cách thành viên. */
export async function removeStaff(actor: Actor, propertyId: string, userId: string): Promise<void> {
  requireOwner(actor);
  await withOrg(actor, async (tx) => {
    const removed = await tx
      .delete(propertyStaff)
      .where(and(eq(propertyStaff.propertyId, propertyId), eq(propertyStaff.userId, userId)))
      .returning({ id: propertyStaff.id });
    if (removed.length === 0) throw new UserError("Không tìm thấy nhân viên");
    const [left] = await tx.select({ id: propertyStaff.id }).from(propertyStaff).where(eq(propertyStaff.userId, userId)).limit(1);
    if (!left) {
      await tx
        .delete(memberships)
        .where(and(eq(memberships.orgId, actor.orgId), eq(memberships.userId, userId), eq(memberships.role, "staff")));
    }
    await audit(tx, actor, "staff.remove", "property", propertyId, { userId }, null);
  });
}
