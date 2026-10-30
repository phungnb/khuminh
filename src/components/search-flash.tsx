"use client";

import { CircleAlert, CircleCheck } from "lucide-react";
import { Suspense } from "react";
import { useSearchParams } from "next/navigation";

/**
 * Thông báo ?loi= / ?ok= đọc phía client để trang chứa nó dựng tĩnh được
 * (trang form đăng nhập/đăng ký không cần dữ liệu server, chỉ cần hiện
 * thông báo sau khi chuyển hướng). Dùng kèm <Suspense> vì useSearchParams
 * yêu cầu biên Suspense khi dựng tĩnh.
 */
function FlashInner() {
  const sp = useSearchParams();
  const loi = sp.get("loi");
  const ok = sp.get("ok");
  if (loi) {
    return (
      <div role="alert" className="mb-4 flex items-start gap-2 rounded-xl border border-danger/40 bg-danger/15 px-3 py-2.5 text-sm text-danger">
        <CircleAlert className="mt-0.5 size-4 shrink-0" />
        <span>{loi}</span>
      </div>
    );
  }
  if (ok) {
    return (
      <div role="status" className="mb-4 flex items-start gap-2 rounded-xl border border-success/40 bg-success/15 px-3 py-2.5 text-sm text-success">
        <CircleCheck className="mt-0.5 size-4 shrink-0" />
        <span>{ok}</span>
      </div>
    );
  }
  return null;
}

export function SearchFlash() {
  return (
    <Suspense>
      <FlashInner />
    </Suspense>
  );
}
