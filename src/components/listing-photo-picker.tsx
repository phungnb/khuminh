"use client";

import { useRef, useState } from "react";
import { ImagePlus, X } from "lucide-react";

function readAsDataURL(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result));
    r.onerror = reject;
    r.readAsDataURL(blob);
  });
}

/** Nén ảnh phía client: cạnh dài nhất 1280px, JPEG 0.82 — đủ nét trên điện thoại, nhẹ cho CSDL. */
async function shrink(file: File): Promise<string> {
  const url = URL.createObjectURL(file);
  try {
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const el = new Image();
      el.onload = () => resolve(el);
      el.onerror = reject;
      el.src = url;
    });
    const scale = Math.min(1, 1280 / Math.max(img.naturalWidth, img.naturalHeight));
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.round(img.naturalWidth * scale));
    canvas.height = Math.max(1, Math.round(img.naturalHeight * scale));
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("no 2d context");
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/jpeg", 0.82));
    if (!blob) throw new Error("toBlob failed");
    return await readAsDataURL(blob);
  } catch {
    // Ảnh trình duyệt không giải mã được (vd. HEIC ngoài Safari): gửi nguyên bản nếu thuộc loại cho phép.
    if (/^image\/(jpeg|png|webp)$/.test(file.type)) return readAsDataURL(file);
    throw new Error("unreadable");
  } finally {
    URL.revokeObjectURL(url);
  }
}

/**
 * Ô chọn ảnh cho form đăng tin/thêm ảnh: nén ngay trên máy người dùng rồi nhét các data URL
 * vào ô ẩn "photos" (JSON) để server action nhận cùng một lần gửi với các trường khác.
 * Ảnh đầu tiên là ảnh bìa trên thẻ tin.
 */
export function ListingPhotoPicker({ max = 6 }: { max?: number }) {
  const [items, setItems] = useState<string[]>([]);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  async function onPick(e: React.ChangeEvent<HTMLInputElement>) {
    const files = [...(e.target.files ?? [])];
    e.target.value = "";
    if (!files.length) return;
    setError("");
    setBusy(true);
    const room = max - items.length;
    const added: string[] = [];
    let failed = false;
    for (const f of files.slice(0, room)) {
      try {
        added.push(await shrink(f));
      } catch {
        failed = true;
      }
    }
    if (files.length > room) setError(`Mỗi tin tối đa ${max} ảnh.`);
    else if (failed) setError("Có ảnh không đọc được, hãy chọn ảnh khác.");
    setItems((prev) => [...prev, ...added].slice(0, max));
    setBusy(false);
  }

  return (
    <div>
      <input type="hidden" name="photos" value={items.length ? JSON.stringify(items) : ""} />
      <div className="grid grid-cols-3 gap-2">
        {items.map((src, i) => (
          <div key={i} className="relative">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={src} alt="" className="aspect-[4/3] w-full rounded-xl border border-border object-cover" />
            {i === 0 ? (
              <span className="absolute bottom-1 left-1 rounded-full bg-black/60 px-2 py-0.5 text-[10px] font-semibold text-white">Ảnh bìa</span>
            ) : null}
            <button
              type="button"
              aria-label="Bỏ ảnh này"
              onClick={() => setItems(items.filter((_, j) => j !== i))}
              className="absolute top-1 right-1 grid size-6 place-items-center rounded-full bg-black/60 text-white"
            >
              <X className="size-3.5" aria-hidden />
            </button>
          </div>
        ))}
        {items.length < max ? (
          <button
            type="button"
            onClick={() => inputRef.current?.click()}
            className="grid aspect-[4/3] w-full place-items-center rounded-xl border border-dashed border-border bg-surface-2 text-fg-muted"
          >
            <span className="flex flex-col items-center gap-1 text-xs">
              <ImagePlus className="size-5" aria-hidden />
              {busy ? "Đang nén ảnh…" : "Thêm ảnh"}
            </span>
          </button>
        ) : null}
      </div>
      <input ref={inputRef} type="file" accept="image/*" multiple className="hidden" onChange={onPick} />
      <p className="mt-1.5 text-xs text-fg-subtle">Tối đa {max} ảnh, ảnh đầu tiên là ảnh bìa. Hệ thống tự nén ảnh trước khi đăng.</p>
      {error ? <p className="mt-1 text-xs font-semibold text-danger">{error}</p> : null}
    </div>
  );
}
