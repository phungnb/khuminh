import { defineConfig } from "vitest/config";
import path from "node:path";

// Kiểm thử cần Postgres thật (DATABASE_URL, DATABASE_URL_APP).
export default defineConfig({
  resolve: { alias: { "@": path.resolve(__dirname, "src") } },
  test: {
    include: ["src/**/*.db.test.ts"],
    fileParallelism: false,
    globalSetup: ["src/db/test-setup.ts"],
  },
});
