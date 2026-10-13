import { CLUB_THEMES, themeForId, wallBackground } from "@/lib/club-themes";

/**
 * "Tường" của một cơ sở — trình bày khu trọ như một CLB của RaceHub:
 * banner gradient (theme tất định theo id) + hàng chỉ số (phòng / đang thuê / tỉ lệ lấp đầy).
 */
export function CoSoWall({
  id,
  name,
  address,
  total,
  occupied,
}: {
  id: string;
  name: string;
  address?: string | null;
  total: number;
  occupied: number;
}) {
  const occupancy = total > 0 ? Math.round((occupied / total) * 100) : 0;
  const themeLabel = CLUB_THEMES[themeForId(id)].label;
  return (
    <div className="club-wall animate-fade-in" style={{ background: wallBackground(id) }}>
      <div className="relative z-[1]">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="text-[11px] font-semibold uppercase tracking-wide text-white/70">Cơ sở</div>
            <h1 className="truncate text-2xl font-bold leading-tight">{name}</h1>
            {address ? <p className="mt-0.5 truncate text-sm text-white/80">{address}</p> : null}
          </div>
          <span className="shrink-0 rounded-full bg-white/15 px-2.5 py-1 text-[11px] font-medium text-white/90 backdrop-blur">
            {themeLabel}
          </span>
        </div>
        <div className="mt-4 grid grid-cols-3 gap-2">
          <WallStat label="Phòng" value={String(total)} />
          <WallStat label="Đang thuê" value={String(occupied)} />
          <WallStat label="Lấp đầy" value={`${occupancy}%`} />
        </div>
      </div>
    </div>
  );
}

function WallStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl bg-white/10 px-3 py-2 backdrop-blur">
      <div className="tabular text-xl font-bold leading-none">{value}</div>
      <div className="mt-1 text-[11px] text-white/75">{label}</div>
    </div>
  );
}
