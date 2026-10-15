import { AlarmClock, CalendarClock, ChevronRight, CircleAlert, CircleDollarSign, FileWarning, TriangleAlert, Wrench } from "lucide-react";
import Link from "next/link";
import type { IsoDate } from "@/domain/dates";
import { vnd } from "@/lib/format";
import { actionItems, sumTotals, type ActionKind, type PropertySummary } from "@/server/overview-items";

const KIND_ICON: Record<ActionKind, React.ComponentType<{ className?: string }>> = {
  unpaid: CircleDollarSign,
  missing_period: CalendarClock,
  period_gap: FileWarning,
  lease_expired: CircleAlert,
  lease_expiring: CalendarClock,
  issues: Wrench,
};

const TONE: Record<"danger" | "warning" | "info", string> = {
  danger: "text-danger",
  warning: "text-warning",
  info: "text-fg-muted",
};

/** Tổng quan gộp ở /quan-ly: số tiền, phòng, và việc cần xử lý của mọi cơ sở (hoặc một cơ sở đang lọc). */
export function OrgOverview({ props, selected, t }: { props: PropertySummary[]; selected: string | null; t: IsoDate }) {
  const shown = selected ? props.filter((p) => p.id === selected) : props;
  const totals = sumTotals(shown);
  const items = actionItems(shown, t, vnd);
  const ratio = totals.money.receivable > 0 ? Math.round((totals.money.collected / totals.money.receivable) * 100) : 0;

  return (
    <section className="mb-8">
      {props.length > 1 ? (
        <nav className="-mx-4 mb-3 flex gap-2 overflow-x-auto px-4 pb-1" aria-label="Lọc theo cơ sở">
          <Link href="/quan-ly" className={`chip ${selected ? "" : "chip-on"}`}>
            Tất cả
          </Link>
          {props.map((p) => (
            <Link key={p.id} href={`/quan-ly?co-so=${p.id}`} className={`chip ${selected === p.id ? "chip-on" : ""}`}>
              {p.name}
            </Link>
          ))}
        </nav>
      ) : null}

      <div className="card">
        <div className="text-sm text-fg-subtle">Đã thu / phải thu (hóa đơn đã phát hành)</div>
        <div className="mt-1 flex flex-wrap items-baseline gap-x-2">
          <span className="tabular text-2xl font-bold text-success">{vnd(totals.money.collected)}</span>
          <span className="tabular text-sm text-fg-muted">/ {vnd(totals.money.receivable)}</span>
        </div>
        <div className="mt-3 h-2 overflow-hidden rounded-full bg-surface-2" aria-hidden>
          <div className="h-full rounded-full bg-brand" style={{ width: `${ratio}%` }} />
        </div>
        <div className="mt-4 grid grid-cols-2 gap-3 text-sm">
          <div>
            <div className="flex items-center gap-1.5 text-fg-subtle">
              <AlarmClock className="size-4" /> Còn nợ
            </div>
            <div className={`tabular mt-0.5 text-lg font-bold ${totals.money.outstanding > 0 ? "text-warning" : ""}`}>
              {vnd(totals.money.outstanding)}
            </div>
          </div>
          <div>
            <div className="flex items-center gap-1.5 text-fg-subtle">
              <TriangleAlert className="size-4" /> Quá hạn
            </div>
            <div className={`tabular mt-0.5 text-lg font-bold ${totals.money.overdue > 0 ? "text-danger" : ""}`}>
              {vnd(totals.money.overdue)}
            </div>
          </div>
        </div>
      </div>

      <div className="card mt-3">
        <div className="grid grid-cols-3 gap-3 text-sm">
          <div>
            <div className="text-fg-subtle">Đang thuê</div>
            <div className="tabular text-lg font-bold">{totals.units.occupied}</div>
          </div>
          <div>
            <div className="text-fg-subtle">Trống</div>
            <div className="tabular text-lg font-bold">{totals.units.vacant}</div>
          </div>
          <div>
            <div className="text-fg-subtle">Bảo trì</div>
            <div className="tabular text-lg font-bold">{totals.units.maintenance}</div>
          </div>
        </div>
        {totals.occupancy !== null ? (
          <>
            <div className="mt-3 h-2 overflow-hidden rounded-full bg-surface-2" aria-hidden>
              <div className="h-full rounded-full bg-xp" style={{ width: `${totals.occupancy}%` }} />
            </div>
            <div className="mt-1 text-xs text-fg-subtle">Lấp đầy {totals.occupancy}%</div>
          </>
        ) : null}
      </div>

      <h2 className="mt-6 mb-2 font-semibold">Cần xử lý</h2>
      {items.length === 0 ? (
        <p className="card text-sm text-fg-subtle">Không có việc gì cần làm ngay.</p>
      ) : (
        <ul className="card divide-y divide-border p-0">
          {items.map((it, i) => {
            const Icon = KIND_ICON[it.kind];
            return (
              <li key={`${it.kind}-${it.propertyId}-${i}`}>
                <Link href={it.href} className="flex items-start gap-3 px-4 py-3 hover:bg-surface-2">
                  <Icon className={`mt-0.5 size-5 shrink-0 ${TONE[it.tone]}`} />
                  <span className="min-w-0 flex-1">
                    <span className="block font-semibold">{it.title}</span>
                    <span className="block text-sm text-fg-subtle">
                      {props.length > 1 && !selected ? `${it.propertyName} · ` : ""}
                      {it.detail}
                    </span>
                  </span>
                  <ChevronRight className="mt-0.5 size-4 shrink-0 text-fg-subtle" />
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
