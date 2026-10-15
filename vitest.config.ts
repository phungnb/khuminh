import { defineConfig } from "vitest/config";
import path from "node:path";

export default defineConfig({
  resolve: { alias: { "@": path.resolve(__dirname, "src") } },
  // JSX kiểu React 17+ (không cần import React), như Next.js.
  esbuild: { jsx: "automatic" },
  test: { include: ["src/**/*.test.ts"], exclude: ["src/**/*.db.test.ts"] },
});
