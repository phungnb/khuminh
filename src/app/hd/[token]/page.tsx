import type { Metadata } from "next";
import { InvoiceView } from "@/components/invoice-view";
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
  return (
    <main className="mx-auto max-w-md px-4 py-6">
      <InvoiceView inv={inv} />
      <p className="mt-6 text-center text-xs text-stone-400">Tạo bởi KhuMình</p>
    </main>
  );
}
