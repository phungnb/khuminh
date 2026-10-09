import { sql } from "drizzle-orm";
import { drizzle, type PostgresJsDatabase } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./schema";

export type Db = PostgresJsDatabase<typeof schema>;
export type Tx = Parameters<Parameters<Db["transaction"]>[0]>[0];

let cached: Db | null = null;

/**
 * Kết nối bằng role khuminh_app (DATABASE_URL_APP). Role này chịu RLS;
 * không bao giờ dùng URL của chủ sở hữu bảng cho ứng dụng.
 */
export function getDb(): Db {
  if (cached) return cached;
  const url = process.env.DATABASE_URL_APP;
  if (!url) throw new Error("Thiếu DATABASE_URL_APP");
  cached = drizzle(postgres(url, { max: 10 }), { schema });
  return cached;
}

export function setDbForTests(db: Db | null): void {
  cached = db;
}

export interface OrgContext {
  orgId: string;
  userId: string | null;
}

/** Chạy `fn` trong một giao dịch đã gắn tổ chức; RLS chỉ cho thấy dữ liệu của tổ chức này. */
export async function withOrg<T>(ctx: OrgContext, fn: (tx: Tx) => Promise<T>): Promise<T> {
  return getDb().transaction(async (tx) => {
    await tx.execute(
      sql`select set_config('app.org_id', ${ctx.orgId}, true), set_config('app.user_id', ${ctx.userId ?? ""}, true)`,
    );
    return fn(tx);
  });
}

/** Giao dịch chỉ gắn người dùng (chưa chọn tổ chức), ví dụ để liệt kê membership. */
export async function withUser<T>(userId: string, fn: (tx: Tx) => Promise<T>): Promise<T> {
  return getDb().transaction(async (tx) => {
    await tx.execute(sql`select set_config('app.user_id', ${userId}, true)`);
    return fn(tx);
  });
}
