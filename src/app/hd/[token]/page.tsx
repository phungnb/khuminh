import type { Metadata } from "next";
import QRCode from "qrcode";
import { COMMON_BANKS } from "@/domain/vietqr";
import { dmy, vnd } from "@/lib/format";
import { resolveShareLink } from "@/server/share";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Hóa đơn tiền nhà — KhuMình", robots: { index: false, follow: false } };

export default async function Page({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const inv = await resolveShareLink(token);
  if (!inv) {
    return (
      <main className="mx-auto max-w-md px-4 py-12 text-center">
        <h1 className="text-lg font-bold">Link không còn hiệu lực</h1>
        <p className="mt-2 text-sm text-stone-600">Link hóa đơn đã hết hạn hoặc không đúng. Vui lòng liên hệ chủ nhà để nhận link mới.</p>
      </main>
    );
  }
  const due = Math.max(0, inv.total - inv.paid);
  const qrSvg = inv.qrPayload ? await QRCode.toString(inv.qrPayload, { type: "svg", margin: 1, width: 240 }) : null;
  const bankName = inv.bank ? (COMMON_BANKS.find((b) => b.bin === inv.bank!.bankBin)?.name ?? inv.bank.bankBin) : null;

  return (
    <main className="mx-auto max-w-md px-4 py-6">
      <p className="text-sm text-stone-500">{inv.propertyName}</p>
      <h1 className="text-xl font-bold">Phòng {inv.unitCode}</h1>
      <p className="text-sm text-stone-600">
        Mã hóa đơn {inv.code} · hạn trả {dmy(inv.dueDate)}
      </p>
      {inv.status === "void" ? (
        <p className="mt-4 rounded-md bg-stone-100 p-3 text-sm">Hóa đơn này đã bị hủy. Chủ nhà sẽ gửi hóa đơn mới.</p>
      ) : null}

      <section className="card mt-4 p-0">
        <table className="table">
          <tbody>
            {inv.lines.map((l, i) => (
              <tr key={i}>
                <td>{l.description}</td>
                <td className="text-right whitespace-nowrap">{vnd(l.amount)}</td>
              </tr>
            ))}
            {inv.adjustments.map((a, i) => (
              <tr key={`a${i}`}>
                <td>Điều chỉnh: {a.reason}</td>
                <td className="text-right whitespace-nowrap">{vnd(a.amount)}</td>
              </tr>
            ))}
            <tr>
              <td className="font-bold">Tổng</td>
              <td className="text-right font-bold">{vnd(inv.total)}</td>
            </tr>
            {inv.paid > 0 ? (
              <tr>
                <td>Đã trả</td>
                <td className="text-right text-emerald-700">−{vnd(inv.paid)}</td>
              </tr>
            ) : null}
            <tr>
              <td className="text-lg font-bold">Còn phải trả</td>
              <td className="text-right text-lg font-bold text-brand">{vnd(due)}</td>
            </tr>
          </tbody>
        </table>
      </section>

      {due === 0 && inv.status === "issued" ? (
        <p className="mt-4 rounded-md bg-emerald-50 p-3 text-center font-semibold text-emerald-800">Đã thanh toán đủ. Cảm ơn bạn.</p>
      ) : null}

      {qrSvg && inv.bank ? (
        <section className="card mt-4 text-center">
          <h2 className="font-semibold">Quét mã để chuyển khoản</h2>
          <div className="mx-auto my-3 w-60" dangerouslySetInnerHTML={{ __html: qrSvg }} />
          <p className="text-sm">
            {bankName} · {inv.bank.accountNo}
            {inv.bank.accountName ? ` · ${inv.bank.accountName}` : ""}
          </p>
          <p className="text-sm">
            Nội dung: <b>{inv.code}</b>
          </p>
          <p className="mt-2 text-xs text-stone-500">Chủ nhà xác nhận đã nhận tiền thì trạng thái mới cập nhật.</p>
        </section>
      ) : null}

      <p className="mt-6 text-center text-xs text-stone-400">Tạo bởi KhuMình</p>
    </main>
  );
}
