// Tạo CSDL kiểm thử mới cho mỗi lần chạy và chạy migration.
// Cần: TEST_DATABASE_ADMIN_URL (quyền tạo database), role khuminh_owner và khuminh_app đã tồn tại.

import { drizzle } from "drizzle-orm/postgres-js";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import postgres from "postgres";

const ADMIN = process.env.TEST_DATABASE_ADMIN_URL ?? "postgres://postgres@localhost:5433/postgres";
const DB = "khuminh_vitest";

function withDb(url: string, db: string, user?: string, password?: string): string {
  const u = new URL(url);
  u.pathname = `/${db}`;
  if (user) u.username = user;
  if (password !== undefined) u.password = password;
  return u.toString();
}

export async function setup() {
  const admin = postgres(ADMIN, { max: 1, onnotice: () => {} });
  await admin.unsafe(`DROP DATABASE IF EXISTS ${DB} WITH (FORCE)`);
  await admin.unsafe(`CREATE DATABASE ${DB} OWNER khuminh_owner`);
  await admin.end();

  const ownerUrl = withDb(ADMIN, DB, "khuminh_owner", process.env.TEST_OWNER_PASSWORD ?? "owner");
  const owner = postgres(ownerUrl, { max: 1, onnotice: () => {} });
  await migrate(drizzle(owner), { migrationsFolder: "drizzle" });
  await owner.end();

  // Kết nối chủ bảng cho test cần làm việc ngoài quyền app (vd. cấp admin nền tảng).
  process.env.TEST_OWNER_DATABASE_URL = ownerUrl;
  process.env.DATABASE_URL_APP = withDb(ADMIN, DB, "khuminh_app", process.env.TEST_APP_PASSWORD ?? "change-me");
}
