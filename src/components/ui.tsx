import { ArrowLeft, CircleAlert, CircleCheck, Inbox } from "lucide-react";
import Link from "next/link";

export function Flash({ params }: { params: { loi?: string; ok?: string } }) {
  if (params.loi) {
    return (
      <div role="alert" className="mb-4 flex items-start gap-2 rounded-xl border border-danger/40 bg-danger/15 px-3 py-2.5 text-sm text-danger">
        <CircleAlert className="mt-0.5 size-4 shrink-0" />
        <span>{params.loi}</span>
      </div>
    );
  }
  if (params.ok) {
    return (
      <div role="status" className="mb-4 flex items-start gap-2 rounded-xl border border-success/40 bg-success/15 px-3 py-2.5 text-sm text-success">
        <CircleCheck className="mt-0.5 size-4 shrink-0" />
        <span>{params.ok}</span>
      </div>
    );
  }
  return null;
}

export function BackLink({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <Link href={href} className="mb-3 inline-flex min-h-9 items-center gap-1 text-sm font-medium text-fg-muted hover:text-fg">
      <ArrowLeft className="size-4" />
      {children}
    </Link>
  );
}

/** Khung trang công khai (đăng nhập, đăng ký, link mời): logo + vầng sáng nền, nội dung ở giữa. */
export function AuthShell({
  title,
  subtitle,
  children,
  width = "max-w-sm",
}: {
  title?: string;
  subtitle?: React.ReactNode;
  children: React.ReactNode;
  width?: string;
}) {
  return (
    <div className="relative min-h-dvh overflow-hidden">
      <div
        aria-hidden
        className="pointer-events-none absolute -top-40 left-1/2 size-[480px] -translate-x-1/2 rounded-full bg-brand/10 blur-3xl"
      />
      <main className={`relative mx-auto ${width} px-4 py-10`}>
        <Link href="/" className="mb-8 inline-block" aria-label="KhuMình — trang chủ">
          <Logo />
        </Link>
        {title ? <h1 className="mb-1 text-2xl font-bold">{title}</h1> : null}
        {subtitle ? <p className="mb-6 text-sm text-fg-muted">{subtitle}</p> : null}
        {children}
      </main>
    </div>
  );
}

export function PageTitle({ children, action }: { children: React.ReactNode; action?: React.ReactNode }) {
  return (
    <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
      <h1 className="text-xl font-bold">{children}</h1>
      {action}
    </div>
  );
}

export function Stat({
  label,
  value,
  tone,
  icon: Icon,
}: {
  label: string;
  value: string;
  tone?: "warn" | "ok";
  icon?: React.ComponentType<{ className?: string }>;
}) {
  const color = tone === "warn" ? "text-danger" : tone === "ok" ? "text-success" : "text-fg";
  return (
    <div className="card">
      <div className="flex items-center gap-1.5 text-sm text-fg-subtle">
        {Icon ? <Icon className="size-4" /> : null}
        {label}
      </div>
      <div className={`tabular mt-1 text-xl font-bold ${color}`}>{value}</div>
    </div>
  );
}

export function Empty({ children, href, cta }: { children: React.ReactNode; href?: string; cta?: string }) {
  return (
    <div className="flex flex-col items-center gap-2 rounded-[var(--radius-card)] border border-dashed border-border px-6 py-8 text-center text-sm text-fg-muted">
      <div className="grid size-10 place-items-center rounded-full bg-surface-2 text-fg-subtle">
        <Inbox className="size-5" />
      </div>
      <p className="max-w-sm">{children}</p>
      {href && cta ? (
        <Link href={href} className="btn mt-1">
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
  // Báo sự cố
  open: "bg-warning/15 text-warning",
  in_progress: "bg-xp/15 text-xp",
  done: "bg-success/15 text-success",
  rejected: "bg-surface-2 text-fg-subtle",
};

export function Badge({ state, children }: { state: string; children: React.ReactNode }) {
  return <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${STATE_STYLE[state] ?? ""}`}>{children}</span>;
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
