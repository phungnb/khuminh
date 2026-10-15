import type { NextConfig } from "next";

// Font cho ảnh hóa đơn (next/og) đọc bằng fs: phải đưa vào gói của hai route ảnh khi deploy.
const FONT_FILES = ["./src/assets/fonts/*.ttf"];

const config: NextConfig = {
  serverExternalPackages: ["postgres"],
  poweredByHeader: false,
  outputFileTracingIncludes: {
    "/hd/[token]/anh": FONT_FILES,
    "/co-so/[id]/hoa-don/[invoiceId]/anh": FONT_FILES,
  },
};

export default config;
