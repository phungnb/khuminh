import Link from "next/link";
import { Badge, Flash } from "@/components/ui";
import { PAYMENT_STATE_LABEL } from "@/domain/payments";
import { dmy, vnd } from "@/lib/format";
import { requireUser } from "@/lib/session";
import { PushToggle } from "@/components/push-toggle";
import { pushPublicKey } from "@/server/push";
import { tenantHome } from "@/server/tenant";

export const dynamic = "force-dynamic";

export default async function Page({ searchParams }: { searchParams: Promise<{ loi?: string; ok?: string }> }) {
  const user = await requireUser();
  const homes = await tenantHome(user.id);
  if (homes.length === 0) {
    return (
      <div className="card text-center text-sm text-stone-600">
        Tài khoản chưa gắn với phòng nào. Hãy xin chủ nhà gửi link mời vào app.
      </div>
    );
  }
  const publicKey = pushPublicKey();
  return (
    <>
      <Flash params={await searchParams} />
      {publicKey ? <PushToggle publicKey={publicKey} /> : null}
      {homes.map((h) => {
        const open = h.invoices.filter((i) => i.state === "unpaid" || i.state === "partial" || i.state === "overdue");
        const owed = open.reduce((s, i) => s + i.total - i.paid, 0);
        return (
          <section key={`${h.orgId}-${h.unitCode}-${h.propertyName}`} className={`mb-6 ${h.active ? "" : "opacity-70"}`}>
            <p className="text-sm text-stone-500">{h.propertyName}</p>
            <h1 className="text-xl font-bold">
              Phòng {h.unitCode}
              {h.active ? null : <span className="ml-2 text-sm font-normal text-stone-500">(đã chuyển đi)</span>}
            </h1>
            <div className={`card mt-3 ${owed > 0 ? "border-amber-300 bg-amber-50" : ""}`}>
              {owed > 0 ? (
                <>
                  <p className="text-sm text-stone-600">Cần thanh toán</p>
                  <p className="text-2xl font-bold text-brand">{vnd(owed)}</p>
                  <Link href={`/app/hoa-don/${open[0]!.id}`} className="btn mt-3 w-full">
                    Xem hóa đơn và mã QR
                  </Link>
                </>
              ) : (
                <p className="font-semibold text-emerald-800">Bạn không còn khoản nào cần trả.</p>
              )}
            </div>
            {h.invoices.length > 0 ? (
              <div className="card mt-3 p-0">
                <h2 className="px-4 pt-3 text-sm font-semibold text-stone-500">Lịch sử hóa đơn</h2>
                <ul>
                  {h.invoices.map((i) => (
                    <li key={i.id} className="border-t border-stone-100 first:border-t-0">
                      <Link href={`/app/hoa-don/${i.id}`} className="flex items-center justify-between gap-2 px-4 py-3">
                        <div>
                          <div className="font-medium">Tháng {i.periodLabel}</div>
                          <div className="text-xs text-stone-500">Hạn {dmy(i.dueDate)}</div>
                        </div>
                        <div className="text-right">
                          <div className="font-semibold">{vnd(i.total)}</div>
                          <Badge state={i.state}>{PAYMENT_STATE_LABEL[i.state]}</Badge>
                        </div>
                      </Link>
                    </li>
                  ))}
                </ul>
              </div>
            ) : (
              <p className="mt-3 text-sm text-stone-500">Chưa có hóa đơn nào.</p>
            )}
          </section>
        );
      })}
    </>
  );
}
