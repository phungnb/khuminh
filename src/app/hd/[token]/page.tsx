import type { Metadata } from "next";
import { FileX } from "lucide-react";
import { InvoiceView } from "@/components/invoice-view";
import { AuthShell, EmptyState, Logo } from "@/components/ui";
import { resolveShareLink } from "@/server/share";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Hóa đơn tiền nhà — KhuMình", robots: { index: false, follow: false } };

export default async function Page({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const inv = await resolveShareLink(token);
  if (!inv) {
    return (
      <AuthShell>
        <EmptyState
          icon={FileX}
          title="Link không còn hiệu lực"
          description="Link hóa đơn đã hết hạn hoặc không đúng. Vui lòng liên hệ chủ nhà để nhận link mới."
        />
      </AuthShell>
    );
  }
  return (
    <main className="mx-auto max-w-md px-4 py-6">
      <div className="mb-4 flex justify-center">
        <Logo />
      </div>
      <InvoiceView inv={inv} />
      <div className="mt-4 flex justify-center">
        <a className="btn-secondary" href={`/hd/${token}/anh`} download={`hoa-don-${inv.code}.png`}>
          Lưu ảnh hóa đơn
        </a>
      </div>
      <p className="mt-6 text-center text-xs text-fg-subtle">Tạo bởi KhuMình, chợ tiện ích quanh nhà</p>
    </main>
  );
}
