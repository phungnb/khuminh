import { drizzle } from "drizzle-orm/postgres-js";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import postgres from "postgres";

// Chạy bằng DATABASE_URL của chủ sở hữu bảng (không phải khuminh_app).
const url = process.env.DATABASE_URL;
if (!url) throw new Error("Thiếu DATABASE_URL");
const client = postgres(url, { max: 1, onnotice: () => {} });
await migrate(drizzle(client), { migrationsFolder: "drizzle" });
await client.end();
console.log("Đã chạy migration");
