// Bảng tin khu trọ: chủ trọ/nhân viên đăng thông báo; người thuê đang ở đăng rao bán, cho tặng,
// cần tìm. Chỉ người trong cùng cơ sở thấy. Chủ trọ ẩn được bài không phù hợp.
//
// RLS chỉ cô lập theo tổ chức; quyền theo cơ sở được kiểm tra ở boardViewer*.

import { and, desc, eq, gte, isNull, or } from "drizzle-orm";
import { withOrg } from "@/db/client";
import { leases, memberships, posts, tenants, units, users } from "@/db/schema";
import { audit, ForbiddenError, UserError, type Actor } from "./audit";
import { sendToUsers, tenantUsersOfProperty } from "./push";
import { today } from "./queries";
import { assertPropertyAccess } from "./setup";

export type PostKind = "announcement" | "sell" | "give" | "want";

export const POST_KIND_LABEL: Record<PostKind, string> = {
  announcement: "Thông báo",
  sell: "Cần bán",
  give: "Cho tặng",
  want: "Cần tìm",
};

/** Người đang xem bảng tin của một cơ sở, đã kiểm tra quyền. */
export interface BoardViewer {
  orgId: string;
  userId: string;
  propertyId: string;
  manager: boolean;
}

export async function managerBoardViewer(actor: Actor, propertyId: string): Promise<BoardViewer> {
  await withOrg(actor, (tx) => assertPropertyAccess(tx, actor, propertyId));
  return { orgId: actor.orgId, userId: actor.userId, propertyId, manager: true };
}

/** Người thuê chỉ vào được bảng tin của cơ sở mình đang ở. */
export async function tenantBoardViewer(userId: string, orgId: string, propertyId: string): Promise<BoardViewer> {
  const ok = await withOrg({ orgId, userId }, async (tx) => {
    const [row] = await tx
      .select({ id: leases.id })
      .from(leases)
      .innerJoin(tenants, eq(tenants.id, leases.tenantId))
      .innerJoin(units, eq(units.id, leases.unitId))
      .where(
        and(
          eq(tenants.userId, userId),
          eq(units.propertyId, propertyId),
          eq(leases.status, "active"),
          or(isNull(leases.movedOutOn), gte(leases.movedOutOn, today())),
        ),
      )
      .limit(1);
    return Boolean(row);
  });
  if (!ok) throw new ForbiddenError("Bạn không còn ở khu trọ này");
  return { orgId, userId, propertyId, manager: false };
}

export interface PostRow {
  id: string;
  kind: PostKind;
  title: string;
  body: string | null;
  price: number | null;
  authorName: string;
  fromManager: boolean;
  mine: boolean;
  closed: boolean;
  hidden: boolean;
  createdAt: Date;
}

export async function listPosts(v: BoardViewer, limit = 50): Promise<PostRow[]> {
  return withOrg(v, async (tx) => {
    const rows = await tx
      .select({ post: posts, authorName: users.displayName, role: memberships.role })
      .from(posts)
      .innerJoin(users, eq(users.id, posts.authorUserId))
      .leftJoin(memberships, and(eq(memberships.orgId, posts.orgId), eq(memberships.userId, posts.authorUserId)))
      .where(and(eq(posts.propertyId, v.propertyId), v.manager ? undefined : isNull(posts.hiddenAt)))
      .orderBy(desc(posts.createdAt))
      .limit(limit);
    return rows.map((r) => ({
      id: r.post.id,
      kind: r.post.kind,
      title: r.post.title,
      body: r.post.body,
      price: r.post.price,
      authorName: r.authorName,
      fromManager: Boolean(r.role),
      mine: r.post.authorUserId === v.userId,
      closed: Boolean(r.post.closedAt),
      hidden: Boolean(r.post.hiddenAt),
      createdAt: r.post.createdAt,
    }));
  });
}

export async function createPost(
  v: BoardViewer,
  input: { kind: PostKind; title: string; body?: string | null; price?: number | null },
): Promise<string> {
  if (!(input.kind in POST_KIND_LABEL)) throw new UserError("Loại tin không hợp lệ");
  if (input.kind === "announcement" && !v.manager) throw new ForbiddenError("Chỉ chủ trọ đăng được thông báo");
  const title = input.title.trim();
  const body = input.body?.trim() || null;
  if (!title) throw new UserError("Cần nhập tiêu đề");
  if (title.length > 120) throw new UserError("Tiêu đề tối đa 120 ký tự");
  if (body && body.length > 2000) throw new UserError("Nội dung tối đa 2000 ký tự");
  const price = input.kind === "sell" ? (input.price ?? null) : null;
  if (price !== null && (!Number.isSafeInteger(price) || price < 0)) throw new UserError("Giá không hợp lệ");

  const { id, recipients } = await withOrg(v, async (tx) => {
    const [row] = await tx
      .insert(posts)
      .values({ orgId: v.orgId, propertyId: v.propertyId, authorUserId: v.userId, kind: input.kind, title, body, price })
      .returning({ id: posts.id });
    await audit(tx, { orgId: v.orgId, userId: v.userId, role: "staff" }, "post.create", "post", row!.id, null, { kind: input.kind, title });
    const recipients = input.kind === "announcement" ? await tenantUsersOfProperty(tx, v.propertyId) : [];
    return { id: row!.id, recipients };
  });
  if (recipients.length) {
    await sendToUsers(recipients.filter((u) => u !== v.userId), {
      title: "Thông báo từ chủ trọ",
      body: title,
      url: "/app/bang-tin",
    });
  }
  return id;
}

/** Người đăng đánh dấu đã xong (đã bán/đã tặng/đã tìm được), hoặc gỡ bài của mình. */
export async function closePost(v: BoardViewer, postId: string, action: "close" | "remove"): Promise<void> {
  await withOrg(v, async (tx) => {
    const [p] = await tx.select().from(posts).where(and(eq(posts.id, postId), eq(posts.propertyId, v.propertyId)));
    if (!p) throw new UserError("Không tìm thấy tin");
    if (p.authorUserId !== v.userId && !v.manager) throw new ForbiddenError();
    await tx
      .update(posts)
      .set(action === "close" ? { closedAt: new Date() } : { hiddenAt: new Date() })
      .where(eq(posts.id, postId));
    await audit(tx, { orgId: v.orgId, userId: v.userId, role: "staff" }, `post.${action}`, "post", postId, null, null);
  });
}
