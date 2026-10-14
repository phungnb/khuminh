// Khung chờ khi chuyển trang trong app: giữ bố cục để không nhảy giao diện.
export default function Loading() {
  return (
    <div className="animate-pulse space-y-4" aria-busy="true" aria-label="Đang tải">
      <div className="h-28 rounded-2xl bg-surface" />
      <div className="h-11 rounded-xl bg-surface" />
      <div className="grid grid-cols-2 gap-3">
        {Array.from({ length: 4 }, (_, i) => (
          <div key={i} className="space-y-2">
            <div className="aspect-[4/3] rounded-[var(--radius-card)] bg-surface" />
            <div className="h-4 w-3/4 rounded bg-surface" />
            <div className="h-3 w-1/2 rounded bg-surface" />
          </div>
        ))}
      </div>
    </div>
  );
}
