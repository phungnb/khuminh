import Link from "next/link";
import { redirect } from "next/navigation";
import { Building2, CheckCircle2, Hammer, Gift, Megaphone, ReceiptText, Store, Wrench, type LucideIcon } from "lucide-react";
import { ago, ListingGrid, priceText } from "@/components/listing-card";
import { Badge, EmptyState, Flash } from "@/components/ui";
import { PAYMENT_STATE_LABEL } from "@/domain/payments";
import { wallBackground } from "@/lib/club-themes";
import { dmy, vnd } from "@/lib/format";
import { cookies } from "next/headers";
import { parseRadius, RADIUS_COOKIE } from "@/lib/geo";
import { requireUser } from "@/lib/session";
import { actorFor } from "@/server/auth";
import { listPosts, tenantBoardViewer, type PostRow } from "@/server/board";
import { MAINTENANCE_STATUS_LABEL, openMaintenanceCount, tenantMaintenanceRequests } from "@/server/maintenance";
import { marketPlaces, searchListings, type ListingKind } from "@/server/market";
import { tenantHome } from "@/server/tenant";
import { dueInvoices, freshAnnouncements, incidentsToShow } from "@/server/today";

export const dynamic = "force-dynamic";

const FRESH_VERB: Record<ListingKind, string> = { sell: "đang bán", want: "cần mua", give: "cho tặng", service: "đăng dịch vụ" };

type Sp = { loi?: string; ok?: string; o?: string; r?: string; k?: string; c?: string; q?: string };

