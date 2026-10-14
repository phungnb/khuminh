// Admin nền tảng (KM-HN2 T6). Chỉ đọc qua các hàm SECURITY DEFINER trong drizzle/0009_platform_admin.sql;
// mỗi hàm tự kiểm người gọi có trong platform_admins. App vẫn chạy bằng khuminh_app, không dùng role chủ bảng.
// Admin chỉ thấy số tổng và tin bị báo cáo, không thấy hóa đơn, tiền hay liên hệ.

import { sql } from "drizzle-orm";
import { withUser } from "@/db/client";
import { ForbiddenError, UserError } from "./audit";
import { pgErrorCode } from "./setup";

export interface AdminStats {
  orgs: number;
  properties: number;
  units: number;
  activeLeases: number;
  users: number;
  openListings: number;
  hiddenListings: number;
  openIncidents: number;
}

export interface ReportedListing {
  listingId: string;
  title: string;
  areaLabel: string;
  authorUserId: string;
  authorName: string;
  authorLocked: boolean;
  reports: number;
  reasons: string[];
  hiddenAt: Date | null;
  status: "open" | "closed";
  createdAt: Date;
}

/** Đóng an toàn: DB chưa có hàm (vd. bản Preview chưa migrate, mã 42883) thì coi là không phải admin. */
export async function isPlatformAdmin(userId: string): Promise<boolean> {
  try {
    const rows = (await withUser(userId, (tx) => tx.execute(sql`select is_platform_admin() as ok`))) as unknown as Array<{ ok: boolean }>;
    return rows[0]?.ok === true;
  } catch (e) {
    if (pgErrorCode(e) === "42883") return false;
    throw e;
  }
}

const DB_ERROR_MESSAGE: Record<string, string> = {
  reason_required: "Cần ghi lý do",
  cannot_lock_admin: "Không khóa được chính mình hoặc admin khác",
  listing_not_found: "Không tìm thấy tin",
  user_not_found: "Không tìm thấy tài khoản",
};

/** Lỗi 42501 từ assert_platform_admin() → ForbiddenError; lỗi nghiệp vụ từ hàm SQL → UserError. */
async function asAdmin<T>(fn: () => Promise<T>): Promise<T> {
  try {
    return await fn();
  } catch (e) {
    if (pgErrorCode(e) === "42501") throw new ForbiddenError();
    const msg = (e as { cause?: { message?: string } }).cause?.message ?? (e as Error).message;
    const known = Object.keys(DB_ERROR_MESSAGE).find((k) => msg?.includes(k));
    if (known) throw new UserError(DB_ERROR_MESSAGE[known]);
    throw e;
  }
}

export async function adminStats(userId: string): Promise<AdminStats> {
  return asAdmin(async () => {
    const [r] = (await withUser(userId, (tx) => tx.execute(sql`select * from admin_stats()`))) as unknown as Array<Record<string, string>>;
    return {
      orgs: Number(r!.orgs),
      properties: Number(r!.properties),
      units: Number(r!.units),
      activeLeases: Number(r!.active_leases),
      users: Number(r!.users),
      openListings: Number(r!.open_listings),
      hiddenListings: Number(r!.hidden_listings),
      openIncidents: Number(r!.open_incidents),
    };
  });
}

export async function reportedListings(userId: string, limit = 100): Promise<ReportedListing[]> {
  return asAdmin(async () => {
    const rows = (await withUser(userId, (tx) => tx.execute(sql`select * from admin_reported_listings(${limit})`))) as unknown as Array<{
      listing_id: string;
      title: string;
      area_label: string;
      author_user_id: string;
      author_name: string;
      author_locked: boolean;
      reports: string;
      reasons: string[];
      hidden_at: Date | string | null;
      status: "open" | "closed";
      created_at: Date | string;
    }>;
    return rows.map((r) => ({
      listingId: r.listing_id,
      title: r.title,
      areaLabel: r.area_label,
      authorUserId: r.author_user_id,
      authorName: r.author_name,
      authorLocked: r.author_locked,
      reports: Number(r.reports),
      reasons: r.reasons,
      hiddenAt: r.hidden_at ? new Date(r.hidden_at) : null,
      status: r.status,
      createdAt: new Date(r.created_at),
    }));
  });
}

/** Ẩn (cần lý do) hoặc hiện lại một tin. Ghi nhật ký admin_actions. */
export async function setListingHidden(userId: string, listingId: string, hidden: boolean, reason: string): Promise<void> {
  await asAdmin(() => withUser(userId, (tx) => tx.execute(sql`select admin_set_listing_hidden(${listingId}::uuid, ${hidden}, ${reason})`)));
}

/** Khóa (cần lý do: xóa mọi phiên, ẩn tin đang mở) hoặc mở khóa tài khoản. Không khóa được admin. */
export async function setUserLocked(userId: string, targetUserId: string, locked: boolean, reason: string): Promise<void> {
  await asAdmin(() => withUser(userId, (tx) => tx.execute(sql`select admin_set_user_locked(${targetUserId}::uuid, ${locked}, ${reason})`)));
}

export interface AdminAction {
  action: "listing.hide" | "listing.unhide" | "user.lock" | "user.unlock";
  targetId: string;
  reason: string | null;
  adminName: string;
  createdAt: Date;
}

export async function recentAdminActions(userId: string, limit = 50): Promise<AdminAction[]> {
  return asAdmin(async () => {
    const rows = (await withUser(userId, (tx) => tx.execute(sql`select * from admin_recent_actions(${limit})`))) as unknown as Array<{
      action: AdminAction["action"];
      target_id: string;
      reason: string | null;
      admin_name: string;
      created_at: Date | string;
    }>;
    return rows.map((r) => ({ action: r.action, targetId: r.target_id, reason: r.reason, adminName: r.admin_name, createdAt: new Date(r.created_at) }));
  });
}
