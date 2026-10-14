import Link from "next/link";

export default function NotFound() {
  return (
    <main className="mx-auto max-w-sm px-4 py-16 text-center">
      <h1 className="text-lg font-bold">Không tìm thấy trang</h1>
      <p className="mt-2 text-sm text-fg-muted">Đường dẫn sai, đã hết hạn, hoặc bạn không có quyền xem trang này.</p>
      <Link className="btn mt-4 inline-block" href="/">Về trang chủ</Link>
    </main>
  );
}