// "Hôm nay có gì?": việc cần chú ý, thông báo khu, tin chợ gần. Chỉ dựng từ dữ liệu thật đã có,
// phần nào không có dữ liệu thì ẩn, không lấp bằng nội dung mẫu.
export default async function Page({ searchParams }: { searchParams: Promise<Sp> }) {
  const sp = await searchParams;
  // Link chợ cũ (/app?o=…&r=…) vẫn mở đúng chợ.
  if (sp.o || sp.r || sp.k || sp.c || sp.q) {
    const p = new URLSearchParams();
    for (const k of ["o", "r", "k", "c", "q"] as const) if (sp[k]) p.set(k, sp[k]!);
    redirect(`/app/quanh-day?${p.toString()}`);
  }

  const user = await requireUser();
  const now = new Date();
  const radius = parseRadius((await cookies()).get(RADIUS_COOKIE)?.value);
  const [homes, requests, places] = await Promise.all([tenantHome(user.id), tenantMaintenanceRequests(user.id), marketPlaces(user.id)]);

  const activeHomes = [...new Map(homes.filter((h) => h.active).map((h) => [`${h.orgId}.${h.propertyId}`, h])).values()];
  const tenant = activeHomes.length > 0;
  const managed = places.filter((p) => p.role === "manager");
  const place = places.find((p) => p.location && p.role === "tenant") ?? places.find((p) => p.location);

  const [boards, managerIncidents, recent] = await Promise.all([
    Promise.all(
      activeHomes.map(async (h) => (await listPosts(await tenantBoardViewer(user.id, h.orgId, h.propertyId), 20)).map((p) => ({ ...p, place: h.propertyName }))),
    ),
    Promise.all(
      managed.map(async (p) => {
        const [orgId, propertyId] = p.key.split(".") as [string, string];
        const actor = await actorFor(user.id, orgId);
        return { name: p.name, propertyId, open: actor ? await openMaintenanceCount(actor, propertyId) : 0 };
      }),
    ),
    place ? searchListings(user.id, place.location!, radius, {}, 12) : Promise.resolve([]),
  ]);
  // "Mới hôm nay": tin đăng trong 24 giờ, kể tên người đăng như kể chuyện hàng xóm.
  const dayAgo = now.getTime() - 24 * 60 * 60 * 1000;
  const fresh = recent.filter((l) => l.createdAt.getTime() >= dayAgo).slice(0, 5);
  const nearby = recent.filter((l) => !fresh.some((f) => f.id === l.id)).slice(0, 4);

  const due = dueInvoices(homes);
  const incidents = incidentsToShow(requests, now);
  const announcements = freshAnnouncements(boards.flat(), now) as Array<PostRow & { place: string }>;
  const managerOpen = managerIncidents.filter((m) => m.open > 0);
  const attention = due.length + incidents.filter((r) => r.status === "open" || r.status === "in_progress").length + managerOpen.length;

  const shortcuts: Array<{ href: string; label: string; icon: LucideIcon }> = [
    tenant ? { href: "/app/su-co", label: "Báo sự cố", icon: Wrench } : null,
    managed.length > 0 ? { href: "/quan-ly", label: "Quản lý khu", icon: Building2 } : null,
    { href: "/app/quanh-day?k=service", label: "Tìm dịch vụ", icon: Hammer },
    { href: "/app/quanh-day?k=give", label: "Cho tặng", icon: Gift },
    tenant ? { href: "/app/bang-tin", label: "Bảng tin khu", icon: Megaphone } : null,
  ].filter((s): s is NonNullable<typeof s> => s !== null);

  const today = now.toLocaleDateString("vi-VN", { timeZone: "Asia/Ho_Chi_Minh", weekday: "long", day: "2-digit", month: "2-digit" });
  const wallId = (activeHomes[0]?.propertyId ?? place?.key.split(".")[1] ?? user.id) as string;

  return (
    <>
      <section className="club-wall animate-fade-in" style={{ background: wallBackground(wallId) }}>
        <div className="relative z-[1]">
          <div className="text-[11px] font-semibold uppercase tracking-wide text-white/70">{today}</div>
          <h1 className="text-2xl leading-tight font-bold">Hôm nay có gì?</h1>
          <p className="mt-0.5 truncate text-sm text-white/80">
            {place ? place.name : "Quanh nơi bạn sống"}
            {" · "}
            {attention > 0 ? `${attention} việc cần chú ý` : "không có việc cần xử lý"}
          </p>
        </div>
      </section>

      <Flash params={sp} />

      <nav aria-label="Lối tắt" className="mt-4 grid grid-cols-4 gap-2">
        {shortcuts.slice(0, 4).map(({ href, label, icon: Icon }) => (
          <Link key={href} href={href} className="flex flex-col items-center gap-1 text-center text-[11px] leading-tight text-fg-muted">
            <span className="grid size-12 place-items-center rounded-2xl border border-border bg-surface text-brand-ink">
              <Icon className="size-5" aria-hidden />
            </span>
            {label}
          </Link>
        ))}
      </nav>

      <h2 className="mt-6 mb-2 text-lg font-semibold">Cần bạn chú ý</h2>
      {attention === 0 && incidents.length === 0 ? (
        <div className="card flex items-center gap-3 text-sm text-fg-muted">
          <CheckCircle2 className="size-5 shrink-0 text-success" aria-hidden />
          {tenant || managed.length > 0 ? "Không có hóa đơn đến hạn hay sự cố nào đang chờ." : "Khi bạn thuê phòng qua KhuMình, hóa đơn và sự cố sẽ hiện ở đây."}
        </div>
      ) : (
        <ul className="space-y-2">
          {due.map((d) => (
            <li key={d.invoice.id}>
              <Link
                href={`/app/hoa-don/${d.invoice.id}`}
                className={`card flex items-center gap-3 hover:border-fg-subtle ${d.invoice.state === "overdue" ? "border-danger/40" : "border-warning/40"}`}
              >
                <ReceiptText className="size-5 shrink-0 text-warning" aria-hidden />
                <span className="min-w-0 flex-1">
                  <span className="block font-semibold">
                    Hóa đơn tháng {d.invoice.periodLabel} · {vnd(d.owed)}
                  </span>
                  <span className="block text-xs text-fg-subtle">
                    Phòng {d.unitCode} · hạn {dmy(d.invoice.dueDate)}
                  </span>
                </span>
                <Badge state={d.invoice.state}>{PAYMENT_STATE_LABEL[d.invoice.state]}</Badge>
              </Link>
            </li>
          ))}
          {managerOpen.map((m) => (
            <li key={m.propertyId}>
              <Link href={`/co-so/${m.propertyId}/su-co`} className="card flex items-center gap-3 border-warning/40 hover:border-fg-subtle">
                <Wrench className="size-5 shrink-0 text-warning" aria-hidden />
                <span className="min-w-0 flex-1">
                  <span className="block font-semibold">{m.open} sự cố chưa xong</span>
                  <span className="block truncate text-xs text-fg-subtle">{m.name} · bạn quản lý</span>
                </span>
              </Link>
            </li>
          ))}
          {incidents.map((r) => (
            <li key={r.id}>
              <Link href="/app/su-co" className="card flex items-center gap-3 hover:border-fg-subtle">
                <Wrench className="size-5 shrink-0 text-fg-subtle" aria-hidden />
                <span className="min-w-0 flex-1">
                  <span className="block truncate font-semibold">
                    {r.urgent ? "Gấp: " : ""}
                    {r.title}
                  </span>
                  <span className="block text-xs text-fg-subtle">Phòng {r.unitCode} · báo {ago(r.createdAt)}</span>
                </span>
                <Badge state={r.status}>{MAINTENANCE_STATUS_LABEL[r.status]}</Badge>
              </Link>
            </li>
          ))}
        </ul>
      )}

      {announcements.length > 0 ? (
        <>
          <h2 className="mt-6 mb-2 text-lg font-semibold">Thông báo từ khu</h2>
          <ul className="space-y-2">
            {announcements.slice(0, 3).map((p) => (
              <li key={p.id}>
                <Link href="/app/bang-tin" className="card block hover:border-fg-subtle">
                  <span className="block font-semibold">{p.title}</span>
                  {p.body ? <span className="mt-0.5 line-clamp-2 block text-sm text-fg-muted">{p.body}</span> : null}
                  <span className="mt-1 block text-xs text-fg-subtle">
                    {p.place} · {p.authorName} · {ago(p.createdAt)}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </>
      ) : null}

      {fresh.length > 0 && place ? (
        <>
          <h2 className="mt-6 mb-2 text-lg font-semibold">Mới hôm nay quanh bạn</h2>
          <ul className="card divide-y divide-border p-0">
            {fresh.map((l) => (
              <li key={l.id}>
                <Link href={`/app/tin/${l.id}?o=${encodeURIComponent(place.key)}&r=${radius}`} className="flex items-center gap-3 px-4 py-3 hover:bg-surface-2">
                  <span className="grid size-9 shrink-0 place-items-center rounded-full bg-surface-2 text-sm font-bold">
                    {l.authorName.charAt(0).toUpperCase()}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm">
                      <span className="font-semibold">{l.authorName}</span> {FRESH_VERB[l.kind]} <span className="font-semibold">{l.title}</span>
                    </span>
                    <span className="block text-xs text-fg-subtle">
                      {priceText(l)} · gần {l.areaLabel} · {ago(l.createdAt)}
                    </span>
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </>
      ) : null}

      <div className="mt-6 mb-2 flex items-baseline justify-between">
        <h2 className="text-lg font-semibold">
          <Link href="/app/quanh-day">Quanh bạn {radius} km</Link>
        </h2>
        {place ? (
          <Link href="/app/quanh-day" className="text-sm font-medium text-brand-ink">
            Xem tất cả
          </Link>
        ) : null}
      </div>
      {!place ? (
        <EmptyState
          icon={Store}
          title="Chưa có khu trên bản đồ"
          description="Tin mua bán, cho tặng, dịch vụ quanh nhà hiện khi khu của bạn có vị trí. Nhờ chủ nhà gửi link mời hoặc đặt vị trí cơ sở."
        />
      ) : recent.length === 0 ? (
        <EmptyState
          icon={Store}
          title={`Chưa có tin nào trong ${radius} km`}
          description="Đồ cũ còn dùng được, món tự nấu, nhận sửa đồ: đăng tin đầu tiên cho hàng xóm."
          action={
            <Link href="/app/dang-tin" className="btn">
              Đăng tin
            </Link>
          }
        />
      ) : nearby.length > 0 ? (
        <ListingGrid items={nearby} query={`?o=${encodeURIComponent(place.key)}&r=${radius}`} />
      ) : (
        <p className="text-sm text-fg-muted">Các tin quanh bạn đều mới đăng hôm nay, xem ở trên.</p>
      )}
    </>
  );
}
