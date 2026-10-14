export default function Loading() {
  return (
    <div className="flex min-h-[40vh] items-center justify-center" role="status" aria-live="polite">
      <span className="size-6 animate-spin rounded-full border-2 border-fg-subtle border-t-transparent" aria-hidden />
      <span className="sr-only">Đang tải…</span>
    </div>
  );
}
