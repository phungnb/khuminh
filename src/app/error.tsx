"use client";

import Link from "next/link";

// Lỗi ngoài dự kiến khi hiển thị trang. Không in chi tiết lỗi ra màn hình; mã digest để đối chiếu log máy chủ.
export default function Error({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <main className="mx-auto max-w-sm px-4 py-16 text-center">
      <h1 className="text-lg font-bold">Có lỗi xảy ra</h1>
      <p className="mt-2 text-sm text-fg-muted">Dữ liệu của bạn không bị thay đổi. Thử lại, nếu vẫn lỗi hãy báo hỗ trợ kèm mã bên dưới.</p>
      {error.digest ? <p className="mt-2 font-mono text-xs text-fg-subtle">Mã lỗi: {error.digest}</p> : null}
      <div className="mt-4 flex justify-center gap-2">
        <button className="btn" onClick={reset}>Thử lại</button>
        <Link className="btn-secondary" href="/">Trang chủ</Link>
      </div>
    </main>
  );
}
