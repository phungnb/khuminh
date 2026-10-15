"use client";

import { Download, Share2 } from "lucide-react";
import { useState } from "react";

/**
 * Gửi ảnh hóa đơn: điện thoại mở bảng chia sẻ (chọn Zalo); máy không chia sẻ được tệp thì tải ảnh về.
 * `src` là route ảnh PNG cùng nguồn.
 */
export function ShareImage({ src, filename, text, label = "Gửi ảnh hóa đơn (Zalo)" }: { src: string; filename: string; text?: string; label?: string }) {
  const [state, setState] = useState<"idle" | "busy" | "error">("idle");

  async function share() {
    setState("busy");
    try {
      const res = await fetch(src, { cache: "no-store" });
      if (!res.ok) throw new Error(String(res.status));
      const blob = await res.blob();
      const file = new File([blob], filename, { type: "image/png" });
      if (navigator.canShare?.({ files: [file] })) {
        await navigator.share({ files: [file], text });
      } else {
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = filename;
        a.click();
        URL.revokeObjectURL(url);
      }
      setState("idle");
    } catch (e) {
      // Người dùng đóng bảng chia sẻ cũng ném lỗi AbortError: không coi là lỗi.
      setState(e instanceof DOMException && e.name === "AbortError" ? "idle" : "error");
    }
  }

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap gap-2">
        <button type="button" className="btn" onClick={share} disabled={state === "busy"}>
          <Share2 className="size-4" />
          {state === "busy" ? "Đang tạo ảnh..." : label}
        </button>
        <a className="btn-secondary" href={src} download={filename}>
          <Download className="size-4" />
          Lưu ảnh
        </a>
      </div>
      {state === "error" ? <p className="text-sm text-danger">Không tạo được ảnh. Thử lại hoặc dùng nút Lưu ảnh.</p> : null}
    </div>
  );
}
