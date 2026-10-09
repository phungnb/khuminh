import type { MetadataRoute } from "next";

// App người thuê cài từ trình duyệt (PWA). Chủ trọ dùng bản web như cũ.
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "KhuMình",
    short_name: "KhuMình",
    description: "Xem hóa đơn tiền nhà, chuyển khoản bằng mã QR, nhận thông báo từ chủ nhà.",
    id: "/app",
    start_url: "/app",
    scope: "/",
    display: "standalone",
    orientation: "portrait",
    lang: "vi",
    background_color: "#fafaf9",
    theme_color: "#0f766e",
    icons: [
      { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png" },
      { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png" },
      { src: "/icons/maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}
