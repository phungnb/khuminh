import type { MetadataRoute } from "next";

// App cư dân cài từ trình duyệt (PWA): chợ quanh nhà, hóa đơn tiền nhà, bảng tin khu trọ.
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "KhuMình",
    short_name: "KhuMình",
    description: "Mua bán, cho tặng, dịch vụ với hàng xóm quanh khu; xem hóa đơn tiền nhà và thông báo từ chủ nhà.",
    id: "/app",
    start_url: "/app",
    scope: "/",
    display: "standalone",
    orientation: "portrait",
    lang: "vi",
    background_color: "#0a0d12",
    theme_color: "#0a0d12",
    icons: [
      { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png" },
      { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png" },
      { src: "/icons/maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}
