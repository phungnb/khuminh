"use client";

import { useState } from "react";

/** Bộ sưu tập ảnh trên trang chi tiết tin: ảnh lớn + hàng thumbnail để chọn. */
export function ListingGallery({ imageIds, title }: { imageIds: string[]; title: string }) {
  const [sel, setSel] = useState(0);
  const cur = imageIds[Math.min(sel, imageIds.length - 1)]!;
  return (
    <div>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={`/api/img/${cur}`} alt={title} className="aspect-[16/10] w-full object-cover" />
      {imageIds.length > 1 ? (
        <div className="flex gap-2 overflow-x-auto px-4 pt-3">
          {imageIds.map((id, i) => (
            <button
              key={id}
              type="button"
              onClick={() => setSel(i)}
              aria-label={`Xem ảnh ${i + 1}`}
              className={`shrink-0 overflow-hidden rounded-lg ring-2 ${i === sel ? "ring-brand" : "ring-transparent opacity-70"}`}
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={`/api/img/${id}`} alt="" className="size-14 object-cover" />
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}
