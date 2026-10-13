// Thông báo đẩy (Web Push) cho app người thuê: hóa đơn mới, thông báo của chủ trọ.
// Cần VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY (tạo bằng `npx web-push generate-vapid-keys`).
// Thiếu khóa thì bỏ qua, không báo lỗi. iPhone chỉ nhận khi app đã được thêm vào màn hình chính.

import { and, eq, inArray, isNotNull, isNull, ne, or, gte } from "drizzle-orm";
import webpush from "web-push";
import { getDb, withOrg, type Tx } from "@/db/client";
import type { Actor } from "./audit";
import { invoices, leases, pushSubscriptions, tenants, units } from "@/db/schema";
import { today } from "./queries";

export interface PushMessage {
  title: string;
  body: string;
  url: string;
}

export interface StoredSubscription {
  endpoint: string;
  p256dh: string;
  auth: string;
}

/** Trả về "gone" khi trình duyệt đã hủy đăng ký (404/410) để xóa khỏi CSDL. */
type Sender = (sub: StoredSubscription, msg: PushMessage) => Promise<"ok" | "gone">;

const defaultSender: Sender = async (sub, msg) => {
  try {
    await webpush.sendNotification(
      { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
      JSON.stringify(msg),
      {
        TTL: 86_400,
        vapidDetails: {
          subject: process.env.VAPID_SUBJECT ?? "mailto:hotro@khuminh.vn",
          publicKey: process.env.VAPID_PUBLIC_KEY!,
          privateKey: process.env.VAPID_PRIVATE_KEY!,
        },
      },
    );
    return "ok";
  } catch (e) {
    const code = (e as { statusCode?: number }).statusCode;
    if (code === 404 || code === 410) return "gone";
    console.error("web push", code, (e as Error).message);
    return "ok";
  }
};

let sender: Sender | null = null;

export function setPushSenderForTests(s: Sender | null): void {
  sender = s;
}

export function pushPublicKey(): string | null {
  return process.env.VAPID_PUBLIC_KEY && process.env.VAPID_PRIVATE_KEY ? process.env.VAPID_PUBLIC_KEY : null;
}

export async function saveSubscription(userId: string, sub: StoredSubscription): Promise<void> {
  if (!/^https:\/\//.test(sub.endpoint) || !sub.p256dh || !sub.auth) throw new Error("Đăng ký thông báo không hợp lệ");
  await getDb()
    .insert(pushSubscriptions)
    .values({ userId, ...sub })
    .onConflictDoUpdate({ target: pushSubscriptions.endpoint, set: { userId, p256dh: sub.p256dh, auth: sub.auth } });
}

export async function removeSubscription(userId: string, endpoint: string): Promise<void> {
  await getDb()
    .delete(pushSubscriptions)
    .where(and(eq(pushSubscriptions.userId, userId), eq(pushSubscriptions.endpoint, endpoint)));
}

export async function hasSubscription(userId: string): Promise<boolean> {
  const [row] = await getDb().select({ id: pushSubscriptions.id }).from(pushSubscriptions).where(eq(pushSubscriptions.userId, userId)).limit(1);
  return Boolean(row);
}

/** Gửi tới mọi thiết bị của các người dùng; lỗi không làm hỏng thao tác chính. */
export async function sendToUsers(userIds: string[], msg: PushMessage): Promise<number> {
  const send = sender ?? (pushPublicKey() ? defaultSender : null);
  const ids = [...new Set(userIds)];
  if (!send || ids.length === 0) return 0;
  const subs = await getDb().select().from(pushSubscriptions).where(inArray(pushSubscriptions.userId, ids));
  const results = await Promise.allSettled(subs.map(async (s) => ((await send(s, msg)) === "gone" ? s.endpoint : null)));
  const gone = results.flatMap((r) => (r.status === "fulfilled" && r.value ? [r.value] : []));
  if (gone.length) await getDb().delete(pushSubscriptions).where(inArray(pushSubscriptions.endpoint, gone));
  return subs.length - gone.length;
}

/** Tài khoản người thuê đang ở trong cơ sở (gọi trong withOrg). */
export async function tenantUsersOfProperty(tx: Tx, propertyId: string): Promise<string[]> {
  const rows = await tx
    .select({ userId: tenants.userId })
    .from(leases)
    .innerJoin(units, eq(units.id, leases.unitId))
    .innerJoin(tenants, eq(tenants.id, leases.tenantId))
    .where(
      and(
        eq(units.propertyId, propertyId),
        eq(leases.status, "active"),
        or(isNull(leases.movedOutOn), gte(leases.movedOutOn, today())),
        isNotNull(tenants.userId),
      ),
    );
  return rows.map((r) => r.userId!);
}

/** Người thuê có tài khoản của từng hóa đơn đã phát hành (gọi trong withOrg). */
export async function tenantUsersOfInvoices(tx: Tx, invoiceIds: string[]) {
  if (invoiceIds.length === 0) return [];
  const rows = await tx
    .select({ userId: tenants.userId, invoiceId: invoices.id, total: invoices.total, dueDate: invoices.dueDate, unitCode: units.code })
    .from(invoices)
    .innerJoin(leases, eq(leases.id, invoices.leaseId))
    .innerJoin(tenants, eq(tenants.id, leases.tenantId))
    .innerJoin(units, eq(units.id, invoices.unitId))
    .where(and(inArray(invoices.id, invoiceIds), ne(invoices.status, "draft"), isNotNull(tenants.userId)));
  return rows.map((r) => ({ ...r, userId: r.userId! }));
}

/** Báo cho người thuê có tài khoản khi hóa đơn của họ được phát hành. */
export async function notifyInvoicesIssued(actor: Actor, invoiceIds: string[]): Promise<number> {
  const rows = await withOrg(actor, (tx) => tenantUsersOfInvoices(tx, invoiceIds));
  let sent = 0;
  for (const r of rows) {
    const [y, m, d] = r.dueDate.split("-");
    sent += await sendToUsers([r.userId], {
      title: `Hóa đơn phòng ${r.unitCode}`,
      body: `${r.total.toLocaleString("vi-VN")}đ, hạn trả ${d}/${m}/${y}. Bấm để xem và quét mã QR.`,
      url: `/app/hoa-don/${r.invoiceId}`,
    });
  }
  return sent;
}
