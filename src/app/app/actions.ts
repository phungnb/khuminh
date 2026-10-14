"use server";

import { runAction } from "@/lib/action";
import { parseMoney } from "@/lib/format";
import { requireUser } from "@/lib/session";
import { UserError } from "@/server/audit";
import { closePost, createPost, tenantBoardViewer, type PostKind } from "@/server/board";
import { createMaintenanceRequest } from "@/server/maintenance";
import { removeSubscription, saveSubscription } from "@/server/push";

const str = (f: FormData, k: string) => String(f.get(k) ?? "").trim();

/** Trang bảng tin của một cơ sở, khóa "orgId.propertyId". */
function boardKey(f: FormData) {
  const [orgId, propertyId] = str(f, "cs").split(".");
  if (!orgId || !propertyId) throw new UserError("Thiếu khu trọ");
  return { orgId, propertyId, back: `/app/bang-tin?cs=${orgId}.${propertyId}` };
}

export async function tenantCreatePostAction(f: FormData) {
  const user = await requireUser();
  const { orgId, propertyId, back } = boardKey(f);
  await runAction(back, async () => {
    const kind = str(f, "kind") as PostKind;
    let price: number | null = null;
    if (kind === "sell" && str(f, "price")) {
      price = parseMoney(f.get("price"));
      if (Number.isNaN(price)) throw new UserError("Giá phải là số nguyên đồng");
    }
    await createPost(await tenantBoardViewer(user.id, orgId, propertyId), { kind, title: str(f, "title"), body: str(f, "body"), price });
  }, "Đã đăng tin");
}

export async function tenantClosePostAction(f: FormData) {
  const user = await requireUser();
  const { orgId, propertyId, back } = boardKey(f);
  const action = str(f, "action") === "remove" ? "remove" : "close";
  await runAction(back, async () => {
    await closePost(await tenantBoardViewer(user.id, orgId, propertyId), str(f, "postId"), action);
  }, action === "close" ? "Đã đánh dấu xong" : "Đã gỡ tin");
}

export async function savePushAction(sub: { endpoint: string; p256dh: string; auth: string }): Promise<boolean> {
  const user = await requireUser();
  await saveSubscription(user.id, sub);
  return true;
}

export async function removePushAction(endpoint: string): Promise<boolean> {
  const user = await requireUser();
  await removeSubscription(user.id, endpoint);
  return true;
}

export async function tenantReportIssueAction(f: FormData) {
  const user = await requireUser();
  await runAction("/app/su-co", async () => {
    await createMaintenanceRequest(user.id, str(f, "leaseId"), {
      title: str(f, "title"),
      body: str(f, "body"),
      urgent: str(f, "urgent") === "1",
    });
  }, "Đã gửi cho chủ nhà");
}
