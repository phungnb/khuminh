// Admin nền tảng (KM-HN2 T6). Chỉ đọc qua các hàm SECURITY DEFINER trong drizzle/0009_platform_admin.sql;
// mỗi hàm tự kiểm người gọi có trong platform_admins. App vẫn chạy bằng khuminh_app, không dùng role chủ bảng.
// Admin chỉ thấy số tổng và tin bị báo cáo, không thấy hóa đơn, tiền hay liên hệ.

import { sql } from "drizzle-orm";
import { withUser } from "@/db/client";
import { ForbiddenError } from "./audit";
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
  authorName: string;
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

/** Lỗi 42501 từ assert_platform_admin() → ForbiddenError. */
async function asAdmin<T>(fn: () => Promise<T>): Promise<T> {
  try {
    return await fn();
  } catch (e) {
    if (pgErrorCode(e) === "42501") throw new ForbiddenError();
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
      author_name: string;
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
      authorName: r.author_name,
      reports: Number(r.reports),
      reasons: r.reasons,
      hiddenAt: r.hidden_at ? new Date(r.hidden_at) : null,
      status: r.status,
      createdAt: new Date(r.created_at),
    }));
  });
}
