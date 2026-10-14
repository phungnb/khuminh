import Link from "next/link";

export function Flash({ params }: { params: { loi?: string; ok?: string } }) {
  if (params.loi) {
    return <div className="mb-4 rounded-md border border-danger/40 bg-danger/15 px-3 py-2 text-sm text-danger">{params.loi}</div>;
  }
  if (params.ok) {
    return <div className="mb-4 rounded-md border border-success/40 bg-success/15 px-3 py-2 text-sm text-success">{params.ok}</div>;
  }
  return null;
}

export function PageTitle({ children, action }: { children: React.ReactNode; action?: React.ReactNode }) {
  return (
    <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
      <h1 className="text-xl font-bold">{children}</h1>
      {action}
    </div>
  );
}

export function Stat({ label, value, tone }: { label: string; value: string; tone?: "warn" | "ok" }) {
  const color = tone === "warn" ? "text-danger" : tone === "ok" ? "text-success" : "text-fg";
  return (
    <div className="card">
      <div className="text-sm text-fg-subtle">{label}</div>
      <div className={`tabular mt-1 text-xl font-bold ${color}`}>{value}</div>
    </div>
  );
}

export function Empty({ children, href, cta }: { children: React.ReactNode; href?: string; cta?: string }) {
  return (
    <div className="card text-center text-sm text-fg-muted">
      <p>{children}</p>
      {href && cta ? (
        <Link href={href} className="btn mt-3">
          {cta}
        </Link>
      ) : null}
    </div>
  );
}

const STATE_STYLE: Record<string, string> = {
  draft: "bg-surface-2 text-fg-muted",
  void: "bg-surface-2 text-fg-subtle line-through",
  unpaid: "bg-warning/15 text-warning",
  partial: "bg-xp/15 text-xp",
  paid: "bg-success/15 text-success",
  overdue: "bg-danger/15 text-danger",
};

export function Badge({ state, children }: { state: string; children: React.ReactNode }) {
  return <span className={`rounded px-2 py-0.5 text-xs font-semibold ${STATE_STYLE[state] ?? ""}`}>{children}</span>;
}

export function EmptyState({
  icon: Icon,
  title,
  description,
  action,
}: {
  icon: React.ComponentType<{ className?: string }>;
  title: string;
  description?: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="flex flex-col items-center gap-2 rounded-[var(--radius-card)] border border-dashed border-border px-6 py-10 text-center">
      <div className="grid size-12 place-items-center rounded-full bg-surface-2 text-fg-muted">
        <Icon className="size-6" />
      </div>
      <p className="font-semibold">{title}</p>
      {description ? <p className="max-w-xs text-sm text-fg-muted">{description}</p> : null}
      {action ? <div className="mt-2">{action}</div> : null}
    </div>
  );
}

export function Logo({ className = "" }: { className?: string }) {
  return (
    <span className={`flex items-center gap-2 text-lg font-extrabold tracking-wide ${className}`}>
      {/* eslint-disable-next-line @next/next/no-img-element -- biểu tượng tĩnh nhỏ */}
      <img src="/icons/mark.svg" alt="" width={28} height={28} className="size-7" />
      <span>
        KHU<span className="text-brand">MÌNH</span>
      </span>
    </span>
  );
}
