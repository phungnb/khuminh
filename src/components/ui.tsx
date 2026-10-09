import Link from "next/link";

export function Flash({ params }: { params: { loi?: string; ok?: string } }) {
  if (params.loi) {
    return <div className="mb-4 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">{params.loi}</div>;
  }
  if (params.ok) {
    return <div className="mb-4 rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-800">{params.ok}</div>;
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
  const color = tone === "warn" ? "text-red-700" : tone === "ok" ? "text-emerald-700" : "text-stone-900";
  return (
    <div className="card">
      <div className="text-sm text-stone-500">{label}</div>
      <div className={`mt-1 text-xl font-bold ${color}`}>{value}</div>
    </div>
  );
}

export function Empty({ children, href, cta }: { children: React.ReactNode; href?: string; cta?: string }) {
  return (
    <div className="card text-center text-sm text-stone-600">
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
  draft: "bg-stone-100 text-stone-700",
  void: "bg-stone-100 text-stone-500 line-through",
  unpaid: "bg-amber-100 text-amber-800",
  partial: "bg-sky-100 text-sky-800",
  paid: "bg-emerald-100 text-emerald-800",
  overdue: "bg-red-100 text-red-800",
};

export function Badge({ state, children }: { state: string; children: React.ReactNode }) {
  return <span className={`rounded px-2 py-0.5 text-xs font-semibold ${STATE_STYLE[state] ?? ""}`}>{children}</span>;
}
